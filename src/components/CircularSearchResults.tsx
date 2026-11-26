import { useMemo, useState } from "react";
import type { Circle } from "../core/circle-geometry";
import type {
  CircularSearchResult,
  SearchCandidate,
  SearchMethod,
  SearchMethodResult,
} from "../core/circular-search";
import { SEARCH_AXES, type SearchLocation } from "../core/search-grid";
import { methodLabel } from "../domain/analysis";
import { formatResultNumber as number } from "./BishopPanel";

export type CompletedSearch = Extract<
  CircularSearchResult,
  { status: "completed" }
>;
const axisLabels = { x: "X", z: "Z", radius: "raio" };
const exactNumber = (value: number) => String(value).replace(".", ",");

export function describeCircle(circle: Circle): string {
  return `X = ${exactNumber(circle.x)} m · Z = ${exactNumber(circle.z)} m · R = ${exactNumber(circle.radius)} m`;
}

export function searchOutcome(
  result: Pick<SearchMethodResult, "status" | "factorOfSafety"> | undefined,
): string {
  if (!result) return "Indisponível";
  if (result.status === "calculated")
    return `FS = ${number(result.factorOfSafety!)}`;
  if (result.status === "zero-resistance")
    return result.factorOfSafety === 0
      ? "Resistência nula · FS = 0"
      : "Resistência nula";
  return result.status === "nonconverged" ? "Sem convergência" : "Rejeitado";
}

export function searchStageLabel(
  stage: CompletedSearch["reasons"][number]["stage"],
): string {
  switch (stage) {
    case "geometry":
      return "Geometria";
    case "limits":
      return "Trechos de entrada/saída";
    case "weights":
      return "Peso próprio";
    case "pressures":
      return "Água";
    case "loads":
      return "Sobrecargas";
    case "mechanics":
      return "Entrada mecânica";
    default:
      return methodLabel(stage);
  }
}

export function CircularSearchResults({
  result,
  onList,
  onInspect,
  onEditLimits,
}: {
  result: CompletedSearch;
  onList: () => void;
  onInspect: (location: SearchLocation, method: SearchMethod) => void;
  onEditLimits?: () => void;
}) {
  const totalEvaluated = result.candidates.length;
  const geometricDescartes =
    totalEvaluated - result.geometricCount - result.filteredCount;
  return (
    <section
      aria-label="Resultado da busca circular"
      className="search-results"
    >
      <p role="status">
        <strong>
          {result.refinement ? "Refinamento concluído." : "Busca concluída."}
        </strong>{" "}
        {totalEvaluated} círculos avaliados. Geometria preparada em{" "}
        {result.geometricCount}.
      </p>
      <p>Descartes na geometria: {geometricDescartes}.</p>
      {result.filteredCount > 0 && (
        <p>Descartes por trechos de entrada/saída: {result.filteredCount}.</p>
      )}
      {result.refinement && (
        <div
          className="info-card"
          role="region"
          aria-label="Cobertura do refinamento"
        >
          <p>
            <strong>
              {result.refinement.regions.length} região(ões) visitada(s)
            </strong>{" "}
            em até {result.refinement.config.stages} etapa(s) · orçamento{" "}
            {result.refinement.uniqueEvaluated}/
            {result.refinement.config.maxTotalCandidates} círculos.
          </p>
          {result.refinement.budgetReached && (
            <p>
              Aviso: orçamento de candidatos atingido; algumas regiões foram
              interrompidas no limite configurado.
            </p>
          )}
          <details className="search-refinement">
            <summary>Regiões visitadas no refinamento</summary>
            <ul aria-label="Lista de regiões refinadas">
              {result.refinement.regions.map((region) => (
                <li key={`${region.stage}-${region.regionIndex}`}>
                  Etapa {region.stage} · região {region.regionIndex}:{" "}
                  {region.evaluatedCount} novo(s)
                  {region.reusedCount > 0
                    ? ` (${region.reusedCount} reaproveitado(s))`
                    : ""}{" "}
                  · X [{exactNumber(region.bounds.x.min ?? 0)} ;{" "}
                  {exactNumber(region.bounds.x.max ?? 0)}] · Z [
                  {exactNumber(region.bounds.z.min ?? 0)} ;{" "}
                  {exactNumber(region.bounds.z.max ?? 0)}] · R [
                  {exactNumber(region.bounds.radius.min ?? 0)} ;{" "}
                  {exactNumber(region.bounds.radius.max ?? 0)}] m.
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {result.rankings.map((ranking) => {
        const { method, minimum, ties } = ranking;
        const exactTies = ties.filter((tie) => tie.difference === 0).length;
        const label = methodLabel(method);
        return (
          <div
            className="info-card"
            key={method}
            role="region"
            aria-label={`Busca · ${label}`}
          >
            <h3>{label}</h3>
            {minimum ? (
              <>
                <p>
                  <strong>
                    {result.refinement
                      ? "Menor FS na cobertura refinada = "
                      : "Menor FS na malha = "}
                    {number(minimum.factorOfSafety)}
                  </strong>{" "}
                  · círculo {minimum.location.number}.
                </p>
                <p>{describeCircle(minimum.location.circle)}</p>
                {minimum.boundaryAxes.length > 0 && (
                  <div
                    className="boundary-warning"
                    role="alert"
                    aria-label={`Aviso de borda · ${label}`}
                  >
                    <p>
                      Aviso: mínimo na borda amostrada (
                      {minimum.boundaryAxes
                        .map((axis) => axisLabels[axis])
                        .join(", ")}
                      ). Amplie os limites ou ajuste os passos.
                    </p>
                    {onEditLimits && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={onEditLimits}
                      >
                        Ajustar limites da busca
                      </button>
                    )}
                  </div>
                )}
                {exactTies > 0 && (
                  <p>
                    Empates exatos: {exactTies}. A ordem da malha definiu a
                    primeira ocorrência.
                  </p>
                )}
                {ties.length > exactTies && (
                  <p>
                    Quase empates: {ties.length - exactTies} na faixa de{" "}
                    {number(result.profile.nearTieTolerance)} acima do mínimo.
                  </p>
                )}
                <button
                  className="secondary"
                  type="button"
                  onClick={() => onInspect(minimum.location, method)}
                >
                  Inspecionar mínimo de {label}
                </button>
              </>
            ) : (
              <p>
                <strong>
                  {ranking.status === "no-surface"
                    ? "Nenhuma superfície geometricamente admissível."
                    : "Nenhum FS positivo admissível."}
                </strong>
              </p>
            )}
            <p>FS positivos admissíveis: {ranking.eligible}.</p>
            {ranking.zeroResistance > 0 && (
              <p>
                Aviso: resistência física nula em {ranking.zeroResistance}{" "}
                círculo(s), registrada fora da classificação dos FS positivos.
              </p>
            )}
            {ranking.failed > 0 && (
              <p>
                Aviso: cobertura parcial. Falharam {ranking.failed} círculo(s)
                com geometria preparada neste método.
              </p>
            )}
          </div>
        );
      })}
      <button type="button" className="secondary" onClick={onList}>
        Ver círculos avaliados
      </button>
    </section>
  );
}

const PAGE_SIZE = 50;
type CandidateFilter = "all" | "issues" | "ties" | "zeros";
export function CircularSearchTable({
  result,
  onInspect,
}: {
  result: CompletedSearch;
  onInspect: (candidate: SearchCandidate) => void;
}) {
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [page, setPage] = useState(0);
  const ties = useMemo(
    () =>
      new Map(
        result.rankings.map((r) => [
          r.method,
          new Map(r.ties.map((t) => [t.number, t.difference])),
        ]),
      ),
    [result],
  );
  const filtered = useMemo(
    () =>
      result.candidates.filter((candidate) => {
        if (filter === "all") return true;
        if (filter === "issues") return candidate.issues.length > 0;
        if (filter === "zeros")
          return candidate.methods.some((r) => r.status === "zero-resistance");
        return result.rankings.some((r) =>
          ties.get(r.method)?.has(candidate.location.number),
        );
      }),
    [filter, result, ties],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const { geometry, equilibrium, bishop, nearTieTolerance } = result.profile;
  return (
    <div className="slice-inspection">
      <p>
        {result.origin.section.name} · {result.origin.analysisCase.name} ·{" "}
        {result.direction === "left-to-right"
          ? "esquerda → direita"
          : "direita → esquerda"}
        .
      </p>
      <p aria-label="Perfil da busca">
        ε = {exactNumber(geometry.toleranceM)} m · abertura ={" "}
        {exactNumber(geometry.maxArcDegrees)}° · τD ={" "}
        {exactNumber(equilibrium.drivingThresholdKNPerM)} kN/m · τt ={" "}
        {exactNumber(equilibrium.tensionToleranceKPa)} kPa · faixa de quase
        empate = {exactNumber(nearTieTolerance)}.
        {bishop && (
          <>
            {" "}
            F₀ = {exactNumber(bishop.initialFactor)} · τF ={" "}
            {exactNumber(bishop.residualTolerance)} · K = {bishop.maxIterations}{" "}
            · τm = {exactNumber(bishop.singularityThreshold)}.
          </>
        )}
      </p>
      <div className="info-card" aria-label="Limites e passos da malha">
        {SEARCH_AXES.map((key) => {
          const axis = result.grid.axes[key];
          return (
            <p key={key}>
              {axisLabels[key]}: {exactNumber(axis.min)} a{" "}
              {exactNumber(axis.max)} m ·{" "}
              {axis.min === axis.max
                ? "fixo"
                : `passo de ${exactNumber(axis.step!)} m`}{" "}
              · {axis.values.length} ponto(s) · último ponto{" "}
              {exactNumber(axis.values.at(-1)!)} m.
            </p>
          );
        })}
      </div>
      {result.reasons.length > 0 && (
        <details>
          <summary>Contagens por motivo</summary>
          <ul aria-label="Motivos por etapa">
            {result.reasons.map((r) => (
              <li key={`${r.stage}:${r.code}:${r.level}`}>
                {searchStageLabel(r.stage)} · {r.count} círculo(s) ·{" "}
                {r.level === "warning" ? "Aviso" : "Falha"} · {r.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      <label className="field">
        <span>Filtrar círculos</span>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as CandidateFilter);
            setPage(0);
          }}
        >
          <option value="all">Todos</option>
          <option value="issues">Com diagnósticos</option>
          <option value="zeros">Resistência nula</option>
          <option value="ties">Empates e quase empates</option>
        </select>
      </label>
      {filtered.length > 0 ? (
        <>
          <div className="materials-table-wrap slice-table-wrap">
            <table className="materials-table" aria-label="Círculos avaliados">
              <thead>
                <tr>
                  <th>Círculo</th>
                  <th>Centro e raio</th>
                  <th>Geometria</th>
                  {result.rankings.map((r) => (
                    <th key={r.method}>{methodLabel(r.method)}</th>
                  ))}
                  <th>Diagnósticos</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                  .map((candidate) => {
                    const { location } = candidate;
                    return (
                      <tr key={location.number}>
                        <td>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => onInspect(candidate)}
                          >
                            Inspecionar círculo {location.number}
                          </button>
                        </td>
                        <td>{describeCircle(location.circle)}</td>
                        <td>
                          {candidate.filteredOut
                            ? "Fora dos trechos"
                            : candidate.sliceCount === null
                              ? "Inadmissível"
                              : `${candidate.sliceCount} fatias`}
                        </td>
                        {result.rankings.map((ranking) => {
                          const method = candidate.methods.find(
                            (r) => r.method === ranking.method,
                          );
                          const tie = ties
                            .get(ranking.method)
                            ?.get(location.number);
                          return (
                            <td
                              key={ranking.method}
                              title={
                                method?.factorOfSafety != null
                                  ? exactNumber(method.factorOfSafety)
                                  : undefined
                              }
                            >
                              {searchOutcome(method)}
                              {ranking.minimum?.location.number ===
                                location.number && (
                                <small>Mínimo na malha</small>
                              )}
                              {tie !== undefined && (
                                <small>
                                  {tie === 0
                                    ? "Empate exato"
                                    : `Quase empate · ΔFS = ${number(tie)}`}
                                </small>
                              )}
                              {method?.evaluations != null && (
                                <small>
                                  {method.evaluations} avaliação(ões)
                                  {method.residual !== null
                                    ? ` · resíduo ${number(method.residual)}`
                                    : ""}
                                </small>
                              )}
                            </td>
                          );
                        })}
                        <td>
                          {candidate.issues.map((issue) => (
                            <small
                              key={`${issue.stage}:${issue.code}:${issue.level}`}
                            >
                              {searchStageLabel(issue.stage)} · {issue.message}
                              {issue.occurrences > 1
                                ? ` (${issue.occurrences} ocorrências)`
                                : ""}
                            </small>
                          ))}
                          {!candidate.issues.length && "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="search-actions">
            <button
              className="secondary"
              type="button"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page + 1} de {pages} · {filtered.length} círculo(s)
            </span>
            <button
              className="secondary"
              type="button"
              disabled={page + 1 === pages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      ) : (
        <p>Nenhum círculo neste filtro.</p>
      )}
    </div>
  );
}
