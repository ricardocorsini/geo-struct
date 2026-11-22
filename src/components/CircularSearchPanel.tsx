import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_BISHOP_ITERATIONS } from "../core/bishop";
import type {
  SearchCircleEvaluation,
  SearchMethod,
} from "../core/circular-search";
import type { FixedCircleGeometry } from "../core/fixed-circle";
import type { InputPreparation } from "../core/input";
import {
  MAX_SEARCH_CANDIDATES,
  prepareSearchGrid,
  type SearchLocation,
} from "../core/search-grid";
import { parseNumber } from "../domain/geometry";
import type { NumericalProfile } from "../domain/model";
import { startSearchWorker } from "../lib/circular-search-client";
import type { SearchExecutionControls } from "../lib/use-case-calculation";
import {
  CircularSearchResults,
  CircularSearchTable,
} from "./CircularSearchResults";
import { Dialog } from "./Dialog";
import { SearchCircleInspection } from "./SearchCircleInspection";

export type SearchOverlay = {
  inputRevision: string;
  geometry: FixedCircleGeometry;
};
type Inspection =
  | { kind: "list" }
  | {
      kind: "circle";
      location: SearchLocation;
      method: SearchMethod | null;
      detail: SearchCircleEvaluation | null;
      error?: string;
    };

const fields = {
  toleranceM: "Tolerância geométrica (m)",
  maxArcDegrees: "Abertura máxima por fatia (°)",
  drivingThresholdKNPerM: "Limiar motriz τD (kN/m)",
  tensionToleranceKPa: "Tolerância de tração τt (kPa)",
  nearTieTolerance: "Faixa de quase empate em FS",
  initialFactor: "Fator inicial F₀",
  residualTolerance: "Tolerância do resíduo τF",
  maxIterations: "Máximo de avaliações K",
  singularityThreshold: "Limiar de singularidade τm",
};
type Field = keyof typeof fields;
const initial: Record<Field, string> = {
  toleranceM: "",
  maxArcDegrees: "3",
  drivingThresholdKNPerM: "",
  tensionToleranceKPa: "",
  nearTieTolerance: "",
  initialFactor: "",
  residualTolerance: "",
  maxIterations: "",
  singularityThreshold: "",
};

export function CircularSearchPanel({
  preparation,
  dirty,
  onPreview,
  initialProfile,
  onProfileChange,
  execution,
  executionBlocked = false,
}: {
  preparation: InputPreparation;
  dirty: boolean;
  onPreview: (overlay: SearchOverlay | null) => void;
  initialProfile: NumericalProfile["search"];
  onProfileChange: (fields: Record<Field, string>) => void;
  execution: SearchExecutionControls;
  executionBlocked?: boolean;
}) {
  const [hasSavedProfile] = useState(
    () => initialProfile.geometry.toleranceM !== null,
  );
  const [values, setValues] = useState(() => {
    const { geometry, equilibrium, bishop, nearTieTolerance } = initialProfile;
    const parameters = {
      ...geometry,
      ...equilibrium,
      ...bishop,
      nearTieTolerance,
    };
    const values = { ...initial };
    for (const key of Object.keys(values) as Field[]) {
      values[key] = String(parameters[key] ?? "");
    }
    return values;
  });
  const { state: run } = execution;
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [visibleNumber, setVisibleNumber] = useState<number | null>(null);
  const worker = useRef<(() => void) | null>(null);
  const stopWorker = useCallback(() => {
    worker.current?.();
    worker.current = null;
  }, []);
  const resetInspection = useCallback(() => {
    stopWorker();
    setInspection(null);
    setVisibleNumber(null);
    onPreview(null);
  }, [stopWorker, onPreview]);
  const executionIdentity =
    run.status === "completed" ? run.result : run.status;
  useEffect(() => {
    resetInspection();
  }, [executionIdentity, resetInspection]);
  useEffect(() => {
    if (dirty || executionBlocked) resetInspection();
  }, [dirty, executionBlocked, resetInspection]);
  useEffect(
    () => () => {
      stopWorker();
      onPreview(null);
    },
    [stopWorker, onPreview],
  );

  const input = preparation.snapshot?.input;
  const bounds = input?.surface.mode === "search" ? input.surface.axes : null;
  const hasBishop = input?.analysis.methods.includes("bishop") ?? false;
  const toleranceM = parseNumber(values.toleranceM);
  const grid = useMemo(
    () =>
      bounds && values.toleranceM.trim()
        ? prepareSearchGrid(bounds, toleranceM ?? NaN)
        : null,
    [bounds, toleranceM, values.toleranceM],
  );
  const completed =
    !dirty &&
    !executionBlocked &&
    run.status === "completed" &&
    run.result.inputRevision === preparation.snapshot?.revision
      ? run.result
      : null;
  const running = !dirty && !executionBlocked && run.status === "running";

  const start = () => {
    if (dirty || executionBlocked || running || grid?.status !== "ready")
      return;
    resetInspection();
    execution.start();
  };

  const inspect = (location: SearchLocation, method: SearchMethod | null) => {
    if (!completed) return;
    stopWorker();
    const pending = { kind: "circle" as const, location, method, detail: null };
    setInspection(pending);
    try {
      worker.current = startSearchWorker(
        { type: "inspect", preparation, profile: completed.profile, location },
        (response) => {
          if (response.type === "progress") return;
          worker.current = null;
          if (response.type === "detail")
            setInspection({ ...pending, detail: response.detail });
          else if (response.type === "error")
            setInspection({ ...pending, error: response.message });
        },
      );
    } catch {
      setInspection({
        ...pending,
        error: "Não foi possível iniciar a inspeção em segundo plano.",
      });
    }
  };

  const closeInspection = () => {
    stopWorker();
    setInspection(null);
  };
  const field = (key: Field) => (
    <label className="field">
      <span>{fields[key]}</span>
      <input
        aria-label={`Busca · ${fields[key]}`}
        inputMode={key === "maxIterations" ? "numeric" : "decimal"}
        value={values[key]}
        disabled={dirty || running}
        onChange={(e) => {
          const next = { ...values, [key]: e.target.value };
          setValues(next);
          onProfileChange(next);
          resetInspection();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
    </label>
  );
  const settings = (
    <>
      {field("toleranceM")}
      {field("maxArcDegrees")}
      <fieldset className="case-fields">
        <legend>Parâmetros da busca</legend>
        {field("drivingThresholdKNPerM")}
        {field("tensionToleranceKPa")}
        {field("nearTieTolerance")}
        <p className="hint">
          Informe valores não negativos. A faixa de quase empate sinaliza
          diferenças acima do menor FS, sem alterar a ordem.
        </p>
      </fieldset>
      {hasBishop && (
        <fieldset className="case-fields">
          <legend>Convergência de Bishop</legend>
          {field("initialFactor")}
          {field("residualTolerance")}
          {field("maxIterations")}
          {field("singularityThreshold")}
          <p className="hint">
            F₀ e τF positivos. K inteiro de 1 a {MAX_BISHOP_ITERATIONS}. τm não
            negativo.
          </p>
        </fieldset>
      )}
    </>
  );
  return (
    <details
      className="circular-search-panel"
      open={hasSavedProfile ? true : undefined}
    >
      <summary>Executar busca circular</summary>
      <section aria-label="Busca circular">
        {dirty ? (
          <p>Aplique ou descarte o rascunho para executar a busca.</p>
        ) : (
          <>
            <p className="hint">
              A busca usa os limites, os passos e os métodos do caso aplicado.
              Até {MAX_SEARCH_CANDIDATES.toLocaleString("pt-BR")} círculos por
              execução.
            </p>
            {!hasSavedProfile && settings}
            {grid?.status === "ready" && (
              <p aria-label="Tamanho da malha">
                <strong>{grid.grid.total} círculos</strong> ·{" "}
                {grid.grid.axes.x.values.length} centros X ×{" "}
                {grid.grid.axes.z.values.length} centros Z ×{" "}
                {grid.grid.axes.radius.values.length} raios.
              </p>
            )}
            {grid?.status === "blocked" && (
              <p className="form-error" role="alert">
                {grid.message}
              </p>
            )}
            <div className="search-actions">
              <button
                className="secondary"
                type="button"
                onClick={start}
                disabled={
                  executionBlocked || running || grid?.status !== "ready"
                }
              >
                Iniciar busca circular
              </button>
              {running && (
                <button
                  className="secondary"
                  type="button"
                  onClick={execution.cancel}
                >
                  Cancelar busca
                </button>
              )}
            </div>
            {hasSavedProfile && (
              <details className="search-profile">
                <summary>Perfil de cálculo do caso</summary>
                {settings}
              </details>
            )}
            {running && (
              <div className="search-progress">
                <progress
                  aria-label="Progresso da busca circular"
                  max={run.progress.total}
                  value={run.progress.completed}
                />
                <p>
                  {run.progress.completed} de {run.progress.total} círculos
                  avaliados.
                </p>
              </div>
            )}
            {run.status === "cancelled" && (
              <p role="status">
                Busca cancelada. {run.progress.completed} de{" "}
                {run.progress.total} círculos avaliados. Resultado parcial
                descartado.
              </p>
            )}
            {run.status === "failed" && (
              <p className="form-error" role="alert">
                {run.message}
              </p>
            )}
            {completed && (
              <CircularSearchResults
                result={completed}
                onInspect={inspect}
                onList={() => setInspection({ kind: "list" })}
              />
            )}
            {visibleNumber !== null && (
              <div className="search-actions">
                <span>Círculo {visibleNumber} no desenho.</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setVisibleNumber(null);
                    onPreview(null);
                  }}
                >
                  Ocultar fatias
                </button>
              </div>
            )}
          </>
        )}
      </section>
      {completed && inspection && (
        <Dialog
          title={
            inspection.kind === "list"
              ? "Círculos avaliados na busca"
              : `Inspeção do círculo ${inspection.location.number}`
          }
          description={
            inspection.kind === "list"
              ? "Malha, resultados por método e motivos registrados durante a busca."
              : "Dados e cálculos reproduzidos para o círculo selecionado."
          }
          onClose={closeInspection}
          wide
        >
          {inspection.kind === "list" ? (
            <CircularSearchTable
              result={completed}
              onInspect={(candidate) => inspect(candidate.location, null)}
            />
          ) : (
            <>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  stopWorker();
                  setInspection({ kind: "list" });
                }}
              >
                Voltar aos círculos avaliados
              </button>
              {inspection.detail ? (
                <SearchCircleInspection
                  key={inspection.location.number}
                  preparation={preparation}
                  profile={completed.profile}
                  detail={inspection.detail}
                  initialMethod={inspection.method}
                  onShow={(geometry) => {
                    onPreview({
                      inputRevision: completed.inputRevision!,
                      geometry,
                    });
                    setVisibleNumber(inspection.location.number);
                    closeInspection();
                  }}
                />
              ) : inspection.error ? (
                <p role="alert">{inspection.error}</p>
              ) : (
                <p role="status">Preparando a inspeção…</p>
              )}
            </>
          )}
        </Dialog>
      )}
    </details>
  );
}
