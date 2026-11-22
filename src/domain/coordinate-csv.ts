import { projectSchema, type Point, type Project } from "./model";
import { replaceContourCoordinates, type ContourTarget } from "./editing";
import {
  EPS,
  introducedError,
  parseNumber,
  regionError,
  terrainError,
} from "./geometry";

export const MAX_CSV_BYTES = 1024 * 1024;
export type CsvDelimiter = ";" | "," | "\t";
export type CsvUnit = "m" | "cm" | "mm";
export type CsvOptions = {
  delimiter: CsvDelimiter;
  decimal: "." | ",";
  hasHeader: boolean | null;
  unit: CsvUnit | "";
  xColumn: number;
  zColumn: number;
};
export type CsvRecord = { line: number; cells: string[] };

// Keep physical line numbers, including blank and quoted lines. No separator,
// header, coordinate column or unit is inferred from the data.
export function readCsvRecords(
  text: string,
  delimiter: CsvDelimiter,
): CsvRecord[] {
  if (![";", ",", "\t"].includes(delimiter))
    throw new Error("Escolha ponto e vírgula, vírgula ou tabulação.");
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES)
    throw new Error("O CSV excede o limite de 1 MiB.");
  const source = text.replace(/^\uFEFF/, "");
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let state: "plain" | "quoted" | "closed" = "plain";
  let line = 1;
  let recordLine = 1;
  const fail = () => {
    throw new Error(
      "Linha " +
        line +
        ": aspas CSV inválidas. Use aspas duplas ao redor do campo e duplique as aspas internas.",
    );
  };
  const field = () => {
    cells.push(cell);
    if (cells.length > 64)
      throw new Error("Linha " + recordLine + ": limite de 64 colunas no CSV.");
    cell = "";
    state = "plain";
  };
  const record = () => {
    field();
    if (cells.length !== 1 || cells[0].trim() !== "") {
      records.push({ line: recordLine, cells });
      if (records.length > 501)
        throw new Error(
          "Limite de 500 pontos por contorno, além do cabeçalho.",
        );
    }
    cells = [];
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (state === "quoted") {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else state = "closed";
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && source[i + 1] === "\n") i++;
        cell += "\n";
        line++;
      } else cell += ch;
      continue;
    }
    if (ch === delimiter) field();
    else if (ch === "\r" || ch === "\n") {
      record();
      if (ch === "\r" && source[i + 1] === "\n") i++;
      line++;
      recordLine = line;
    } else if (state === "closed") {
      if (ch !== " " && ch !== "\t") fail();
    } else if (ch === '"') {
      if (cell.trim() !== "") fail();
      cell = "";
      state = "quoted";
    } else cell += ch;
  }
  if (state === "quoted")
    throw new Error(
      "Linha " + recordLine + ": campo entre aspas não foi fechado.",
    );
  record();
  if (!records.length) throw new Error("O CSV está vazio.");
  return records;
}

export function parseCoordinateCsv(text: string, options: CsvOptions) {
  if (options.hasHeader === null)
    throw new Error("Informe se a primeira linha é cabeçalho ou coordenadas.");
  if (!["m", "cm", "mm"].includes(options.unit))
    throw new Error("Escolha a unidade das coordenadas do CSV: m, cm ou mm.");
  if (options.decimal !== "." && options.decimal !== ",")
    throw new Error("Escolha ponto ou vírgula como separador decimal.");
  if (options.delimiter === "," && options.decimal === ",")
    throw new Error(
      "Vírgula como campo e decimal é ambígua. Use ponto e vírgula ou tabulação para vírgula decimal.",
    );
  const records = readCsvRecords(text, options.delimiter);
  const width = records[0].cells.length;
  const { xColumn, zColumn } = options;
  if (
    !Number.isInteger(xColumn) ||
    !Number.isInteger(zColumn) ||
    xColumn < 0 ||
    zColumn < 0 ||
    xColumn >= width ||
    zColumn >= width ||
    xColumn === zColumn
  )
    throw new Error("Escolha duas colunas distintas e existentes para X e Z.");
  const data = records.slice(options.hasHeader ? 1 : 0);
  if (data.length < 2)
    throw new Error(
      "O CSV precisa conter ao menos dois pontos de coordenadas.",
    );
  if (data.length > 500) throw new Error("Limite de 500 pontos por contorno.");
  const factor =
    options.unit === "cm" ? 0.01 : options.unit === "mm" ? 0.001 : 1;
  const number = (value: string, row: number, axis: string) => {
    const raw = value.trim();
    const unexpectedDecimal = options.decimal === "." ? "," : ".";
    const n = raw.includes(unexpectedDecimal) ? null : parseNumber(raw);
    if (n === null)
      throw new Error(
        "Linha " +
          row +
          ", " +
          axis +
          ": número inválido para o decimal escolhido. Separadores de milhares não são aceitos.",
      );
    const scaled = n * factor;
    if (!Number.isFinite(scaled) || Math.abs(scaled) > 1e6)
      throw new Error(
        "Linha " +
          row +
          ", " +
          axis +
          ": a coordenada convertida deve ficar entre −1.000.000 e 1.000.000 m.",
      );
    return scaled;
  };
  const rows = data.map(({ line, cells }) => {
    if (cells.length !== width)
      throw new Error(
        "Linha " +
          line +
          ": foram encontradas " +
          cells.length +
          " colunas; esperadas " +
          width +
          ". Confira o separador e os campos vazios.",
      );
    return {
      line,
      sourceX: cells[xColumn],
      sourceZ: cells[zColumn],
      x: number(cells[xColumn], line, "X"),
      z: number(cells[zColumn], line, "Z"),
    };
  });
  return {
    points: rows.map(({ x, z }) => ({ x, y: z })),
    rows,
    columns: records[0].cells.map((s, i) =>
      options.hasHeader ? s.trim() || "Coluna " + (i + 1) : "Coluna " + (i + 1),
    ),
  };
}

// Match pasted X/Z replacement: imported vertices have no correspondence with
// the old contour. IDs and materials remain unchanged.
export function importContourPoints(
  project: Project,
  sectionId: string,
  target: ContourTarget,
  points: Point[],
): Project {
  if (target.kind === "water")
    throw new Error(
      "Selecione o terreno ou uma região de solo para importar CSV.",
    );
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error("Selecione uma seção existente.");
  if (
    target.kind === "region" &&
    !section.regions.some((r) => r.id === target.id)
  )
    throw new Error("Selecione uma região existente.");
  const replacement = points.map((p) => ({ ...p }));
  const next = structuredClone(project);
  const index = next.sections.findIndex((s) => s.id === sectionId);
  next.sections[index] = replaceContourCoordinates(
    section,
    target,
    replacement,
    replacement.map(() => null),
  );
  const parsed = projectSchema.safeParse(next);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .map((i) => String(i.path.at(-1)) + ": " + i.message)
        .join(" · "),
    );
  const s = parsed.data.sections[index];
  const geometryError =
    target.kind === "terrain"
      ? terrainError(s.terrain) ||
        (s.terrain.some((p) => p.y <= s.base + EPS)
          ? "A base deve ficar abaixo de todo o terreno."
          : null)
      : regionError(s, replacement, target.id);
  if (geometryError) throw new Error(geometryError);
  const added = introducedError(project, parsed.data);
  if (added) throw new Error(added.message);
  return parsed.data;
}
