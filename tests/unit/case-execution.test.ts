import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCircularSearch } from "../../src/core/circular-search";
import * as calculation from "../../src/lib/case-calculation";
import {
  createCaseExecution,
  type CaseExecutionState,
} from "../../src/lib/case-execution";
import type {
  SearchRequest,
  SearchResponse,
} from "../../src/lib/circular-search-messages";
import { emptyNumericalProfile } from "../../src/domain/model";
import { fixture } from "../fixtures/equilibrium";
import {
  bishopProfile,
  felleniusProfile,
  searchProfile,
} from "../fixtures/numerical-profile";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function model() {
  const p = fixture();
  p.analysisCases[0].numericalProfile = {
    ...emptyNumericalProfile(),
    geometry: { toleranceM: 1e-8, maxArcDegrees: 3 },
    fellenius: { ...felleniusProfile },
    bishop: { ...bishopProfile },
    search: structuredClone(searchProfile),
  };
  return p;
}

function fixedReady(): calculation.FixedCaseReady {
  const p = model();
  const ready = calculation.getCaseCalculationReadiness(
    p,
    p.analysisCases[0].id,
  );
  if (ready.status !== "ready" || ready.mode !== "fixed")
    throw new Error(JSON.stringify(ready));
  return ready;
}

function searchReady(): calculation.SearchCaseReady {
  const p = model();
  const c = p.analysisCases[0];
  c.surfaceMode = "search";
  c.search = {
    x: { min: 0, max: 0, step: null },
    y: { min: 4, max: 4, step: null },
    radius: { min: 3, max: 5, step: 1 },
  };
  const ready = calculation.getCaseCalculationReadiness(p, c.id);
  if (ready.status !== "ready" || ready.mode !== "search")
    throw new Error(JSON.stringify(ready));
  return ready;
}

function harness(
  ready:
    | calculation.FixedCaseReady
    | calculation.SearchCaseReady = searchReady(),
) {
  let key: string | null = ready.identityKey;
  const states: CaseExecutionState[] = [];
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
  const execution = createCaseExecution({
    currentKey: () => key,
    onChange: (state) => states.push(state),
    startWorker,
  });
  return {
    ready,
    execution,
    states,
    workers,
    startWorker,
    setKey: (next: string | null) => {
      key = next;
    },
    last: () => states.at(-1),
  };
}

describe("Execução do caso na sessão", () => {
  it("anuncia execução antes do cálculo fixo e calcula uma única vez após o timer", () => {
    const ready = fixedReady();
    const h = harness(ready);
    const calculate = vi.spyOn(calculation, "calculateFixedCase");
    h.execution.start(ready);
    expect(h.last()).toMatchObject({
      status: "running",
      caseId: ready.caseId,
      identityKey: ready.identityKey,
      mode: "fixed",
      progress: { completed: 0, total: 1 },
    });
    expect(calculate).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(calculate).toHaveBeenCalledExactlyOnceWith(ready);
    const completed = h.last();
    expect(completed).toMatchObject({ status: "completed", mode: "fixed" });
    if (completed?.status !== "completed" || completed.mode !== "fixed")
      throw new Error("Esperado resultado fixo");
    expect(completed.fixed.identityKey).toBe(ready.identityKey);
    expect(completed.fixed.methods.map((m) => m.method)).toEqual(ready.methods);
    expect(h.startWorker).not.toHaveBeenCalled();
  });

  it("cancela o timer fixo sem produzir resultado e conserva progresso", () => {
    const ready = fixedReady();
    const h = harness(ready);
    const calculate = vi.spyOn(calculation, "calculateFixedCase");
    h.execution.start(ready);
    h.execution.cancel();
    vi.runAllTimers();
    expect(calculate).not.toHaveBeenCalled();
    expect(h.last()).toMatchObject({
      status: "cancelled",
      progress: { completed: 0, total: 1 },
    });
    expect(h.last()).not.toHaveProperty("fixed");
  });

  it("ignora timer e pedido que já não correspondem à identidade atual", () => {
    const ready = fixedReady();
    const h = harness(ready);
    const calculate = vi.spyOn(calculation, "calculateFixedCase");
    h.execution.start(ready);
    h.setKey("perfil-alterado");
    const count = h.states.length;
    vi.runAllTimers();
    expect(calculate).not.toHaveBeenCalled();
    expect(h.states).toHaveLength(count);
    h.execution.start(ready);
    expect(h.last()).toEqual({ status: "idle" });
    expect(calculate).not.toHaveBeenCalled();
  });

  it("entrega bloqueio geométrico fixo como resultado concluído com diagnósticos", () => {
    const p = model();
    p.analysisCases[0].fixedCircle.radius = 3;
    const ready = calculation.getCaseCalculationReadiness(
      p,
      p.analysisCases[0].id,
    );
    if (ready.status !== "ready" || ready.mode !== "fixed")
      throw new Error("Esperada prontidão fixa");
    const h = harness(ready);
    h.execution.start(ready);
    vi.runAllTimers();
    const state = h.last();
    if (state?.status !== "completed" || state.mode !== "fixed")
      throw new Error("Esperado cálculo concluído");
    expect(state.fixed.geometry.status).toBe("blocked");
    expect(state.fixed.methods).toEqual([]);
    expect(state.fixed.geometry.diagnostics.length).toBeGreaterThan(0);
  });

  it("usa o Worker existente e conserva progresso até a conclusão da busca", () => {
    const ready = searchReady();
    const h = harness(ready);
    h.execution.start(ready);
    expect(h.workers[0].request).toEqual({
      type: "run",
      preparation: ready.preparation,
      profile: ready.profile,
    });
    h.workers[0].receive({
      type: "progress",
      progress: { completed: 1, total: 3 },
    });
    expect(h.last()).toMatchObject({
      status: "running",
      progress: { completed: 1, total: 3 },
    });
    const result = runCircularSearch(ready.preparation, ready.profile);
    h.workers[0].receive({ type: "result", result });
    expect(h.last()).toMatchObject({
      status: "completed",
      mode: "search",
      identityKey: ready.identityKey,
      search: result,
    });
    expect(h.workers[0].stop).toHaveBeenCalledTimes(1);
    const count = h.states.length;
    h.workers[0].receive({ type: "error", message: "atrasado" });
    expect(h.states).toHaveLength(count);
  });

  it("cancela a busca, encerra o Worker e descarta callbacks/resultados parciais", () => {
    const ready = searchReady();
    const h = harness(ready);
    h.execution.start(ready);
    h.workers[0].receive({
      type: "progress",
      progress: { completed: 1, total: 3 },
    });
    h.execution.cancel();
    expect(h.workers[0].stop).toHaveBeenCalledTimes(1);
    expect(h.last()).toMatchObject({
      status: "cancelled",
      progress: { completed: 1, total: 3 },
    });
    expect(h.last()).not.toHaveProperty("search");
    const count = h.states.length;
    h.workers[0].receive({
      type: "progress",
      progress: { completed: 2, total: 3 },
    });
    h.workers[0].receive({
      type: "result",
      result: runCircularSearch(ready.preparation, ready.profile),
    });
    expect(h.states).toHaveLength(count);
  });

  it("somente a geração ativa da mesma identidade pode alterar a execução", () => {
    const ready = searchReady();
    const h = harness(ready);
    h.execution.start(ready);
    h.execution.start(ready);
    expect(h.workers).toHaveLength(2);
    expect(h.workers[0].stop).toHaveBeenCalledTimes(1);
    const count = h.states.length;
    h.workers[0].receive({
      type: "progress",
      progress: { completed: 2, total: 3 },
    });
    h.workers[0].receive({ type: "error", message: "anterior" });
    expect(h.states).toHaveLength(count);
    h.workers[1].receive({
      type: "progress",
      progress: { completed: 1, total: 3 },
    });
    expect(h.last()).toMatchObject({
      status: "running",
      progress: { completed: 1, total: 3 },
    });
  });

  it.each(["outro-caso", "outro-perfil", null])(
    "ignora respostas após mudar a identidade para %s",
    (key) => {
      const ready = searchReady();
      const h = harness(ready);
      h.execution.start(ready);
      h.setKey(key);
      const count = h.states.length;
      h.workers[0].receive({
        type: "progress",
        progress: { completed: 2, total: 3 },
      });
      h.workers[0].receive({
        type: "result",
        result: runCircularSearch(ready.preparation, ready.profile),
      });
      h.workers[0].receive({ type: "error", message: "atrasado" });
      expect(h.states).toHaveLength(count);
    },
  );

  it("reset encerra recursos e retira resultados sem aceitar respostas antigas", () => {
    const ready = searchReady();
    const h = harness(ready);
    h.execution.start(ready);
    h.execution.reset();
    expect(h.last()).toEqual({ status: "idle" });
    expect(h.workers[0].stop).toHaveBeenCalledTimes(1);
    const count = h.states.length;
    h.workers[0].receive({ type: "error", message: "atrasado" });
    expect(h.states).toHaveLength(count);
    const fixed = fixedReady();
    h.setKey(fixed.identityKey);
    const calculate = vi.spyOn(calculation, "calculateFixedCase");
    h.execution.start(fixed);
    h.execution.reset();
    vi.runAllTimers();
    expect(calculate).not.toHaveBeenCalled();
    expect(h.last()).toEqual({ status: "idle" });
  });

  it("dispose encerra Worker e timer sem emitir estado após desmontagem", () => {
    const ready = searchReady();
    const h = harness(ready);
    h.execution.start(ready);
    const count = h.states.length;
    h.execution.dispose();
    expect(h.workers[0].stop).toHaveBeenCalledTimes(1);
    h.workers[0].receive({ type: "error", message: "atrasado" });
    h.execution.reset();
    h.execution.cancel();
    h.execution.start(ready);
    expect(h.states).toHaveLength(count);
    expect(h.workers).toHaveLength(1);

    const fixed = fixedReady();
    const timer = harness(fixed);
    const calculate = vi.spyOn(calculation, "calculateFixedCase");
    timer.execution.start(fixed);
    timer.execution.dispose();
    vi.runAllTimers();
    expect(calculate).not.toHaveBeenCalled();
    expect(timer.states).toHaveLength(1);
  });

  it("representa erros de inicialização, execução e retorno bloqueado", () => {
    const ready = searchReady();
    const states: CaseExecutionState[] = [];
    const execution = createCaseExecution({
      currentKey: () => ready.identityKey,
      onChange: (state) => states.push(state),
      startWorker: () => {
        throw new Error("falha simulada");
      },
    });
    execution.start(ready);
    expect(states.at(-1)).toMatchObject({ status: "failed", mode: "search" });
    const h = harness(ready);
    h.execution.start(ready);
    h.workers[0].receive({
      type: "error",
      message: "Erro informado pelo Worker",
    });
    expect(h.last()).toMatchObject({
      status: "failed",
      message: "Erro informado pelo Worker",
    });
    h.execution.start(ready);
    h.workers[1].receive({
      type: "result",
      result: {
        contract: "geostruct-circular-search/1",
        status: "blocked",
        inputRevision: ready.inputRevision,
        profile: ready.profile,
        diagnostic: { code: "bloqueio", message: "Diagnóstico preservado" },
      },
    });
    expect(h.last()).toMatchObject({
      status: "failed",
      message: "Diagnóstico preservado",
    });

    const fixed = fixedReady();
    const f = harness(fixed);
    vi.spyOn(calculation, "calculateFixedCase").mockImplementation(() => {
      throw new Error("falha simulada");
    });
    f.execution.start(fixed);
    vi.runAllTimers();
    expect(f.last()).toMatchObject({ status: "failed", mode: "fixed" });
  });

  it("encerra o recurso devolvido após uma resposta síncrona do adaptador", () => {
    const ready = searchReady();
    const stop = vi.fn();
    const states: CaseExecutionState[] = [];
    const execution = createCaseExecution({
      currentKey: () => ready.identityKey,
      onChange: (state) => states.push(state),
      startWorker: (_request, receive) => {
        receive({ type: "error", message: "Falha imediata" });
        return stop;
      },
    });
    execution.start(ready);
    expect(states.at(-1)).toMatchObject({
      status: "failed",
      message: "Falha imediata",
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
