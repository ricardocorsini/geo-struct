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
  MAX_DXF_FILE_BYTES,
  openNativeDxf,
  readDxfFile,
} from "../../src/lib/files";

beforeEach(() => vi.resetAllMocks());

describe("DXF escolhido no navegador", () => {
  it("lê UTF-8 com BOM, preservando texto e nome acentuado", async () => {
    const text =
      "0\r\nSECTION\r\n2\r\nENTITIES\r\n999\r\nSeção\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n";
    expect(await readDxfFile(new File(["\uFEFF" + text], "Seção.DXF"))).toEqual(
      {
        name: "Seção.DXF",
        text,
      },
    );
  });

  it.each([[0xff], [0xc0, 0xaf], [0xe2, 0x82]])(
    "recusa bytes UTF-8 inválidos %j sem substituição silenciosa",
    async (...bytes) => {
      await expect(
        readDxfFile(new File([Uint8Array.from(bytes)], "terreno.dxf")),
      ).rejects.toThrow("UTF-8");
    },
  );

  it("aceita exatamente 2 MiB em bytes, inclusive texto multibyte", async () => {
    const text = "é".repeat(MAX_DXF_FILE_BYTES / 2);
    const file = new File([text], "limite.dxf");
    expect(file.size).toBe(2_097_152);
    expect((await readDxfFile(file)).text).toBe(text);
  });

  it("rejeita excesso de bytes antes de carregar o arquivo", async () => {
    const file = new File(
      ["é".repeat(MAX_DXF_FILE_BYTES / 2) + "x"],
      "grande.dxf",
    );
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(readDxfFile(file)).rejects.toThrow("2 MiB");
    expect(read).not.toHaveBeenCalled();
  });

  it("rejeita extensão diferente sem ler o conteúdo", async () => {
    const file = new File(["0\nEOF\n"], "terreno.dwg");
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(readDxfFile(file)).rejects.toThrow(".dxf");
    expect(read).not.toHaveBeenCalled();
  });

  it("propaga falha de leitura sem devolver conteúdo parcial", async () => {
    const file = new File(["0\nEOF\n"], "terreno.dxf");
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(
      new Error("Arquivo indisponível"),
    );
    await expect(readDxfFile(file)).rejects.toThrow("Arquivo indisponível");
  });
});

describe("DXF escolhido no diálogo desktop", () => {
  it("cancelar não consulta metadados nem lê outro arquivo", async () => {
    io.open.mockResolvedValue(null);
    expect(await openNativeDxf()).toBeNull();
    expect(io.stat).not.toHaveBeenCalled();
    expect(io.readFile).not.toHaveBeenCalled();
  });

  it("lê somente o caminho escolhido com filtro DXF e seleção única", async () => {
    const path = "C:\\pasta escolhida\\Seção.DXF";
    const text = "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n";
    io.open.mockResolvedValue(path);
    io.stat.mockResolvedValue({ size: 100 });
    io.readFile.mockResolvedValue(new TextEncoder().encode("\uFEFF" + text));
    expect(await openNativeDxf()).toEqual({ name: "Seção.DXF", text });
    expect(io.open).toHaveBeenCalledExactlyOnceWith({
      multiple: false,
      directory: false,
      filters: [{ name: "Contornos DXF", extensions: ["dxf"] }],
    });
    expect(io.stat).toHaveBeenCalledExactlyOnceWith(path);
    expect(io.readFile).toHaveBeenCalledExactlyOnceWith(path);
  });

  it("rejeita arquivo maior que o limite antes da leitura", async () => {
    io.open.mockResolvedValue("/escolhido/grande.dxf");
    io.stat.mockResolvedValue({ size: MAX_DXF_FILE_BYTES + 1 });
    await expect(openNativeDxf()).rejects.toThrow("2 MiB");
    expect(io.readFile).not.toHaveBeenCalled();
  });

  it("revalida os bytes se o arquivo cresceu depois dos metadados", async () => {
    io.open.mockResolvedValue("/escolhido/cresceu.dxf");
    io.stat.mockResolvedValue({ size: 10 });
    io.readFile.mockResolvedValue(new Uint8Array(MAX_DXF_FILE_BYTES + 1));
    await expect(openNativeDxf()).rejects.toThrow("2 MiB");
  });

  it("rejeita texto UTF-8 truncado no caminho nativo", async () => {
    io.open.mockResolvedValue("/escolhido/truncado.dxf");
    io.stat.mockResolvedValue({ size: 2 });
    io.readFile.mockResolvedValue(Uint8Array.from([0xe2, 0x82]));
    await expect(openNativeDxf()).rejects.toThrow("UTF-8");
  });

  it("não tenta outra API ou caminho quando o escolhido não está autorizado", async () => {
    const path = "/escolhido/restrito.dxf";
    io.open.mockResolvedValue(path);
    io.stat.mockResolvedValue({ size: 10 });
    io.readFile.mockRejectedValue(
      new Error("path not allowed on the configured scope"),
    );
    await expect(openNativeDxf()).rejects.toThrow("configured scope");
    expect(io.readFile).toHaveBeenCalledExactlyOnceWith(path);
  });

  it("preserva falha do seletor e não inicia leitura", async () => {
    io.open.mockRejectedValue(new Error("Diálogo indisponível"));
    await expect(openNativeDxf()).rejects.toThrow("Diálogo indisponível");
    expect(io.stat).not.toHaveBeenCalled();
    expect(io.readFile).not.toHaveBeenCalled();
  });

  it("preserva falha de metadados sem tentar ler", async () => {
    io.open.mockResolvedValue("/escolhido/removido.dxf");
    io.stat.mockRejectedValue(new Error("Arquivo removido"));
    await expect(openNativeDxf()).rejects.toThrow("Arquivo removido");
    expect(io.readFile).not.toHaveBeenCalled();
  });
});
