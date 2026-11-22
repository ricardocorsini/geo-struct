import { useEffect, useState } from "react";
import type { FixedCircleGeometry } from "../core/fixed-circle";
import type { CaseExecutionState } from "../lib/case-execution";
import { getMethodComparison } from "../lib/case-results";
import type { CaseResultsControls } from "../lib/use-case-results";
import { methodLabel } from "../domain/analysis";
import { BishopInspection, formatResultNumber as number } from "./BishopPanel";
import {
  CircularSearchResults,
  CircularSearchTable,
  describeCircle,
  searchOutcome,
} from "./CircularSearchResults";
import { Dialog } from "./Dialog";
import { FelleniusInspection } from "./FelleniusPanel";
import { MaterialAreaInspection } from "./MaterialAreaInspection";
import { ResultsSliceInspection } from "./ResultsSliceInspection";
import { SliceLoadInspection } from "./SliceLoadInspection";
import { SliceMechanicsInspection } from "./SliceMechanicsInspection";
import { SlicePressureInspection } from "./SlicePressureInspection";
import { SliceWeightInspection } from "./SliceWeightInspection";

export type ResultsWorkspaceProps = {
  results: CaseResultsControls;
  execution: CaseExecutionState;
  caseName: string | null;
  onCalculate: () => void;
};

export function ResultsWorkspace({
  results,
  execution,
  caseName,
  onCalculate,
}: ResultsWorkspaceProps) {
  const { view, selection, detail, surface } = results;
  const [dialog, setDialog] = useState<
    "candidates" | "slices" | "inspection" | null
  >(null);
  const [candidateText, setCandidateText] = useState("");
  const [candidateError, setCandidateError] = useState("");
  const record = view.status === "current" ? view.record : null;
  useEffect(() => {
    setDialog(null);
  }, [record]);
  useEffect(() => {
    setCandidateText(String(selection.candidateNumber ?? ""));
    setCandidateError("");
  }, [selection.candidateNumber, record]);
  const temporarilyUnavailable =
    execution.status === "running" ||
    execution.status === "cancelled" ||
    execution.status === "failed";
  if (!record || temporarilyUnavailable) {
    const heading =
      execution.status === "running"
        ? "Calculando caso"
        : execution.status === "cancelled"
          ? "Cálculo cancelado"
          : execution.status === "failed"
            ? "Falha no cálculo"
            : view.status === "stale"
              ? "Resultado desatualizado"
              : "Nenhum resultado nesta sessão";
    const message =
      execution.status === "running"
        ? `${execution.progress.completed} de ${execution.progress.total} etapa(s) concluída(s).`
        : execution.status === "cancelled"
          ? "O resultado parcial foi descartado. Execute o caso novamente."
          : execution.status === "failed"
            ? execution.message
            : view.status === "stale"
              ? view.reason === "draft"
                ? "Aplique ou descarte os rascunhos para conferir as entradas e recalcular."
                : "As entradas ou o perfil do caso mudaram. Confira as propriedades e recalcule."
              : caseName
                ? "Use Calcular caso para preparar os resultados do caso selecionado."
                : "Selecione um caso na árvore para consultar seus resultados.";
    return (
      <aside
        className="inspector results-workspace"
        aria-label="Resultados do caso"
      >
        <div className="panel-heading">
          <span>RESULTADOS</span>
        </div>
        <div className="inspector-fields results-fields">
          <h2>{caseName ?? "Resultados"}</h2>
          <p role="status" aria-label="Disponibilidade dos resultados">
            <strong>{heading}</strong>
          </p>
          <p>{message}</p>
          {execution.status === "running" ? (
            <progress
              aria-label="Progresso na aba Resultados"
              value={execution.progress.completed}
              max={execution.progress.total}
            />
          ) : (
            <button type="button" className="secondary" onClick={onCalculate}>
              Calcular caso
            </button>
          )}
        </div>
      </aside>
    );
  }
  const input = record.ready.preparation.snapshot?.input;
  const search = record.mode === "search" ? record.execution.search : null;
  const candidates = search?.candidates ?? [];
  const candidateIndex = candidates.findIndex(
    (candidate) => candidate.location.number === selection.candidateNumber,
  );
  const method = surface?.methods.find(
    (item) => item.method === selection.method,
  );
  const geometry = surface?.geometry.geometry;
  const comparison = surface ? getMethodComparison(surface.methods) : null;
  const prepareCandidate = () => {
    const candidateNumber = Number(candidateText);
    if (
      !Number.isInteger(candidateNumber) ||
      !candidates.some(
        (candidate) => candidate.location.number === candidateNumber,
      )
    ) {
      setCandidateError("Informe o número de um círculo avaliado nesta busca.");
      return;
    }
    setCandidateError("");
    if (candidateNumber !== selection.candidateNumber)
      results.selectCandidate(candidateNumber);
  };
  const diagnostics = surface
    ? [
        ...surface.geometry.diagnostics.map((item) => ({
          stage: "Geometria",
          ...item,
        })),
        ...Object.entries(surface.preparations ?? {}).flatMap(
          ([stage, preparation]) =>
            preparation.diagnostics.map((item) => ({
              stage: (
                {
                  weights: "Pesos",
                  pressures: "Água",
                  loads: "Sobrecargas",
                  mechanics: "Entrada mecânica",
                } as Record<string, string>
              )[stage],
              ...item,
            })),
        ),
        ...surface.methods.flatMap((item) =>
          item.diagnostics.map((diagnostic) => ({
            stage: methodLabel(item.method),
            ...diagnostic,
          })),
        ),
      ]
    : [];
  return (
    <aside
      className="inspector results-workspace"
      aria-label="Resultados do caso"
    >
      <div className="panel-heading">
        <span>RESULTADOS</span>
      </div>
      <div className="inspector-fields results-fields">
        <h2>{caseName ?? input?.origin.analysisCase.name ?? "Resultados"}</h2>
        <p
          className="hint"
          role="status"
          aria-label="Disponibilidade dos resultados"
        >
          Resultados da entrada e do perfil aplicados.
        </p>
        <label className="field">
          <span>Método do resultado</span>
          <select
            aria-label="Método do resultado"
            value={selection.method ?? ""}
            onChange={(event) => {
              const selected = record.ready.methods.find(
                (item) => item === event.target.value,
              );
              if (selected) results.selectMethod(selected);
            }}
          >
            {record.ready.methods.map((item) => (
              <option key={item} value={item}>
                {methodLabel(item)}
              </option>
            ))}
          </select>
        </label>
        {surface && (
          <section
            aria-label="Resultado da superfície selecionada"
            className="results-surface-summary"
          >
            <h3>
              {search
                ? `Superfície ${selection.candidateNumber}`
                : "Círculo fixo"}
            </h3>
            {(surface.location?.circle ?? geometry?.circle) && (
              <p>
                {describeCircle(
                  (surface.location?.circle ?? geometry?.circle)!,
                )}
              </p>
            )}
            <p
              aria-label={
                method?.factorOfSafety != null
                  ? "Fator de segurança do resultado"
                  : undefined
              }
            >
              <strong>
                {method ? searchOutcome(method) : "FS indisponível"}
              </strong>
            </p>
            <p className="hint" aria-label="Validade do resultado">
              {method?.status === "calculated"
                ? "FS positivo admissível no recorte do método; consulte os diagnósticos."
                : method?.status === "zero-resistance"
                  ? "Resistência nula, distinta de rejeição ou de resultado pendente."
                  : method?.status === "nonconverged"
                    ? "Sem convergência. As últimas parcelas são dados de diagnóstico, sem solução admissível."
                    : "Sem FS admissível. Consulte os diagnósticos da superfície e do método."}
            </p>
          </section>
        )}
        {search ? (
          <>
            <label className="field">
              <span>Superfície do resultado</span>
              <input
                aria-label="Superfície do resultado"
                type="number"
                inputMode="numeric"
                min={1}
                max={search.grid.total}
                step={1}
                value={candidateText}
                aria-invalid={!!candidateError}
                onChange={(event) => {
                  setCandidateText(event.target.value);
                  setCandidateError("");
                }}
                onBlur={prepareCandidate}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    prepareCandidate();
                  }
                }}
              />
            </label>
            {candidateError && (
              <p className="form-error" role="alert">
                {candidateError}
              </p>
            )}
            <div className="search-actions">
              <button
                type="button"
                className="secondary"
                aria-label="Superfície anterior"
                disabled={candidateIndex <= 0}
                onClick={() =>
                  results.selectCandidate(
                    candidates[candidateIndex - 1].location.number,
                  )
                }
              >
                Anterior
              </button>
              <button
                type="button"
                className="secondary"
                aria-label="Próxima superfície"
                disabled={
                  candidateIndex < 0 || candidateIndex + 1 >= candidates.length
                }
                onClick={() =>
                  results.selectCandidate(
                    candidates[candidateIndex + 1].location.number,
                  )
                }
              >
                Próxima
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setDialog("candidates")}
              >
                Ver superfícies avaliadas
              </button>
            </div>
          </>
        ) : (
          <p aria-label="Superfície do resultado">
            Círculo fixo informado no caso.
          </p>
        )}
        {detail.status === "loading" && (
          <p role="status">Preparando a superfície {detail.candidateNumber}…</p>
        )}
        {detail.status === "failed" && (
          <p className="form-error" role="alert">
            {detail.message}
          </p>
        )}
        {surface && (
          <>
            {record.ready.methods.length > 1 && (
              <section
                aria-label="Comparação na mesma superfície"
                className="results-comparison"
              >
                <h3>Mesma superfície</h3>
                {surface.methods.map((item) => (
                  <p key={item.method}>
                    {methodLabel(item.method)} · {searchOutcome(item)}
                  </p>
                ))}
                <p>
                  {comparison?.status === "comparable"
                    ? `ΔFS (Bishop − Fellenius) = ${number(comparison.difference)}.`
                    : (comparison?.message ?? "Comparação indisponível.")}
                </p>
                <p className="hint">
                  Comparação neste círculo. Os mínimos de cada método na malha
                  podem pertencer a outras superfícies.
                </p>
              </section>
            )}
            {diagnostics.length > 0 && (
              <details open className="results-diagnostics">
                <summary>
                  Diagnósticos da superfície ({diagnostics.length})
                </summary>
                <ul aria-label="Diagnósticos do resultado">
                  {diagnostics.map((diagnostic, index) => (
                    <li key={index}>
                      {diagnostic.stage} · {diagnostic.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {geometry && (
              <>
                <label className="field">
                  <span>Fatia do resultado</span>
                  <select
                    aria-label="Fatia do resultado"
                    value={selection.sliceNumber ?? ""}
                    onChange={(event) =>
                      results.selectSlice(
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                  >
                    <option value="">Selecione uma fatia</option>
                    {geometry.slices.map((slice) => (
                      <option key={slice.number} value={slice.number}>
                        Fatia {slice.number}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDialog("slices")}
                >
                  Selecionar fatia pela tabela
                </button>
                {selection.sliceNumber !== null && (
                  <ResultsSliceInspection
                    surface={surface}
                    sliceNumber={selection.sliceNumber}
                    method={selection.method}
                  />
                )}
              </>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => setDialog("inspection")}
            >
              Inspeção completa
            </button>
          </>
        )}
        {search && (
          <details open className="results-search-minima">
            <summary>Mínimos da malha por método</summary>
            <CircularSearchResults
              result={search}
              onList={() => setDialog("candidates")}
              onInspect={(location, selectedMethod) =>
                results.selectCandidate(location.number, selectedMethod)
              }
            />
          </details>
        )}
      </div>
      {dialog === "candidates" && search && (
        <Dialog
          wide
          title="Círculos avaliados nos resultados"
          onClose={() => setDialog(null)}
          description="Selecione uma superfície para atualizar o desenho e a inspeção do mesmo caso."
        >
          <CircularSearchTable
            result={search}
            onInspect={(candidate) => {
              results.selectCandidate(candidate.location.number);
              setDialog(null);
            }}
          />
        </Dialog>
      )}
      {dialog === "slices" && geometry && (
        <Dialog
          wide
          title="Fatias da superfície selecionada"
          onClose={() => setDialog(null)}
          description="Use Tab e Enter nos botões de fatia para selecionar pelo teclado."
        >
          <ResultsSliceTable
            geometry={geometry}
            selectedSlice={selection.sliceNumber}
            onSelect={(sliceNumber) => {
              results.selectSlice(sliceNumber);
              setDialog(null);
            }}
          />
        </Dialog>
      )}
      {dialog === "inspection" && surface && input && (
        <Dialog
          wide
          title="Inspeção completa do resultado"
          onClose={() => setDialog(null)}
          description="Dados brutos da mesma superfície e do método selecionado. As tabelas completas mantêm suas inspeções independentes."
        >
          <p>
            {input.origin.analysisCase.name} ·{" "}
            {selection.method ? methodLabel(selection.method) : "Preparações"} ·{" "}
            {search
              ? `superfície ${selection.candidateNumber}`
              : "círculo fixo"}
            .
          </p>
          {diagnostics.length > 0 && (
            <ul aria-label="Diagnósticos na inspeção completa">
              {diagnostics.map((diagnostic, index) => (
                <li key={index}>
                  {diagnostic.stage} · {diagnostic.message}
                </li>
              ))}
            </ul>
          )}
          {method?.method === "fellenius" && (
            <FelleniusInspection result={method} />
          )}
          {method?.method === "bishop" && <BishopInspection result={method} />}
          {geometry && (
            <MaterialAreaInspection geometry={geometry} input={input} />
          )}
          {surface.preparations?.weights && (
            <SliceWeightInspection
              result={surface.preparations.weights}
              input={input}
            />
          )}
          {surface.preparations?.pressures && (
            <SlicePressureInspection
              result={surface.preparations.pressures}
              input={input}
            />
          )}
          {surface.preparations?.loads && (
            <SliceLoadInspection result={surface.preparations.loads} />
          )}
          {surface.preparations?.mechanics && (
            <SliceMechanicsInspection result={surface.preparations.mechanics} />
          )}
        </Dialog>
      )}
    </aside>
  );
}

function ResultsSliceTable({
  geometry,
  selectedSlice,
  onSelect,
}: {
  geometry: FixedCircleGeometry;
  selectedSlice: number | null;
  onSelect: (sliceNumber: number) => void;
}) {
  const pageSize = 50;
  const [page, setPage] = useState(() =>
    Math.floor(
      Math.max(
        0,
        geometry.slices.findIndex((slice) => slice.number === selectedSlice),
      ) / pageSize,
    ),
  );
  const pages = Math.max(1, Math.ceil(geometry.slices.length / pageSize));
  return (
    <div className="slice-inspection">
      <div className="materials-table-wrap slice-table-wrap">
        <table className="materials-table" aria-label="Fatias do resultado">
          <thead>
            <tr>
              <th>Fatia</th>
              <th>X inicial (m)</th>
              <th>X final (m)</th>
              <th>b (m)</th>
              <th>Área (m²)</th>
              <th>ℓ (m)</th>
            </tr>
          </thead>
          <tbody>
            {geometry.slices
              .slice(page * pageSize, (page + 1) * pageSize)
              .map((slice) => (
                <tr
                  key={slice.number}
                  aria-selected={slice.number === selectedSlice}
                >
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onSelect(slice.number)}
                    >
                      Selecionar fatia {slice.number}
                    </button>
                  </td>
                  <td>{number(slice.left.x)}</td>
                  <td>{number(slice.right.x)}</td>
                  <td>{number(slice.widthM)}</td>
                  <td>{number(slice.areaM2)}</td>
                  <td>{number(slice.chordLengthM)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="search-actions">
        <button
          type="button"
          className="secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <span>
          Página {page + 1} de {pages}
        </span>
        <button
          type="button"
          className="secondary"
          disabled={page + 1 === pages}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
