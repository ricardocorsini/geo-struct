import { useEffect, useMemo, useRef, useState } from "react";
import { version } from "../../package.json";
import { methodLabel, directionLabel } from "../domain/analysis";
import type { CaseExecutionState } from "../lib/case-execution";
import type { CaseResultsControls } from "../lib/use-case-results";
import {
  buildResultExport,
  exportResultCsv,
  type ResultExport,
} from "../lib/result-export";
import { exportText, safeName } from "../lib/files";
import { createReportHtml } from "../lib/report-html";

const number = (value: number | null | undefined, digits = 6) =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const fsNumber = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("pt-BR", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      });
const states: Record<string, string> = {
  calculated: "Calculado — FS positivo admissível",
  "zero-resistance": "Resistência nula",
  nonconverged: "Não convergente",
  rejected: "Rejeitado",
  "not-evaluated": "Não avaliado",
};

export function ResultReport({
  results,
  execution,
  onError,
}: {
  results: CaseResultsControls;
  execution: CaseExecutionState;
  onError: (message: string) => void;
}) {
  const { view, surface, selection } = results;
  // Os wrappers de view/surface são recriados no hook; os dados da execução são estáveis.
  const source = useMemo(
    () => ({ view, surface, selection }),
    [
      view.status,
      view.record,
      surface?.geometry,
      surface?.preparations,
      surface?.methods,
      surface?.location,
      selection.method,
      selection.candidateNumber,
      selection.sliceNumber,
    ],
  );
  const [prepared, setPrepared] = useState<{
    source: typeof source;
    value: ResultExport | null;
    error?: string;
  } | null>(null);
  const article = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void buildResultExport({
      ...source,
      appVersion: version,
      generatedAt: new Date().toISOString(),
    }).then(
      (value) => {
        if (!cancelled) setPrepared({ source, value });
      },
      () => {
        if (!cancelled)
          setPrepared({
            source,
            value: null,
            error:
              "Não foi possível preparar a exportação rastreável. Tente abrir o memorial novamente.",
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source]);

  // O artigo antigo sai já no render, inclusive antes de o digest assíncrono terminar.
  const snapshot =
    view.status === "current" && prepared?.source === source
      ? prepared.value
      : null;
  const error = prepared?.source === source ? prepared.error : null;
  const unavailable =
    view.status === "stale"
      ? "Resultado desatualizado. Aplique ou descarte os rascunhos e calcule o caso antes de exportar."
      : execution.status === "running"
        ? "Cálculo em andamento. Aguarde a conclusão; resultados parciais não são exportados."
        : execution.status === "cancelled"
          ? "Cálculo cancelado. O resultado parcial foi descartado; calcule novamente antes de exportar."
          : view.status === "empty"
            ? "Nenhum resultado atual disponível. Selecione um caso e use Calcular caso."
            : results.detail.status === "loading"
              ? "Preparando a superfície selecionada para exportação…"
              : results.detail.status === "failed"
                ? results.detail.message
                : prepared?.source !== source
                  ? "Preparando a rastreabilidade do memorial…"
                  : "A superfície selecionada não corresponde a uma execução exportável. Confira a seleção e recalcule.";

  const fileName = snapshot
    ? `${safeName(snapshot.metadata.project.name)}-${safeName(snapshot.metadata.analysisCase.name)}-${snapshot.selection.candidateNumber ?? "fixo"}-${snapshot.selection.method ?? "diagnostico"}`
    : "resultados";
  const write = async (kind: "html" | "candidates" | "slices") => {
    if (!snapshot || busy) return;
    setBusy(true);
    try {
      if (kind === "html" && article.current)
        await exportText(
          `${fileName}-resultados.html`,
          createReportHtml(
            `GeoStruct · Memorial de resultados · ${snapshot.metadata.analysisCase.name}`,
            article.current.outerHTML,
          ),
          "text/html;charset=utf-8",
        );
      else {
        const table =
          kind === "candidates" ? snapshot.candidates : snapshot.slices;
        if (!table.rows.length) return;
        await exportText(
          `${fileName}-${kind === "candidates" ? "candidatos" : "fatias"}.csv`,
          exportResultCsv(table),
          "text/csv;charset=utf-8",
        );
      }
    } catch (error) {
      onError(`Falha na exportação dos resultados: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="report-actions no-print">
        <button
          className="secondary"
          disabled={!snapshot || busy}
          onClick={() => window.print()}
        >
          Imprimir / PDF
        </button>
        <button
          className="primary"
          disabled={!snapshot || busy}
          onClick={() => void write("html")}
        >
          Exportar HTML
        </button>
        {view.record?.mode === "search" && (
          <button
            className="secondary"
            disabled={!snapshot?.candidates.rows.length || busy}
            onClick={() => void write("candidates")}
          >
            Exportar candidatos CSV
          </button>
        )}
        <button
          className="secondary"
          disabled={!snapshot?.slices.rows.length || busy}
          onClick={() => void write("slices")}
        >
          Exportar fatias CSV
        </button>
      </div>
      {!snapshot && (
        <p role={error ? "alert" : "status"}>{error ?? unavailable}</p>
      )}
      {snapshot && (
        <article
          ref={article}
          id="result-report"
          className="project-report result-report"
        >
          <div className="report-brand">
            OPENSTRUCT / GEOSTRUCT {snapshot.metadata.appVersion}
          </div>
          <h1>Memorial de resultados</h1>
          <h2>{snapshot.metadata.project.name}</h2>
          <p>
            Seção: <strong>{snapshot.metadata.section.name}</strong> · Caso:{" "}
            <strong>{snapshot.metadata.analysisCase.name}</strong>.
          </p>
          <p>
            Gerado em {new Date(snapshot.generatedAt).toLocaleString("pt-BR")} ·{" "}
            {snapshot.generatedAt}.
          </p>
          <p>
            <strong>Resultado atual</strong> — corresponde às entradas e ao
            perfil aplicados no momento da geração. Não constitui aprovação de
            estabilidade.
          </p>
          <p>
            {directionLabel(snapshot.input.analysis.direction)} · Unidades: m,
            kN, kPa; forças e pesos por metro de largura fora do plano.
          </p>

          <section aria-label="Rastreabilidade do memorial">
            <h2>Rastreabilidade</h2>
            <dl className="report-metadata">
              <dt>Projeto / seção / caso</dt>
              <dd>
                {snapshot.metadata.project.id} / {snapshot.metadata.section.id}{" "}
                / {snapshot.metadata.analysisCase.id}
              </dd>
              <dt>Entrada do caso — SHA-256</dt>
              <dd>
                <code>{snapshot.metadata.inputRevisionSha256}</code>
              </dd>
              <dt>Execução e perfil — SHA-256</dt>
              <dd>
                <code>{snapshot.metadata.identitySha256}</code>
              </dd>
              <dt>Entrada da superfície — SHA-256</dt>
              <dd>
                <code>{snapshot.metadata.surfaceRevisionSha256}</code>
              </dd>
              <dt>Versões e contratos do motor</dt>
              <dd>
                <code>{JSON.stringify(snapshot.metadata.contracts)}</code>
              </dd>
            </dl>
            <p className="hint">
              SHA-256 calculado sobre o texto UTF-8 exato das revisões e da
              identidade da execução. Na busca, a entrada da superfície é a
              derivação do caso para o círculo selecionado.
            </p>
            <h3>Perfil numérico efetivo</h3>
            <pre>{JSON.stringify(snapshot.metadata.profile, null, 2)}</pre>
          </section>

          <section aria-label="Superfície do memorial">
            <h2>Superfície inspecionada</h2>
            <p>
              {snapshot.searchSummary
                ? `Candidato ${snapshot.selection.candidateNumber}`
                : "Círculo fixo"}{" "}
              · Método selecionado:{" "}
              {snapshot.selection.method
                ? methodLabel(snapshot.selection.method)
                : "Não avaliado"}
              .
            </p>
            <p>
              Centro X = {number(snapshot.circle.x)} m; Z ={" "}
              {number(snapshot.circle.z)} m; raio ={" "}
              {number(snapshot.circle.radius)} m.
            </p>
            <p>
              Geometria:{" "}
              {snapshot.geometrySummary.status === "prepared"
                ? "preparada"
                : "bloqueada"}
              ; {snapshot.geometrySummary.sliceCount} fatias; área ={" "}
              {number(snapshot.geometrySummary.areaM2)} m².
            </p>
            <table aria-label="Resultados dos métodos no memorial">
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Estado</th>
                  <th>FS</th>
                  <th>Formulação</th>
                  <th>Convergência / diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.input.analysis.methods.map((method) => {
                  const evaluated = snapshot.methods.find(
                    (item) => item.method === method,
                  );
                  const last =
                    evaluated?.method === "bishop"
                      ? evaluated.iterations.at(-1)
                      : null;
                  return (
                    <tr key={method}>
                      <td>{methodLabel(method)}</td>
                      <td>
                        {evaluated
                          ? states[evaluated.status]
                          : "Não avaliado — preparação bloqueada"}
                      </td>
                      <td>{fsNumber(evaluated?.factorOfSafety ?? null)}</td>
                      <td>{evaluated?.formulation ?? "—"}</td>
                      <td>
                        {evaluated?.method === "bishop"
                          ? `${evaluated.iterations.length} avaliações; resíduo = ${number(last?.residual, 12)}. ${evaluated.status === "calculated" ? "Convergência admissível." : "Última tentativa somente para diagnóstico; não é FS válido."}`
                          : "Consulte estados e diagnósticos."}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p>
              {snapshot.comparison.status === "comparable"
                ? `Mesma superfície: ΔFS (Bishop − Fellenius) = ${number(snapshot.comparison.difference, 7)}.`
                : snapshot.comparison.message}
            </p>
            <p className="hint">
              FS no memorial com três casas decimais; CSV conserva a precisão
              das parcelas e dos valores numéricos. “—” significa indisponível,
              distinto de zero.
            </p>
          </section>

          {snapshot.searchSummary && (
            <section aria-label="Cobertura da busca no memorial">
              <h2>Busca — cobertura da malha</h2>
              <p>
                {snapshot.searchSummary.candidateCount} candidatos avaliados;
                geometria preparada em {snapshot.searchSummary.geometricCount}.
                Os mínimos abaixo pertencem à malha amostrada e podem pertencer
                a superfícies diferentes.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Eixo</th>
                    <th>Mínimo (m)</th>
                    <th>Máximo (m)</th>
                    <th>Passo (m)</th>
                    <th>Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {(["x", "z", "radius"] as const).map((axis) => {
                    const values = snapshot.searchSummary!.grid.axes[axis];
                    return (
                      <tr key={axis}>
                        <td>
                          {axis === "radius"
                            ? "Raio"
                            : `Centro ${axis.toUpperCase()}`}
                        </td>
                        <td>{number(values.min)}</td>
                        <td>{number(values.max)}</td>
                        <td>{number(values.step)}</td>
                        <td>{values.values.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <h3>Mínimos da malha por método</h3>
              <table aria-label="Mínimos no memorial">
                <thead>
                  <tr>
                    <th>Método</th>
                    <th>Estado</th>
                    <th>Candidato</th>
                    <th>FS</th>
                    <th>Borda</th>
                    <th>
                      Elegíveis / resistência nula / falhas / quase empates
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.searchSummary.rankings.map((ranking) => (
                    <tr key={ranking.method}>
                      <td>{methodLabel(ranking.method)}</td>
                      <td>
                        {ranking.status === "minimum"
                          ? "Mínimo amostrado"
                          : ranking.status === "no-surface"
                            ? "Sem superfície"
                            : "Sem FS positivo"}
                      </td>
                      <td>{ranking.minimum?.location.number ?? "—"}</td>
                      <td>
                        {fsNumber(ranking.minimum?.factorOfSafety ?? null)}
                      </td>
                      <td>
                        {ranking.minimum?.boundaryAxes
                          .map(
                            (axis) =>
                              ({ x: "X", z: "Z", radius: "raio" })[axis],
                          )
                          .join(", ") || "Nenhuma"}
                      </td>
                      <td>
                        {ranking.eligible} / {ranking.zeroResistance} /{" "}
                        {ranking.failed} / {ranking.ties.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Aviso de borda: confira limites e passos quando o mínimo estiver
                em X, Z ou raio na borda amostrada. Não há garantia de mínimo
                global.
              </p>
              <h3>Descartes e motivos na malha</h3>
              {snapshot.searchSummary.reasons.length ? (
                <ul>
                  {snapshot.searchSummary.reasons.map((reason, index) => (
                    <li key={index}>
                      {reason.stage} · {reason.code} · {reason.count}{" "}
                      ocorrência(s): {reason.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum motivo de descarte registrado nesta malha.</p>
              )}
              <p>
                O CSV de candidatos contém a malha completa; o CSV de fatias
                pertence à superfície e ao método selecionados acima.
              </p>
            </section>
          )}

          <section aria-label="Diagnósticos do memorial">
            <h2>Diagnósticos da superfície</h2>
            {snapshot.diagnostics.length ? (
              <ul>
                {snapshot.diagnostics.map((diagnostic, index) => (
                  <li key={index}>
                    {diagnostic.stage} · {diagnostic.level} · {diagnostic.code}:{" "}
                    {diagnostic.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhum diagnóstico registrado para a superfície.</p>
            )}
          </section>
          <section aria-label="Fatias do memorial">
            <h2>
              Dados por fatia —{" "}
              {snapshot.selection.method
                ? methodLabel(snapshot.selection.method)
                : "não avaliado"}
            </h2>
            {snapshot.slices.rows.length ? (
              <ReportSliceTable table={snapshot.slices} />
            ) : (
              <p>
                Fatias indisponíveis para esta superfície. Não há parcelas
                inventadas para uma preparação bloqueada.
              </p>
            )}
            <p className="hint">
              Parcelas de uma avaliação não convergente ou rejeitada são dados
              de diagnóstico; não tornam o FS admissível. O CSV mantém estado,
              identificadores, unidades e precisão completa.
            </p>
          </section>
          <details open>
            <summary>Entradas aplicadas da execução</summary>
            <pre>{JSON.stringify(snapshot.input, null, 2)}</pre>
          </details>
          <p>
            Contrato do memorial: {snapshot.contract}. Os resultados da sessão
            não são gravados no arquivo do projeto. A exportação de entradas
            permanece independente.
          </p>
        </article>
      )}
    </>
  );
}

function ReportSliceTable({ table }: { table: ResultExport["slices"] }) {
  const columns = [
    ["fatia_id", "Fatia"],
    ["X_inicial_m", "X inicial (m)"],
    ["X_final_m", "X final (m)"],
    ["largura_m", "b (m)"],
    ["comprimento_base_m", "ℓ (m)"],
    ["W_kN_por_m", "W (kN/m)"],
    ["Q_kN_por_m", "Q (kN/m)"],
    ["u_kPa", "u (kPa)"],
    ["normal_resistencia_kN_por_m", "N usada (kN/m)"],
    ["resistencia_kN_por_m", "Resistência (kN/m)"],
  ]
    .map(([header, label]) => ({
      header,
      label,
      index: table.headers.indexOf(header),
    }))
    .filter(({ index }) => index >= 0);
  return (
    <div className="report-table-wrap">
      <table aria-label="Parcelas das fatias no memorial">
        <thead>
          <tr>
            {columns.map(({ header, label }) => (
              <th key={header}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index}>
              {columns.map(({ header, index: column }) => (
                <td key={header}>
                  {typeof row[column] === "number"
                    ? number(row[column], 6)
                    : row[column] === null
                      ? "—"
                      : String(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
