import {
  duplicateSection,
  emptyNumericalProfile,
  uid,
  type AnalysisCase,
  type Project,
  type Section,
} from "./model";

export const directionLabel = (v: AnalysisCase["direction"]) =>
  v === "left-to-right"
    ? "Esquerda → direita (+X)"
    : v === "right-to-left"
      ? "Direita → esquerda (−X)"
      : "Direção não definida";
export const surfaceLabel = (v: AnalysisCase["surfaceMode"]) =>
  v === "fixed"
    ? "Círculo fixo"
    : v === "search"
      ? "Busca circular"
      : "Superfície não definida";
export const methodLabel = (v: AnalysisCase["methods"][number]) =>
  v === "bishop" ? "Bishop Simplificado" : "Fellenius";
export const caseWaterLabel = (v: AnalysisCase["waterCondition"]) =>
  v === "section"
    ? "Usar condição da seção"
    : v === "dry"
      ? "Condição seca no caso"
      : v === "piezometric"
        ? "Usar linha da seção"
        : v === "case-piezometric"
          ? "Linha piezométrica do caso"
          : "Água não definida no caso";
export const caseLoadLabel = (v: AnalysisCase["loadCondition"]) =>
  v === "section"
    ? "Usar condição da seção"
    : v === "none"
      ? "Sem sobrecargas no caso"
      : v === "selected"
        ? "Usar faixas selecionadas"
        : "Cargas não definidas no caso";

function availableName(p: Project, sectionId: string, base: string) {
  let name = base.slice(0, 100),
    n = 2;
  while (
    p.analysisCases.some((c) => c.sectionId === sectionId && c.name === name)
  )
    name = `${base.slice(0, 100)} (${n++})`;
  return name;
}
export function addAnalysisCase(
  p: Project,
  sectionId: string,
  sourceId?: string,
): { project: Project; analysisCase: AnalysisCase } {
  if (p.analysisCases.length >= 100)
    throw new Error("Limite de 100 casos de análise por projeto.");
  if (!p.sections.some((s) => s.id === sectionId))
    throw new Error("A seção não existe mais.");
  const source = sourceId
    ? p.analysisCases.find(
        (c) => c.id === sourceId && c.sectionId === sectionId,
      )
    : undefined;
  if (sourceId && !source) throw new Error("Selecione um caso desta seção.");
  const axis = () => ({ min: null, max: null, step: null });
  const analysisCase: AnalysisCase = source
    ? {
        ...structuredClone(source),
        id: uid(),
        name: availableName(
          p,
          sectionId,
          `${source.name.slice(0, 85)} — cópia`,
        ),
      }
    : {
        id: uid(),
        name: availableName(p, sectionId, "Novo caso"),
        sectionId,
        description: "",
        direction: null,
        methods: [],
        surfaceMode: null,
        numericalProfile: emptyNumericalProfile(),
        fixedCircle: { x: null, y: null, radius: null },
        search: { x: axis(), y: axis(), radius: axis() },
        waterCondition: null,
        water: null,
        waterUnitWeight: null,
        waterSource: "",
        loadCondition: null,
        loadIds: [],
      };
  const next = structuredClone(p);
  next.analysisCases.push(analysisCase);
  return { project: next, analysisCase };
}
export function removeAnalysisCase(p: Project, id: string): Project {
  if (!p.analysisCases.some((c) => c.id === id))
    throw new Error("O caso não existe mais.");
  return {
    ...structuredClone(p),
    analysisCases: p.analysisCases
      .filter((c) => c.id !== id)
      .map((c) => structuredClone(c)),
  };
}
export function loadCaseUses(p: Project, loadId: string): AnalysisCase[] {
  return p.analysisCases.filter((c) => c.loadIds.includes(loadId));
}
export function duplicateSectionWithCases(
  p: Project,
  id: string,
): { project: Project; section: Section } {
  const original = p.sections.find((s) => s.id === id);
  if (!original) throw new Error("A seção não existe mais.");
  if (p.sections.length >= 100)
    throw new Error("Limite de 100 seções por projeto.");
  const cases = p.analysisCases.filter((c) => c.sectionId === id);
  if (p.analysisCases.length + cases.length > 100)
    throw new Error(
      "Duplicar a seção excederia o limite de 100 casos. Nenhum dado foi duplicado.",
    );
  const section = duplicateSection(original),
    next = structuredClone(p);
  const loads = new Map(
    original.loads.map((l, i) => [l.id, section.loads[i].id]),
  );
  next.sections.push(section);
  next.analysisCases.push(
    ...cases.map((c) => ({
      ...structuredClone(c),
      id: uid(),
      sectionId: section.id,
      loadIds: c.loadIds.map((id) => loads.get(id)!),
    })),
  );
  return { project: next, section };
}
export function removeSectionWithCases(p: Project, id: string): Project {
  if (p.sections.length <= 1)
    throw new Error("O projeto precisa manter ao menos uma seção.");
  if (!p.sections.some((s) => s.id === id))
    throw new Error("A seção não existe mais.");
  const next = structuredClone(p);
  next.sections = next.sections.filter((s) => s.id !== id);
  next.analysisCases = next.analysisCases.filter((c) => c.sectionId !== id);
  return next;
}
// View/input resolution only: no forces, pressures, candidates or results are computed.
export function resolveCaseSection(s: Section, c: AnalysisCase): Section {
  if (c.sectionId !== s.id) throw new Error("O caso pertence a outra seção.");
  const next = structuredClone(s);
  if (c.waterCondition === "case-piezometric") {
    next.waterMode = "piezometric";
    next.water = c.water ? structuredClone(c.water) : null;
    next.waterUnitWeight = c.waterUnitWeight;
    next.waterSource = c.waterSource;
  } else if (c.waterCondition !== "section") {
    next.waterMode = c.waterCondition ?? "unspecified";
    next.waterSource = c.waterSource;
  }
  if (c.loadCondition !== "section") {
    next.loadCondition =
      c.loadCondition === "none"
        ? "none"
        : c.loadCondition === "selected"
          ? "loads"
          : "unspecified";
    next.loads = next.loads.map((l) => ({
      ...l,
      enabled: c.loadIds.includes(l.id),
    }));
  }
  return next;
}

export type EffectiveWaterDescription = {
  selectionLabel: string;
  mode: Section["waterMode"];
  originKind: "section" | "case" | "none";
  originLabel: string;
  unitWeight: number | null;
  pointCount: number;
  source: string;
};

export function describeEffectiveWater(
  section: Section,
  analysisCase: AnalysisCase,
): EffectiveWaterDescription {
  const resolved = resolveCaseSection(section, analysisCase);
  const originKind =
    analysisCase.waterCondition === null
      ? "none"
      : analysisCase.waterCondition === "section"
        ? "section"
        : "case";
  const originLabel =
    analysisCase.waterCondition === "section"
      ? "Herdada da seção"
      : analysisCase.waterCondition === "piezometric"
        ? "Linha da seção · origem do caso"
        : analysisCase.waterCondition === "case-piezometric"
          ? "Própria do caso"
          : analysisCase.waterCondition === "dry"
            ? "Seca no caso"
            : "Não definida";
  return {
    selectionLabel: caseWaterLabel(analysisCase.waterCondition),
    mode: resolved.waterMode,
    originKind,
    originLabel,
    unitWeight:
      resolved.waterMode === "piezometric" ? resolved.waterUnitWeight : null,
    pointCount:
      resolved.waterMode === "piezometric" ? (resolved.water?.length ?? 0) : 0,
    source: resolved.waterSource.trim(),
  };
}
export type CaseIssue = { level: "warning" | "error"; message: string };
export function caseIssues(c: AnalysisCase): CaseIssue[] {
  const issues: CaseIssue[] = [];
  const pending = (message: string) =>
    issues.push({ level: "warning", message });
  if (!c.description.trim()) pending("registre as hipóteses do caso.");
  if (!c.direction) pending("defina a direção de deslizamento.");
  if (!c.methods.length) pending("selecione os métodos pretendidos.");
  if (!c.waterCondition) pending("defina a condição de água do caso.");
  if (!c.loadCondition) pending("defina a condição de sobrecargas do caso.");
  if (c.loadCondition === "selected" && !c.loadIds.length)
    pending("selecione ao menos uma faixa ou escolha Sem sobrecargas no caso.");
  if (!c.surfaceMode) pending("escolha círculo fixo ou busca circular.");
  if (
    c.surfaceMode === "fixed" &&
    Object.values(c.fixedCircle).some((v) => v === null)
  )
    pending("complete o centro X/Z e o raio do círculo fixo.");
  if (c.surfaceMode === "search")
    for (const [key, label] of [
      ["x", "Centro X"],
      ["y", "Centro Z"],
      ["radius", "Raio"],
    ] as const) {
      const { min, max, step } = c.search[key];
      if (min === null || max === null)
        pending(`${label}: informe mínimo e máximo da busca.`);
      if (min !== null && max !== null) {
        if (max < min)
          issues.push({
            level: "error",
            message: `${label}: o máximo não pode ser menor que o mínimo.`,
          });
        if (max > min && step === null)
          pending(`${label}: informe o passo da busca.`);
      }
    }
  return issues;
}
