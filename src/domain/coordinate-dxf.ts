import type { Point } from "./model";

export const MAX_DXF_BYTES = 2 * 1024 * 1024;
export const MAX_DXF_ENTITIES = 200;
export const MAX_DXF_POINTS = 500;
export const MAX_DXF_GROUPS = 250_000;
export type DxfEntity = {
  id: string;
  type: string;
  layer: string;
  closed: boolean;
  points: Point[];
  error: string | null;
};
export type DxfDocument = {
  entities: DxfEntity[];
  insUnits: number | null;
  version: string | null;
};
export type DxfTransform = {
  unit: "m" | "cm" | "mm" | "";
  originX: number;
  originZ: number;
};
type Group = { code: number; value: string; line: number };
type EntityRecord = { type: string; groups: Group[] };

function groupsFromText(text: string): Group[] {
  if (
    text.length > MAX_DXF_BYTES ||
    new TextEncoder().encode(text).length > MAX_DXF_BYTES
  )
    throw new Error("O DXF excede o limite de 2 MiB.");
  const source = text.replace(/^\uFEFF/, "");
  if (
    source.startsWith("AutoCAD Binary DXF") ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(source)
  )
    throw new Error(
      "DXF binário não é suportado. Exporte um DXF de texto ASCII/UTF-8.",
    );
  const lines = source.split(/\r\n|\n|\r/);
  while (lines.length && lines.at(-1)!.trim() === "") lines.pop();
  if (lines.length % 2)
    throw new Error(
      "DXF incompleto: cada código de grupo precisa de uma linha de valor.",
    );
  if (lines.length / 2 > MAX_DXF_GROUPS)
    throw new Error("O DXF excede o limite de 250.000 grupos.");
  const groups: Group[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const raw = lines[i].trim();
    if (!/^\d{1,4}$/.test(raw) || Number(raw) > 1071)
      throw new Error(`Linha ${i + 1}: código de grupo DXF inválido.`);
    const code = Number(raw);
    // Comments do not participate in the section/entity grammar, but count
    // towards the input limits before being removed.
    if (code !== 999)
      groups.push({
        code,
        value: code === 8 ? lines[i + 1] : lines[i + 1].trim(),
        line: i + 1,
      });
  }
  return groups;
}

function sections(groups: Group[]): Map<string, Group[]> {
  const result = new Map<string, Group[]>();
  let eof = false;
  let i = 0;
  while (i < groups.length) {
    const marker = groups[i];
    if (marker.code === 0 && marker.value === "EOF") {
      if (i !== groups.length - 1)
        throw new Error("Há dados após o EOF do DXF.");
      eof = true;
      break;
    }
    if (
      marker.code !== 0 ||
      marker.value !== "SECTION" ||
      groups[i + 1]?.code !== 2
    )
      throw new Error(
        `Linha ${marker.line}: esperava SECTION e o nome da seção.`,
      );
    const name = groups[i + 1].value;
    if (!name || result.has(name))
      throw new Error("Seção DXF vazia ou repetida: " + name + ".");
    const start = i + 2;
    i = start;
    while (
      i < groups.length &&
      !(groups[i].code === 0 && groups[i].value === "ENDSEC")
    ) {
      if (groups[i].code === 0 && ["SECTION", "EOF"].includes(groups[i].value))
        throw new Error("Seção DXF sem ENDSEC: " + name + ".");
      i++;
    }
    if (i === groups.length)
      throw new Error("Seção DXF sem ENDSEC: " + name + ".");
    result.set(name, groups.slice(start, i));
    i++;
  }
  if (!eof) throw new Error("DXF incompleto: marcador EOF ausente.");
  if (!result.has("ENTITIES"))
    throw new Error("O DXF não contém a seção ENTITIES.");
  return result;
}

const all = (groups: Group[], code: number) =>
  groups.filter((g) => g.code === code);
function one(groups: Group[], code: number): Group | undefined {
  const found = all(groups, code);
  if (found.length > 1) throw new Error(`Código ${code} repetido na entidade.`);
  return found[0];
}
function numeric(g: Group, integer = false): number {
  const pattern = integer
    ? /^[+-]?\d+$/
    : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  const value = Number(g.value);
  if (
    !pattern.test(g.value) ||
    !Number.isFinite(value) ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error(
      `Linha ${g.line}: valor ${integer ? "inteiro" : "numérico finito"} inválido no código ${g.code}.`,
    );
  return value;
}
function number(
  groups: Group[],
  code: number,
  fallback?: number,
  integer = false,
): number {
  const g = one(groups, code);
  if (g) return numeric(g, integer);
  if (fallback !== undefined) return fallback;
  throw new Error(`Código ${code} obrigatório ausente.`);
}
function zero(groups: Group[], codes: number[], message: string) {
  for (const g of groups)
    if (codes.includes(g.code) && numeric(g) !== 0) throw new Error(message);
}
function numericFields(groups: Group[]) {
  for (const g of groups) {
    const c = g.code;
    const real =
      (c >= 10 && c <= 59) ||
      (c >= 110 && c <= 149) ||
      (c >= 210 && c <= 239) ||
      (c >= 1010 && c <= 1059);
    const integer =
      (c >= 60 && c <= 99) ||
      (c >= 160 && c <= 179) ||
      (c >= 270 && c <= 299) ||
      (c >= 370 && c <= 389) ||
      (c >= 400 && c <= 409) ||
      (c >= 420 && c <= 429) ||
      (c >= 440 && c <= 459) ||
      (c >= 1060 && c <= 1071);
    if (real || integer) numeric(g, integer);
  }
}

// Autodesk DXF 2024: common entity groups, LWPOLYLINE, POLYLINE and VERTEX.
// Application-defined 102 groups are not geometry; interpreting their 10/20
// codes as vertices would corrupt the contour.
function geometryGroups(groups: Group[]): Group[] {
  const result: Group[] = [];
  let depth = 0;
  let xdata = false;
  for (const g of groups) {
    if (!depth && g.code === 1001) {
      xdata = true;
      continue;
    }
    if (xdata) {
      if (g.code < 1000)
        throw new Error(
          "XDATA contém códigos de geometria fora do contrato; a entidade não pode ser importada.",
        );
      continue;
    }
    if (g.code === 102) {
      if (g.value.startsWith("{")) depth++;
      else if (g.value === "}" && depth > 0) depth--;
      else throw new Error("Grupo de aplicação 102 inválido.");
      if (depth > 16)
        throw new Error("Limite de grupos de aplicação aninhados excedido.");
    } else if (!depth) result.push(g);
  }
  if (depth) throw new Error("Grupo de aplicação 102 incompleto.");
  return result;
}
function modelPlane(groups: Group[]) {
  numericFields(groups);
  const paper = number(groups, 67, 0, true);
  if (paper !== 0 && paper !== 1)
    throw new Error("Indicador de espaço 67 inválido.");
  const layout = one(groups, 410)?.value;
  if (paper === 1 || (layout && layout.toLowerCase() !== "model"))
    throw new Error(
      "Entidade no espaço de papel/layout; use uma polilinha do espaço do modelo.",
    );
  zero(
    groups,
    [30, 38, 39],
    "Elevação Z ou espessura diferente de zero: somente o plano XY é suportado.",
  );
  if (
    number(groups, 210, 0) !== 0 ||
    number(groups, 220, 0) !== 0 ||
    number(groups, 230, 1) !== 1
  )
    throw new Error(
      "Extrusão/OCS incompatível: somente a normal (0, 0, 1) no plano XY é suportada.",
    );
}
function straight(groups: Group[]) {
  zero(
    groups,
    [42],
    "Polilinha com bulge/arco não suportada; curvas não são aproximadas.",
  );
  zero(
    groups,
    [40, 41, 43],
    "Polilinha com largura diferente de zero não suportada.",
  );
}
function flags(groups: Group[], type: string): number {
  const f = number(groups, 70, 0, true);
  if (![0, 1, 128, 129].includes(f))
    throw new Error(
      `${type}: flags de ajuste, 3D, malha ou desconhecidas não suportadas.`,
    );
  return f;
}
function subclasses(groups: Group[], allowed: string[]) {
  if (all(groups, 100).some((g) => !allowed.includes(g.value)))
    throw new Error("Subclasse DXF não suportada para uma polilinha 2D reta.");
}
function lwPoints(groups: Group[]): { points: Point[]; closed: boolean } {
  subclasses(groups, ["AcDbEntity", "AcDbPolyline"]);
  modelPlane(groups);
  straight(groups);
  const f = flags(groups, "LWPOLYLINE");
  const count = number(groups, 90, undefined, true);
  if (count < 2 || count > MAX_DXF_POINTS)
    throw new Error("A polilinha deve ter entre 2 e 500 pontos.");
  const coordinates = groups.filter((g) => g.code === 10 || g.code === 20);
  if (
    coordinates.length !== count * 2 ||
    coordinates.some((g, i) => g.code !== (i % 2 ? 20 : 10))
  )
    throw new Error(
      "A contagem 90 deve corresponder a pares X/Y completos, na sequência 10/20 por vértice.",
    );
  for (const code of [40, 41, 42, 91])
    if (all(groups, code).length > count)
      throw new Error("Há atributos de vértices além da contagem declarada.");
  return {
    closed: (f & 1) !== 0,
    points: Array.from({ length: count }, (_, i) => ({
      x: numeric(coordinates[i * 2]),
      y: numeric(coordinates[i * 2 + 1]),
    })),
  };
}
function polyPoints(
  groups: Group[],
  vertices: EntityRecord[],
  complete: boolean,
): { points: Point[]; closed: boolean } {
  if (!complete)
    throw new Error("POLYLINE incompleta: faltou SEQEND após os vértices.");
  subclasses(groups, ["AcDbEntity", "AcDb2dPolyline"]);
  modelPlane(groups);
  straight(groups);
  const f = flags(groups, "POLYLINE");
  zero(
    groups,
    [10, 20],
    "O ponto de referência da POLYLINE 2D deve ser (0, 0, 0).",
  );
  zero(
    groups,
    [71, 72, 73, 74, 75],
    "Ajuste de curva/superfície ou malha não suportado.",
  );
  if (vertices.length < 2 || vertices.length > MAX_DXF_POINTS)
    throw new Error("A polilinha deve ter entre 2 e 500 pontos.");
  const points = vertices.map((vertex) => {
    const v = geometryGroups(vertex.groups);
    subclasses(v, ["AcDbEntity", "AcDbVertex", "AcDb2dVertex"]);
    modelPlane(v);
    straight(v);
    if (number(v, 70, 0, true) !== 0)
      throw new Error("VERTEX com ajuste, 3D ou malha não suportado.");
    zero(
      v,
      [50, 71, 72, 73, 74],
      "VERTEX com ajuste de curva ou índices de malha não suportado.",
    );
    return { x: number(v, 10), y: number(v, 20) };
  });
  return { points, closed: (f & 1) !== 0 };
}

function entityRecords(groups: Group[]): EntityRecord[] {
  const records: EntityRecord[] = [];
  for (const g of groups) {
    if (g.code === 0) {
      if (!g.value) throw new Error("Entidade DXF sem tipo.");
      records.push({ type: g.value, groups: [] });
    } else {
      if (!records.length)
        throw new Error(
          "A seção ENTITIES deve começar por um código 0 de entidade.",
        );
      records.at(-1)!.groups.push(g);
    }
  }
  return records;
}
function header(groups: Group[]): {
  insUnits: number | null;
  version: string | null;
} {
  const variables = new Map<string, Group[]>();
  let current: string | null = null;
  for (const g of groups) {
    if (g.code === 9) {
      current = g.value;
      if (variables.has(current))
        throw new Error("Variável HEADER repetida: " + current + ".");
      variables.set(current, []);
    } else {
      if (!current || g.code === 0)
        throw new Error("Estrutura HEADER inválida.");
      variables.get(current)!.push(g);
    }
  }
  const unitGroups = variables.get("$INSUNITS");
  const insUnits = unitGroups ? number(unitGroups, 70, undefined, true) : null;
  if (insUnits !== null && (insUnits < 0 || insUnits > 24))
    throw new Error("$INSUNITS deve ser um código inteiro entre 0 e 24.");
  const versionGroups = variables.get("$ACADVER");
  const version = versionGroups ? one(versionGroups, 1)?.value : null;
  if (versionGroups && (!version || !/^AC\d{4}$/.test(version)))
    throw new Error("$ACADVER inválida no HEADER.");
  return { insUnits, version: version ?? null };
}

export function parseDxf(text: string): DxfDocument {
  const bySection = sections(groupsFromText(text));
  const metadata = header(bySection.get("HEADER") ?? []);
  const records = entityRecords(bySection.get("ENTITIES")!);
  const entities: DxfEntity[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const vertices: EntityRecord[] = [];
    let complete = false;
    let ending: EntityRecord | undefined;
    if (record.type === "POLYLINE") {
      let next = i + 1;
      while (records[next]?.type === "VERTEX") {
        if (vertices.length <= MAX_DXF_POINTS) vertices.push(records[next]);
        next++;
      }
      complete = records[next]?.type === "SEQEND";
      ending = complete ? records[next] : undefined;
      i = complete ? next : next - 1;
    }
    const entity: DxfEntity = {
      id: `dxf-${entities.length + 1}`,
      type: record.type,
      layer: all(record.groups, 8)[0]?.value || "(não informada)",
      closed: false,
      points: [],
      error: null,
    };
    try {
      const g = geometryGroups(record.groups);
      const layer = one(g, 8)?.value;
      if (!layer?.trim())
        throw new Error("A entidade não informa uma camada (código 8).");
      entity.layer = layer;
      if (record.type !== "LWPOLYLINE" && record.type !== "POLYLINE")
        throw new Error(
          `Tipo ${record.type} não suportado. Use LWPOLYLINE ou POLYLINE 2D com segmentos retos; blocos não são expandidos.`,
        );
      if (ending) modelPlane(geometryGroups(ending.groups));
      const parsed =
        record.type === "LWPOLYLINE"
          ? lwPoints(g)
          : polyPoints(g, vertices, complete);
      entity.points = parsed.points;
      entity.closed = parsed.closed;
    } catch (e) {
      entity.error = e instanceof Error ? e.message : String(e);
    }
    entities.push(entity);
    if (entities.length > MAX_DXF_ENTITIES)
      throw new Error(
        "O DXF excede o limite de 200 entidades no espaço ENTITIES.",
      );
  }
  return { entities, ...metadata };
}

export function convertDxfPoints(
  entity: DxfEntity,
  transform: DxfTransform,
): Point[] {
  if (entity.error) throw new Error(entity.error);
  if (!["LWPOLYLINE", "POLYLINE"].includes(entity.type))
    throw new Error("Tipo de entidade não suportado.");
  if (!["m", "cm", "mm"].includes(transform.unit))
    throw new Error("Escolha a unidade do DXF: m, cm ou mm.");
  if (
    !Number.isFinite(transform.originX) ||
    !Number.isFinite(transform.originZ)
  )
    throw new Error(
      "Informe uma origem X/Y finita nas unidades do arquivo DXF.",
    );
  if (entity.points.length < 2 || entity.points.length > MAX_DXF_POINTS)
    throw new Error("A polilinha deve ter entre 2 e 500 pontos.");
  const factor =
    transform.unit === "cm" ? 0.01 : transform.unit === "mm" ? 0.001 : 1;
  return entity.points.map((p, i) => {
    const x = (p.x - transform.originX) * factor;
    const y = (p.y - transform.originZ) * factor;
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x) > 1e6 ||
      Math.abs(y) > 1e6
    )
      throw new Error(
        `Ponto ${i + 1}: coordenadas convertidas devem ficar entre −1.000.000 e 1.000.000 m.`,
      );
    return { x, y };
  });
}
