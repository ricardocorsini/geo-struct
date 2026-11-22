import { useMemo, useState } from "react";
import type { Project } from "../domain/model";
import type { Diagnostic } from "../domain/geometry";
import { auditProject, auditCounts } from "../domain/audit";
export function Audit({
  project,
  onLocate,
  calculationDiagnostic,
}: {
  project: Project;
  onLocate: (d: Diagnostic) => void;
  calculationDiagnostic?: Diagnostic;
}) {
  const scopes = useMemo(
    () =>
      auditProject(project).map((scope) =>
        calculationDiagnostic && scope.id === calculationDiagnostic.target
          ? {
              ...scope,
              diagnostics: [...scope.diagnostics, calculationDiagnostic],
            }
          : scope,
      ),
    [project, calculationDiagnostic],
  );
  const [scope, setScope] = useState("all"),
    [level, setLevel] = useState("all");
  const selected = scopes.filter((s) => scope === "all" || s.id === scope);
  return (
    <div className="audit-panel">
      <p>
        Conferência dos dados aplicados. Os casos incluem geometria e materiais
        compartilhados e suas condições próprias de água e cargas. Uma pendência
        compartilhada aparece em cada caso afetado.
      </p>
      <p>
        Sem pendências detectadas não significa estabilidade verificada. Não há
        cálculo de FS ou verificação da admissibilidade das superfícies.
      </p>
      <div className="field-row">
        <label className="field">
          Seção ou caso
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Todas as seções e casos</option>
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Severidade
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">Todas</option>
            <option value="error">Erros</option>
            <option value="warning">Avisos</option>
            <option value="info">Informações</option>
          </select>
        </label>
      </div>
      {selected.map((s) => {
        const counts = auditCounts(s.diagnostics),
          rows = s.diagnostics.filter(
            (d) => level === "all" || d.level === level,
          );
        return (
          <section key={s.id} aria-label={s.name}>
            <h3>{s.name}</h3>
            <p>
              {counts.errors} erro(s) · {counts.warnings} aviso(s)
            </p>
            {rows.length ? (
              <ul>
                {rows.map((d, i) => (
                  <li key={i}>
                    <button className="text-button" onClick={() => onLocate(d)}>
                      {d.level === "error"
                        ? "Erro"
                        : d.level === "warning"
                          ? "Aviso"
                          : "Informação"}{" "}
                      · {d.message}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {s.diagnostics.length
                  ? "Nenhum item para este filtro."
                  : "Nenhuma pendência de cadastro detectada neste escopo."}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
