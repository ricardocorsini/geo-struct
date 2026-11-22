import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  open: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: io.open }));
vi.mock("@tauri-apps/plugin-fs", () => io);
import {
  MAX_CSV_FILE_BYTES,
  openNativeCsv,
  readCsvFile,
} from "../../src/lib/files";

beforeEach(() => vi.resetAllMocks());

describe("leitura de CSV escolhido no navegador", () => {
  it("lê UTF-8 com BOM e nome acentuado sem alterar as coordenadas", async () => {
    const text = "X;Z;Descrição\r\n0;10;início\r\n20;8;fim\r\n";
    const file = new File(["\uFEFF" + text], "Seção.CSV");
    expect(await readCsvFile(file)).toEqual({ name: "Seção.CSV", text });
  });

  it.each([[0xff], [0xc0, 0xaf], [0xe2, 0x82]])(
    "recusa sequência UTF-8 inválida %j",
    async (...bytes) => {
      const file = new File([Uint8Array.from(bytes)], "terreno.csv");
      await expect(readCsvFile(file)).rejects.toThrow("UTF-8");
    },
  );

  it("aceita exatamente 1 MiB de bytes UTF-8, inclusive caracteres multibyte", async () => {
    const text = "é".repeat(MAX_CSV_FILE_BYTES / 2);
    const file = new File([text], "limite.csv");
    expect(file.size).toBe(1_048_576);
    expect((await readCsvFile(file)).text).toBe(text);
  });

  it("recusa o excesso em bytes antes de carregar o conteúdo", async () => {
    const file = new File(
      ["é".repeat(MAX_CSV_FILE_BYTES / 2) + "x"],
      "grande.csv",
    );
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(readCsvFile(file)).rejects.toThrow("1 MiB");
    expect(read).not.toHaveBeenCalled();
  });

  it("recusa extensão diferente sem ler o arquivo", async () => {
    const file = new File(["0;10\n20;8"], "terreno.txt");
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(readCsvFile(file)).rejects.toThrow(".csv");
    expect(read).not.toHaveBeenCalled();
  });

  it("preserva a falha de leitura e não retorna conteúdo parcial", async () => {
    const file = new File(["0;10"], "terreno.csv");
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(
      new Error("Arquivo indisponível"),
    );
    await expect(readCsvFile(file)).rejects.toThrow("Arquivo indisponível");
  });
});

describe("leitura de CSV escolhido no diálogo desktop", () => {
  it("cancelar o seletor não consulta metadados nem lê arquivos", async () => {
    io.open.mockResolvedValue(null);
    expect(await openNativeCsv()).toBeNull();
    expect(io.stat).not.toHaveBeenCalled();
    expect(io.readFile).not.toHaveBeenCalled();
  });

  it("lê somente o caminho escolhido, com filtro CSV de arquivo único", async () => {
    const path = "C:\\pasta autorizada\\Seção.CSV";
    const text = "X;Z\n0;10\n20;8";
    io.open.mockResolvedValue(path);
    io.stat.mockResolvedValue({ size: 100 });
    io.readFile.mockResolvedValue(new TextEncoder().encode(text));
    expect(await openNativeCsv()).toEqual({ name: "Seção.CSV", text });
    expect(io.open).toHaveBeenCalledExactlyOnceWith({
      multiple: false,
      directory: false,
      filters: [{ name: "Coordenadas CSV", extensions: ["csv"] }],
    });
    expect(io.stat).toHaveBeenCalledExactlyOnceWith(path);
    expect(io.readFile).toHaveBeenCalledExactlyOnceWith(path);
  });

  it("recusa arquivo acima do limite antes de ler seu conteúdo", async () => {
    io.open.mockResolvedValue("/selecionado/grande.csv");
    io.stat.mockResolvedValue({ size: MAX_CSV_FILE_BYTES + 1 });
    await expect(openNativeCsv()).rejects.toThrow("1 MiB");
    expect(io.readFile).not.toHaveBeenCalled();
  });

  it("recusa conteúdo que cresceu além do limite após os metadados", async () => {
    io.open.mockResolvedValue("/selecionado/cresceu.csv");
    io.stat.mockResolvedValue({ size: 10 });
    io.readFile.mockResolvedValue(new Uint8Array(MAX_CSV_FILE_BYTES + 1));
    await expect(openNativeCsv()).rejects.toThrow("1 MiB");
  });

  it("recusa UTF-8 truncado sem conversão silenciosa para caractere de substituição", async () => {
    io.open.mockResolvedValue("/selecionado/errado.csv");
    io.stat.mockResolvedValue({ size: 2 });
    io.readFile.mockResolvedValue(Uint8Array.from([0xe2, 0x82]));
    await expect(openNativeCsv()).rejects.toThrow("UTF-8");
  });

  it("não tenta outro arquivo ou API quando o caminho escolhido não está autorizado", async () => {
    const path = "/selecionado/restrito.csv";
    io.open.mockResolvedValue(path);
    io.stat.mockResolvedValue({ size: 10 });
    io.readFile.mockRejectedValue(
      new Error("path not allowed on the configured scope"),
    );
    await expect(openNativeCsv()).rejects.toThrow("configured scope");
    expect(io.readFile).toHaveBeenCalledExactlyOnceWith(path);
  });

  it("preserva falha do seletor sem iniciar leitura", async () => {
    io.open.mockRejectedValue(new Error("Diálogo indisponível"));
    await expect(openNativeCsv()).rejects.toThrow("Diálogo indisponível");
    expect(io.stat).not.toHaveBeenCalled();
    expect(io.readFile).not.toHaveBeenCalled();
  });

  it("preserva falha de metadados sem tentar a leitura", async () => {
    io.open.mockResolvedValue("/selecionado/removido.csv");
    io.stat.mockRejectedValue(new Error("Arquivo removido"));
    await expect(openNativeCsv()).rejects.toThrow("Arquivo removido");
    expect(io.readFile).not.toHaveBeenCalled();
  });
});
