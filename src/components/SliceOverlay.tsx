import type { FixedCircleGeometry } from "../core/fixed-circle";

/** Desenho da geometria preparada; não participa dos cálculos de área. */
export function SliceOverlay({
  geometry,
  selectedSliceNumber = null,
  interactive = false,
}: {
  geometry: FixedCircleGeometry;
  selectedSliceNumber?: number | null;
  interactive?: boolean;
}) {
  const radius = geometry.circle.radius;
  return (
    <g
      data-slice-preview="true"
      pointerEvents={interactive ? "visiblePainted" : "none"}
      stroke="#2e8194"
      fill="#39a0ad"
      fillOpacity={0.12}
    >
      {geometry.slices.map((slice) => {
        const l = slice.left,
          r = slice.right;
        // O grupo pai usa Z para cima; o caminho percorre a base de +X para −X.
        const d = `M${l.x} ${l.topZ} L${r.x} ${r.topZ} L${r.x} ${r.baseZ} A${radius} ${radius} 0 0 0 ${l.x} ${l.baseZ} Z`;
        return (
          <path
            key={slice.number}
            data-slice={slice.number}
            data-selected-slice={
              selectedSliceNumber === slice.number ? "true" : "false"
            }
            d={d}
            fillOpacity={selectedSliceNumber === slice.number ? 0.55 : 0.12}
            stroke={
              selectedSliceNumber === slice.number ? "#c26d29" : "#2e8194"
            }
            strokeWidth={selectedSliceNumber === slice.number ? 2.5 : 1}
            style={interactive ? { cursor: "pointer" } : undefined}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}
