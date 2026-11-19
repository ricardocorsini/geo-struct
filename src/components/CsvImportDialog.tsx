import { useEffect, useMemo, useRef, useState } from "react";
import type { Point, Project, Section } from "../domain/model";
import type { ContourTarget } from "../domain/editing";
import {
  importContourPoints,
  parseCoordinateCsv,
  readCsvRecords,
  type CsvOptions,
} from "../domain/coordinate-csv";
import {
  desktop,
  openNativeCsv,
  readCsvFile,
  type CsvFile,
} from "../lib/files";
import { Dialog } from "./Dialog";
import "./CsvImportDialog.css";

function ContourPreview({
  points,
  closed,
}: {
  points: Point[];
  closed: boolean;
}) {
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.y),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs),
    scale = Math.min(560 / (maxX - minX || 1), 180 / (maxZ - minZ || 1)),
    offsetX = (600 - (maxX - minX) * scale) / 2,
    offsetZ = (220 - (maxZ - minZ) * scale) / 2,
    drawing = points
      .map(
        (p) =>
          `${offsetX + (p.x - minX) * scale},${offsetZ + (maxZ - p.y) * scale}`,
      )
      .join(" ");
  return (
    <figure className="csv-contour-preview">
      <svg
        viewBox="0 0 600 220"
        role="img"
        aria-label="Prévia do contorno importado"
      >
        {closed ? <polygon points={drawing} /> : <polyline points={drawing} />}
      </svg>
      <figcaption>
        Contorno selecionado · X para a direita, Z para cima · coordenadas em
        metros
      </figcaption>
    </figure>
  );
}

export function CsvImportDialog({
  project,
  section,
  target,
  onApply,
  onClose,
}: {
  project: Project;
  section: Section;
  target: Exclude<ContourTarget, { kind: "water" }>;
  onApply: (project: Project) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<CsvFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [options, setOptions] = useState<CsvOptions>({
    delimiter: ";",
    decimal: ",",
    hasHeader: null,
    unit: "",
    xColumn: 0,
    zColumn: 1,
  });
  const request = useRef(0);
  const applying = useRef(false);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const load = async (read: () => Promise<CsvFile | null>) => {
    const current = ++request.current;
    setFile(null);
    setFileError("");
    setOptions((previous) => ({
      ...previous,
      hasHeader: null,
      unit: "",
      xColumn: 0,
      zColumn: 1,
    }));
    setLoading(true);
    try {
      const next = await read();
      if (request.current === current) setFile(next);
    } catch (e) {
      if (request.current === current)
        setFileError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request.current === current) setLoading(false);
    }
  };
  const columns = useMemo(() => {
    if (!file) return [];
    try {
      const first = readCsvRecords(file.text, options.delimiter)[0];
      return (
        first?.cells.map((cell, i) =>
          options.hasHeader === true && cell.trim()
            ? `${i + 1} — ${cell.trim().slice(0, 80)}`
            : `Coluna ${i + 1}`,
        ) ?? []
      );
    } catch {
      return [];
    }
  }, [file, options.delimiter, options.hasHeader]);
  const preview = useMemo(() => {
    if (!file) return { data: null, project: null, error: "" };
    try {
      const data = parseCoordinateCsv(file.text, options);
      return {
        data,
        project: importContourPoints(project, section.id, target, data.points),
        error: "",
      };
    } catch (e) {
      return {
        data: null,
        project: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [file, options, project, section.id, target]);
  const configured = options.hasHeader !== null && options.unit !== "";
  return (
    <Dialog
      title="Importar CSV"
      description={`Substitui o contorno ${target.kind === "terrain" ? "do terreno" : "da região selecionada"}. Confira a conversão para metros antes de aplicar. Vínculos entre vértices antigos e novos não são inferidos.`}
      onClose={onClose}
      wide
    >
      <div className="csv-import">
        <div className="csv-file-picker">
          {desktop ? (
            <button
              type="button"
              className="secondary"
              disabled={loading}
              onClick={() => void load(openNativeCsv)}
            >
              Escolher arquivo CSV
            </button>
          ) : (
            <label className="field">
              <span>Arquivo CSV</span>
              <input
                type="file"
                accept=".csv"
                disabled={loading}
                onChange={(event) => {
                  const selected = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (selected) void load(() => readCsvFile(selected));
                }}
              />
            </label>
          )}
          <p className="hint">
            CSV UTF-8 · até 1 MiB · até 500 pontos · um ponto por linha.
          </p>
          <p className="csv-file-status" role="status">
            {loading
              ? "Lendo arquivo…"
              : (file?.name ?? "Nenhum arquivo carregado.")}
          </p>
        </div>
        <div className="csv-options">
          <label className="field">
            <span>Separador</span>
            <select
              aria-label="Separador"
              value={options.delimiter}
              onChange={(e) =>
                setOptions({
                  ...options,
                  delimiter: e.target.value as CsvOptions["delimiter"],
                })
              }
            >
              <option value=";">Ponto e vírgula (;)</option>
              <option value=",">Vírgula (,)</option>
              <option value={"\t"}>Tabulação</option>
            </select>
          </label>
          <label className="field">
            <span>Separador decimal</span>
            <select
              aria-label="Separador decimal"
              value={options.decimal}
              onChange={(e) =>
                setOptions({
                  ...options,
                  decimal: e.target.value as CsvOptions["decimal"],
                })
              }
            >
              <option value=".">Ponto (.)</option>
              <option value=",">Vírgula (,)</option>
            </select>
          </label>
          <label className="field">
            <span>Primeira linha</span>
            <select
              aria-label="Primeira linha"
              value={
                options.hasHeader === null ? "" : String(options.hasHeader)
              }
              onChange={(e) =>
                setOptions({
                  ...options,
                  hasHeader:
                    e.target.value === "" ? null : e.target.value === "true",
                })
              }
            >
              <option value="">Selecione</option>
              <option value="true">Cabeçalho</option>
              <option value="false">Coordenadas</option>
            </select>
          </label>
          <label className="field">
            <span>Unidade do arquivo</span>
            <select
              aria-label="Unidade do arquivo"
              value={options.unit}
              onChange={(e) =>
                setOptions({
                  ...options,
                  unit: e.target.value as CsvOptions["unit"],
                })
              }
            >
              <option value="">Selecione</option>
              <option value="m">Metro (m)</option>
              <option value="cm">Centímetro (cm)</option>
              <option value="mm">Milímetro (mm)</option>
            </select>
          </label>
          {(["xColumn", "zColumn"] as const).map((key) => (
            <label className="field" key={key}>
              <span>{key === "xColumn" ? "Coluna X" : "Coluna Z"}</span>
              <select
                aria-label={key === "xColumn" ? "Coluna X" : "Coluna Z"}
                value={options[key]}
                disabled={!columns.length}
                onChange={(e) =>
                  setOptions({ ...options, [key]: Number(e.target.value) })
                }
              >
                {!columns.length && (
                  <option value={options[key]}>Carregue um CSV</option>
                )}
                {columns.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {!configured && (
          <p className="info-card">
            Escolha se a primeira linha é cabeçalho e informe a unidade do
            arquivo. Essas informações não são deduzidas do conteúdo.
          </p>
        )}
        {fileError && (
          <div className="form-error" role="alert">
            {fileError}
          </div>
        )}
        {configured && preview.error && (
          <div className="form-error" role="alert">
            {preview.error}
          </div>
        )}
        {preview.data && (
          <>
            <p className="info-card" role="status">
              {preview.data.points.length} pontos válidos para aplicação. O
              projeto só muda ao aplicar o contorno.
            </p>
            <ContourPreview
              points={preview.data.points}
              closed={target.kind === "region"}
            />
            <div
              className="csv-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Prévia das coordenadas em metros"
            >
              <table className="csv-table">
                <caption>Prévia das coordenadas em metros</caption>
                <thead>
                  <tr>
                    <th scope="col">Linha CSV</th>
                    <th scope="col">X no arquivo</th>
                    <th scope="col">Z no arquivo</th>
                    <th scope="col">X (m)</th>
                    <th scope="col">Z (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.data.rows.map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td>{row.sourceX}</td>
                      <td>{row.sourceZ}</td>
                      <td>{row.x}</td>
                      <td>{row.z}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            disabled={!preview.project || loading}
            onClick={() => {
              if (!preview.project || applying.current) return;
              applying.current = true;
              onApply(preview.project);
            }}
          >
            Aplicar contorno
          </button>
        </div>
      </div>
    </Dialog>
  );
}
