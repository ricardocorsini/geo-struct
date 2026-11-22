import { useEffect, useState } from "react";
import { Plus, Trash2, Check, RotateCcw } from "lucide-react";
import {
  projectSchema,
  type Project,
  type Section,
  type Selection,
  type Point,
  type Material,
} from "../domain/model";
import { setWaterMode } from "../domain/conditions";
import { materialPending, materialUses } from "../domain/materials";
import { contourTarget, replaceContourCoordinates } from "../domain/editing";
import {
  introducedError,
  parseCoordinates,
  parseNumber,
} from "../domain/geometry";
import { CsvImportDialog } from "./CsvImportDialog";

const labels: Record<Selection["kind"], string> = {
  project: "Dados do projeto",
  section: "Dados da seção",
  terrain: "Perfil do terreno",
  region: "Região de solo",
  material: "Material",
  water: "Condição de água",
  load: "Sobrecarga",
  circle: "Círculo de tentativa",
  case: "Caso de análise",
};
export function Inspector({
  project,
  section,
  selection,
  onApply,
  onDirty,
  linked,
}: {
  project: Project;
  section: Section;
  selection: Selection;
  onApply: (p: Project) => void;
  onDirty: (b: boolean) => void;
  linked: boolean;
}) {
  const source =
    selection.kind === "material"
      ? project.materials.find((m) => m.id === selection.id)
      : selection.kind === "region"
        ? section.regions.find((r) => r.id === selection.id)
        : selection.kind === "load"
          ? section.loads.find((l) => l.id === selection.id)
          : selection.kind === "project"
            ? project
            : selection.kind === "circle"
              ? section.circle
              : section;
  const initialPoints: Point[] =
    selection.kind === "terrain"
      ? section.terrain
      : selection.kind === "water"
        ? (section.water ?? [])
        : selection.kind === "region"
          ? ((source as Section["regions"][number])?.points ?? [])
          : [];
  const initial = Object.fromEntries(
    Object.entries(source ?? {})
      .filter(
        ([, v]) =>
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean" ||
          v === null,
      )
      .map(([k, v]) => [k, v === null ? "" : String(v)]),
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [coordinates, setCoordinates] = useState<string[][]>(
    initialPoints.map((p) => [String(p.x), String(p.y)]),
  );
  const [originalRows, setOriginalRows] = useState<(number | null)[]>(
    initialPoints.map((_, i) => i),
  );
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  useEffect(() => {
    onDirty(dirty || csvOpen);
  }, [dirty, csvOpen, onDirty]);
  const change = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
    setError("");
  };
  const editCoordinates = (coords: string[][]) => {
    setCoordinates(coords);
    setDirty(true);
    setError("");
  };
  const reset = () => {
    setValues(initial);
    setCoordinates(initialPoints.map((p) => [String(p.x), String(p.y)]));
    setOriginalRows(initialPoints.map((_, i) => i));
    setError("");
    setDirty(false);
    setPaste("");
  };
  const field = (
    key: string,
    label: string,
    opts: {
      number?: boolean;
      textarea?: boolean;
      hint?: string;
      type?: string;
    } = {},
  ) => (
    <label className="field" key={key}>
      <span>{label}</span>
      {opts.textarea ? (
        <textarea
          aria-label={label}
          value={values[key] ?? ""}
          onChange={(e) => change(key, e.target.value)}
          rows={3}
        />
      ) : (
        <input
          aria-label={label}
          type={opts.type ?? "text"}
          inputMode={opts.number ? "decimal" : undefined}
          value={values[key] ?? ""}
          onChange={(e) => change(key, e.target.value)}
          autoComplete="off"
        />
      )}
      {opts.hint && <small>{opts.hint}</small>}
    </label>
  );
  const materialSelect = (key: string, label: string) => (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={values[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">Sem material — atribuição pendente</option>
        {project.materials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {!values[key] && (
        <small className="material-pending">
          Escolha o material e clique em Aplicar. A geometria pode ser salva com
          esta pendência.
        </small>
      )}
      {values[key] &&
        (() => {
          const m = project.materials.find((m) => m.id === values[key]);
          const pending = m ? materialPending(m) : [];
          return (
            pending.length > 0 && (
              <small className="material-pending">
                Falta no cadastro: {pending.join(", ")}.
              </small>
            )
          );
        })()}
    </label>
  );
  const number = (key: string, label: string, optional = false) => {
    const value = values[key] ?? "";
    if (!value.trim() && optional) return null;
    const n = parseNumber(value);
    if (n === null)
      throw new Error(
        `${label}: informe um número válido. Use ponto ou vírgula decimal.`,
      );
    return n;
  };
  const apply = () => {
    try {
      const p = structuredClone(project),
        s = p.sections.find((x) => x.id === section.id)!;
      const points = () =>
        parseCoordinates(coordinates.map((row) => row.join(" ; ")).join("\n"));
      const target = contourTarget(selection);
      if (target && selection.kind !== "water")
        Object.assign(
          s,
          replaceContourCoordinates(
            section,
            target,
            points(),
            originalRows,
            linked,
          ),
        );
      switch (selection.kind) {
        case "project":
          p.name = values.name;
          p.author = values.author;
          p.description = values.description;
          break;
        case "section":
          s.name = values.name;
          s.base = number("base", "Cota da base")!;
          s.backgroundMaterialId = values.backgroundMaterialId || null;
          break;
        case "terrain":
          s.base = number("base", "Cota da base")!;
          s.backgroundMaterialId = values.backgroundMaterialId || null;
          break;
        case "region": {
          const r = s.regions.find((x) => x.id === selection.id)!;
          r.name = values.name;
          r.materialId = values.materialId || null;
          break;
        }
        case "water":
          s.water = coordinates.length
            ? points()
            : section.water === null
              ? null
              : [];
          Object.assign(
            s,
            setWaterMode(s, values.waterMode as Section["waterMode"]),
          );
          s.waterUnitWeight = number(
            "waterUnitWeight",
            "Peso específico da água",
            true,
          );
          s.waterSource = values.waterSource;
          break;
        case "material": {
          const m = p.materials.find((x) => x.id === selection.id)!;
          m.name = values.name;
          m.color = values.color;
          m.gamma = number("gamma", "Peso específico", true);
          m.cohesion = number("cohesion", "Coesão", true);
          m.friction = number("friction", "Atrito", true);
          m.mode = (values.mode || null) as Material["mode"];
          m.source = values.source;
          break;
        }
        case "load": {
          const l = s.loads.find((x) => x.id === selection.id)!;
          l.name = values.name;
          l.x1 = number("x1", "X inicial")!;
          l.x2 = number("x2", "X final")!;
          l.q = number("q", "Sobrecarga", true);
          l.enabled = values.enabled === "true";
          l.source = values.source;
          break;
        }
        case "circle":
          s.circle = {
            x: number("x", "Centro X")!,
            y: number("y", "Centro Y")!,
            radius: number("radius", "Raio")!,
          };
          break;
      }
      const parsed = projectSchema.safeParse(p);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) => `${String(i.path.at(-1))}: ${i.message}`)
            .join(" · "),
        );
      const added = introducedError(project, parsed.data);
      if (added) throw new Error(added.message);
      setDirty(false);
      onDirty(false);
      onApply(parsed.data);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const showCoordinates = ["terrain", "region", "water"].includes(
    selection.kind,
  );
  if (!source && selection.kind !== "water")
    return (
      <aside className="inspector">
        <div className="panel-heading">PROPRIEDADES</div>
        <p className="hint padded">
          Selecione um elemento no desenho ou na árvore.
        </p>
      </aside>
    );
  return (
    <aside className="inspector" aria-label="Propriedades">
      <div className="panel-heading">
        <span>PROPRIEDADES</span>
        {dirty && <span className="draft-badge">Em edição</span>}
      </div>
      <form
        className="inspector-form"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="inspector-fields">
          <h2>{labels[selection.kind]}</h2>
          {["project", "section", "region", "material", "load"].includes(
            selection.kind,
          ) && field("name", "Nome")}
          {selection.kind === "project" && (
            <>
              {field("author", "Responsável")}
              {field("description", "Descrição", { textarea: true })}
              <div className="info-card">
                Comprimentos em m · forças em kN · tensões em kPa. Os materiais
                são compartilhados entre as seções.
              </div>
            </>
          )}
          {["section", "terrain"].includes(selection.kind) && (
            <>
              {field("base", "Cota da base (m)", {
                number: true,
                hint: "Abaixo de todos os pontos do terreno.",
              })}
              {materialSelect("backgroundMaterialId", "Solo de fundo")}
              <p className="hint">
                O solo de fundo preenche o domínio fora das regiões desenhadas.
              </p>
            </>
          )}
          {selection.kind === "region" &&
            materialSelect("materialId", "Material da região")}
          {selection.kind === "material" && (
            <>
              <div className="info-card">
                Mohr–Coulomb · {materialUses(project, selection.id).length}{" "}
                atribuições no projeto. Alterações neste cadastro valem para
                todas elas.
              </div>
              {field("color", "Cor", { type: "color" })}
              {field("gamma", "Peso específico total γ (kN/m³)", {
                number: true,
              })}
              <label className="field">
                <span>Parâmetros de resistência</span>
                <select
                  aria-label="Parâmetros de resistência"
                  value={values.mode}
                  onChange={(e) => change("mode", e.target.value)}
                >
                  <option value="">Não definido — selecione</option>
                  <option value="effective">Tensões efetivas — c′, φ′</option>
                  <option value="total">Tensões totais — c, φ</option>
                </select>
              </label>
              <div className="field-row">
                {field(
                  "cohesion",
                  values.mode === "effective"
                    ? "Coesão c′ (kPa)"
                    : "Coesão c (kPa)",
                  { number: true },
                )}
                {field(
                  "friction",
                  values.mode === "effective"
                    ? "Atrito φ′ (°)"
                    : "Atrito φ (°)",
                  { number: true },
                )}
              </div>
              <p className="hint">
                Escolha o tipo correspondente aos parâmetros informados. Alterar
                a opção não converte valores nem define automaticamente uma
                condição drenada ou não drenada.
              </p>
              {field("source", "Origem dos parâmetros", {
                textarea: true,
                hint: "Investigação, ensaio, referência ou hipótese adotada.",
              })}
              <p className="hint">
                Campos vazios ficam identificados como pendentes. Esta versão
                não calcula resistência ou fator de segurança.
              </p>
              {(() => {
                const pending = materialPending(source as Material);
                return (
                  <div className={pending.length ? "material-pending" : "hint"}>
                    Cadastro aplicado:{" "}
                    {pending.length
                      ? `falta ${pending.join(", ")}.`
                      : "dados preenchidos."}
                  </div>
                );
              })()}
            </>
          )}
          {selection.kind === "load" && (
            <>
              <label className="assignment-target">
                <input
                  type="checkbox"
                  checked={values.enabled === "true"}
                  onChange={(e) => change("enabled", String(e.target.checked))}
                />
                Habilitar esta sobrecarga
              </label>
              {section.loadCondition !== "loads" && (
                <p className="material-pending">
                  As sobrecargas desta seção estão inativas. Para utilizá-las,
                  escolha Usar sobrecargas cadastradas em Gerenciar cargas.
                </p>
              )}
              <div className="field-row">
                {field("x1", "X inicial (m)", { number: true })}
                {field("x2", "X final (m)", { number: true })}
              </div>
              {field("q", "Sobrecarga q (kPa)", {
                number: true,
                hint: "Vertical, descendente e uniforme na projeção horizontal. Vazio significa não informado; zero é um valor explícito.",
              })}
              {field("source", "Origem da sobrecarga", {
                textarea: true,
                hint: "Uso, referência ou hipótese adotada para a intensidade e a faixa.",
              })}
            </>
          )}
          {selection.kind === "circle" && (
            <>
              <div className="field-row">
                {field("x", "Centro X (m)", { number: true })}
                {field("y", "Centro Y (m)", { number: true })}
              </div>
              {field("radius", "Raio (m)", { number: true })}
              <div className="info-card">
                Círculo geométrico de tentativa. Ainda não foi verificado quanto
                à admissibilidade ou estabilidade.
              </div>
            </>
          )}
          {selection.kind === "water" && (
            <>
              <label className="field">
                <span>Condição de água</span>
                <select
                  aria-label="Condição de água"
                  value={values.waterMode}
                  onChange={(e) => change("waterMode", e.target.value)}
                >
                  <option value="unspecified">Não definida</option>
                  <option value="dry">Condição seca</option>
                  <option value="piezometric">
                    Linha piezométrica prescrita
                  </option>
                </select>
              </label>
              {field("waterUnitWeight", "Peso específico da água γw (kN/m³)", {
                number: true,
                hint: "Necessário para a condição piezométrica. Informe o valor adotado; não há valor presumido.",
              })}
              {field("waterSource", "Origem da condição de água", {
                textarea: true,
                hint: "Medição, referência ou justificativa da hipótese, inclusive para condição seca.",
              })}
              <p className="hint">
                A linha representa carga piezométrica prescrita. Fluxo e água
                externa ainda não são modelados.
              </p>
              {values.waterMode !== "piezometric" && (
                <p className="info-card">
                  A linha e os valores abaixo ficam guardados, mas inativos
                  nesta condição. Alterar a condição não apaga os dados.
                </p>
              )}
            </>
          )}
          {showCoordinates && (
            <>
              {(selection.kind === "terrain" ||
                selection.kind === "region") && (
                <div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={dirty}
                    onClick={() => setCsvOpen(true)}
                  >
                    Importar CSV
                  </button>
                  {dirty && (
                    <p className="hint">
                      Aplique ou descarte as propriedades em edição antes de
                      importar CSV.
                    </p>
                  )}
                </div>
              )}
              <div className="field-heading">
                Coordenadas <span>m</span>
              </div>
              <div className="coordinate-table">
                <div className="coordinate-head">
                  <span>#</span>
                  <span>X</span>
                  <span>Z</span>
                  <span />
                </div>
                {coordinates.map((row, i) => (
                  <div className="coordinate-row" key={i}>
                    <span>{i + 1}</span>
                    {row.map((value, k) => (
                      <input
                        key={k}
                        aria-label={`${k === 0 ? "X" : "Z"} do ponto ${i + 1}`}
                        inputMode="decimal"
                        value={value}
                        onChange={(e) =>
                          editCoordinates(
                            coordinates.map((r, j) =>
                              j === i
                                ? r.map((v, l) =>
                                    l === k ? e.target.value : v,
                                  )
                                : r,
                            ),
                          )
                        }
                      />
                    ))}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remover ponto ${i + 1}`}
                      onClick={() => {
                        editCoordinates(coordinates.filter((_, j) => i !== j));
                        setOriginalRows((rows) =>
                          rows.filter((_, j) => i !== j),
                        );
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="text-button"
                type="button"
                disabled={coordinates.length >= 500}
                onClick={() => {
                  editCoordinates([...coordinates, ["", ""]]);
                  setOriginalRows((rows) => [...rows, null]);
                }}
              >
                <Plus size={14} />
                Adicionar ponto
              </button>
              <details className="coordinate-paste">
                <summary>Colar lista de coordenadas</summary>
                <p className="hint">
                  Uma linha por ponto: X ; Z. A lista substitui o contorno;
                  vínculos entre vértices antigos e novos não são inferidos.
                  Aceita tabulação e vírgula decimal.
                </p>
                <textarea
                  aria-label="Lista de coordenadas"
                  placeholder={"0 ; 20\n15 ; 20\n30 ; 8\n50 ; 8"}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={5}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    try {
                      const parsed = parseCoordinates(paste);
                      setOriginalRows(parsed.map(() => null));
                      editCoordinates(
                        parsed.map((pt) => [String(pt.x), String(pt.y)]),
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Usar coordenadas
                </button>
              </details>
            </>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="inspector-actions">
          <button
            type="button"
            className="secondary"
            disabled={!dirty}
            onClick={reset}
          >
            <RotateCcw size={14} />
            Descartar
          </button>
          <button type="submit" className="primary" disabled={!dirty}>
            <Check size={14} />
            Aplicar
          </button>
        </div>
      </form>
      {csvOpen &&
        (selection.kind === "terrain" || selection.kind === "region") && (
          <CsvImportDialog
            project={project}
            section={section}
            target={
              selection.kind === "region"
                ? { kind: "region", id: selection.id }
                : { kind: "terrain" }
            }
            onClose={() => setCsvOpen(false)}
            onApply={(next) => {
              setCsvOpen(false);
              onDirty(false);
              onApply(next);
            }}
          />
        )}
    </aside>
  );
}
