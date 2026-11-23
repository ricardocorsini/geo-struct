import { useEffect, useMemo, useRef, useState } from "react";
import { parseNumber } from "../domain/geometry";
import { uid, type Point, type Project, type Section } from "../domain/model";
import {
  convertDxfPoints,
  parseDxf,
  type DxfDocument,
} from "../domain/coordinate-dxf";
import { importDxfContours, type DxfAssignment } from "../domain/dxf-import";
import {
  desktop,
  openNativeDxf,
  readDxfFile,
  type DxfFile,
} from "../lib/files";
import { Dialog } from "./Dialog";
import "./DxfImportDialog.css";

type Unit = "m" | "cm" | "mm" | "";
type DxfShape = Pick<DxfAssignment, "entityId" | "points" | "closed">;
type EntityDraft = {
  destination: string;
  name: string;
  material: string;
  reverse: boolean;
  newId: string;
};

function bounds(points: Point[]) {
  if (!points.length) return null;
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y);
    maxZ = Math.max(maxZ, p.y);
  }
  return { minX, maxX, minZ, maxZ };
}
const number = (n: number) =>
  n.toLocaleString("pt-BR", { maximumSignificantDigits: 10 });
function boundsLabel(points: Point[]) {
  const box = bounds(points);
  return box
    ? `X: ${number(box.minX)} a ${number(box.maxX)} m · Z: ${number(box.minZ)} a ${number(box.maxZ)} m`
    : "Sem coordenadas convertidas.";
}

function declaredUnit(code: number | null) {
  if (code === null) return "não informada";
  const names: Record<number, string> = {
    0: "sem unidade",
    1: "polegada",
    2: "pé",
    3: "milha",
    4: "milímetro (mm)",
    5: "centímetro (cm)",
    6: "metro (m)",
    7: "quilômetro (km)",
    14: "decímetro (dm)",
  };
  return names[code] ?? `não reconhecida (código ${code})`;
}

function GeometryPreview({
  section,
  assignments,
  valid,
}: {
  section: Section;
  assignments: DxfShape[];
  valid: boolean;
}) {
  const domain =
    section.terrain.length >= 2
      ? [
          ...section.terrain,
          { x: section.terrain.at(-1)!.x, y: section.base },
          { x: section.terrain[0].x, y: section.base },
        ]
      : [];
  const all = [
    ...domain,
    ...section.regions.flatMap((r) => r.points),
    ...assignments.flatMap((a) => a.points),
  ];
  const box = bounds(all);
  if (!box) return null;
  const width = 720,
    height = 280,
    margin = 24;
  const scale = Math.min(
    (width - margin * 2) / (box.maxX - box.minX || 1),
    (height - margin * 2) / (box.maxZ - box.minZ || 1),
  );
  const left = (width - (box.maxX - box.minX) * scale) / 2;
  const top = (height - (box.maxZ - box.minZ) * scale) / 2;
  const drawing = (points: Point[]) =>
    points
      .map(
        (p) =>
          `${left + (p.x - box.minX) * scale},${top + (box.maxZ - p.y) * scale}`,
      )
      .join(" ");
  return (
    <figure className="dxf-preview" data-invalid={!valid}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Seção atual e contornos DXF selecionados"
      >
        {domain.length > 0 && (
          <polygon className="dxf-current-domain" points={drawing(domain)} />
        )}
        {section.regions.map((r) => (
          <polygon
            key={r.id}
            className="dxf-current-region"
            points={drawing(r.points)}
          />
        ))}
        {assignments.map((a) =>
          a.closed ? (
            <polygon
              key={a.entityId}
              className="dxf-selected"
              points={drawing(a.points)}
            />
          ) : (
            <polyline
              key={a.entityId}
              className="dxf-selected"
              points={drawing(a.points)}
            />
          ),
        )}
      </svg>
      <figcaption>
        Cinza: seção atual · Destaque: contornos selecionados · X para a
        direita, Z para cima.
        {!valid &&
          assignments.length > 0 &&
          " Prévia com pendências; a aplicação está bloqueada."}
      </figcaption>
    </figure>
  );
}

export function DxfImportDialog({
  project,
  section,
  onApply,
  onClose,
}: {
  project: Project;
  section: Section;
  onApply: (project: Project) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<DxfFile | null>(null);
  const [document, setDocument] = useState<DxfDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [unit, setUnit] = useState<Unit>("");
  const [originX, setOriginX] = useState("0");
  const [originZ, setOriginZ] = useState("0");
  const [confirmed, setConfirmed] = useState(false);
  const [layer, setLayer] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, EntityDraft>>({});
  const [inspected, setInspected] = useState("");
  const request = useRef(0);
  const applying = useRef(false);
  const context = useRef({ project, sectionId: section.id });
  const contextChanged =
    context.current.project !== project ||
    context.current.sectionId !== section.id;

  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (
      context.current.project === project &&
      context.current.sectionId === section.id
    )
      return;
    request.current += 1;
    context.current = { project, sectionId: section.id };
    setDocument(null);
    setFile(null);
    setDrafts({});
    setConfirmed(false);
    setLoading(false);
    setApplyError("");
    setFileError(
      "O projeto ou a seção mudou. Escolha o arquivo DXF novamente antes de aplicar.",
    );
  }, [project, section.id]);

  const load = async (read: () => Promise<DxfFile | null>) => {
    const current = ++request.current;
    setFile(null);
    setDocument(null);
    setFileError("");
    setApplyError("");
    setDrafts({});
    setUnit("");
    setOriginX("0");
    setOriginZ("0");
    setConfirmed(false);
    setLayer("all");
    setInspected("");
    setLoading(true);
    try {
      const next = await read();
      if (request.current !== current || !next) return;
      setFile(next);
      const parsed = parseDxf(next.text);
      if (request.current !== current) return;
      setDrafts(
        Object.fromEntries(
          parsed.entities.map((entity) => [
            entity.id,
            {
              destination: "ignore",
              name: "",
              material: "",
              reverse: false,
              newId: uid(),
            },
          ]),
        ),
      );
      setDocument(parsed);
    } catch (error) {
      if (request.current === current)
        setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      if (request.current === current) setLoading(false);
    }
  };

  const x = originX.trim() ? parseNumber(originX) : null;
  const z = originZ.trim() ? parseNumber(originZ) : null;
  const configurationError = !unit
    ? "Escolha a unidade do DXF, mesmo quando houver unidade declarada no arquivo."
    : x === null || z === null
      ? "Informe origens X e Y válidas nas unidades do arquivo DXF."
      : "";
  const converted = useMemo(() => {
    const result = new Map<string, { points: Point[]; error: string | null }>();
    if (!document || !unit || x === null || z === null) return result;
    for (const entity of document.entities) {
      if (entity.error) {
        result.set(entity.id, { points: [], error: entity.error });
        continue;
      }
      try {
        const points = convertDxfPoints(entity, {
          unit,
          originX: x,
          originZ: z,
        });
        result.set(entity.id, { points, error: null });
      } catch (error) {
        result.set(entity.id, {
          points: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  }, [document, unit, x, z]);

  const preview = useMemo(() => {
    const assignments: DxfAssignment[] = [];
    if (!document || configurationError || contextChanged)
      return { assignments, next: null, error: "" };
    try {
      for (const entity of document.entities) {
        const draft = drafts[entity.id];
        if (!draft || draft.destination === "ignore") continue;
        const data = converted.get(entity.id);
        if (!data || data.error)
          throw new Error(
            `${entity.id}: ${data?.error ?? "Confira a conversão das coordenadas."}`,
          );
        let target: DxfAssignment["target"];
        if (draft.destination === "terrain") target = { kind: "terrain" };
        else if (draft.destination.startsWith("region:"))
          target = { kind: "region", id: draft.destination.slice(7) };
        else if (draft.destination === "new-region") {
          if (!draft.name.trim())
            throw new Error(`${entity.id}: informe o nome da nova região.`);
          if (!draft.material)
            throw new Error(
              `${entity.id}: escolha o material ou a opção Sem material — pendente.`,
            );
          target = {
            kind: "new-region",
            id: draft.newId,
            name: draft.name.trim(),
            materialId:
              draft.material === "none" ? null : draft.material.slice(9),
          };
        } else throw new Error(`${entity.id}: escolha um destino válido.`);
        assignments.push({
          entityId: entity.id,
          target,
          closed: entity.closed,
          points:
            draft.destination === "terrain" && draft.reverse
              ? [...data.points].reverse()
              : data.points,
        });
      }
      if (!assignments.length) return { assignments, next: null, error: "" };
      return {
        assignments,
        next: importDxfContours(project, section.id, assignments),
        error: "",
      };
    } catch (error) {
      return {
        assignments,
        next: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [
    document,
    drafts,
    converted,
    project,
    section.id,
    configurationError,
    contextChanged,
  ]);

  const layers = useMemo(
    () =>
      [...new Set(document?.entities.map((e) => e.layer) ?? [])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [document],
  );
  const selected =
    document?.entities.filter(
      (e) => drafts[e.id] && drafts[e.id].destination !== "ignore",
    ) ?? [];
  const visible =
    document?.entities.filter(
      (e) => layer === "all" || e.layer === layer.slice(6),
    ) ?? [];
  const selectedHidden = selected.filter((e) => !visible.includes(e)).length;
  const selectedShapes: DxfShape[] = selected.flatMap((entity) => {
    const data = converted.get(entity.id);
    if (!data || data.error) return [];
    const draft = drafts[entity.id];
    return [
      {
        entityId: entity.id,
        closed: entity.closed,
        points:
          draft.destination === "terrain" && draft.reverse
            ? [...data.points].reverse()
            : data.points,
      },
    ];
  });
  const points = selectedShapes.flatMap((a) => a.points);
  const inspectedAssignment =
    selectedShapes.find((a) => a.entityId === inspected) ?? selectedShapes[0];
  const destinationLabel = (draft: EntityDraft) => {
    if (draft.destination === "terrain")
      return `Terreno — substituir contorno${draft.reverse ? "; ordem invertida" : ""}`;
    if (draft.destination.startsWith("region:")) {
      const region = section.regions.find(
        (r) => r.id === draft.destination.slice(7),
      );
      const material = project.materials.find(
        (m) => m.id === region?.materialId,
      );
      return `Região ${region?.name ?? "ausente"} — substituir contorno; material preservado: ${material?.name ?? "sem material — pendente"}`;
    }
    const material =
      draft.material === "none"
        ? "sem material — pendente"
        : (project.materials.find((m) => `material:${m.id}` === draft.material)
            ?.name ?? "escolha pendente");
    return `Nova região: ${draft.name.trim() || "nome pendente"}; material: ${material}`;
  };
  const changeDraft = (id: string, change: Partial<EntityDraft>) => {
    setApplyError("");
    setDrafts((before) => ({ ...before, [id]: { ...before[id], ...change } }));
  };
  const changeReference = (change: () => void) => {
    setConfirmed(false);
    setApplyError("");
    change();
  };

  return (
    <Dialog
      title="Importar DXF"
      description={`Importar para ${section.name}. Apenas polilinhas 2D XY com segmentos retos. Cada destino deve ser escolhido; o projeto só muda ao aplicar todos os contornos.`}
      onClose={onClose}
      wide
    >
      <div className="dxf-import">
        <div className="dxf-file-picker">
          {desktop ? (
            <button
              type="button"
              className="secondary"
              disabled={loading}
              onClick={() => void load(openNativeDxf)}
            >
              Escolher arquivo DXF
            </button>
          ) : (
            <label className="field">
              <span>Arquivo DXF</span>
              <input
                type="file"
                aria-label="Arquivo DXF"
                accept=".dxf"
                disabled={loading}
                onChange={(event) => {
                  const selectedFile = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (selectedFile) void load(() => readDxfFile(selectedFile));
                }}
              />
            </label>
          )}
          <p className="hint">
            DXF em texto UTF-8 · até 2 MiB · até 200 entidades e 500 pontos por
            entidade.
          </p>
          <p className="dxf-file-status" role="status">
            {loading ? "Lendo DXF…" : (file?.name ?? "Nenhum DXF carregado.")}
          </p>
        </div>
        {fileError && (
          <p className="form-error" role="alert">
            {fileError}
          </p>
        )}
        {document && (
          <>
            <p className="info-card">
              <strong>X DXF → X; Y DXF → Z.</strong> Subtraia a origem nas
              unidades do arquivo antes da conversão para metros. Origem (0, 0)
              conserva o referencial absoluto. Unidade declarada no arquivo:{" "}
              {declaredUnit(document.insUnits)}. Dado informativo; confirme a
              unidade abaixo. Ela não será escolhida automaticamente.
            </p>
            <div className="dxf-reference">
              <label className="field">
                <span>Unidade do DXF</span>
                <select
                  aria-label="Unidade do DXF"
                  value={unit}
                  onChange={(e) =>
                    changeReference(() => setUnit(e.target.value as Unit))
                  }
                >
                  <option value="">Selecione</option>
                  <option value="m">Metro (m)</option>
                  <option value="cm">Centímetro (cm)</option>
                  <option value="mm">Milímetro (mm)</option>
                </select>
              </label>
              <label className="field">
                <span>Origem X no DXF</span>
                <input
                  aria-label="Origem X no DXF"
                  inputMode="decimal"
                  value={originX}
                  onChange={(e) =>
                    changeReference(() => setOriginX(e.target.value))
                  }
                />
                <small>Na unidade escolhida, antes de converter.</small>
              </label>
              <label className="field">
                <span>Origem Y no DXF (Z)</span>
                <input
                  aria-label="Origem Y no DXF (Z)"
                  inputMode="decimal"
                  value={originZ}
                  onChange={(e) =>
                    changeReference(() => setOriginZ(e.target.value))
                  }
                />
                <small>Na unidade escolhida, antes de converter.</small>
              </label>
            </div>
            <label className="assignment-target dxf-reference-confirmation">
              <input
                type="checkbox"
                aria-label="Conferi unidades e referencial"
                checked={confirmed}
                disabled={!!configurationError}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Conferi unidades e referencial
            </label>
            {configurationError && (
              <p className="info-card">{configurationError}</p>
            )}
            <div className="dxf-filter">
              <label className="field">
                <span>Camada DXF</span>
                <select
                  aria-label="Camada DXF"
                  value={layer}
                  onChange={(e) => setLayer(e.target.value)}
                >
                  <option value="all">Todas as camadas</option>
                  {layers.map((name) => (
                    <option key={name} value={`layer:${name}`}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <p role="status">
                {document.entities.length} entidades · {selected.length}{" "}
                selecionadas · {document.entities.length - selected.length}{" "}
                ignoradas.{" "}
                {selectedHidden > 0 &&
                  `${selectedHidden} selecionadas estão fora do filtro e continuam na aplicação.`}
              </p>
            </div>
            <p className="hint">
              Filtro não altera destinos. Polilinha aberta: terreno. Polilinha
              fechada: região existente ou nova. Entidades incompatíveis ficam
              listadas com o motivo e são ignoradas.
            </p>
            <section
              className="dxf-entity-list"
              aria-label="Entidades DXF"
              tabIndex={0}
            >
              {visible.map((entity) => {
                const draft = drafts[entity.id];
                if (!draft) return null;
                const data = converted.get(entity.id);
                const incompatible = entity.error ?? data?.error;
                return (
                  <article
                    className="dxf-entity"
                    data-entity-id={entity.id}
                    key={entity.id}
                  >
                    <div className="dxf-entity-heading">
                      <h3>
                        {entity.id} · {entity.type}
                      </h3>
                      <span>
                        Camada: {entity.layer} ·{" "}
                        {entity.closed ? "fechada" : "aberta"} ·{" "}
                        {entity.points.length} pontos
                      </span>
                    </div>
                    {incompatible && (
                      <p className="dxf-entity-error">
                        Não importável: {incompatible}
                      </p>
                    )}
                    <label className="field">
                      <span>Destino de {entity.id}</span>
                      <select
                        aria-label={`Destino de ${entity.id}`}
                        value={draft.destination}
                        onChange={(e) =>
                          changeDraft(entity.id, {
                            destination: e.target.value,
                          })
                        }
                      >
                        <option value="ignore">Ignorar</option>
                        <option
                          value="terrain"
                          disabled={!!incompatible || entity.closed}
                        >
                          Terreno — substituir contorno
                        </option>
                        {section.regions.map((region) => (
                          <option
                            key={region.id}
                            value={`region:${region.id}`}
                            disabled={!!incompatible || !entity.closed}
                          >
                            {region.name} — substituir contorno
                          </option>
                        ))}
                        <option
                          value="new-region"
                          disabled={!!incompatible || !entity.closed}
                        >
                          Nova região
                        </option>
                      </select>
                    </label>
                    {draft.destination === "terrain" && (
                      <label className="assignment-target">
                        <input
                          type="checkbox"
                          aria-label={`Inverter ordem de ${entity.id}`}
                          checked={draft.reverse}
                          onChange={(e) =>
                            changeDraft(entity.id, {
                              reverse: e.target.checked,
                            })
                          }
                        />
                        Inverter ordem de {entity.id} explicitamente
                      </label>
                    )}
                    {draft.destination === "new-region" && (
                      <div className="dxf-new-region">
                        <label className="field">
                          <span>Nome da região {entity.id}</span>
                          <input
                            aria-label={`Nome da região ${entity.id}`}
                            value={draft.name}
                            maxLength={120}
                            onChange={(e) =>
                              changeDraft(entity.id, { name: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Material da região {entity.id}</span>
                          <select
                            aria-label={`Material da região ${entity.id}`}
                            value={draft.material}
                            onChange={(e) =>
                              changeDraft(entity.id, {
                                material: e.target.value,
                              })
                            }
                          >
                            <option value="">Selecione explicitamente</option>
                            <option value="none">
                              Sem material — pendente
                            </option>
                            {project.materials.map((material) => (
                              <option
                                key={material.id}
                                value={`material:${material.id}`}
                              >
                                {material.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    {draft.destination.startsWith("region:") && (
                      <p className="hint">
                        O material e a identidade da região existente serão
                        preservados.
                      </p>
                    )}
                    {data && !data.error && (
                      <p className="dxf-bounds">{boundsLabel(data.points)}</p>
                    )}
                  </article>
                );
              })}
              {!visible.length && (
                <p className="hint">Nenhuma entidade nesta camada.</p>
              )}
            </section>
            {selected.length === 0 && (
              <p className="info-card">
                Escolha o destino de pelo menos uma entidade para preparar a
                aplicação.
              </p>
            )}
            {selected.length > 0 && (
              <section
                className="dxf-selection-summary"
                aria-label="Todos os contornos selecionados"
              >
                <h3>Todos os contornos selecionados</h3>
                <p className="hint">
                  Esta lista inclui as seleções fora do filtro de camada.
                  Confira os destinos antes de aplicar.
                </p>
                <ul>
                  {selected.map((entity) => {
                    const data = converted.get(entity.id);
                    return (
                      <li key={entity.id}>
                        <strong>
                          {entity.id} · camada {entity.layer}
                        </strong>
                        <span>{destinationLabel(drafts[entity.id])}</span>
                        <span>
                          {data?.error ??
                            (data
                              ? `${data.points.length} pontos · ${boundsLabel(data.points)}`
                              : "Coordenadas aguardando unidade e origem válidas.")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {preview.error && (
              <p className="form-error" role="alert">
                {preview.error}
              </p>
            )}
            {points.length > 0 && (
              <>
                <p className="info-card" aria-label="Resumo dos contornos DXF">
                  {selectedShapes.length} contornos · {points.length} pontos
                  selecionados. {boundsLabel(points)} A confirmação aplica todos
                  em uma única operação.
                </p>
                <GeometryPreview
                  section={section}
                  assignments={selectedShapes}
                  valid={!!preview.next}
                />
                <label className="field">
                  <span>Entidade para conferir coordenadas</span>
                  <select
                    aria-label="Entidade para conferir coordenadas"
                    value={inspectedAssignment?.entityId ?? ""}
                    onChange={(e) => setInspected(e.target.value)}
                  >
                    {selectedShapes.map((a) => (
                      <option key={a.entityId} value={a.entityId}>
                        {a.entityId}
                      </option>
                    ))}
                  </select>
                </label>
                {inspectedAssignment && (
                  <div
                    className="dxf-coordinate-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Coordenadas DXF convertidas em metros"
                  >
                    <table className="dxf-coordinate-table">
                      <caption>Coordenadas DXF convertidas em metros</caption>
                      <thead>
                        <tr>
                          <th scope="col">Ponto</th>
                          <th scope="col">X (m)</th>
                          <th scope="col">Z (m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspectedAssignment.points.map((p, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{p.x}</td>
                            <td>{p.y}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {applyError && (
          <p className="form-error" role="alert">
            {applyError}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            disabled={!preview.next || !confirmed || loading || contextChanged}
            onClick={() => {
              if (
                !preview.next ||
                !confirmed ||
                loading ||
                contextChanged ||
                applying.current
              )
                return;
              applying.current = true;
              try {
                onApply(
                  importDxfContours(project, section.id, preview.assignments),
                );
              } catch (error) {
                applying.current = false;
                setApplyError(
                  error instanceof Error ? error.message : String(error),
                );
              }
            }}
          >
            Aplicar contornos
          </button>
        </div>
      </div>
    </Dialog>
  );
}
