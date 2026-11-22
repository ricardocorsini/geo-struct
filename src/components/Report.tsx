import { version } from "../../package.json";
import { auditProject, auditCounts } from "../domain/audit";
import {
  activeWater,
  activeLoads,
  waterModeLabel,
  loadConditionLabel,
  isLoadActive,
} from "../domain/conditions";
import {
  caseWaterLabel,
  caseLoadLabel,
  directionLabel,
  surfaceLabel,
  methodLabel,
  resolveCaseSection,
} from "../domain/analysis";
import type { Project, Section } from "../domain/model";
import {
  materialMode,
  materialName,
  materialPending,
  materialUses,
} from "../domain/materials";
import { diagnose, boundary } from "../domain/geometry";
import { exportText, safeName } from "../lib/files";
import { createReportHtml } from "../lib/report-html";
const number = (n: number | null) =>
  n === null
    ? "Não informado"
    : n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
function CaseReport({
  project,
  section,
}: {
  project: Project;
  section: Section;
}) {
  const cases = project.analysisCases.filter((c) => c.sectionId === section.id);
  return (
    <div>
      <h3>Casos de análise</h3>
      {!cases.length && (
        <p>Nenhum caso cadastrado. Não há análise preparada nesta seção.</p>
      )}
      {cases.map((c) => {
        const resolved = resolveCaseSection(section, c),
          loads = activeLoads(resolved),
          water = activeWater(resolved);
        return (
          <section key={c.id}>
            <h4>{c.name} · somente entradas</h4>
            <p>
              Hipóteses: {c.description.trim() || "Não informadas"}.
              Identificação: {c.id}.
            </p>
            <p>
              {directionLabel(c.direction)} · {surfaceLabel(c.surfaceMode)}.
              Métodos pretendidos:{" "}
              {c.methods.map(methodLabel).join(", ") || "Não definidos"}.
              Coordenadas no referencial original X/Z da seção.
            </p>
            <p>
              Água: {caseWaterLabel(c.waterCondition)}. Condição resultante:{" "}
              {waterModeLabel(resolved.waterMode)}. Origem:{" "}
              {resolved.waterSource.trim() || "Não informada"}.
            </p>
            {c.waterCondition === "section" && c.waterSource.trim() && (
              <p>Origem própria guardada, inativa: {c.waterSource}</p>
            )}
            {resolved.waterMode === "piezometric" && (
              <p>
                γw = {number(resolved.waterUnitWeight)} kN/m³. Linha:{" "}
                {water
                  ?.map((p) => `(${number(p.x)} ; ${number(p.y)})`)
                  .join(" · ") || "Não informada"}
                .
              </p>
            )}
            <p>
              Cargas: {caseLoadLabel(c.loadCondition)}. Condição resultante:{" "}
              {loadConditionLabel(resolved.loadCondition)}. Seleção guardada:{" "}
              {c.loadIds
                .map(
                  (id) =>
                    section.loads.find((l) => l.id === id)?.name ??
                    "Referência ausente",
                )
                .join(", ") || "Nenhuma"}
              .
            </p>
            {loads.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Faixa ativa no caso</th>
                    <th>X inicial/final (m)</th>
                    <th>q (kPa)</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map((l) => (
                    <tr key={l.id}>
                      <td>{l.name}</td>
                      <td>
                        {number(l.x1)} / {number(l.x2)}
                      </td>
                      <td>{number(l.q)}</td>
                      <td>{l.source.trim() || "Não informada"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p>
              Círculo fixo{" "}
              {c.surfaceMode === "fixed" ? "selecionado" : "guardado, inativo"}:
              centro ({number(c.fixedCircle.x)} ; {number(c.fixedCircle.y)}) m;
              raio {number(c.fixedCircle.radius)} m. Admissibilidade não
              verificada.
            </p>
            <p>
              Limites de busca{" "}
              {c.surfaceMode === "search"
                ? "selecionados"
                : "guardados, inativos"}
              :
            </p>
            <table>
              <thead>
                <tr>
                  <th>Eixo</th>
                  <th>Mínimo (m)</th>
                  <th>Máximo (m)</th>
                  <th>Passo (m)</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["x", "Centro X"],
                    ["y", "Centro Z"],
                    ["radius", "Raio"],
                  ] as const
                ).map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{number(c.search[key].min)}</td>
                    <td>{number(c.search[key].max)}</td>
                    <td>{number(c.search[key].step)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Geometria e materiais compartilhados com {section.name}. Este
              relatório registra as entradas; resultados da sessão não são
              incluídos.
            </p>
          </section>
        );
      })}
    </div>
  );
}
export function Report({
  project,
  onError,
}: {
  project: Project;
  onError: (s: string) => void;
}) {
  const diagnostics = diagnose(project);
  return (
    <>
      <div className="report-actions no-print">
        <button className="secondary" onClick={() => window.print()}>
          Imprimir / PDF
        </button>
        <button
          className="primary"
          onClick={async () => {
            try {
              const content =
                document.getElementById("project-report")!.outerHTML;
              await exportText(
                `${safeName(project.name)}-entradas.html`,
                createReportHtml("GeoStruct · Relatório de entradas", content),
                "text/html",
              );
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          Exportar HTML
        </button>
      </div>
      <article id="project-report" className="project-report">
        <div className="report-brand">OPENSTRUCT / GEOSTRUCT {version}</div>
        <h1>{project.name}</h1>
        <h2>Conferência dos lançamentos por seção e caso</h2>
        <p>
          Inclui dependências compartilhadas. A ausência de pendências não é
          aprovação de estabilidade.
        </p>
        {auditProject(project).map((scope) => {
          const counts = auditCounts(scope.diagnostics);
          return (
            <section key={scope.id}>
              <h3>{scope.name}</h3>
              <p>
                {counts.errors} erro(s) · {counts.warnings} aviso(s)
              </p>
              <ul>
                {scope.diagnostics.map((d, i) => (
                  <li key={i}>
                    {d.level === "error"
                      ? "Erro"
                      : d.level === "warning"
                        ? "Aviso"
                        : "Informação"}
                    : {d.message}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <p>
          Relatório de dados de entrada ·{" "}
          {new Date().toLocaleDateString("pt-BR")}
        </p>
        <p>Responsável: {project.author || "Não informado"}</p>
        {project.description && <p>{project.description}</p>}
        <p>
          <strong>Etapa de modelagem.</strong> Este documento não contém cálculo
          de fator de segurança, dimensionamento de contenções ou aprovação de
          estabilidade. Unidades: m, kN, kPa.
        </p>
        <h2>Materiais</h2>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>γ (kN/m³)</th>
              <th>c / c′ (kPa)</th>
              <th>φ / φ′ (°)</th>
              <th>Parâmetros</th>
              <th>Cadastro / uso</th>
            </tr>
          </thead>
          <tbody>
            {project.materials.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{number(m.gamma)}</td>
                <td>{number(m.cohesion)}</td>
                <td>{number(m.friction)}</td>
                <td>{materialMode(m.mode)}</td>
                <td>
                  {materialPending(m).length
                    ? `Falta: ${materialPending(m).join(", ")}.`
                    : "Dados preenchidos."}{" "}
                  {materialUses(project, m.id).length} atribuições.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {project.materials.map((m) => (
          <p key={m.id}>
            <strong>{m.name} — origem:</strong>{" "}
            {m.source.trim() || "Não informada"}
          </p>
        ))}
        {project.sections.map((s) => {
          const water = activeWater(s);
          const pts = boundary(s),
            xmin = Math.min(...pts.map((p) => p.x)),
            xmax = Math.max(...pts.map((p) => p.x)),
            ymin = Math.min(...pts.map((p) => p.y)),
            ymax = Math.max(...pts.map((p) => p.y));
          const d = (points: typeof pts) =>
            points.map((p) => `${p.x},${-p.y}`).join(" ");
          return (
            <section key={s.id}>
              <h2>{s.name}</h2>
              <p>
                Base: {number(s.base)} m · Solo de fundo:{" "}
                {materialName(project, s.backgroundMaterialId)}
              </p>
              {pts.length > 0 && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox={`${xmin - 2} ${-ymax - 2} ${xmax - xmin + 4} ${ymax - ymin + 4}`}
                  role="img"
                  aria-label={`Seção ${s.name}`}
                >
                  <polygon
                    points={d(pts)}
                    fill={
                      project.materials.find(
                        (m) => m.id === s.backgroundMaterialId,
                      )?.color ?? "#a4a7a9"
                    }
                    stroke="#675d50"
                    strokeWidth="0.1"
                  />
                  {s.regions.map((r) => (
                    <polygon
                      key={r.id}
                      points={d(r.points)}
                      fill={
                        project.materials.find((m) => m.id === r.materialId)
                          ?.color ?? "#a4a7a9"
                      }
                      stroke="#675d50"
                      strokeWidth="0.1"
                    />
                  ))}
                  {water && (
                    <polyline
                      points={d(water)}
                      fill="none"
                      stroke="#277ca7"
                      strokeWidth="0.15"
                      strokeDasharray="0.6 0.3"
                    />
                  )}
                </svg>
              )}
              <h3>Terreno · X ; Z (m)</h3>
              <p>
                {s.terrain
                  .map((p) => `(${number(p.x)} ; ${number(p.y)})`)
                  .join(" · ") || "Não definido"}
              </p>
              {s.regions.map((r) => (
                <div key={r.id}>
                  <h3>
                    {r.name} · {materialName(project, r.materialId)}
                  </h3>
                  <p>
                    {r.points
                      .map((p) => `(${number(p.x)} ; ${number(p.y)})`)
                      .join(" · ")}
                  </p>
                </div>
              ))}
              <h3>Água · {waterModeLabel(s.waterMode)}</h3>
              <p>
                Peso específico da água γw: {number(s.waterUnitWeight)} kN/m³
                {s.waterMode !== "piezometric" ? " (guardado, inativo)" : ""}.
                Origem da condição: {s.waterSource.trim() || "Não informada"}.
              </p>
              {s.water && s.waterMode !== "piezometric" && (
                <p>Linha guardada, inativa na condição atual:</p>
              )}
              <p>
                {s.water
                  ? s.water
                      .map((p) => `(${number(p.x)} ; ${number(p.y)})`)
                      .join(" · ")
                  : "Sem linha piezométrica prescrita."}
              </p>
              <h3>Sobrecargas verticais uniformes</h3>
              <p>
                Condição: {loadConditionLabel(s.loadCondition)}. Intensidades na
                projeção horizontal.
              </p>
              {s.loads.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>X inicial (m)</th>
                      <th>X final (m)</th>
                      <th>q (kPa)</th>
                      <th>Estado</th>
                      <th>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.loads.map((l) => (
                      <tr key={l.id}>
                        <td>{l.name}</td>
                        <td>{number(l.x1)}</td>
                        <td>{number(l.x2)}</td>
                        <td>{number(l.q)}</td>
                        <td>
                          {isLoadActive(s, l) ? "Ativa" : "Inativa"}
                          {!l.enabled ? " — desabilitada" : ""}
                        </td>
                        <td>{l.source.trim() || "Não informada"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>Nenhuma faixa cadastrada.</p>
              )}
              {s.circle && (
                <p>
                  Círculo de tentativa: centro ({number(s.circle.x)} ;{" "}
                  {number(s.circle.y)}) m; raio {number(s.circle.radius)} m.
                  Admissibilidade não verificada.
                </p>
              )}
              <CaseReport project={project} section={s} />
            </section>
          );
        })}
        <h2>Conferência da modelagem</h2>
        {diagnostics.length ? (
          <ul>
            {diagnostics.map((d, i) => (
              <li key={i}>
                {d.level === "error"
                  ? "Erro"
                  : d.level === "info"
                    ? "Informação"
                    : "Aviso"}
                : {d.message}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            Nenhuma inconsistência detectada pelas verificações de modelagem
            implementadas. Isso não constitui validação de engenharia.
          </p>
        )}
        <p>
          Formato geostruct/{project.version} · Projeto {project.id}
        </p>
      </article>
    </>
  );
}
