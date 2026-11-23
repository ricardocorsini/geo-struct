import { projectSchema, type Point, type Project } from "./model";
import { EPS, introducedError, regionError, terrainError } from "./geometry";

export type DxfAssignment = {
  entityId: string;
  target:
    | { kind: "terrain" }
    | { kind: "region"; id: string }
    | {
        kind: "new-region";
        id: string;
        name: string;
        materialId: string | null;
      };
  points: Point[];
  closed: boolean;
};

// Assemble the entire section before validating it: a new terrain and its
// regions may only be valid together. Never publish an intermediate contour.
export function importDxfContours(
  project: Project,
  sectionId: string,
  assignments: DxfAssignment[],
): Project {
  const index = project.sections.findIndex((s) => s.id === sectionId);
  if (index < 0) throw new Error("Selecione uma seção existente.");
  if (!assignments.length)
    throw new Error("Escolha ao menos uma entidade DXF.");
  if (assignments.length > 65)
    throw new Error("Limite de um terreno e 64 regiões por seção.");
  const next = structuredClone(project);
  const section = next.sections[index];
  const entities = new Set<string>();
  const targets = new Set<string>();
  const regions = new Set<string>();
  let terrainChanged = false;
  for (const assignment of assignments) {
    if (!assignment.entityId || entities.has(assignment.entityId))
      throw new Error("Cada entidade DXF deve ter um único destino.");
    entities.add(assignment.entityId);
    const { target, closed } = assignment;
    const key = target.kind === "terrain" ? "terrain" : `region:${target.id}`;
    if (targets.has(key))
      throw new Error("Duas entidades não podem substituir o mesmo contorno.");
    targets.add(key);
    const points = assignment.points.map((p) => ({ ...p }));
    if (target.kind === "terrain") {
      if (closed) throw new Error("O terreno exige uma polilinha aberta.");
      section.terrain = points;
      terrainChanged = true;
    } else {
      if (!closed)
        throw new Error("As regiões de solo exigem polilinhas fechadas.");
      // A repeated last vertex is redundant with the DXF closed flag. Only
      // remove exact equality; no tolerance, simplification or repair is used.
      if (
        points.length > 1 &&
        points[0].x === points.at(-1)!.x &&
        points[0].y === points.at(-1)!.y
      )
        points.pop();
      if (target.kind === "region") {
        const region = section.regions.find((r) => r.id === target.id);
        if (!region) throw new Error("Selecione uma região existente.");
        region.points = points;
      } else if (target.kind === "new-region") {
        section.regions.push({
          id: target.id,
          name: target.name,
          materialId: target.materialId,
          points,
        });
      } else throw new Error("Destino DXF inválido.");
      regions.add(target.id);
    }
  }
  const parsed = projectSchema.safeParse(next);
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((i) => i.message).join(" · "));
  const finalSection = parsed.data.sections[index];
  if (terrainChanged) {
    const error = terrainError(finalSection.terrain);
    if (error) throw new Error(error);
    if (finalSection.terrain.some((p) => p.y <= finalSection.base + EPS))
      throw new Error("A base deve ficar abaixo de todo o terreno.");
  }
  for (const r of finalSection.regions) {
    if (!terrainChanged && !regions.has(r.id)) continue;
    const error = regionError(finalSection, r.points, r.id);
    if (error) throw new Error(`${r.name}: ${error}`);
  }
  const added = introducedError(project, parsed.data);
  if (added) throw new Error(added.message);
  return parsed.data;
}
