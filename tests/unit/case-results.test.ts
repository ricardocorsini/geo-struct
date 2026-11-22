import { describe, expect, it, vi } from "vitest";
import {
  evaluateSearchCircle,
  runCircularSearch,
} from "../../src/core/circular-search";
import {
  calculateFixedCase,
  getCaseCalculationReadiness,
} from "../../src/lib/case-calculation";
import {
  caseResultsReducer,
  caseResultsScope,
  createResultsInspection,
  getCaseResultsView,
  getMethodComparison,
  getRetainedCaseResult,
  initialResultsSelection,
  type CaseResultRecord,
  type CaseResultsCache,
  type ResultsInspectionEvent,
} from "../../src/lib/case-results";
import type {
  SearchRequest,
  SearchResponse,
} from "../../src/lib/circular-search-messages";
import { emptyNumericalProfile, projectSchema } from "../../src/domain/model";
import { copy, fixture } from "../fixtures/equilibrium";
import {
  bishopProfile,
  felleniusProfile,
  searchProfile,
} from "../fixtures/numerical-profile";

function model(search = false) {
  const project = fixture();
  project.materials[0].cohesion = 0;
  const c = project.analysisCases[0];
  c.numericalProfile = {
    ...emptyNumericalProfile(),
    geometry: { toleranceM: 1e-8, maxArcDegrees: 3 },
    fellenius: { ...felleniusProfile },
    bishop: { ...bishopProfile },
    search: structuredClone(searchProfile),
  };
  if (search) {
    c.surfaceMode = "search";
    c.search = {
      x: { min: 0, max: 0, step: null },
      y: { min: 4, max: 4, step: null },
      radius: { min: 3, max: 5, step: 1 },
    };
  }
  return project;
}

function record(search = false): CaseResultRecord {
  const p = model(search);
  const ready = getCaseCalculationReadiness(p, p.analysisCases[0].id);
  if (ready.status !== "ready") throw new Error(JSON.stringify(ready));
  const bound = {
    status: "completed" as const,
    caseId: ready.caseId,
    identityKey: ready.identityKey,
  };
  if (ready.mode === "fixed")
    return {
      mode: "fixed",
      ready,
      execution: { ...bound, mode: "fixed", fixed: calculateFixedCase(ready) },
    };
  const result = runCircularSearch(ready.preparation, ready.profile);
  if (result.status !== "completed") throw new Error(result.diagnostic.message);
  return {
    mode: "search",
    ready,
    execution: { ...bound, mode: "search", search: result },
  };
}

function inspectionHarness(result = record(true)) {
  if (result.mode !== "search") throw new Error("Busca esperada");
  let current: {
    record: CaseResultRecord | null;
    candidateNumber: number | null;
  } = { record: result, candidateNumber: 2 };
  const events: ResultsInspectionEvent[] = [];
  const workers: {
    request: SearchRequest;
    receive: (response: SearchResponse) => void;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  const startWorker = vi.fn(
    (request: SearchRequest, receive: (response: SearchResponse) => void) => {
      const stop = vi.fn();
      workers.push({ request, receive, stop });
      return stop;
    },
  );
  const inspection = createResultsInspection({
    current: () => current,
    onChange: (event) => events.push(event),
    startWorker,
  });
  const detail = (number = 2) =>
    evaluateSearchCircle(
      result.ready.preparation,
      result.ready.profile,
      result.execution.search.candidates[number - 1].location,
    );
  return {
    result,
    events,
    workers,
    inspection,
    detail,
    setCurrent: (next: typeof current) => {
      current = next;
    },
  };
}

describe("Resultados retidos por caso e sessão", () => {
  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "preserva o ID válido %s na leitura, retenção e descarte sem herdar registros",
    (caseId) => {
      const project = model();
      project.analysisCases[0].id = caseId;
      expect(projectSchema.safeParse(project).success).toBe(true);
      const ready = getCaseCalculationReadiness(project, caseId);
      if (ready.status !== "ready" || ready.mode !== "fixed")
        throw new Error("Esperada prontidão fixa com ID preservado");
      const context = { projectId: project.id, caseId, sessionId: 1 };
      const scope = caseResultsScope(context);
      const unrelated = record(true);
      let cache: CaseResultsCache = { scope, records: {} };
      expect(getRetainedCaseResult(cache, context)).toBeNull();
      expect(
        getCaseResultsView(
          getRetainedCaseResult(cache, context),
          ready,
          context,
        ),
      ).toEqual({ status: "empty", record: null });
      cache = caseResultsReducer(cache, {
        type: "retain",
        scope,
        record: unrelated,
      });
      const completed: CaseResultRecord = {
        mode: "fixed",
        ready,
        execution: {
          status: "completed",
          mode: "fixed",
          caseId,
          identityKey: ready.identityKey,
          fixed: calculateFixedCase(ready),
        },
      };
      cache = caseResultsReducer(cache, {
        type: "retain",
        scope,
        record: completed,
      });
      expect(Object.hasOwn(cache.records, caseId)).toBe(true);
      expect(Object.getPrototypeOf(cache.records)).toBe(Object.prototype);
      expect(getRetainedCaseResult(cache, context)).toBe(completed);
      expect(
        getCaseResultsView(
          getRetainedCaseResult(cache, context),
          ready,
          context,
        ).status,
      ).toBe("current");
      expect(
        getRetainedCaseResult(cache, { ...context, sessionId: 2 }),
      ).toBeNull();
      expect(
        getCaseResultsView(
          getRetainedCaseResult(cache, context),
          { ...ready, identityKey: "alterado" },
          context,
        ).status,
      ).toBe("stale");
      cache = caseResultsReducer(cache, { type: "discard", scope, caseId });
      expect(Object.hasOwn(cache.records, caseId)).toBe(false);
      expect(getRetainedCaseResult(cache, context)).toBeNull();
      expect(cache.records[unrelated.ready.caseId]).toBe(unrelated);
      expect(Object.getPrototypeOf(cache.records)).toBe(Object.prototype);
    },
  );

  it("retém casos independentes e descarta somente o caso solicitado", () => {
    const first = record();
    const second = record(true);
    let cache: CaseResultsCache = { scope: "sessão", records: {} };
    const original = cache;
    cache = caseResultsReducer(cache, {
      type: "retain",
      scope: "sessão",
      record: first,
    });
    cache = caseResultsReducer(cache, {
      type: "retain",
      scope: "sessão",
      record: second,
    });
    expect(cache.records[first.ready.caseId]).toBe(first);
    expect(cache.records[second.ready.caseId]).toBe(second);
    cache = caseResultsReducer(cache, {
      type: "discard",
      scope: "sessão",
      caseId: first.ready.caseId,
    });
    expect(cache.records[first.ready.caseId]).toBeUndefined();
    expect(cache.records[second.ready.caseId]).toBe(second);
    expect(original.records).toEqual({});
  });

  it("isola projeto e reabertura do mesmo projeto com outra sessão", () => {
    const result = record();
    const context = {
      projectId: result.ready.projectId,
      caseId: result.ready.caseId,
      sessionId: 1,
    };
    const scope = caseResultsScope(context);
    let cache: CaseResultsCache = { scope, records: {} };
    cache = caseResultsReducer(cache, {
      type: "retain",
      scope,
      record: result,
    });
    expect(caseResultsScope({ ...context, caseId: "outro-caso" })).toBe(scope);
    expect(
      caseResultsScope({ ...context, projectId: "outro-projeto" }),
    ).not.toBe(scope);
    const reopened = caseResultsScope({ ...context, sessionId: 2 });
    cache = caseResultsReducer(cache, { type: "clear", scope: reopened });
    expect(cache).toEqual({ scope: reopened, records: {} });
  });

  it("expõe current só na mesma identidade e não empresta resultados de outro caso", () => {
    const result = record();
    const context = {
      projectId: result.ready.projectId,
      caseId: result.ready.caseId,
    };
    expect(getCaseResultsView(result, result.ready, context)).toEqual({
      status: "current",
      record: result,
    });
    expect(
      getCaseResultsView(result, result.ready, { ...context, caseId: "outro" }),
    ).toEqual({ status: "empty", record: null });
    expect(
      getCaseResultsView(result, result.ready, {
        ...context,
        projectId: "outro",
      }),
    ).toEqual({ status: "empty", record: null });
    expect(getCaseResultsView(null, result.ready, context)).toEqual({
      status: "empty",
      record: null,
    });
    expect(
      getCaseResultsView(
        result,
        { ...result.ready, identityKey: "perfil-alterado" },
        context,
      ),
    ).toMatchObject({ status: "stale", reason: "changed" });
  });

  it("mantém o registro obsoleto durante rascunho ou pendência sem torná-lo atual", () => {
    const result = record();
    const context = {
      projectId: result.ready.projectId,
      caseId: result.ready.caseId,
    };
    for (const [reason, expected] of [
      ["draft", "draft"],
      ["profile-pending", "pending"],
    ] as const) {
      const view = getCaseResultsView(
        result,
        {
          status: "blocked",
          reason,
          message: "Pendente",
          missingFields: [],
          preparation: null,
          diagnostics: [],
        },
        context,
      );
      expect(view).toEqual({
        status: "stale",
        reason: expected,
        record: result,
      });
    }
    expect(getCaseResultsView(result, result.ready, context).status).toBe(
      "current",
    );
  });

  it("seleciona números originais e o mínimo do método inicial sem comparar mínimos", () => {
    const fixed = record();
    if (fixed.mode !== "fixed") throw new Error("Fixo esperado");
    expect(initialResultsSelection(fixed)).toMatchObject({
      method: "fellenius",
      candidateNumber: null,
      sliceNumber: fixed.execution.fixed.geometry.geometry?.slices[0].number,
    });
    const search = record(true);
    if (search.mode !== "search") throw new Error("Busca esperada");
    expect(initialResultsSelection(search)).toEqual({
      method: search.ready.methods[0],
      candidateNumber: search.execution.search.rankings.find(
        (r) => r.method === search.ready.methods[0],
      )?.minimum?.location.number,
      sliceNumber: null,
    });
  });
});

describe("Comparação dos métodos no mesmo círculo", () => {
  it("compara só resultados positivos admissíveis na mesma entrada e perfil", () => {
    const result = record();
    if (result.mode !== "fixed") throw new Error("Fixo esperado");
    const methods = result.execution.fixed.methods;
    expect(methods.every((m) => m.status === "calculated")).toBe(true);
    const comparison = getMethodComparison(methods);
    expect(comparison).toEqual({
      status: "comparable",
      difference: methods[1].factorOfSafety! - methods[0].factorOfSafety!,
    });
    expect(getMethodComparison(methods.slice(0, 1)).status).toBe("unavailable");
    const different = copy(methods);
    different[1].inputRevision = "outro-círculo";
    expect(getMethodComparison(different).status).toBe("unavailable");
    different[1].inputRevision = methods[1].inputRevision;
    different[1].source!.center.x += 1;
    expect(getMethodComparison(different).status).toBe("unavailable");
    const thresholds = copy(methods);
    thresholds[1].profile.tensionToleranceKPa += 1;
    expect(getMethodComparison(thresholds).status).toBe("unavailable");
    const invalid = copy(methods);
    invalid[0].status = "zero-resistance";
    invalid[0].factorOfSafety = 0;
    expect(getMethodComparison(invalid).status).toBe("unavailable");
  });
});

describe("Inspeção de candidato em Worker", () => {
  it("usa o perfil e a entrada originais, conservando detalhe e diagnóstico", () => {
    const h = inspectionHarness();
    h.inspection.start(h.result, 2);
    expect(h.events.at(-1)?.detail).toEqual({
      status: "loading",
      candidateNumber: 2,
    });
    expect(h.workers[0].request).toEqual({
      type: "inspect",
      preparation: h.result.ready.preparation,
      profile: h.result.ready.profile,
      location: h.result.execution.search.candidates[1].location,
    });
    const value = h.detail();
    h.workers[0].receive({ type: "detail", detail: value });
    expect(h.events.at(-1)?.detail).toEqual({
      status: "ready",
      candidateNumber: 2,
      value,
    });
    expect(h.workers[0].stop).toHaveBeenCalledTimes(1);
  });

  it("permite inspecionar candidato sem geometria e não inventa FS", () => {
    const h = inspectionHarness();
    h.setCurrent({ record: h.result, candidateNumber: 1 });
    h.inspection.start(h.result, 1);
    const value = h.detail(1);
    expect(value.geometry.status).toBe("blocked");
    h.workers[0].receive({ type: "detail", detail: value });
    const detail = h.events.at(-1)?.detail;
    expect(detail?.status).toBe("ready");
    if (detail?.status === "ready") {
      expect(detail.value.methods).toEqual([]);
      expect(detail.value.issues.length).toBeGreaterThan(0);
    }
  });

  it("recusa números fora dos candidatos sem iniciar Worker", () => {
    const h = inspectionHarness();
    h.setCurrent({ record: h.result, candidateNumber: 999 });
    h.inspection.start(h.result, 999);
    expect(h.events.at(-1)?.detail.status).toBe("failed");
    expect(h.workers).toHaveLength(0);
  });

  it.each(["case", "profile", "session", "candidate"])(
    "ignora resposta antiga após mudar %s antes da limpeza do efeito",
    (change) => {
      const h = inspectionHarness();
      h.inspection.start(h.result, 2);
      const next =
        change === "candidate"
          ? h.result
          : {
              ...h.result,
              ready: {
                ...h.result.ready,
                identityKey:
                  change === "session"
                    ? h.result.ready.identityKey
                    : "nova-identidade",
              },
            };
      h.setCurrent({
        record: next,
        candidateNumber: change === "candidate" ? 3 : 2,
      });
      const count = h.events.length;
      h.workers[0].receive({ type: "detail", detail: h.detail() });
      h.workers[0].receive({ type: "error", message: "atrasado" });
      expect(h.events).toHaveLength(count);
    },
  );

  it("protege gerações da mesma identidade e candidato, reset e desmontagem", () => {
    const h = inspectionHarness();
    h.inspection.start(h.result, 2);
    h.inspection.start(h.result, 2);
    expect(h.workers[0].stop).toHaveBeenCalledTimes(1);
    const count = h.events.length;
    h.workers[0].receive({ type: "detail", detail: h.detail() });
    expect(h.events).toHaveLength(count);
    h.inspection.reset();
    expect(h.events.at(-1)?.detail).toEqual({ status: "idle" });
    expect(h.workers[1].stop).toHaveBeenCalledTimes(1);
    h.inspection.start(h.result, 2);
    const beforeDispose = h.events.length;
    h.inspection.dispose();
    expect(h.workers[2].stop).toHaveBeenCalledTimes(1);
    h.workers[2].receive({ type: "detail", detail: h.detail() });
    h.inspection.reset();
    expect(h.events).toHaveLength(beforeDispose);
  });

  it("preserva falhas e recusa detalhes de outro círculo ou perfil", () => {
    const h = inspectionHarness();
    h.inspection.start(h.result, 2);
    h.workers[0].receive({ type: "error", message: "Erro da inspeção" });
    expect(h.events.at(-1)?.detail).toMatchObject({
      status: "failed",
      message: "Erro da inspeção",
    });
    h.inspection.start(h.result, 2);
    h.workers[1].receive({ type: "detail", detail: h.detail(3) });
    expect(h.events.at(-1)?.detail.status).toBe("failed");
    h.inspection.start(h.result, 2);
    const wrongProfile = copy(h.detail());
    wrongProfile.geometry.profile.maxArcDegrees = 1;
    h.workers[2].receive({ type: "detail", detail: wrongProfile });
    expect(h.events.at(-1)?.detail.status).toBe("failed");
  });

  it("encerra stopper retornado após erro síncrono do adaptador", () => {
    const result = record(true);
    if (result.mode !== "search") throw new Error("Busca esperada");
    const stop = vi.fn();
    const events: ResultsInspectionEvent[] = [];
    const inspection = createResultsInspection({
      current: () => ({ record: result, candidateNumber: 2 }),
      onChange: (event) => events.push(event),
      startWorker: (_request, receive) => {
        receive({ type: "error", message: "Imediato" });
        return stop;
      },
    });
    inspection.start(result, 2);
    expect(events.at(-1)?.detail).toMatchObject({
      status: "failed",
      message: "Imediato",
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
