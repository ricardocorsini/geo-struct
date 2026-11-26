import type { CoreInput, InputPreparation, InputSnapshot } from "../core/input";
import { projectSchema, type Point } from "./model";
import { resolveCaseSection } from "./analysis";
import { activeLoads, activeWater } from "./conditions";
import { auditProject } from "./audit";
import { freeze } from "../core/immutable";
const pointXZ = ({ x, y }: Point) => ({ x, z: y });

/** Recebe o projeto atual, já migrado pelo leitor. Nunca preenche pendências. */
export function prepareCoreInput(
  project: unknown,
  caseId: string,
): InputPreparation {
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success)
    return freeze({
      status: "unavailable" as const,
      snapshot: null,
      diagnostics: parsed.error.issues.map((issue) => ({
        code: "invalid-project" as const,
        level: "error" as const,
        message: issue.message,
        path: issue.path.map(String),
      })),
    });
  const p = parsed.data;
  const c = p.analysisCases.find((candidate) => candidate.id === caseId);
  if (!c)
    return freeze({
      status: "unavailable" as const,
      snapshot: null,
      diagnostics: [
        {
          code: "case-not-found" as const,
          level: "error" as const,
          message: "O caso de análise não existe neste projeto.",
          target: caseId,
        },
      ],
    });
  // As referências foram verificadas pelo schema, inclusive as faixas guardadas.
  const section = p.sections.find((s) => s.id === c.sectionId)!;
  const resolved = resolveCaseSection(section, c);
  const usedIds = new Set([
    section.backgroundMaterialId,
    ...section.regions.map((r) => r.materialId),
  ]);
  const materials = p.materials.filter((m) => usedIds.has(m.id));
  const diagnostics = auditProject({
    ...p,
    materials,
    sections: [section],
    analysisCases: [c],
  })
    .find((scope) => scope.id === c.id)!
    .diagnostics.map((d) => ({
      ...d,
      code: "model-diagnostic" as const,
    }));
  const input: CoreInput = {
    contract: "geostruct-input/1",
    stage: "inputs-only",
    origin: {
      projectFormat: "geostruct/6",
      project: { id: p.id, name: p.name },
      section: { id: section.id, name: section.name },
      analysisCase: { id: c.id, name: c.name },
    },
    units: {
      length: "m",
      force: "kN",
      stress: "kPa",
      unitWeight: "kN/m³",
      angle: "deg",
    },
    coordinates: { frame: "project", horizontal: "X", vertical: "Z", up: "+Z" },
    analysis: {
      assumptions: c.description,
      direction: c.direction,
      methods: [...c.methods],
    },
    geometry: {
      terrain: section.terrain.map(pointXZ),
      baseZ: section.base,
      backgroundMaterialId: section.backgroundMaterialId,
      regions: section.regions.map((r) => ({
        id: r.id,
        name: r.name,
        materialId: r.materialId,
        points: r.points.map(pointXZ),
      })),
    },
    materials: materials.map((m) => ({
      id: m.id,
      name: m.name,
      unitWeight: m.gamma,
      cohesion: m.cohesion,
      frictionDegrees: m.friction,
      parameterMode: m.mode,
      source: m.source,
    })),
    water: {
      selection: c.waterCondition,
      mode: resolved.waterMode,
      source: resolved.waterSource,
      line: activeWater(resolved)?.map(pointXZ) ?? null,
      unitWeight:
        resolved.waterMode === "piezometric" ? resolved.waterUnitWeight : null,
    },
    loads: {
      selection: c.loadCondition,
      condition: resolved.loadCondition,
      items: activeLoads(resolved).map((l) => ({
        id: l.id,
        name: l.name,
        x1: l.x1,
        x2: l.x2,
        q: l.q,
        source: l.source,
      })),
    },
    surface:
      c.surfaceMode === "fixed"
        ? {
            mode: "fixed",
            circle: {
              x: c.fixedCircle.x,
              z: c.fixedCircle.y,
              radius: c.fixedCircle.radius,
            },
          }
        : c.surfaceMode === "search"
          ? {
              mode: "search",
              axes: {
                x: { ...c.search.x },
                z: { ...c.search.y },
                radius: { ...c.search.radius },
              },
            }
          : { mode: null },
  };
  return freeze({
    status: diagnostics.some((d) => d.level !== "info")
      ? "pending"
      : "collected",
    snapshot: { input, revision: JSON.stringify(input) },
    diagnostics,
  });
}

/** Compara conteúdo, inclusive depois de desfazer/refazer; não usa relógio ou IDs aleatórios. */
export function isCoreInputCurrent(
  project: unknown,
  snapshot: InputSnapshot,
): boolean {
  const current = prepareCoreInput(
    project,
    snapshot.input.origin.analysisCase.id,
  );
  return (
    current.snapshot !== null && current.snapshot.revision === snapshot.revision
  );
}
