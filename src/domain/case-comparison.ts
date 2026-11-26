import {
  describeEffectiveWater,
  directionLabel,
  resolveCaseSection,
  surfaceLabel,
  type EffectiveWaterDescription,
} from "./analysis";
import { auditProject } from "./audit";
import { activeLoads } from "./conditions";
import { prepareCoreInput } from "./core-input";
import type { AnalysisCase, NumericalProfile, Project } from "./model";

export type CaseMethodSummary = {
  method: "fellenius" | "bishop";
  status:
    | "calculated"
    | "zero-resistance"
    | "nonconverged"
    | "rejected"
    | "no-surface"
    | "no-factor";
  factorOfSafety: number | null;
  surface: { x: number; z: number; radius: number } | null;
  sliceCount: number | null;
  notes: string[];
};

export type CaseRunState =
  | "queued"
  | "running"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

export type CaseRunRecord = {
  caseId: string;
  sectionId: string;
  state: CaseRunState;
  inputRevision: string | null;
  profileRevision: string;
  progress?: { completed: number; total: number };
  surfaceMode: AnalysisCase["surfaceMode"];
  methods: CaseMethodSummary[];
  warnings: string[];
  error?: string;
  counts?: { total: number; geometric: number };
};

export type ComparisonStatusKind =
  | "current"
  | "outdated"
  | "running"
  | "queued"
  | "blocked"
  | "failed"
  | "cancelled"
  | "idle";

export type ScenarioComparisonRow = {
  analysisCase: AnalysisCase;
  water: EffectiveWaterDescription;
  activeLoadNames: string[];
  directionLabel: string;
  surfaceLabel: string;
  methods: ("fellenius" | "bishop")[];
  statusKind: ComparisonStatusKind;
  statusLabel: string;
  progress?: { completed: number; total: number };
  run: CaseRunRecord | null;
  fellenius: CaseMethodSummary | null;
  bishop: CaseMethodSummary | null;
  warnings: string[];
};

export function profileRevision(profile: NumericalProfile): string {
  return JSON.stringify(profile);
}

export function isNumericalProfileComplete(c: AnalysisCase): {
  ok: boolean;
  missingMessage?: string;
} {
  if (!c.surfaceMode) {
    return {
      ok: false,
      missingMessage: "Escolha círculo fixo ou busca circular no caso.",
    };
  }
  const p = c.numericalProfile;
  const required =
    c.surfaceMode === "search"
      ? [
          ...Object.values(p.search.geometry),
          ...Object.values(p.search.equilibrium),
          p.search.nearTieTolerance,
          ...(c.methods.includes("bishop")
            ? Object.values(p.search.bishop)
            : []),
        ]
      : [
          ...Object.values(p.geometry),
          ...(c.methods.includes("fellenius")
            ? Object.values(p.fellenius)
            : []),
          ...(c.methods.includes("bishop") ? Object.values(p.bishop) : []),
        ];
  if (required.some((value) => value === null)) {
    return {
      ok: false,
      missingMessage:
        "Perfil de cálculo incompleto. Informe os parâmetros numéricos do caso antes de calcular.",
    };
  }
  return { ok: true };
}

export function isCaseRunCurrent(
  project: Project,
  record: CaseRunRecord,
): boolean {
  const c = project.analysisCases.find((item) => item.id === record.caseId);
  if (!c || c.sectionId !== record.sectionId) return false;
  if (profileRevision(c.numericalProfile) !== record.profileRevision)
    return false;
  if (!record.inputRevision) return false;
  const prep = prepareCoreInput(project, c.id);
  return (
    prep.snapshot !== null && prep.snapshot.revision === record.inputRevision
  );
}

function uniqueMessages(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export function buildScenarioComparison(
  project: Project,
  sectionId: string,
  caseIds: string[],
  runs: Record<string, CaseRunRecord>,
): ScenarioComparisonRow[] {
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section) return [];
  const selectedIds = new Set(caseIds);
  const cases = project.analysisCases.filter(
    (c) => c.sectionId === sectionId && selectedIds.has(c.id),
  );
  if (!cases.length) return [];

  const auditScopes = auditProject(project);

  return cases.map((analysisCase) => {
    const resolved = resolveCaseSection(section, analysisCase);
    const water = describeEffectiveWater(section, analysisCase);
    const activeLoadNames = activeLoads(resolved).map((l) => l.name);
    const run = runs[analysisCase.id] ?? null;
    const caseDiagnostics =
      auditScopes
        .find((scope) => scope.id === analysisCase.id)
        ?.diagnostics.filter((d) => d.level !== "info")
        .map((d) => d.message) ?? [];

    let statusKind: ComparisonStatusKind = "idle";
    let statusLabel = "Não calculado";

    if (run) {
      if (run.state === "running") {
        statusKind = "running";
        statusLabel = run.progress
          ? `Calculando (${run.progress.completed}/${run.progress.total})`
          : "Calculando";
      } else if (run.state === "queued") {
        statusKind = "queued";
        statusLabel = "Na fila";
      } else if (run.state === "cancelled") {
        statusKind = "cancelled";
        statusLabel = "Cancelado";
      } else if (run.state === "failed") {
        statusKind = "failed";
        statusLabel = "Falhou";
      } else if (run.state === "blocked") {
        statusKind = isCaseRunCurrent(project, run) ? "blocked" : "outdated";
        statusLabel =
          statusKind === "blocked" ? "Incompleto / bloqueado" : "Desatualizado";
      } else if (run.state === "completed") {
        const current = isCaseRunCurrent(project, run);
        statusKind = current ? "current" : "outdated";
        statusLabel = current ? "Atualizado" : "Desatualizado";
      }
    }

    const showRunDetails =
      run !== null &&
      (run.state === "completed" ||
        run.state === "blocked" ||
        run.state === "failed" ||
        run.state === "cancelled");

    const fellenius =
      showRunDetails && run
        ? (run.methods.find((m) => m.method === "fellenius") ?? null)
        : null;
    const bishop =
      showRunDetails && run
        ? (run.methods.find((m) => m.method === "bishop") ?? null)
        : null;

    const warnings = uniqueMessages([
      ...caseDiagnostics,
      ...(run?.error ? [run.error] : []),
      ...(run?.warnings ?? []),
    ]);

    return {
      analysisCase,
      water,
      activeLoadNames,
      directionLabel: directionLabel(analysisCase.direction),
      surfaceLabel: surfaceLabel(analysisCase.surfaceMode),
      methods: [...analysisCase.methods],
      statusKind,
      statusLabel,
      progress: run?.progress,
      run,
      fellenius,
      bishop,
      warnings,
    };
  });
}
