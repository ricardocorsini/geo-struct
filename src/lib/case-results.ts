import type {
  SearchCircleEvaluation,
  SearchMethod,
  SolverResult,
} from "../core/circular-search";
import type {
  FixedCircleGeometry,
  FixedCirclePreparation,
} from "../core/fixed-circle";
import type { SearchLocation } from "../core/search-grid";
import type {
  CaseCalculationReadiness,
  FixedCaseCalculation,
  FixedCaseReady,
  SearchCaseReady,
} from "./case-calculation";
import type { CaseExecutionState } from "./case-execution";
import type { startSearchWorker } from "./circular-search-client";

type CompletedFixed = Extract<
  CaseExecutionState,
  { status: "completed"; mode: "fixed" }
>;
type CompletedSearch = Extract<
  CaseExecutionState,
  { status: "completed"; mode: "search" }
>;
export type CaseResultRecord =
  | { mode: "fixed"; ready: FixedCaseReady; execution: CompletedFixed }
  | { mode: "search"; ready: SearchCaseReady; execution: CompletedSearch };
export type CaseResultsContext = {
  projectId: string | null;
  caseId: string | null;
  sessionId?: string | number;
};
export type CaseResultsView =
  | { status: "empty"; record: null }
  | { status: "current"; record: CaseResultRecord }
  | {
      status: "stale";
      record: CaseResultRecord;
      reason: "draft" | "changed" | "pending";
    };
export type CaseResultsCache = {
  scope: string;
  records: Readonly<Record<string, CaseResultRecord>>;
};
type CacheAction =
  | { type: "retain"; scope: string; record: CaseResultRecord }
  | { type: "discard"; scope: string; caseId: string }
  | { type: "clear"; scope: string };

/** A sessão distingue reabrir um arquivo que conserva os mesmos IDs. */
export function caseResultsScope(context: CaseResultsContext): string {
  return JSON.stringify([context.sessionId ?? 0, context.projectId]);
}

export function caseResultsReducer(
  cache: CaseResultsCache,
  action: CacheAction,
): CaseResultsCache {
  const previous = cache.scope === action.scope ? cache.records : {};
  if (action.type === "clear") return { scope: action.scope, records: {} };
  if (action.type === "retain")
    return {
      scope: action.scope,
      records: { ...previous, [action.record.ready.caseId]: action.record },
    };
  const records = { ...previous };
  delete records[action.caseId];
  return { scope: action.scope, records };
}

/** IDs importados são strings arbitrárias, inclusive nomes do protótipo de Object. */
export function getRetainedCaseResult(
  cache: CaseResultsCache,
  context: CaseResultsContext,
): CaseResultRecord | null {
  const caseId = context.caseId;
  return cache.scope === caseResultsScope(context) &&
    caseId !== null &&
    Object.hasOwn(cache.records, caseId)
    ? cache.records[caseId]
    : null;
}

export function getCaseResultsView(
  record: CaseResultRecord | null,
  readiness: CaseCalculationReadiness,
  context: CaseResultsContext,
): CaseResultsView {
  if (
    !record ||
    record.ready.projectId !== context.projectId ||
    record.ready.caseId !== context.caseId
  )
    return { status: "empty", record: null };
  if (readiness.status === "blocked")
    return {
      status: "stale",
      record,
      reason: readiness.reason === "draft" ? "draft" : "pending",
    };
  return readiness.identityKey === record.ready.identityKey
    ? { status: "current", record }
    : { status: "stale", record, reason: "changed" };
}

export type ResultsSelection = {
  method: SearchMethod | null;
  candidateNumber: number | null;
  sliceNumber: number | null;
};
export type ResultSurface = {
  geometry: FixedCirclePreparation;
  preparations: FixedCaseCalculation["preparations"];
  methods: readonly SolverResult[];
  location: SearchLocation | null;
};
export type ResultsOverlay = {
  geometry: FixedCircleGeometry;
  selectedSliceNumber: number | null;
};
export type ResultsDetail =
  | { status: "idle" }
  | { status: "loading"; candidateNumber: number }
  | { status: "failed"; candidateNumber: number; message: string }
  | { status: "ready"; candidateNumber: number; value: SearchCircleEvaluation };

export function initialResultsSelection(
  record: CaseResultRecord,
): ResultsSelection {
  const method = record.ready.methods[0] ?? null;
  if (record.mode === "fixed")
    return {
      method,
      candidateNumber: null,
      sliceNumber:
        record.execution.fixed.geometry.geometry?.slices[0]?.number ?? null,
    };
  const search = record.execution.search;
  return {
    method,
    candidateNumber:
      search.rankings.find((ranking) => ranking.method === method)?.minimum
        ?.location.number ??
      search.candidates[0]?.location.number ??
      null,
    sliceNumber: null,
  };
}

/** Compara resultados completos do mesmo círculo, nunca os mínimos compactos da busca. */
export function getMethodComparison(
  methods: readonly SolverResult[],
):
  | { status: "comparable"; difference: number }
  | { status: "unavailable"; message: string } {
  const f = methods.find((r) => r.method === "fellenius");
  const b = methods.find((r) => r.method === "bishop");
  const unavailable = (message: string) => ({
    status: "unavailable" as const,
    message,
  });
  if (!f || !b)
    return unavailable(
      "A comparação exige resultados de Fellenius e Bishop no mesmo círculo.",
    );
  if (
    !f.inputRevision ||
    f.inputRevision !== b.inputRevision ||
    !f.source ||
    !b.source ||
    f.source.radiusM !== b.source.radiusM ||
    f.source.center.x !== b.source.center.x ||
    f.source.center.z !== b.source.center.z ||
    f.source.direction !== b.source.direction ||
    !f.geometryProfile ||
    !b.geometryProfile ||
    f.geometryProfile.toleranceM !== b.geometryProfile.toleranceM ||
    f.geometryProfile.maxArcDegrees !== b.geometryProfile.maxArcDegrees
  )
    return unavailable(
      "Os resultados pertencem a entradas, círculos ou discretizações diferentes.",
    );
  if (
    f.profile.drivingThresholdKNPerM !== b.profile.drivingThresholdKNPerM ||
    f.profile.tensionToleranceKPa !== b.profile.tensionToleranceKPa
  )
    return unavailable("Iguale τD e τt e recalcule para comparar os métodos.");
  if (
    f.status !== "calculated" ||
    b.status !== "calculated" ||
    !Number.isFinite(f.factorOfSafety) ||
    !Number.isFinite(b.factorOfSafety) ||
    f.factorOfSafety <= 0 ||
    b.factorOfSafety <= 0
  )
    return unavailable(
      "A diferença exige dois resultados positivos admissíveis.",
    );
  return {
    status: "comparable",
    difference: b.factorOfSafety - f.factorOfSafety,
  };
}

export type ResultsInspectionEvent = {
  record: CaseResultRecord | null;
  detail: ResultsDetail;
};

/** Um Worker por inspeção; referência do resultado e geração protegem inclusive a reabertura. */
export function createResultsInspection({
  current,
  onChange,
  startWorker,
}: {
  current: () => {
    record: CaseResultRecord | null;
    candidateNumber: number | null;
  };
  onChange: (event: ResultsInspectionEvent) => void;
  startWorker: typeof startSearchWorker;
}) {
  let generation = 0;
  let disposed = false;
  let stopWorker: (() => void) | null = null;
  const invalidate = () => {
    generation++;
    const stop = stopWorker;
    stopWorker = null;
    stop?.();
  };
  return {
    start: (
      record: Extract<CaseResultRecord, { mode: "search" }>,
      candidateNumber: number,
    ) => {
      if (disposed) return;
      invalidate();
      const token = generation;
      let finished = false;
      const active = () => {
        const selected = current();
        return (
          !disposed &&
          !finished &&
          token === generation &&
          selected.record === record &&
          selected.record.ready.identityKey === record.ready.identityKey &&
          selected.candidateNumber === candidateNumber
        );
      };
      if (!active()) return;
      const publish = (detail: ResultsDetail) => onChange({ record, detail });
      const finish = (detail: ResultsDetail) => {
        if (!active()) return;
        finished = true;
        invalidate();
        publish(detail);
      };
      const fail = (message: string) =>
        finish({ status: "failed", candidateNumber, message });
      const candidate = record.execution.search.candidates.find(
        (c) => c.location.number === candidateNumber,
      );
      if (!candidate) {
        fail("O círculo selecionado não pertence ao resultado da busca.");
        return;
      }
      publish({ status: "loading", candidateNumber });
      if (!active()) return;
      try {
        const stop = startWorker(
          {
            type: "inspect",
            preparation: record.ready.preparation,
            profile: record.ready.profile,
            location: candidate.location,
          },
          (response) => {
            if (!active() || response.type === "progress") return;
            if (response.type === "error") fail(response.message);
            else if (response.type === "detail") {
              const value = response.detail;
              if (
                value.location.number !== candidateNumber ||
                JSON.stringify(value.location.circle) !==
                  JSON.stringify(candidate.location.circle) ||
                JSON.stringify(value.geometry.profile) !==
                  JSON.stringify(record.ready.profile.geometry)
              )
                fail("A inspeção retornou dados de outro círculo ou perfil.");
              else finish({ status: "ready", candidateNumber, value });
            } else fail("A inspeção retornou uma resposta inesperada.");
          },
        );
        if (active()) stopWorker = stop;
        else stop();
      } catch {
        fail("Não foi possível iniciar a inspeção em segundo plano.");
      }
    },
    reset: () => {
      if (disposed) return;
      invalidate();
      onChange({ record: null, detail: { status: "idle" } });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      invalidate();
    },
  };
}
