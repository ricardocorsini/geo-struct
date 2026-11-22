import {
  resolveCaseSection,
  directionLabel,
  methodLabel,
} from "../domain/analysis";
import { activeWater, activeLoads } from "../domain/conditions";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize,
  MousePointer2,
  Hand,
  Plus,
  Minus,
  Check,
  X,
} from "lucide-react";
import type {
  AnalysisCase,
  Point,
  Project,
  Section,
  Selection,
  Tool,
} from "../domain/model";
import { PointEntry } from "./PointEntry";
import {
  contourTarget,
  contourPoints,
  moveContourVertex,
  projectOnSegment,
  segments,
} from "../domain/editing";
import { snapPoint, measurePoints, type Precision } from "../domain/precision";
import { boundary, distance, elevation } from "../domain/geometry";
import type { FixedCircleGeometry } from "../core/fixed-circle";
import type { Circle } from "../core/circle-geometry";
import type { SearchMethod } from "../core/circular-search";
import { SliceOverlay } from "./SliceOverlay";

export type Visibility = {
  materials: boolean;
  water: boolean;
  loads: boolean;
  circle: boolean;
};
const path = (pts: Point[], close = false) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") +
  (close ? " Z" : "");
const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export const instructions: Record<Tool, string> = {
  select: "Selecione um elemento. Arraste os vértices para editar.",
  pan: "Arraste para mover a vista. Use a roda para ampliar.",
  terrain:
    "Marque o terreno da esquerda para a direita. Enter conclui · Esc cancela.",
  region: "Marque o contorno da região. Enter fecha · Esc cancela.",
  water:
    "Marque a linha piezométrica da esquerda para a direita. Enter conclui.",
  load: "Clique no início e no fim da faixa. Depois informe a sobrecarga nas propriedades.",
  "case-circle":
    "Clique no centro e em um ponto para definir o círculo fixo deste caso. Esc cancela.",
  circle: "Clique no centro e em um ponto do círculo para definir o raio.",
  "insert-vertex":
    "Clique no segmento do contorno selecionado para inserir um vértice.",
  "delete-vertex":
    "Clique em um vértice do contorno selecionado para excluí-lo.",
  "move-contour":
    "Marque um ponto base e o destino para mover o contorno selecionado.",
  "copy-region":
    "Marque um ponto base e o destino da cópia da região selecionada.",
  "split-region":
    "Dois pontos definem a reta que divide a região selecionada. Esc cancela.",
  measure:
    "Marque dois pontos para medir distância, desnível e ângulo. Esc encerra.",
};
export function ModelCanvas({
  project,
  section,
  selection,
  analysisCase,
  sliceGeometry,
  resultsMode = false,
  resultSelection = null,
  onSelectSlice,
  tool,
  dark,
  grid,
  snap,
  precision,
  onEditVertex,
  visibility,
  fitToken,
  onSelect,
  onDraw,
  onVertex,
  onTool,
  onCursor,
  onDrawing,
  onCancel,
  exportRef,
}: {
  project: Project;
  section: Section;
  selection: Selection;
  analysisCase: AnalysisCase | null;
  sliceGeometry: FixedCircleGeometry | null;
  resultsMode?: boolean;
  resultSelection?: {
    candidate: number | "fixed";
    method: SearchMethod | null;
    sliceNumber: number | null;
    circle: Circle | null;
  } | null;
  onSelectSlice?: (number: number) => void;
  tool: Tool;
  dark: boolean;
  grid: boolean;
  snap: boolean;
  precision: Precision;
  onEditVertex: (
    kind: "move" | "insert" | "delete",
    index: number,
    point?: Point,
  ) => void;
  visibility: Visibility;
  fitToken: number;
  onSelect: (s: Selection) => void;
  onDraw: (t: Tool, p: Point[]) => void;
  onVertex: (index: number, p: Point) => void;
  onTool: (t: Tool) => void;
  onCursor: (p: Point) => void;
  onDrawing: (b: boolean) => void;
  onCancel: () => void;
  exportRef: React.RefObject<SVGSVGElement | null>;
}) {
  const host = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ x: 65, y: 430, z: 10 });
  const [points, setPoints] = useState<Point[]>([]),
    [cursor, setCursor] = useState<Point | null>(null),
    [dragged, setDragged] = useState<{ index: number; p: Point } | null>(null);
  const operation = useRef<
    | { type: "pan"; x: number; y: number; vx: number; vy: number }
    | { type: "vertex"; index: number; last: Point }
    | null
  >(null);
  const space = useRef(false);
  const [snapKind, setSnapKind] = useState("Livre");
  const twoPointTools: Tool[] = [
    "circle",
    "case-circle",
    "load",
    "move-contour",
    "copy-region",
    "split-region",
  ];
  const drafting = [
    "terrain",
    "region",
    "water",
    "measure",
    ...twoPointTools,
  ].includes(tool);
  useEffect(() => {
    if (!host.current) return;
    const obs = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    obs.observe(host.current);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    exportRef.current = svg.current;
    return () => {
      exportRef.current = null;
    };
  }, [exportRef]);
  useEffect(() => {
    setPoints([]);
    setDragged(null);
    operation.current = null;
  }, [tool, section.id]);
  useEffect(() => {
    onDrawing(points.length > 0 && tool !== "measure");
  }, [points.length, tool, onDrawing]);
  const fit = () => {
    const pts = boundary(section);
    if (resultsMode && resultSelection?.circle && !sliceGeometry) {
      const c = resultSelection.circle;
      pts.push(
        { x: c.x - c.radius, y: c.z - c.radius },
        { x: c.x + c.radius, y: c.z + c.radius },
      );
    } else if (!resultsMode && analysisCase?.surfaceMode === "fixed") {
      const c = analysisCase.fixedCircle;
      if (c.x !== null && c.y !== null && c.radius !== null)
        pts.push(
          { x: c.x - c.radius, y: c.y - c.radius },
          { x: c.x + c.radius, y: c.y + c.radius },
        );
    }
    if (!resultsMode && analysisCase?.surfaceMode === "search") {
      const { x, y } = analysisCase.search;
      if (x.min !== null && x.max !== null && y.min !== null && y.max !== null)
        pts.push({ x: x.min, y: y.min }, { x: x.max, y: y.max });
    }
    if (!pts.length) {
      setView({
        x: 60,
        y: size.h - 60,
        z: Math.max(2, Math.min((size.w - 120) / 60, (size.h - 120) / 30)),
      });
      return;
    }
    const xmin = Math.min(...pts.map((p) => p.x)),
      xmax = Math.max(...pts.map((p) => p.x)),
      ymin = Math.min(...pts.map((p) => p.y)),
      ymax = Math.max(...pts.map((p) => p.y));
    const z = Math.max(
      0.00001,
      Math.min(
        (size.w - 130) / Math.max(xmax - xmin, 1),
        (size.h - 170) / Math.max(ymax - ymin, 1),
      ),
    );
    setView({
      x: (size.w - z * (xmax - xmin)) / 2 - z * xmin,
      y: (size.h + z * (ymax - ymin)) / 2 + z * ymin + (resultsMode ? 55 : 15),
      z,
    });
  };
  useEffect(fit, [
    section.id,
    analysisCase?.id,
    fitToken,
    size.w,
    size.h,
    resultsMode,
    resultSelection?.circle?.x,
    resultSelection?.circle?.z,
    resultSelection?.circle?.radius,
  ]);
  const zoom = (factor: number, px = size.w / 2, py = size.h / 2) =>
    setView((v) => {
      const z = Math.max(0.00001, Math.min(100000, v.z * factor));
      const f = z / v.z;
      return { z, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
    });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left,
        py = e.clientY - r.top,
        factor = Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.002);
      setView((v) => {
        const z = Math.max(0.00001, Math.min(100000, v.z * factor));
        const f = z / v.z;
        return { z, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const displaySection = useMemo(
    () => (analysisCase ? resolveCaseSection(section, analysisCase) : section),
    [section, analysisCase],
  );
  const water = activeWater(displaySection);
  const selectedPoints =
    selection.kind === "terrain"
      ? section.terrain
      : selection.kind === "water"
        ? (water ?? [])
        : selection.kind === "region"
          ? (section.regions.find((r) => r.id === selection.id)?.points ?? [])
          : [];
  const shownPoints = dragged
    ? selectedPoints.map((p, i) => (i === dragged.index ? dragged.p : p))
    : selectedPoints;
  const previewSection = useMemo(() => {
    const target = contourTarget(selection);
    if (!dragged || !target) return section;
    try {
      return moveContourVertex(
        section,
        target,
        dragged.index,
        dragged.p,
        precision.linked,
      );
    } catch {
      return section;
    }
  }, [section, selection, dragged, precision.linked]);
  const selectedTerrain = previewSection.terrain;
  const boundaryPoints = boundary(previewSection);
  const snapContours = useMemo(
    () => [
      { points: section.terrain, closed: false },
      ...section.regions.map((r) => ({ points: r.points, closed: true })),
      { points: activeWater(displaySection) ?? [], closed: false },
      { points, closed: false },
    ],
    [section, displaySection, points],
  );
  const world = (e: { clientX: number; clientY: number }): Point => {
    const rect = host.current!.getBoundingClientRect();
    const raw = {
      x: (e.clientX - rect.left - view.x) / view.z,
      y: (view.y - e.clientY + rect.top) / view.z,
    };
    const excluded =
      operation.current?.type === "vertex"
        ? selectedPoints[operation.current.index]
        : null;
    const result = snapPoint(
      raw,
      snap ? snapContours : [],
      snap ? 10 / view.z : 0,
      snap ? precision.gridStep : 0,
      excluded ?? points.at(-1) ?? null,
      precision.ortho,
      excluded,
    );
    setSnapKind(result.kind);
    return result.point;
  };
  const addPoint = (p: Point) => {
    if (!drafting || points.length >= 500) return;
    if (tool === "measure" && points.length === 2) {
      setPoints([p]);
      return;
    }
    if (points.length && distance(points.at(-1)!, p) < 1e-7) return;
    const next = [...points, p];
    if (twoPointTools.includes(tool) && next.length === 2) {
      onDraw(tool, next);
      return;
    }
    setPoints(next);
  };
  const finish = () => {
    if (!drafting || tool === "measure" || twoPointTools.includes(tool)) return;
    if (points.length < (tool === "region" ? 3 : 2)) return;
    onDraw(tool, points);
  };
  const cancel = () => {
    operation.current = null;
    setDragged(null);
    setPoints([]);
    onCancel();
  };
  const label = (
    p: Point,
    text: string,
    color = "#493b2d",
    anchor: "start" | "middle" | "end" = "start",
    dy = 0,
  ) => (
    <text
      transform={`translate(${p.x} ${p.y}) scale(${1 / view.z} ${-1 / view.z})`}
      fill={color}
      fontSize={11}
      fontFamily="Inter Variable, sans-serif"
      textAnchor={anchor}
      dy={dy}
      style={{ pointerEvents: "none" }}
    >
      {text}
    </text>
  );
  const isSelected = (kind: Selection["kind"], id?: string) =>
    selection.kind === kind &&
    (!id || ("id" in selection && selection.id === id));
  const screenWorld = (x: number, y: number) => ({
    x: (x - view.x) / view.z,
    y: (view.y - y) / view.z,
  });
  const min = screenWorld(0, size.h),
    max = screenWorld(size.w, 0);
  const rough = 80 / view.z;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const adaptiveTick = [1, 2, 5, 10]
    .map((n) => n * mag)
    .find((n) => n >= rough)!;
  const tick = Math.max(
    precision.gridStep,
    Math.ceil(adaptiveTick / precision.gridStep) * precision.gridStep,
  );
  const xs = Array.from(
    {
      length: Math.min(150, Math.max(0, Math.ceil((max.x - min.x) / tick) + 1)),
    },
    (_, i) => (Math.ceil(min.x / tick) + i) * tick,
  );
  const ys = Array.from(
    {
      length: Math.min(150, Math.max(0, Math.ceil((max.y - min.y) / tick) + 1)),
    },
    (_, i) => (Math.ceil(min.y / tick) + i) * tick,
  );
  const ground = project.materials.find(
    (m) => m.id === section.backgroundMaterialId,
  );
  const missingMaterials =
    section.regions.filter((r) => r.materialId === null).length +
    (section.backgroundMaterialId === null ? 1 : 0);
  return (
    <div
      className={`model-canvas tool-${tool}`}
      ref={host}
      tabIndex={0}
      role="region"
      aria-label="Editor da seção 2D"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget && e.target !== svg.current) return;
        if (e.key === " ") {
          space.current = true;
          e.preventDefault();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          finish();
        }
        if (e.key === "Backspace" && points.length) {
          e.preventDefault();
          setPoints((p) => p.slice(0, -1));
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " ") space.current = false;
      }}
      onBlur={() => {
        space.current = false;
      }}
    >
      <svg
        ref={svg}
        width="100%"
        height="100%"
        viewBox={`0 0 ${size.w} ${size.h}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label={`Desenho de ${section.name}`}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          host.current?.focus();
          if (e.button === 2) {
            if (points.length) setPoints((p) => p.slice(0, -1));
            return;
          }
          const p = world(e);
          if (e.button === 1 || tool === "pan" || space.current) {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            operation.current = {
              type: "pan",
              x: e.clientX,
              y: e.clientY,
              vx: view.x,
              vy: view.y,
            };
            return;
          }
          if (resultsMode) {
            const hit = (e.target as Element).closest("[data-slice]");
            if (hit) onSelectSlice?.(Number(hit.getAttribute("data-slice")));
            return;
          }
          if (tool === "insert-vertex") {
            const edge = (e.target as Element).closest("[data-edge]");
            if (edge) {
              const index = Number(edge.getAttribute("data-edge"));
              const pair = segments(
                selectedPoints,
                selection.kind === "region",
              )[index];
              if (pair)
                onEditVertex("insert", index, projectOnSegment(p, ...pair));
            }
            return;
          }
          if (tool === "delete-vertex") {
            const vertex = (e.target as Element).closest("[data-vertex]");
            if (vertex)
              onEditVertex(
                "delete",
                Number(vertex.getAttribute("data-vertex")),
              );
            return;
          }
          if (tool === "select" && analysisCase) return;
          if (tool === "select") {
            const vertex = (e.target as Element).closest("[data-vertex]");
            if (vertex) {
              const index = Number(vertex.getAttribute("data-vertex"));
              operation.current = {
                type: "vertex",
                index,
                last: selectedPoints[index],
              };
              setDragged({ index, p: selectedPoints[index] });
              e.currentTarget.setPointerCapture(e.pointerId);
              return;
            }
            const hit = (e.target as Element).closest("[data-pick]");
            if (hit) {
              const kind = hit.getAttribute("data-pick")! as Selection["kind"],
                id = hit.getAttribute("data-id");
              onSelect((id ? { kind, id } : { kind }) as Selection);
            }
            return;
          }
          if (e.detail > 1) return;
          addPoint(p);
        }}
        onPointerMove={(e) => {
          const op = operation.current;
          const p = world(e);
          setCursor(p);
          onCursor(p);
          if (op?.type === "pan") {
            setView((v) => ({
              ...v,
              x: op.vx + e.clientX - op.x,
              y: op.vy + e.clientY - op.y,
            }));
          } else if (op?.type === "vertex") {
            op.last = p;
            setDragged({ index: op.index, p });
          }
        }}
        onPointerUp={(e) => {
          const op = operation.current;
          operation.current = null;
          if (op?.type === "vertex") {
            onVertex(op.index, op.last);
            setDragged(null);
          }
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          operation.current = null;
          setDragged(null);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          finish();
        }}
      >
        <rect width="100%" height="100%" fill={dark ? "#1e2327" : "#fafaf7"} />
        {grid && (
          <g stroke={dark ? "#343a3d" : "#e9e8e2"} strokeWidth={1}>
            {xs.map((x) => (
              <line
                key={x}
                x1={view.x + x * view.z}
                y1={0}
                x2={view.x + x * view.z}
                y2={size.h}
              />
            ))}
            {ys.map((y) => (
              <line
                key={y}
                x1={0}
                y1={view.y - y * view.z}
                x2={size.w}
                y2={view.y - y * view.z}
              />
            ))}
          </g>
        )}
        <g
          transform={`translate(${view.x} ${view.y}) scale(${view.z} ${-view.z})`}
        >
          {boundaryPoints.length > 0 && (
            <path
              data-pick="terrain"
              d={path(boundaryPoints, true)}
              fill={
                visibility.materials
                  ? (ground?.color ?? "#a4a7a9")
                  : dark
                    ? "#303436"
                    : "#ecebe5"
              }
              stroke="#776b58"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {previewSection.regions.map((r) => {
            const pts =
              selection.kind === "region" && selection.id === r.id && dragged
                ? shownPoints
                : r.points;
            return (
              <path
                key={r.id}
                data-pick="region"
                data-id={r.id}
                d={path(pts, true)}
                fill={
                  visibility.materials
                    ? (project.materials.find((m) => m.id === r.materialId)
                        ?.color ?? "#a4a7a9")
                    : "transparent"
                }
                fillOpacity={0.95}
                stroke={isSelected("region", r.id) ? "#b85e2a" : "#776b58"}
                strokeWidth={isSelected("region", r.id) ? 2.4 : 1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {selectedTerrain.length > 0 && (
            <>
              <path
                data-pick="terrain"
                d={path(selectedTerrain)}
                fill="none"
                stroke={
                  isSelected("terrain")
                    ? "#b85e2a"
                    : dark
                      ? "#eee4d3"
                      : "#4c4234"
                }
                strokeWidth={isSelected("terrain") ? 3 : 2}
                vectorEffect="non-scaling-stroke"
              />
              <path
                data-pick="terrain"
                d={path(selectedTerrain)}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          {visibility.water && water && (
            <>
              <path
                data-pick="water"
                d={path(
                  selection.kind === "water" && dragged ? shownPoints : water,
                )}
                fill="none"
                stroke="#267aa4"
                strokeDasharray="10 4 2 4"
                strokeWidth={isSelected("water") ? 2.5 : 1.8}
                vectorEffect="non-scaling-stroke"
              />
              <path
                data-pick="water"
                d={path(water)}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                vectorEffect="non-scaling-stroke"
              />
              {water.length > 0 && label(water.at(-1)!, "  LP", "#267aa4")}
            </>
          )}
          {visibility.loads &&
            activeLoads(displaySection).map((l) => {
              const a = elevation(selectedTerrain, l.x1),
                b = elevation(selectedTerrain, l.x2);
              if (a === null || b === null) return null;
              const top =
                Math.max(
                  a,
                  b,
                  ...selectedTerrain
                    .filter((p) => p.x > l.x1 && p.x < l.x2)
                    .map((p) => p.y),
                ) + 3;
              const count = Math.min(
                25,
                Math.max(2, Math.ceil(((l.x2 - l.x1) * view.z) / 22)),
              );
              return (
                <g
                  key={l.id}
                  data-pick="load"
                  data-id={l.id}
                  stroke={isSelected("load", l.id) ? "#b85e2a" : "#a24c38"}
                  strokeWidth={isSelected("load", l.id) ? 2.4 : 1.4}
                >
                  <path
                    d={`M${l.x1} ${top} H${l.x2}`}
                    vectorEffect="non-scaling-stroke"
                  />
                  {l.q !== null &&
                    l.q > 0 &&
                    Array.from({ length: count + 1 }, (_, i) => {
                      const x = l.x1 + (i * (l.x2 - l.x1)) / count,
                        y = elevation(selectedTerrain, x)!;
                      return (
                        <path
                          key={i}
                          d={`M${x} ${top} V${y + 0.25} m${-3.5 / view.z} ${7 / view.z} l${3.5 / view.z} ${-7 / view.z} l${3.5 / view.z} ${7 / view.z}`}
                          fill="none"
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })}
                  <path
                    d={`M${l.x1} ${top} H${l.x2}`}
                    stroke="transparent"
                    strokeWidth={15}
                    vectorEffect="non-scaling-stroke"
                  />
                  {label(
                    { x: (l.x1 + l.x2) / 2, y: top },
                    l.q === null ? "q não informado" : `${fmt(l.q)} kPa`,
                    "#a24c38",
                    "middle",
                    -9,
                  )}
                </g>
              );
            })}
          {analysisCase &&
            visibility.circle &&
            sliceGeometry &&
            !resultsMode && (
              <SliceOverlay
                geometry={sliceGeometry}
                selectedSliceNumber={
                  resultsMode ? resultSelection?.sliceNumber : null
                }
                interactive={resultsMode}
              />
            )}
          {resultsMode && resultSelection?.circle && visibility.circle && (
            <g
              data-result-candidate={resultSelection.candidate}
              data-result-method={resultSelection.method ?? ""}
              pointerEvents="none"
              fill="none"
              stroke={dark ? "#efb172" : "#a34f20"}
            >
              {sliceGeometry && (
                <SliceOverlay
                  geometry={sliceGeometry}
                  selectedSliceNumber={resultSelection.sliceNumber}
                  interactive
                />
              )}
              {sliceGeometry?.slices.length ? (
                (() => {
                  const first = sliceGeometry.slices[0].left;
                  const last = sliceGeometry.slices.at(-1)!.right;
                  const radius = sliceGeometry.circle.radius;
                  return (
                    <path
                      data-result-arc="true"
                      d={`M${last.x} ${last.baseZ} A${radius} ${radius} 0 0 0 ${first.x} ${first.baseZ}`}
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })()
              ) : (
                <circle
                  data-result-circle="true"
                  cx={resultSelection.circle.x}
                  cy={resultSelection.circle.z}
                  r={resultSelection.circle.radius}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          )}
          {analysisCase && visibility.circle && !resultSelection && (
            <g
              data-case-preview={analysisCase.id}
              pointerEvents="none"
              stroke="#7053c1"
              fill="none"
            >
              {analysisCase.surfaceMode === "fixed" &&
                analysisCase.fixedCircle.x !== null &&
                analysisCase.fixedCircle.y !== null &&
                analysisCase.fixedCircle.radius !== null && (
                  <>
                    <circle
                      data-case-circle="true"
                      cx={analysisCase.fixedCircle.x}
                      cy={analysisCase.fixedCircle.y}
                      r={analysisCase.fixedCircle.radius}
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    {label(
                      {
                        x: analysisCase.fixedCircle.x,
                        y: analysisCase.fixedCircle.y,
                      },
                      "+ C do caso",
                      "#7053c1",
                    )}
                  </>
                )}
              {analysisCase.surfaceMode === "search" &&
                analysisCase.search.x.min !== null &&
                analysisCase.search.x.max !== null &&
                analysisCase.search.y.min !== null &&
                analysisCase.search.y.max !== null && (
                  <>
                    <path
                      data-case-search="true"
                      d={`M${analysisCase.search.x.min} ${analysisCase.search.y.min} H${analysisCase.search.x.max} V${analysisCase.search.y.max} H${analysisCase.search.x.min} Z`}
                      fill="#7053c1"
                      fillOpacity={0.08}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    {label(
                      {
                        x: analysisCase.search.x.min,
                        y: analysisCase.search.y.max,
                      },
                      "Centros da busca",
                      "#7053c1",
                      "start",
                      -7,
                    )}
                  </>
                )}
            </g>
          )}
          {visibility.circle && section.circle && !analysisCase && (
            <g data-pick="circle">
              <circle
                cx={section.circle.x}
                cy={section.circle.y}
                r={section.circle.radius}
                fill="none"
                stroke="#7f70a4"
                strokeWidth={isSelected("circle") ? 2.5 : 1.6}
                strokeDasharray="8 5"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={section.circle.x}
                cy={section.circle.y}
                r={section.circle.radius}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                vectorEffect="non-scaling-stroke"
              />
              {label(section.circle, "+ C", "#7f70a4")}
            </g>
          )}
          {(tool === "select" || tool === "delete-vertex") &&
            shownPoints.map((p, i) => (
              <g key={i} data-transient="true">
                <circle
                  data-vertex={i}
                  cx={p.x}
                  cy={p.y}
                  r={5 / view.z}
                  fill="#fff"
                  stroke="#a45730"
                  strokeWidth={1.7}
                  vectorEffect="non-scaling-stroke"
                />
                {label(
                  { x: p.x + 8 / view.z, y: p.y + 8 / view.z },
                  `${i + 1}`,
                  dark ? "#fff1d9" : "#573c28",
                )}
              </g>
            ))}
          {tool === "insert-vertex" &&
            segments(selectedPoints, selection.kind === "region").map(
              ([a, b], i) => (
                <line
                  key={i}
                  data-transient="true"
                  data-edge={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#b85e2a"
                  strokeOpacity={0.3}
                  strokeWidth={12}
                  vectorEffect="non-scaling-stroke"
                />
              ),
            )}
          {points.length > 0 && (
            <g data-transient="true">
              <path
                d={path(
                  [
                    ...points,
                    ...(cursor && !(tool === "measure" && points.length === 2)
                      ? [cursor]
                      : []),
                  ],
                  tool === "region" && points.length > 1,
                )}
                stroke="#ab582e"
                fill={tool === "region" ? "#ab582e22" : "none"}
                strokeWidth={2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              {(tool === "circle" || tool === "case-circle") && cursor && (
                <circle
                  cx={points[0].x}
                  cy={points[0].y}
                  r={distance(points[0], cursor)}
                  fill="none"
                  stroke="#7f70a4"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {["move-contour", "copy-region"].includes(tool) &&
                cursor &&
                contourTarget(selection) && (
                  <path
                    d={path(
                      contourPoints(section, contourTarget(selection)!).map(
                        (p) => ({
                          x: p.x + cursor.x - points[0].x,
                          y: p.y + cursor.y - points[0].y,
                        }),
                      ),
                      selection.kind === "region",
                    )}
                    fill="none"
                    stroke="#ab582e"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={4 / view.z}
                  fill="#ab582e"
                />
              ))}
            </g>
          )}
        </g>
        <g
          fill={dark ? "#a6afb6" : "#8b8a80"}
          fontFamily="Inter Variable, sans-serif"
          fontSize={10}
        >
          {xs.map((x) => (
            <text
              key={x}
              x={view.x + x * view.z}
              y={size.h - 9}
              textAnchor="middle"
            >
              {fmt(x)}
            </text>
          ))}
          {ys.map((y) => (
            <text key={y} x={9} y={view.y - y * view.z - 4}>
              {fmt(y)}
            </text>
          ))}
          <text x={size.w - 32} y={size.h - 27}>
            X (m)
          </text>
          <text x={8} y={18}>
            Z (m)
          </text>
        </g>
      </svg>
      <div className="canvas-label">
        <span className="section-tag">SEÇÃO 2D</span>
        <strong>{section.name}</strong>
        <span>
          {section.terrain.length
            ? missingMaterials
              ? `${missingMaterials} atribuições pendentes de material`
              : "Modelo geométrico · materiais atribuídos"
            : "Defina o perfil do terreno para começar"}
        </span>
        {analysisCase && (
          <div
            className="case-preview-note"
            role="note"
            aria-label={
              resultsMode && resultSelection
                ? "Resultado no desenho"
                : "Prévia do caso"
            }
          >
            {resultsMode && resultSelection ? (
              <>
                Resultado: {analysisCase.name} ·{" "}
                {resultSelection.candidate === "fixed"
                  ? "círculo fixo"
                  : `superfície ${resultSelection.candidate}`}
                {resultSelection.method && (
                  <> · {methodLabel(resultSelection.method)}</>
                )}
                {resultSelection.sliceNumber !== null && (
                  <> · fatia {resultSelection.sliceNumber}</>
                )}
              </>
            ) : (
              <>
                Prévia: {analysisCase.name} ·{" "}
                {directionLabel(analysisCase.direction)} · prévia das entradas
              </>
            )}
          </div>
        )}
      </div>
      <div className="canvas-controls">
        <button
          className={`icon-button ${tool === "select" ? "active" : ""}`}
          aria-label="Selecionar no desenho"
          title="Selecionar · V"
          onClick={() => onTool("select")}
        >
          <MousePointer2 size={17} />
        </button>
        <button
          className={`icon-button ${tool === "pan" ? "active" : ""}`}
          aria-label="Mover vista"
          title="Pan · H"
          onClick={() => onTool("pan")}
        >
          <Hand size={17} />
        </button>
        <span />
        <button
          className="icon-button"
          aria-label="Ampliar"
          onClick={() => zoom(1.25)}
        >
          <Plus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Reduzir"
          onClick={() => zoom(0.8)}
        >
          <Minus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Enquadrar seção"
          title="Enquadrar · F"
          onClick={fit}
        >
          <Maximize size={17} />
        </button>
      </div>
      {points.length > 0 && tool !== "measure" && (
        <div className="drawing-actions">
          <span>{points.length} pontos</span>
          {!twoPointTools.includes(tool) && (
            <button
              className="primary"
              disabled={points.length < (tool === "region" ? 3 : 2)}
              onClick={finish}
            >
              <Check size={15} />
              Concluir
            </button>
          )}
          <button className="secondary" onClick={cancel}>
            <X size={15} />
            Cancelar
          </button>
        </div>
      )}
      {drafting && (
        <PointEntry
          key={tool}
          anchor={points.at(-1) ?? null}
          onPoint={addPoint}
        />
      )}
      {cursor && (
        <div className="snap-indicator">
          {snapKind}
          {precision.ortho ? " · ORTO" : ""}
          {precision.linked ? " · Interfaces vinculadas" : ""}
        </div>
      )}
      {tool === "measure" &&
        points.length > 0 &&
        (() => {
          const end = points[1] ?? cursor;
          if (!end) return null;
          const m = measurePoints(points[0], end);
          return (
            <output className="measurement" aria-label="Medição">
              Distância {fmt(m.distance)} m · ΔX {fmt(m.dx)} m · ΔZ {fmt(m.dz)}{" "}
              m · {fmt(m.angle)}°
            </output>
          );
        })()}
      {section.terrain.length === 0 && points.length === 0 && !drafting && (
        <div className="empty-canvas">
          <MountainIcon />
          <h2>Desenhe sua primeira seção</h2>
          <p>
            Trace o perfil do terreno ou informe suas coordenadas no painel à
            direita.
          </p>
          <button className="primary" onClick={() => onTool("terrain")}>
            Desenhar terreno
          </button>
        </div>
      )}
    </div>
  );
}
function MountainIcon() {
  return (
    <svg
      width="70"
      height="42"
      viewBox="0 0 70 42"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 36H18L35 12H48L69 36M1 41H69"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M10 36L24 28H49L60 36" stroke="currentColor" opacity=".4" />
    </svg>
  );
}
