import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  CircularSearchResult,
  SearchProgress,
} from "../core/circular-search";
import type { CaseCalculationReadiness } from "./case-calculation";
import {
  createCaseExecution,
  type CaseExecution,
  type CaseExecutionState,
} from "./case-execution";
import {
  caseResultsReducer,
  caseResultsScope,
  getCaseResultsView,
  getRetainedCaseResult,
  type CaseResultRecord,
  type CaseResultsContext,
} from "./case-results";

export type SearchRunState =
  | { status: "idle" }
  | { status: "running" | "cancelled"; progress: SearchProgress }
  | { status: "failed"; message: string }
  | {
      status: "completed";
      result: Extract<CircularSearchResult, { status: "completed" }>;
    };
export type SearchExecutionControls = {
  state: SearchRunState;
  start: () => void;
  cancel: () => void;
  reset: () => void;
};
const idle = { status: "idle" } as const;

/** Estado de sessão compartilhado pela Ribbon e pelas inspeções do caso. */
export function useCaseCalculation(
  readiness: CaseCalculationReadiness,
  context: CaseResultsContext,
) {
  const scope = caseResultsScope(context);
  const [stored, setStored] = useState<{
    scope: string;
    state: CaseExecutionState;
  }>({ scope, state: idle });
  const [retained, dispatch] = useReducer(caseResultsReducer, {
    scope,
    records: {},
  });
  const executor = useRef<CaseExecution | null>(null);
  const current = useRef(readiness);
  const currentContext = useRef(context);
  const currentScope = useRef(scope);
  const runScope = useRef<string | null>(null);
  const runReady = useRef<Extract<
    CaseCalculationReadiness,
    { status: "ready" }
  > | null>(null);
  const identity = readiness.status === "ready" ? readiness.identityKey : null;
  const currentKey = useRef(identity);
  // O guard fica atualizado já no render, antes de callbacks de Workers antigos.
  current.current = readiness;
  currentContext.current = context;
  currentScope.current = scope;
  currentKey.current = identity;
  useEffect(() => {
    const task = createCaseExecution({
      onChange: (next) => {
        const eventScope = runScope.current ?? currentScope.current;
        if (eventScope !== currentScope.current) return;
        setStored({ scope: eventScope, state: next });
        const ready = runReady.current;
        if (
          next.status !== "completed" ||
          !ready ||
          ready.identityKey !== next.identityKey
        )
          return;
        let record: CaseResultRecord | null = null;
        if (ready.mode === "fixed" && next.mode === "fixed")
          record = { mode: "fixed", ready, execution: next };
        if (ready.mode === "search" && next.mode === "search")
          record = { mode: "search", ready, execution: next };
        if (record) dispatch({ type: "retain", scope: eventScope, record });
      },
      currentKey: () =>
        runScope.current === currentScope.current ? currentKey.current : null,
    });
    executor.current = task;
    return () => {
      task.dispose();
      if (executor.current === task) executor.current = null;
    };
  }, []);
  useEffect(() => {
    dispatch({ type: "clear", scope });
  }, [scope]);
  useEffect(() => {
    runReady.current = null;
    runScope.current = null;
    executor.current?.reset();
  }, [identity, scope, context.caseId]);

  const start = useCallback(() => {
    const ready = current.current;
    if (ready.status === "ready") {
      runReady.current = ready;
      runScope.current = currentScope.current;
      dispatch({
        type: "discard",
        scope: currentScope.current,
        caseId: ready.caseId,
      });
      executor.current?.start(ready);
    }
  }, []);
  const cancel = useCallback(() => executor.current?.cancel(), []);
  const reset = useCallback(() => {
    runReady.current = null;
    runScope.current = null;
    executor.current?.reset();
    const caseId = currentContext.current.caseId;
    if (caseId)
      dispatch({ type: "discard", scope: currentScope.current, caseId });
  }, []);
  const record = getRetainedCaseResult(retained, context);
  const results = getCaseResultsView(record, readiness, context);
  // Nunca publicar dados de outra revisão enquanto o efeito de reset é agendado.
  const activeState =
    stored.scope === scope &&
    stored.state.status !== "idle" &&
    stored.state.identityKey === identity
      ? stored.state
      : idle;
  const state =
    activeState.status !== "idle"
      ? activeState
      : results.status === "current"
        ? results.record.execution
        : idle;
  const search = useMemo<SearchRunState>(() => {
    if (state.status === "idle" || state.mode !== "search") return idle;
    if (state.status === "completed")
      return { status: "completed", result: state.search };
    if (state.status === "failed")
      return { status: "failed", message: state.message };
    return { status: state.status, progress: state.progress };
  }, [state]);
  const searchExecution = useMemo<SearchExecutionControls>(
    () => ({ state: search, start, cancel, reset }),
    [search, start, cancel, reset],
  );
  const fixed =
    state.status === "completed" && state.mode === "fixed" ? state.fixed : null;
  return { state, fixed, start, cancel, reset, searchExecution, results };
}
