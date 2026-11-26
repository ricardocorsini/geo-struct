import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import {
  buildScenarioComparison,
  type CaseMethodSummary,
  type CaseRunRecord,
} from "../domain/case-comparison";
import type { Project, Section } from "../domain/model";
import { formatResultNumber } from "./BishopPanel";
import { describeCircle } from "./CircularSearchResults";

function formatMethodCell(
  summary: CaseMethodSummary | null,
  selected: boolean,
) {
  if (!selected) return "Não selecionado";
  if (!summary) return "—";
  if (summary.status === "calculated" && summary.factorOfSafety !== null) {
    return `FS = ${formatResultNumber(summary.factorOfSafety)}`;
  }
  if (summary.status === "zero-resistance") {
    return summary.factorOfSafety === 0
      ? "Resistência nula · FS = 0"
      : "Resistência nula";
  }
  if (summary.status === "nonconverged") return "Sem convergência";
  if (summary.status === "no-surface") return "Sem superfície admissível";
  if (summary.status === "no-factor") return "Sem FS positivo admissível";
  return "Rejeitado";
}

export function ScenarioComparison({
  project,
  section,
  runs,
  batchRunning,
  onRunBatch,
  onCancelBatch,
  onEditCase,
}: {
  project: Project;
  section: Section;
  runs: Record<string, CaseRunRecord>;
  batchRunning: boolean;
  onRunBatch: (caseIds: string[]) => void;
  onCancelBatch: () => void;
  onEditCase: (caseId: string) => void;
}) {
  const sectionCases = project.analysisCases.filter(
    (c) => c.sectionId === section.id,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    sectionCases.map((c) => c.id),
  );

  useEffect(() => {
    const valid = new Set(sectionCases.map((c) => c.id));
    setSelectedIds((prev) => {
      const kept = prev.filter((id) => valid.has(id));
      const added = sectionCases
        .map((c) => c.id)
        .filter((id) => !prev.includes(id));
      return [...kept, ...added];
    });
  }, [section.id, project.analysisCases]);

  if (!sectionCases.length) return null;

  const rows = buildScenarioComparison(project, section.id, selectedIds, runs);
  const toggleCase = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked
        ? prev.includes(id)
          ? prev
          : [...prev, id]
        : prev.filter((item) => item !== id),
    );
  };

  return (
    <section
      className="scenario-comparison"
      aria-label="Comparação de cenários"
    >
      <h3>Comparação de cenários e cálculo em lote</h3>
      <p className="hint">
        Seção compartilhada: <strong>{section.name}</strong>. Geometria e
        materiais permanecem idênticos entre os casos comparados.
      </p>

      <div className="comparison-toolbar">
        <div
          className="comparison-checks"
          role="group"
          aria-label="Casos para comparar e calcular"
        >
          {sectionCases.map((c) => (
            <label className="assignment-target" key={c.id}>
              <input
                type="checkbox"
                aria-label={`Selecionar ${c.name} para lote`}
                checked={selectedIds.includes(c.id)}
                disabled={batchRunning}
                onChange={(e) => toggleCase(c.id, e.target.checked)}
              />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
        <div className="comparison-actions">
          <button
            type="button"
            className="secondary"
            disabled={batchRunning}
            onClick={() => setSelectedIds(sectionCases.map((c) => c.id))}
          >
            Selecionar todos
          </button>
          <button
            type="button"
            className="secondary"
            disabled={batchRunning || !selectedIds.length}
            onClick={() => setSelectedIds([])}
          >
            Limpar seleção
          </button>
          <button
            type="button"
            className="primary"
            disabled={batchRunning || !selectedIds.length}
            onClick={() => onRunBatch(selectedIds)}
          >
            <Play size={14} />
            Calcular selecionados ({selectedIds.length})
          </button>
          {batchRunning && (
            <button type="button" className="secondary" onClick={onCancelBatch}>
              <Square size={14} />
              Cancelar lote
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="materials-table-wrap">
          <table
            className="materials-table comparison-table"
            aria-label="Tabela comparativa de cenários"
          >
            <thead>
              <tr>
                <th>Caso</th>
                <th>Água e origem</th>
                <th>Cargas / direção</th>
                <th>Fellenius</th>
                <th>Bishop Simplificado</th>
                <th>Estado</th>
                <th>Avisos e diagnósticos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const c = row.analysisCase;
                const mainSurface =
                  row.bishop?.surface ?? row.fellenius?.surface ?? null;
                return (
                  <tr key={c.id} data-comparison-case={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <small>{row.surfaceLabel}</small>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onEditCase(c.id)}
                      >
                        Abrir caso
                      </button>
                    </td>
                    <td>
                      <strong>{row.water.selectionLabel}</strong>
                      <small>{row.water.originLabel}</small>
                      {row.water.mode === "piezometric" && (
                        <small>
                          {row.water.pointCount} pontos · γw ={" "}
                          {row.water.unitWeight ?? "pendente"} kN/m³
                        </small>
                      )}
                      {row.water.source && (
                        <small>Origem: {row.water.source}</small>
                      )}
                    </td>
                    <td>
                      {row.directionLabel}
                      <small>
                        {row.activeLoadNames.length
                          ? `Cargas: ${row.activeLoadNames.join(", ")}`
                          : "Sem sobrecargas ativas"}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {formatMethodCell(
                          row.fellenius,
                          row.methods.includes("fellenius"),
                        )}
                      </strong>
                      {row.fellenius?.surface && (
                        <small>{describeCircle(row.fellenius.surface)}</small>
                      )}
                    </td>
                    <td>
                      <strong>
                        {formatMethodCell(
                          row.bishop,
                          row.methods.includes("bishop"),
                        )}
                      </strong>
                      {row.bishop?.surface &&
                        (!row.fellenius?.surface ||
                          row.bishop.surface.x !== row.fellenius.surface.x ||
                          row.bishop.surface.z !== row.fellenius.surface.z ||
                          row.bishop.surface.radius !==
                            row.fellenius.surface.radius) && (
                          <small>{describeCircle(row.bishop.surface)}</small>
                        )}
                      {!row.bishop?.surface && mainSurface === null && (
                        <small>Sem superfície calculada</small>
                      )}
                    </td>
                    <td>
                      <span
                        className={`batch-status status-${row.statusKind}`}
                        data-case-status={row.statusKind}
                      >
                        {row.statusLabel}
                      </span>
                      {row.run?.counts && (
                        <small>
                          {row.run.counts.geometric}/{row.run.counts.total}{" "}
                          geométricos
                        </small>
                      )}
                    </td>
                    <td>
                      {row.warnings.length ? (
                        <ul className="comparison-warnings">
                          {row.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="hint">Sem avisos</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">
          Selecione ao menos um caso acima para comparar hipóteses e resultados.
        </p>
      )}
    </section>
  );
}
