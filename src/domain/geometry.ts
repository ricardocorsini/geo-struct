import polygonClipping from "polygon-clipping";
import type { Point, Section, Project } from "./model";
import { materialPending, materialUses } from "./materials";
import { activeLoads, activeWater, loadPending } from "./conditions";
import { caseIssues, resolveCaseSection } from "./analysis";
// Tolerância geométrica de modelagem, em metros. Não é tolerância do futuro solver.
export const EPS = 1e-7;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function signedArea(points: Point[]): number {
  const origin = points[0] ?? { x: 0, y: 0 };
  return (
    points.reduce((a, p, i) => {
      const q = points[(i + 1) % points.length];
      return (
        a +
        (p.x - origin.x) * (q.y - origin.y) -
        (q.x - origin.x) * (p.y - origin.y)
      );
    }, 0) / 2
  );
}
export function onSegment(p: Point, a: Point, b: Point): boolean {
  return (
    Math.abs(cross(a, b, p)) <= EPS * Math.max(1, distance(a, b)) &&
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}
export function segmentsIntersect(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): boolean {
  const c1 = cross(a, b, c),
    c2 = cross(a, b, d),
    c3 = cross(c, d, a),
    c4 = cross(c, d, b);
  return (
    (c1 * c2 < 0 && c3 * c4 < 0) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b)
  );
}
export function polygonError(p: Point[]): string | null {
  if (p.length < 3) return "Uma região precisa de ao menos três vértices.";
  for (let i = 0; i < p.length; i++) {
    const prev = p[(i + p.length - 1) % p.length];
    const next = p[(i + 1) % p.length];
    if (onSegment(next, prev, p[i]) || onSegment(prev, p[i], next))
      return "O contorno retorna sobre um segmento existente.";
    if (distance(p[i], p[(i + 1) % p.length]) <= EPS)
      return "Há vértices consecutivos coincidentes.";
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      if (
        segmentsIntersect(
          p[i],
          p[(i + 1) % p.length],
          p[j],
          p[(j + 1) % p.length],
        )
      )
        return "O contorno cruza ou toca a si próprio.";
    }
  }
  if (Math.abs(signedArea(p)) <= EPS * EPS) return "A região tem área nula.";
  return null;
}
export function lineError(points: Point[]): string | null {
  if (points.length < 2)
    return "Informe ao menos dois pontos, da esquerda para a direita.";
  if (points.some((p, i) => i > 0 && p.x - points[i - 1].x <= EPS))
    return "As coordenadas X devem crescer na linha piezométrica.";
  return null;
}
export function terrainError(points: Point[]): string | null {
  if (points.length < 2) return "Informe ao menos dois pontos do terreno.";
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[i - 1].x)
      return "As coordenadas X devem crescer ou permanecer iguais nas faces verticais. Perfis em balanço não são admitidos.";
    if (distance(points[i], points[i - 1]) <= EPS)
      return "Há pontos consecutivos coincidentes no terreno.";
    if (
      (points[i].x === points[0].x && points[i].y < points[i - 1].y) ||
      (points[i - 1].x === points.at(-1)!.x && points[i].y > points[i - 1].y)
    )
      return "A face vertical na extremidade se sobrepõe ao fechamento da seção. Remova o trecho sem área.";
    if (
      i > 1 &&
      (onSegment(points[i], points[i - 2], points[i - 1]) ||
        onSegment(points[i - 2], points[i - 1], points[i]))
    )
      return "O terreno retorna sobre um segmento existente.";
  }
  if (points.at(-1)!.x - points[0].x <= EPS)
    return "O terreno precisa ter extensão horizontal.";
  return null;
}
// Envelope para desenho/diagnóstico; não define forças do futuro motor.
export function elevation(
  points: Point[],
  x: number,
  side: "upper" | "lower" = "upper",
): number | null {
  if (points.length < 2 || x < points[0].x - EPS || x > points.at(-1)!.x + EPS)
    return null;
  const values: number[] = [];
  for (let i = 1; i < points.length; i++)
    if (x >= points[i - 1].x - EPS && x <= points[i].x + EPS) {
      const a = points[i - 1],
        b = points[i];
      if (Math.abs(b.x - a.x) <= EPS) values.push(a.y, b.y);
      else
        values.push(
          a.y + (b.y - a.y) * Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x))),
        );
    }
  return values.length
    ? side === "upper"
      ? Math.max(...values)
      : Math.min(...values)
    : null;
}
export function boundary(s: Section): Point[] {
  return s.terrain.length < 2
    ? []
    : [
        ...s.terrain,
        { x: s.terrain.at(-1)!.x, y: s.base },
        { x: s.terrain[0].x, y: s.base },
      ];
}
const ring = (p: Point[]): polygonClipping.Polygon => [
  p.map(({ x, y }) => [x, y]),
];
function clippedArea(mp: polygonClipping.MultiPolygon): number {
  return mp.reduce(
    (a, poly) =>
      a +
      poly.reduce(
        (v, r, i) =>
          v +
          (i === 0 ? 1 : -1) *
            Math.abs(signedArea(r.map(([x, y]) => ({ x, y })))),
        0,
      ),
    0,
  );
}
export function regionError(
  s: Section,
  points: Point[],
  exceptId?: string,
): string | null {
  const err = polygonError(points);
  if (err) return err;
  if (terrainError(s.terrain))
    return "Defina primeiro um perfil de terreno válido.";
  if (s.terrain.some((p) => p.y <= s.base + EPS))
    return "A base deve ficar abaixo de todo o terreno.";
  try {
    if (
      clippedArea(polygonClipping.difference(ring(points), ring(boundary(s)))) >
      EPS * EPS
    )
      return "A região deve ficar inteiramente dentro da seção.";
    for (const r of s.regions)
      if (
        r.id !== exceptId &&
        !polygonError(r.points) &&
        clippedArea(
          polygonClipping.intersection(ring(points), ring(r.points)),
        ) >
          EPS * EPS
      )
        return `A região se sobrepõe a “${r.name}”. Contornos podem compartilhar bordas.`;
  } catch {
    return "Não foi possível verificar os contornos. Revise os vértices.";
  }
  return null;
}
export type Diagnostic = {
  level: "error" | "warning" | "info";
  message: string;
  target: string;
  sectionId?: string;
};
export function loadOverlaps(
  s: Section,
): { firstId: string; secondId: string; x1: number; x2: number }[] {
  const loads = activeLoads(s),
    pairs: { firstId: string; secondId: string; x1: number; x2: number }[] = [];
  for (let i = 0; i < loads.length; i++)
    for (let j = i + 1; j < loads.length; j++) {
      const x1 = Math.max(loads[i].x1, loads[j].x1),
        x2 = Math.min(loads[i].x2, loads[j].x2);
      if (x2 - x1 > EPS)
        pairs.push({ firstId: loads[i].id, secondId: loads[j].id, x1, x2 });
    }
  return pairs;
}
export function introducedError(
  before: Project,
  after: Project,
): Diagnostic | undefined {
  const key = (d: Diagnostic) =>
    `${d.sectionId ?? ""}:${d.target}:${d.message}`;
  const previous = new Set(
    diagnose(before)
      .filter((d) => d.level === "error")
      .map(key),
  );
  return diagnose(after).find(
    (d) => d.level === "error" && !previous.has(key(d)),
  );
}
export function diagnose(p: Project): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const m of p.materials) {
    const pending = materialPending(m);
    if (pending.length)
      out.push({
        level: "warning",
        target: m.id,
        message: `${m.name}: informe ${pending.join(", ")}.${materialUses(p, m.id).length ? "" : " Material ainda sem uso."}`,
      });
  }
  for (const s of p.sections) {
    const push = (level: Diagnostic["level"], message: string, target = s.id) =>
      out.push({
        level,
        message: `${s.name}: ${message}`,
        target,
        sectionId: s.id,
      });
    if (s.backgroundMaterialId === null)
      push("warning", "solo de fundo sem material atribuído.");
    for (const r of s.regions)
      if (r.materialId === null)
        push("warning", `${r.name}: sem material atribuído.`, r.id);
    if (s.waterMode === "unspecified")
      push(
        "warning",
        "defina a condição de água: seca ou linha piezométrica.",
        "water",
      );
    else {
      if (!s.waterSource.trim())
        push(
          "warning",
          "informe a origem ou hipótese da condição de água.",
          "water",
        );
      if (s.waterMode === "piezometric") {
        if (s.waterUnitWeight === null)
          push("warning", "informe o peso específico da água γw.", "water");
        if (!s.water || s.water.length < 2)
          push(
            "warning",
            "linha piezométrica pendente: informe ao menos dois pontos.",
            "water",
          );
      }
    }
    if (s.loadCondition === "unspecified")
      push(
        "warning",
        "defina a condição de sobrecargas: sem sobrecargas ou usar as cadastradas.",
        "loads",
      );
    if (s.loadCondition === "loads" && !activeLoads(s).length)
      push(
        "warning",
        "nenhuma sobrecarga está ativa; cadastre/ative uma faixa ou escolha Sem sobrecargas.",
        "loads",
      );
    for (const l of activeLoads(s)) {
      const pending = loadPending(l);
      if (pending.length)
        push("warning", `${l.name}: informe ${pending.join(" e ")}.`, l.id);
      if (l.q === 0)
        push(
          "info",
          `${l.name}: q = 0 kPa foi informado explicitamente.`,
          l.id,
        );
    }
    const overlaps = loadOverlaps(s);
    if (overlaps.length)
      push(
        "warning",
        `${overlaps.length} sobreposições entre faixas de sobrecarga ativas; confira se a coexistência é intencional.`,
        "loads",
      );
    const err = terrainError(s.terrain);
    if (err) {
      push("error", err);
      continue;
    }
    if (s.terrain.some((pt) => pt.y <= s.base + EPS))
      push("error", "a cota da base deve ficar abaixo de todo o terreno.");
    for (const r of s.regions) {
      const e = regionError(s, r.points, r.id);
      if (e) push("error", `${r.name}: ${e}`, r.id);
    }
    const water = activeWater(s);
    if (water && water.length >= 2) {
      const e = lineError(water);
      if (e) push("error", `linha piezométrica: ${e}`, "water");
      else {
        if (
          water[0].x > s.terrain[0].x + EPS ||
          water.at(-1)!.x < s.terrain.at(-1)!.x - EPS
        )
          push(
            "warning",
            "a linha piezométrica não cobre toda a seção.",
            "water",
          );
        const xs = [...s.terrain, ...water].map((v) => v.x);
        if (
          xs.some((x) => {
            const g = elevation(s.terrain, x, "lower"),
              w = elevation(water, x);
            return g !== null && w !== null && w > g + EPS;
          })
        )
          push(
            "warning",
            "há carga piezométrica acima do terreno; isso não modela lâmina de água externa.",
            "water",
          );
      }
    }
    for (const l of activeLoads(s))
      if (
        l.x2 - l.x1 <= EPS ||
        l.x1 < s.terrain[0].x - EPS ||
        l.x2 > s.terrain.at(-1)!.x + EPS
      )
        push(
          "error",
          `${l.name}: confira os limites da faixa sobre o terreno.`,
          l.id,
        );
  }
  for (const c of p.analysisCases) {
    const section = p.sections.find((s) => s.id === c.sectionId);
    if (!section) continue; // Structural validation reports missing references.
    for (const issue of caseIssues(c))
      out.push({
        ...issue,
        target: c.id,
        sectionId: c.sectionId,
        message: `${section.name} · ${c.name}: ${issue.message}`,
      });
    if (c.surfaceMode === "search" && section.terrain.length >= 2) {
      const tMin = section.terrain[0].x,
        tMax = section.terrain.at(-1)!.x;
      for (const [rangeKey, rangeLabel] of [
        ["entryRange", "Trecho de entrada"],
        ["exitRange", "Trecho de saída"],
      ] as const) {
        const { min, max } = c.search[rangeKey];
        if (
          min !== null &&
          max !== null &&
          max >= min &&
          (min < tMin - EPS || max > tMax + EPS)
        ) {
          out.push({
            level: "warning",
            target: c.id,
            sectionId: c.sectionId,
            message: `${section.name} · ${c.name}: ${rangeLabel} ultrapassa os limites horizontais do terreno.`,
          });
        }
      }
    }
    const resolved = resolveCaseSection(section, c);
    for (const d of diagnose({
      ...p,
      materials: [],
      analysisCases: [],
      sections: [{ ...resolved, regions: [] }],
    })) {
      const isWater = d.target === "water" && c.waterCondition !== null;
      const isLoad =
        (d.target === "loads" ||
          resolved.loads.some((l) => l.id === d.target)) &&
        c.loadCondition !== null;
      if (isWater || isLoad)
        out.push({ ...d, target: c.id, message: `${c.name} · ${d.message}` });
    }
  }
  return out;
}
export function parseNumber(value: string): number | null {
  const v = value.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(v)) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function parseCoordinates(text: string): Point[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((x) => x.trim());
  if (lines.length > 500) throw new Error("Limite de 500 pontos por contorno.");
  return lines.map((line, i) => {
    const values = line.trim().split(/[;\t ]+/);
    const x = parseNumber(values[0] ?? ""),
      y = parseNumber(values[1] ?? "");
    if (
      values.length !== 2 ||
      x === null ||
      y === null ||
      Math.abs(x) > 1e6 ||
      Math.abs(y) > 1e6
    )
      throw new Error(
        `Linha ${i + 1}: use X ; Y, com valores entre −1.000.000 e 1.000.000 m.`,
      );
    return { x, y };
  });
}
