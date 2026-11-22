import type {
  CircularSearchResult,
  SearchProgress,
} from "../core/circular-search";
import type { Immutable } from "../core/input";
import { freeze } from "../core/immutable";
import {
  calculateFixedCase,
  type FixedCaseCalculation,
  type FixedCaseReady,
  type SearchCaseReady,
} from "./case-calculation";
import { startSearchWorker } from "./circular-search-client";

type BoundExecution = {
  identityKey: string;
  caseId: string;
  mode: "fixed" | "search";
};

export type CaseExecutionState = Immutable<
  | { status: "idle" }
  | (BoundExecution & {
      status: "running" | "cancelled";
      progress: SearchProgress;
    })
  | (BoundExecution & { status: "failed"; message: string })
  | (BoundExecution & {
      status: "completed";
      mode: "fixed";
      fixed: FixedCaseCalculation;
    })
  | (BoundExecution & {
      status: "completed";
      mode: "search";
      search: Extract<CircularSearchResult, { status: "completed" }>;
    })
>;

export type CaseExecution = {
  start: (ready: FixedCaseReady | SearchCaseReady) => void;
  cancel: () => void;
  reset: () => void;
  dispose: () => void;
};

/** Coordena recursos de sessão, sem React e sem persistir estado no projeto. */
export function createCaseExecution({
  onChange,
  currentKey,
  startWorker = startSearchWorker,
}: {
  onChange: (state: CaseExecutionState) => void;
  currentKey: () => string | null;
  startWorker?: typeof startSearchWorker;
}): CaseExecution {
  let state: CaseExecutionState = { status: "idle" };
  let generation = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopWorker: (() => void) | null = null;

  const publish = (next: CaseExecutionState) => {
    state = freeze(next);
    onChange(state);
  };
  const invalidate = () => {
    // Invalida primeiro: terminate também pode provocar callbacks de um adaptador.
    generation++;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const stop = stopWorker;
    stopWorker = null;
    stop?.();
  };
  const isCurrent = (token: number, identityKey: string) =>
    !disposed &&
    generation === token &&
    currentKey() === identityKey &&
    state.status === "running" &&
    state.identityKey === identityKey;

  const start = (ready: FixedCaseReady | SearchCaseReady) => {
    if (disposed) return;
    invalidate();
    if (currentKey() !== ready.identityKey) {
      publish({ status: "idle" });
      return;
    }
    const token = generation;
    const bound: BoundExecution = {
      identityKey: ready.identityKey,
      caseId: ready.caseId,
      mode: ready.mode,
    };
    publish({
      ...bound,
      status: "running",
      progress: {
        completed: 0,
        total: ready.mode === "fixed" ? 1 : ready.grid.total,
      },
    });
    const active = () => isCurrent(token, ready.identityKey);
    const finish = (next: CaseExecutionState) => {
      if (!active()) return;
      invalidate();
      publish(next);
    };
    const fail = (message: string) =>
      finish({ ...bound, status: "failed", message });
    if (!active()) return;
    if (ready.mode === "fixed") {
      timer = setTimeout(() => {
        timer = null;
        if (!active()) return;
        try {
          const fixed = calculateFixedCase(ready);
          finish({ ...bound, mode: "fixed", status: "completed", fixed });
        } catch {
          fail("Não foi possível concluir o cálculo do círculo fixo.");
        }
      }, 0);
      return;
    }
    try {
      const stop = startWorker(
        { type: "run", preparation: ready.preparation, profile: ready.profile },
        (response) => {
          if (!active()) return;
          switch (response.type) {
            case "progress":
              publish({
                ...bound,
                status: "running",
                progress: { ...response.progress },
              });
              break;
            case "result":
              if (response.result.status === "completed")
                finish({
                  ...bound,
                  mode: "search",
                  status: "completed",
                  search: response.result,
                });
              else fail(response.result.diagnostic.message);
              break;
            case "error":
              fail(response.message);
              break;
            default:
              fail("A execução da busca retornou uma resposta inesperada.");
          }
        },
      );
      // Um adaptador pode responder antes de retornar a função de cancelamento.
      if (active()) stopWorker = stop;
      else stop();
    } catch {
      fail("Não foi possível iniciar a busca em segundo plano.");
    }
  };

  return {
    start,
    cancel: () => {
      if (disposed || state.status !== "running") return;
      const running = state;
      invalidate();
      publish({ ...running, status: "cancelled" });
    },
    reset: () => {
      if (disposed) return;
      invalidate();
      publish({ status: "idle" });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      invalidate();
      state = { status: "idle" };
    },
  };
}
