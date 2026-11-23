import { describe, expect, it } from "vitest";
import {
  MAX_CSV_BYTES,
  importContourPoints,
  parseCoordinateCsv,
  readCsvRecords,
  type CsvOptions,
} from "../../src/domain/coordinate-csv";
import {
  duplicateSection,
  newProject,
  parseProject,
  serializeProject,
} from "../../src/domain/model";
import { parseCoordinates } from "../../src/domain/geometry";
import { commit, history, redo, undo } from "../../src/domain/history";

const options: CsvOptions = {
  delimiter: ";",
  decimal: ",",
  hasHeader: true,
  unit: "m",
  xColumn: 0,
  zColumn: 1,
};
const parse = (text: string, extra: Partial<CsvOptions> = {}) =>
  parseCoordinateCsv(text, { ...options, ...extra });

describe("CSV de coordenadas", () => {
  it("equivale à entrada X/Z e preserva linhas físicas e valores de origem", () => {
    const result = parse("\uFEFFX;Z\r\n\r\n0;10,5\r\n20;8,5\r\n");
    expect(result.points).toEqual(parseCoordinates("0;10,5\n20;8,5"));
    expect(result.rows).toEqual([
      { line: 3, sourceX: "0", sourceZ: "10,5", x: 0, z: 10.5 },
      { line: 4, sourceX: "20", sourceZ: "8,5", x: 20, z: 8.5 },
    ]);
    expect(result.columns).toEqual(["X", "Z"]);
  });
  it.each([
    ["m", "2,5", "10", "20", 2.5],
    ["cm", "250", "1000", "2000", 2.5],
    ["mm", "2500", "10000", "20000", 2.5],
  ] as const)(
    "converte %s para metros explicitamente",
    (unit, x, z, x2, expected) => {
      expect(
        parse("X;Z\n" + x + ";" + z + "\n" + x2 + ";" + z, { unit }).points,
      ).toEqual([
        { x: expected, y: 10 },
        { x: 20, y: 10 },
      ]);
    },
  );
  it("mapeia colunas reordenadas com aspas, delimitador no campo e aspas escapadas", () => {
    const parsed = parse('Nome,Z,X\n"ponto, ""A""",10.5,0\nB,8.5,20', {
      delimiter: ",",
      decimal: ".",
      xColumn: 2,
      zColumn: 1,
    });
    expect(parsed.points).toEqual([
      { x: 0, y: 10.5 },
      { x: 20, y: 8.5 },
    ]);
    expect(parsed.columns).toEqual(["Nome", "Z", "X"]);
  });
  it("não descarta a primeira coordenada quando não há cabeçalho", () => {
    expect(
      parse("0\t10\n20\t8", {
        delimiter: "\t",
        hasHeader: false,
      }).points,
    ).toEqual([
      { x: 0, y: 10 },
      { x: 20, y: 8 },
    ]);
  });
  it("aceita expoente decimal explícito e campos numéricos entre aspas", () => {
    expect(parse('X;Z\n"0";"1,25e1"\n"+2e1";"8"').points).toEqual([
      { x: 0, y: 12.5 },
      { x: 20, y: 8 },
    ]);
  });
  it("aceita quebras em campo auxiliar e mantém número de linha dos pontos", () => {
    const parsed = parse('nome;X;Z\n"linha\nauxiliar";0;10\nfim;20;8', {
      xColumn: 1,
      zColumn: 2,
    });
    expect(parsed.rows.map((r) => r.line)).toEqual([2, 4]);
  });
  it.each([
    [{ unit: "" }, /unidade/],
    [{ hasHeader: null }, /primeira linha/],
    [{ delimiter: "," }, /ambígua/],
    [{ xColumn: 1, zColumn: 1 }, /distintas/],
    [{ xColumn: -1 }, /existentes/],
    [{ zColumn: 2 }, /existentes/],
    [{ zColumn: 0.5 }, /existentes/],
  ] as [Partial<CsvOptions>, RegExp][])(
    "recusa configuração incompleta/ambígua %j",
    (extra, message) => {
      expect(() => parse("X;Z\n0;10\n20;8", extra)).toThrow(message);
    },
  );
  it.each(["NaN", "Infinity", "1.234", "1 234", "", "=1+1", "1e999", "2x"])(
    "recusa o campo %j em vez de corrigir ou ignorar o ponto",
    (bad) => expect(() => parse("X;Z\n0;10\n20;" + bad)).toThrow(/Linha 3, Z/),
  );
  it("recusa vírgula com decimal ponto e mostra linha após cabeçalho/vazio", () => {
    expect(() => parse("X;Z\n\n0;10\n20;8,5", { decimal: "." })).toThrow(
      /Linha 4, Z/,
    );
  });
  it.each(["X;Z\n0;10\n20;8;9", "X;Z\n0;10\n20", "X;Z\n0;10\n;"])(
    "recusa largura inconsistente e não ignora registros vazios delimitados",
    (text) => expect(() => parse(text)).toThrow(/Linha 3/),
  );
  it.each(['X;Z\n0;"10\n20;8', 'X;Z\n0;"10"x\n20;8', 'X;Z\n0;1"0\n20;8'])(
    "recusa aspas malformadas",
    (text) => expect(() => parse(text)).toThrow(/aspas/),
  );
  it("recusa arquivo vazio, somente cabeçalho e somente um ponto", () => {
    expect(() => parse(" \r\n")).toThrow(/vazio/);
    expect(() => parse("X;Z")).toThrow(/dois pontos/);
    expect(() => parse("X;Z\n0;10")).toThrow(/dois pontos/);
  });
  it("confere limites depois da conversão sem saturar as coordenadas", () => {
    expect(parse("X;Z\n0;10\n100000000;10", { unit: "cm" }).points[1].x).toBe(
      1e6,
    );
    expect(() => parse("X;Z\n0;10\n100000001;10", { unit: "cm" })).toThrow(
      /convertida/,
    );
    expect(() => parse("X;Z\n0;10\n-1000001;10")).toThrow(/convertida/);
  });
  it("admite 500 pontos e recusa 501, com ou sem cabeçalho", () => {
    const rows = Array.from({ length: 500 }, (_, i) => i + ";10").join("\n");
    expect(parse("X;Z\n" + rows).points).toHaveLength(500);
    expect(() => parse("X;Z\n" + rows + "\n500;10")).toThrow(/500 pontos/);
    expect(() => parse(rows + "\n500;10", { hasHeader: false })).toThrow(
      /500 pontos/,
    );
  });
  it("limita bytes UTF-8, colunas e registros antes de montar a prévia", () => {
    expect(() =>
      readCsvRecords("é".repeat(MAX_CSV_BYTES / 2 + 1), ";"),
    ).toThrow(/1 MiB/);
    expect(() => readCsvRecords(Array(65).fill("x").join(";"), ";")).toThrow(
      /64 colunas/,
    );
    expect(() =>
      readCsvRecords(Array(502).fill("0;10").join("\n"), ";"),
    ).toThrow(/500 pontos/);
  });
});

function fixture() {
  const p = newProject("Importação");
  const s = p.sections[0];
  s.base = 0;
  s.terrain = [
    { x: 0, y: 10 },
    { x: 20, y: 10 },
  ];
  s.regions = [
    {
      id: "esquerda",
      name: "Esquerda",
      materialId: p.materials[0].id,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 5 },
      ],
    },
    {
      id: "direita",
      name: "Direita",
      materialId: p.materials[0].id,
      points: [
        { x: 10, y: 0 },
        { x: 15, y: 0 },
        { x: 15, y: 5 },
        { x: 10, y: 5 },
      ],
    },
  ];
  p.sections.push(duplicateSection(s));
  return p;
}

describe("Aplicação CSV transacional", () => {
  it("substitui como X/Z, preserva IDs/seções e desfaz/refaz em uma operação", () => {
    const p = fixture(),
      before = structuredClone(p);
    const s = p.sections[0];
    const points = parse("X;Z\n0;8\n20;8").points;
    const next = importContourPoints(p, s.id, { kind: "terrain" }, points);
    expect(p).toEqual(before);
    expect(next.sections[0].terrain).toEqual([
      { x: 0, y: 8 },
      { x: 20, y: 8 },
    ]);
    expect(next.sections[0].regions).toEqual(s.regions);
    expect(next.sections[1]).toEqual(p.sections[1]);
    expect(next.materials).toEqual(p.materials);
    expect(next.analysisCases).toEqual(p.analysisCases);
    expect(parseProject(serializeProject(next))).toEqual(next);
    const h = commit(history(p), next);
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toEqual(p);
    expect(redo(undo(h)).present).toEqual(next);
    points[0].y = 99;
    expect(next.sections[0].terrain[0].y).toBe(8);
  });
  it("altera somente o contorno da região, preservando identidade e material", () => {
    const p = fixture(),
      s = p.sections[0];
    const next = importContourPoints(
      p,
      s.id,
      { kind: "region", id: "esquerda" },
      [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 4 },
        { x: 1, y: 4 },
      ],
    );
    expect(next.sections[0].regions[0]).toMatchObject({
      id: "esquerda",
      name: "Esquerda",
      materialId: s.regions[0].materialId,
    });
    expect(next.sections[0].regions[1]).toEqual(s.regions[1]);
    expect(next.sections[0].terrain).toEqual(s.terrain);
    expect(next.sections[1]).toEqual(p.sections[1]);
  });
  it("recusa região sobreposta/externa e não altera o projeto original", () => {
    const p = fixture(),
      before = structuredClone(p),
      s = p.sections[0];
    for (const xs of [
      [12, 18],
      [19, 21],
    ]) {
      expect(() =>
        importContourPoints(p, s.id, { kind: "region", id: "esquerda" }, [
          { x: xs[0], y: 1 },
          { x: xs[1], y: 1 },
          { x: xs[1], y: 4 },
          { x: xs[0], y: 4 },
        ]),
      ).toThrow(/sobrepõe|dentro da seção/);
      expect(p).toEqual(before);
    }
  });
  it("recusa retorno em X, base inválida e terreno que deixa regiões fora", () => {
    const p = fixture(),
      s = p.sections[0],
      before = structuredClone(p);
    for (const points of [
      [
        { x: 0, y: 10 },
        { x: 10, y: 8 },
        { x: 5, y: 8 },
      ],
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      [
        { x: 0, y: 10 },
        { x: 3, y: 10 },
      ],
    ]) {
      expect(() =>
        importContourPoints(p, s.id, { kind: "terrain" }, points),
      ).toThrow();
      expect(p).toEqual(before);
    }
  });
  it("não aceita destinos inexistentes nem contornos degenerados mesmo se já havia erro", () => {
    const p = fixture(),
      s = p.sections[0];
    expect(() =>
      importContourPoints(p, "inexistente", { kind: "terrain" }, []),
    ).toThrow(/seção existente/);
    expect(() =>
      importContourPoints(p, s.id, { kind: "region", id: "ausente" }, []),
    ).toThrow(/região existente/);
    s.terrain = [
      { x: 0, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(() =>
      importContourPoints(p, s.id, { kind: "terrain" }, s.terrain),
    ).toThrow();
  });
});
