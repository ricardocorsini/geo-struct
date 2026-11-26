import { auditProject } from "../domain/audit";
import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import {
  projectSchema,
  numericalProfileSchema,
  type NumericalProfile,
  type AnalysisCase,
  type Project,
  type Section,
} from "../domain/model";
import {
  caseLoadLabel,
  caseWaterLabel,
  directionLabel,
  methodLabel,
  surfaceLabel,
} from "../domain/analysis";
import { introducedError, parseNumber } from "../domain/geometry";
import { CoreInputPreview } from "./CoreInputPreview";
import {
  FixedCirclePreview,
  type FixedCirclePreviewProps,
} from "./FixedCirclePreview";
import { CircularSearchPanel, type SearchOverlay } from "./CircularSearchPanel";

export function AnalysisCases({
  project,
  section,
  onNew,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  project: Project;
  section: Section;
  onNew: () => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null),
    [error, setError] = useState("");
  const cases = project.analysisCases.filter((c) => c.sectionId === section.id),
    diagnostics = auditProject(project).flatMap((scope) =>
      scope.diagnostics.map((d) => ({ ...d, target: scope.id })),
    );
  const removed = cases.find((c) => c.id === deleting);
  return (
    <div className="materials-manager">
      <p>
        Seção: <strong>{section.name}</strong>. Os casos compartilham geometria
        e materiais. Cada caso guarda suas escolhas de água, cargas, direção e
        superfície.
      </p>
      <button
        className="primary"
        onClick={onNew}
        disabled={project.analysisCases.length >= 100}
      >
        Criar caso
      </button>
      {!cases.length && (
        <p>
          Nenhum caso cadastrado nesta seção. O círculo de tentativa existente é
          apenas um desenho; copie-o explicitamente para um caso, se desejar.
        </p>
      )}
      <div className="materials-table-wrap">
        <table className="materials-table">
          <thead>
            <tr>
              <th>Caso</th>
              <th>Direção / superfície</th>
              <th>Conferência</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <small>{caseWaterLabel(c.waterCondition)}</small>
                  <small>{caseLoadLabel(c.loadCondition)}</small>
                </td>
                <td>
                  {directionLabel(c.direction)}
                  <small>{surfaceLabel(c.surfaceMode)}</small>
                </td>
                <td>
                  {diagnostics.some(
                    (d) => d.target === c.id && d.level !== "info",
                  )
                    ? `${diagnostics.filter((d) => d.target === c.id && d.level !== "info").length} pendência(s)`
                    : "Sem pendências"}
                  <small>Dados do caso</small>
                </td>
                <td>
                  <div className="material-row-actions">
                    <button
                      className="secondary"
                      aria-label={`Editar ${c.name}`}
                      onClick={() => onEdit(c.id)}
                    >
                      Editar
                    </button>
                    <button
                      className="secondary"
                      aria-label={`Duplicar ${c.name}`}
                      disabled={project.analysisCases.length >= 100}
                      onClick={() => {
                        try {
                          onDuplicate(c.id);
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Duplicar
                    </button>
                    <button
                      className="secondary"
                      aria-label={`Excluir ${c.name}`}
                      onClick={() => setDeleting(c.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {removed && (
        <div
          className="material-removal"
          role="group"
          aria-label="Exclusão de caso"
        >
          <h3>Excluir {removed.name}</h3>
          <p>
            A seção, seus materiais e lançamentos serão preservados. A exclusão
            do caso pode ser desfeita.
          </p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              Cancelar exclusão
            </button>
            <button
              className="primary"
              onClick={() => {
                try {
                  onRemove(removed.id);
                  setDeleting(null);
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Confirmar exclusão
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function CaseInspector({
  project,
  section,
  analysisCase: c,
  onApply,
  onDirty,
  onDrawCircle,
  onDrawEntry,
  onDrawExit,
  onBase,
  geometryPreview,
  onSearchPreview,
  onProfileApply,
  onDiscard,
}: {
  project: Project;
  section: Section;
  analysisCase: AnalysisCase;
  onApply: (p: Project) => void;
  onDirty: (v: boolean) => void;
  onDrawCircle: () => void;
  onDrawEntry: () => void;
  onDrawExit: () => void;
  onBase: () => void;
  geometryPreview: Omit<
    FixedCirclePreviewProps,
    "dirty" | "initialProfile" | "onProfileChange"
  >;
  onSearchPreview: (overlay: SearchOverlay | null) => void;
  onProfileApply: (profile: NumericalProfile) => void;
  onDiscard: () => void;
}) {
  const limitsRef = useRef<HTMLFieldSetElement>(null);
  const initial: Record<string, string> = {
    name: c.name,
    description: c.description,
    direction: c.direction ?? "",
    surfaceMode: c.surfaceMode ?? "",
    waterCondition: c.waterCondition ?? "",
    waterSource: c.waterSource,
    loadCondition: c.loadCondition ?? "",
    "entry.min":
      c.search.entryRange.min === null ? "" : String(c.search.entryRange.min),
    "entry.max":
      c.search.entryRange.max === null ? "" : String(c.search.entryRange.max),
    "exit.min":
      c.search.exitRange.min === null ? "" : String(c.search.exitRange.min),
    "exit.max":
      c.search.exitRange.max === null ? "" : String(c.search.exitRange.max),
  };
  for (const [key, value] of Object.entries(c.fixedCircle))
    initial[`fixed.${key}`] = value === null ? "" : String(value);
  for (const key of ["x", "y", "radius"] as const)
    for (const [field, value] of Object.entries(c.search[key]))
      initial[`search.${key}.${field}`] = value === null ? "" : String(value);
  const [values, setValues] = useState(initial),
    [methods, setMethods] = useState(c.methods),
    [loadIds, setLoadIds] = useState(c.loadIds),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>(
    {},
  );
  const invalidProfile = Object.values(profileErrors).some(Boolean);
  useEffect(() => {
    onDirty(dirty || invalidProfile);
  }, [dirty, invalidProfile, onDirty]);
  const updateProfile = (
    group: keyof NumericalProfile,
    fields: Record<string, string>,
  ) => {
    const numbers: Record<string, number | null> = {};
    for (const [key, text] of Object.entries(fields)) {
      const value = text.trim() ? parseNumber(text) : null;
      if (text.trim() && value === null) {
        setProfileErrors((before) => ({
          ...before,
          [group]: "Informe números válidos no perfil de cálculo.",
        }));
        return;
      }
      numbers[key] = value;
    }
    const next = structuredClone(c.numericalProfile);
    if (group === "search") {
      Object.assign(next.search.geometry, {
        toleranceM: numbers.toleranceM,
        maxArcDegrees: numbers.maxArcDegrees,
      });
      Object.assign(next.search.equilibrium, {
        drivingThresholdKNPerM: numbers.drivingThresholdKNPerM,
        tensionToleranceKPa: numbers.tensionToleranceKPa,
      });
      Object.assign(next.search.bishop, {
        initialFactor: numbers.initialFactor,
        residualTolerance: numbers.residualTolerance,
        maxIterations: numbers.maxIterations,
        singularityThreshold: numbers.singularityThreshold,
      });
      next.search.nearTieTolerance = numbers.nearTieTolerance;
    } else {
      Object.assign(next[group], numbers);
    }
    const parsed = numericalProfileSchema.safeParse(next);
    setProfileErrors((before) => ({
      ...before,
      [group]: parsed.success
        ? ""
        : "Corrija os valores do perfil conforme os limites indicados nos campos.",
    }));
    if (parsed.success) onProfileApply(parsed.data);
  };
  const profile = c.numericalProfile;
  const requiredProfileValues =
    c.surfaceMode === "search"
      ? [
          ...Object.values(profile.search.geometry),
          ...Object.values(profile.search.equilibrium),
          profile.search.nearTieTolerance,
          ...(c.methods.includes("bishop")
            ? Object.values(profile.search.bishop)
            : []),
        ]
      : [
          ...Object.values(profile.geometry),
          ...(c.methods.includes("fellenius")
            ? Object.values(profile.fellenius)
            : []),
          ...(c.methods.includes("bishop")
            ? Object.values(profile.bishop)
            : []),
        ];
  const profileIncomplete = requiredProfileValues.some(
    (value) => value === null,
  );
  const [showCalculationFirst] = useState(() => !profileIncomplete);
  const change = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
    setError("");
  };
  const number = (key: string, label: string) => {
    const text = values[key];
    if (!text.trim()) return null;
    const n = parseNumber(text);
    if (n === null)
      throw new Error(
        `${label}: informe um número válido, com ponto ou vírgula decimal.`,
      );
    return n;
  };
  const field = (key: string, label: string, numeric = false) => (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        inputMode={numeric ? "decimal" : undefined}
        value={values[key]}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  const textField = (key: string, label: string) => (
    <label className="field">
      <span>{label}</span>
      <textarea
        aria-label={label}
        rows={3}
        value={values[key]}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  const select = (key: string, label: string, options: [string, string][]) => (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={values[key]}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">Não definido</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const apply = () => {
    try {
      if (invalidProfile)
        throw new Error(
          "Corrija ou descarte o perfil de cálculo em edição antes de aplicar o caso.",
        );
      const next = structuredClone(project),
        edited = next.analysisCases.find((a) => a.id === c.id)!;
      Object.assign(edited, {
        name: values.name,
        description: values.description,
        direction: values.direction || null,
        surfaceMode: values.surfaceMode || null,
        waterCondition: values.waterCondition || null,
        waterSource: values.waterSource,
        loadCondition: values.loadCondition || null,
        methods: [...methods],
        loadIds: [...loadIds],
      });
      edited.fixedCircle = {
        x: number("fixed.x", "Centro X"),
        y: number("fixed.y", "Centro Z"),
        radius: number("fixed.radius", "Raio"),
      };
      for (const key of ["x", "y", "radius"] as const)
        edited.search[key] = {
          min: number(`search.${key}.min`, "Mínimo"),
          max: number(`search.${key}.max`, "Máximo"),
          step: number(`search.${key}.step`, "Passo"),
        };
      edited.search.entryRange = {
        min: number("entry.min", "Entrada X mínimo"),
        max: number("entry.max", "Entrada X máximo"),
      };
      edited.search.exitRange = {
        min: number("exit.min", "Saída X mínimo"),
        max: number("exit.max", "Saída X máximo"),
      };
      const parsed = projectSchema.safeParse(next);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) => `${String(i.path.at(-1))}: ${i.message}`)
            .join(" · "),
        );
      const issue = introducedError(project, parsed.data);
      if (issue) throw new Error(issue.message);
      setDirty(false);
      onDirty(false);
      onApply(parsed.data);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const calculationPanel =
    c.surfaceMode === "search" ? (
      <CircularSearchPanel
        key={geometryPreview.preparation.snapshot?.revision}
        preparation={geometryPreview.preparation}
        dirty={dirty}
        onPreview={onSearchPreview}
        onEditLimits={() => {
          limitsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
          limitsRef.current?.querySelector("input")?.focus();
        }}
        initialProfile={profile.search}
        onProfileChange={(fields) => updateProfile("search", fields)}
      />
    ) : (
      <FixedCirclePreview
        {...geometryPreview}
        dirty={dirty}
        initialProfile={profile}
        onProfileChange={(group, fields) => updateProfile(group, fields)}
        onChange={(fields) => {
          geometryPreview.onChange(fields);
          updateProfile("geometry", {
            toleranceM: fields.tolerance,
            maxArcDegrees: fields.angle,
          });
        }}
      />
    );
  return (
    <aside className="inspector" aria-label="Propriedades do caso">
      <div className="panel-heading">
        <span>CASO DE ANÁLISE</span>
        {(dirty || invalidProfile) && (
          <span className="draft-badge">Em edição</span>
        )}
      </div>
      <form
        className="inspector-form"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="inspector-fields">
          <h2>Caso de análise</h2>
          <p className="hint">
            Seção: {section.name}. Alterar a geometria ou os materiais da seção
            afeta todos os seus casos.
          </p>
          {invalidProfile && (
            <p className="form-error" role="alert">
              {Object.values(profileErrors).filter(Boolean).join(" ")} Corrija
              os campos antes de salvar ou trocar de caso.
            </p>
          )}
          {profileIncomplete && (
            <p className="hint" role="status">
              Perfil de cálculo incompleto. Informe os parâmetros do modo e dos
              métodos selecionados antes de calcular.
            </p>
          )}
          {showCalculationFirst && calculationPanel}
          {field("name", "Nome do caso")}
          {textField("description", "Hipóteses do caso")}
          {select("direction", "Direção de deslizamento", [
            ["left-to-right", directionLabel("left-to-right")],
            ["right-to-left", directionLabel("right-to-left")],
          ])}
          <p className="hint">
            As coordenadas permanecem no referencial X/Z do desenho, mesmo ao
            escolher movimento para a esquerda.
          </p>
          <fieldset className="case-fields">
            <legend>Métodos pretendidos</legend>
            {(["bishop", "fellenius"] as const).map((m) => (
              <label className="assignment-target" key={m}>
                <input
                  type="checkbox"
                  checked={methods.includes(m)}
                  onChange={(e) => {
                    setMethods((v) =>
                      e.target.checked ? [...v, m] : v.filter((x) => x !== m),
                    );
                    setDirty(true);
                    setError("");
                  }}
                />
                {methodLabel(m)}
                {m === "bishop" ? " · principal" : " · referência"}
              </label>
            ))}
          </fieldset>
          {select("waterCondition", "Água no caso", [
            ["section", caseWaterLabel("section")],
            ["dry", caseWaterLabel("dry")],
            ["piezometric", caseWaterLabel("piezometric")],
          ])}
          <p className="hint">
            Usar condição da seção acompanha suas alterações. Usar linha ativa a
            linha e γw cadastrados, inclusive quando guardados na seção seca.
          </p>
          {textField("waterSource", "Origem da água no caso")}
          <p className="hint">
            Justifique a hipótese própria seca/piezométrica. Ao usar a condição
            da seção, vale a origem cadastrada nela; este texto fica guardado.
          </p>
          {select("loadCondition", "Sobrecargas no caso", [
            ["section", caseLoadLabel("section")],
            ["none", caseLoadLabel("none")],
            ["selected", caseLoadLabel("selected")],
          ])}
          <fieldset className="case-fields">
            <legend>Faixas selecionadas</legend>
            <p className="hint">
              A seleção só fica ativa em Usar faixas selecionadas. Nesse modo, a
              habilitação da seção não interfere. Alterar q ou os limites da
              faixa afeta os casos que a usam.
            </p>
            {!section.loads.length && (
              <p className="hint">Cadastre as faixas na seção.</p>
            )}
            {section.loads.map((l) => (
              <label className="assignment-target" key={l.id}>
                <input
                  type="checkbox"
                  aria-label={`Incluir ${l.name}`}
                  checked={loadIds.includes(l.id)}
                  onChange={(e) => {
                    setLoadIds((v) =>
                      e.target.checked
                        ? [...v, l.id]
                        : v.filter((id) => id !== l.id),
                    );
                    setDirty(true);
                    setError("");
                  }}
                />
                <span>
                  {l.name}
                  <small>
                    {l.q === null ? "q não informado" : `${l.q} kPa`}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          {select("surfaceMode", "Definição da superfície", [
            ["fixed", surfaceLabel("fixed")],
            ["search", surfaceLabel("search")],
          ])}
          <fieldset className="case-fields">
            <legend>
              Círculo fixo
              {values.surfaceMode !== "fixed" ? " · guardado, inativo" : ""}
            </legend>
            <div className="field-row">
              {field("fixed.x", "Centro X do caso (m)", true)}
              {field("fixed.y", "Centro Z do caso (m)", true)}
            </div>
            {field("fixed.radius", "Raio do caso (m)", true)}
            <button className="secondary" type="button" onClick={onDrawCircle}>
              Desenhar círculo do caso
            </button>
            <button
              className="text-button"
              type="button"
              disabled={!section.circle}
              onClick={() => {
                if (section.circle) {
                  setValues((v) => ({
                    ...v,
                    "fixed.x": String(section.circle!.x),
                    "fixed.y": String(section.circle!.y),
                    "fixed.radius": String(section.circle!.radius),
                    surfaceMode: "fixed",
                  }));
                  setDirty(true);
                  setError("");
                }
              }}
            >
              Copiar círculo de tentativa
            </button>
          </fieldset>
          <fieldset className="case-fields" ref={limitsRef}>
            <legend>
              Limites da busca
              {values.surfaceMode !== "search" ? " · guardados, inativos" : ""}
            </legend>
            {(
              [
                ["x", "Centro X"],
                ["y", "Centro Z"],
                ["radius", "Raio"],
              ] as const
            ).map(([axis, label]) => (
              <div key={axis}>
                <h3>{label}</h3>
                <div className="field-row">
                  {field(`search.${axis}.min`, `${label} mínimo (m)`, true)}
                  {field(`search.${axis}.max`, `${label} máximo (m)`, true)}
                </div>
                {field(`search.${axis}.step`, `${label} passo (m)`, true)}
              </div>
            ))}
            <h3>Trechos admissíveis no terreno</h3>
            <div className="field-row">
              {field("entry.min", "Entrada X mínimo (m)", true)}
              {field("entry.max", "Entrada X máximo (m)", true)}
            </div>
            <div className="field-row">
              {field("exit.min", "Saída X mínimo (m)", true)}
              {field("exit.max", "Saída X máximo (m)", true)}
            </div>
            <div className="case-water-actions">
              <button className="secondary" type="button" onClick={onDrawEntry}>
                Marcar entrada no desenho
              </button>
              <button className="secondary" type="button" onClick={onDrawExit}>
                Marcar saída no desenho
              </button>
              <button
                className="text-button"
                type="button"
                disabled={
                  !values["entry.min"] &&
                  !values["entry.max"] &&
                  !values["exit.min"] &&
                  !values["exit.max"]
                }
                onClick={() => {
                  setValues((v) => ({
                    ...v,
                    "entry.min": "",
                    "entry.max": "",
                    "exit.min": "",
                    "exit.max": "",
                  }));
                  setDirty(true);
                  setError("");
                }}
              >
                Limpar trechos
              </button>
            </div>
            <p className="hint">
              Mínimo e máximo iguais fixam o eixo; o passo pode ficar vazio
              nesse eixo. Trechos vazios mantêm entrada e saída livres. Aplique
              o caso para conferir a malha e iniciar a busca.
            </p>
          </fieldset>
          <CoreInputPreview
            prepared={geometryPreview.preparation}
            dirty={dirty}
          />
          {!showCalculationFirst && calculationPanel}
          <button className="text-button" type="button" onClick={onBase}>
            Voltar à seção base
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="inspector-actions">
          <button
            className="secondary"
            type="button"
            disabled={!dirty && !invalidProfile}
            onClick={onDiscard}
          >
            <RotateCcw size={14} />
            Descartar
          </button>
          <button className="primary" type="submit" disabled={!dirty}>
            <Check size={14} />
            Aplicar caso
          </button>
        </div>
      </form>
    </aside>
  );
}
