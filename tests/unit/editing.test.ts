import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  newProject,
  parseProject,
  serializeProject,
  type Point,
  type Section,
} from "../../src/domain/model";
import {
  boundary,
  diagnose,
  elevation,
  polygonError,
  regionError,
  signedArea,
  terrainError,
} from "../../src/domain/geometry";
import {
  copyRegion,
  deleteContourVertex,
  insertContourVertex,
  moveContourVertex,
  replaceContourCoordinates,
  splitRegion,
  translateContour,
} from "../../src/domain/editing";
import { commit, history, redo, undo } from "../../src/domain/history";

const pts = (rows: number[][]): Point[] => rows.map(([x, y]) => ({ x, y }));
function layers() {
  const p = newProject("Interfaces");
  const s = p.sections[0];
  s.base = 0;
  s.terrain = pts([
    [0, 10],
    [20, 10],
  ]);
  s.water = pts([
    [0, 2],
    [20, 2],
  ]);
  s.regions = [
    {
      id: "lower",
      name: "Inferior",
      materialId: p.materials[0].id,
      points: pts([
        [0, 0],
        [20, 0],
        [20, 5],
        [10, 5],
        [0, 5],
      ]),
    },
    {
      id: "upper",
      name: "Superior",
      materialId: p.materials[0].id,
      points: pts([
        [0, 5],
        [5, 5],
        [20, 5],
        [20, 10],
        [0, 10],
      ]),
    },
  ];
  return p;
}
const lower = { kind: "region" as const, id: "lower" };
function expectPartition(s: Section) {
  for (const r of s.regions) expect(regionError(s, r.points, r.id)).toBeNull();
  const area = s.regions.reduce(
    (sum, r) => sum + Math.abs(signedArea(r.points)),
    0,
  );
  expect(area).toBeCloseTo(Math.abs(signedArea(boundary(s))), 8);
}

describe("Interfaces e operações atômicas", () => {
  it("move uma fronteira com subdivisões distintas sem frestas ou sobreposição", () => {
    const p = layers(),
      s = p.sections[0],
      before = structuredClone(s);
    const next = moveContourVertex(s, lower, 3, { x: 10, y: 6 });
    expect(next.regions[1].points).toContainEqual({ x: 5, y: 5.5 });
    expect(next.regions[1].points).toContainEqual({ x: 10, y: 6 });
    expectPartition(next);
    expect(next.water).toEqual(s.water);
    expect(s).toEqual(before);
    const edited = { ...p, sections: [next] };
    const h = commit(history(p), edited);
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toEqual(p);
    expect(redo(undo(h)).present).toEqual(edited);
  });
  it("insere, move e remove um vértice compartilhado", () => {
    const s = layers().sections[0];
    const inserted = insertContourVertex(s, lower, 2, { x: 15, y: 6 });
    expect(inserted.regions[0].points).toContainEqual({ x: 15, y: 6 });
    expect(inserted.regions[1].points).toContainEqual({ x: 15, y: 6 });
    expectPartition(inserted);
    const deleted = deleteContourVertex(inserted, lower, 3);
    expect(deleted.regions[1].points).not.toContainEqual({ x: 15, y: 6 });
    expectPartition(deleted);
    expect(deleted.regions[0].points).toEqual(s.regions[0].points);
  });
  it("retifica os pontos intermediários do vizinho ao excluir um canto", () => {
    const s = moveContourVertex(layers().sections[0], lower, 3, {
      x: 10,
      y: 7,
    });
    const next = deleteContourVertex(s, lower, 3);
    expect(next.regions[1].points).toContainEqual({ x: 5, y: 5 });
    expectPartition(next);
  });
  it("vincula a superfície às regiões sem alterar a água", () => {
    const s = layers().sections[0];
    const next = moveContourVertex(s, { kind: "terrain" }, 0, { x: 0, y: 12 });
    expect(next.regions[1].points).toContainEqual({ x: 0, y: 12 });
    expect(next.water).toEqual(s.water);
    expectPartition(next);
  });
  it("desvinculação explícita e edição da água não arrastam outros contornos", () => {
    const s = layers().sections[0];
    expect(
      moveContourVertex(s, lower, 3, { x: 10, y: 4 }, false).regions[1],
    ).toEqual(s.regions[1]);
    const next = translateContour(s, { kind: "water" }, { x: 0, y: 3 });
    expect(next.regions).toEqual(s.regions);
    expect(next.terrain).toEqual(s.terrain);
    expect(next.water?.[0].y).toBe(5);
  });
  it("edição numérica usa a correspondência de linhas e preserva IDs", () => {
    const s = layers().sections[0];
    const replacement = structuredClone(s.regions[0].points);
    replacement[3].y = 6;
    const next = replaceContourCoordinates(
      s,
      lower,
      replacement,
      [0, 1, 2, 3, 4],
    );
    expect(next).toEqual(moveContourVertex(s, lower, 3, { x: 10, y: 6 }));
    const removed = replaceContourCoordinates(
      s,
      lower,
      replacement.filter((_, i) => i !== 3),
      [0, 1, 2, 4],
    );
    expectPartition(removed);
    expect(next.regions.map((r) => r.id)).toEqual(s.regions.map((r) => r.id));
  });
  it("não densifica interfaces em aplicação sem mudança de coordenadas", () => {
    const s = layers().sections[0];
    expect(
      replaceContourCoordinates(s, lower, s.regions[0].points, [0, 1, 2, 3, 4]),
    ).toEqual(s);
  });
  it("colagem substitui somente o contorno e mínimo de pontos tem erro acionável", () => {
    const s = layers().sections[0];
    const next = replaceContourCoordinates(
      s,
      lower,
      pts([
        [0, 0],
        [20, 0],
        [20, 4],
        [0, 4],
      ]),
      [null, null, null, null],
    );
    expect(next.regions[1]).toEqual(s.regions[1]);
    expect(() =>
      replaceContourCoordinates(
        s,
        lower,
        pts([
          [0, 0],
          [20, 0],
          [10, 2],
        ]),
        [0, 1, null],
      ),
    ).toThrow(/Colar lista/);
    expect(() => insertContourVertex(s, lower, 0, { x: 0, y: 0 })).toThrow(
      /interior/,
    );
    const triangle = {
      ...s,
      regions: [
        {
          ...s.regions[0],
          points: pts([
            [0, 0],
            [20, 0],
            [10, 5],
          ]),
        },
      ],
    };
    expect(() => deleteContourVertex(triangle, lower, 1)).toThrow(
      /três vértices/,
    );
  });
  it("respeita o limite de pontos também nos vizinhos", () => {
    const s = layers().sections[0];
    s.regions[1].points = [
      ...Array.from({ length: 497 }, (_, i) => ({ x: (20 * i) / 497, y: 5 })),
      ...pts([
        [20, 5],
        [20, 10],
        [0, 10],
      ]),
    ];
    expect(() => moveContourVertex(s, lower, 3, { x: 10, y: 6 })).toThrow(
      /500/,
    );
    expect(s.regions[1].points).toHaveLength(500);
  });
});

describe("Divisão e cópia de regiões", () => {
  it.each(
    [
      [
        [0, 3],
        [20, 3],
      ],
      [
        [10, 0],
        [10, 10],
      ],
      [
        [0, 0],
        [20, 5],
      ],
    ].map((rows) => ({ rows })),
  )("divide por reta e conserva material e área: $rows", ({ rows }) => {
    const p = layers(),
      s = p.sections[0],
      [a, b] = pts(rows);
    const next = splitRegion(s, "lower", a, b, "new-region");
    expect(next.regions).toHaveLength(3);
    expect(next.regions[0].id).toBe("lower");
    expect(next.regions[2].materialId).toBe(s.regions[0].materialId);
    expectPartition(next);
    p.sections[0] = next;
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it("recusa tangência, reta exterior e corte com três partes", () => {
    const s = layers().sections[0];
    expect(() =>
      splitRegion(s, "lower", { x: 0, y: 0 }, { x: 20, y: 0 }, "new"),
    ).toThrow(/duas partes/);
    expect(() =>
      splitRegion(s, "lower", { x: 0, y: -1 }, { x: 20, y: -1 }, "new"),
    ).toThrow(/duas partes/);
    s.regions[0].points = pts([
      [0, 0],
      [6, 0],
      [6, 6],
      [4, 6],
      [4, 2],
      [2, 2],
      [2, 6],
      [0, 6],
    ]);
    expect(() =>
      splitRegion(s, "lower", { x: -1, y: 4 }, { x: 8, y: 4 }, "new"),
    ).toThrow(/duas partes/);
  });
  it("copia com novo ID e detecta cópias sobrepostas ou fora do domínio", () => {
    const s = layers().sections[0];
    s.regions = [
      {
        ...s.regions[0],
        points: pts([
          [1, 1],
          [4, 1],
          [4, 4],
          [1, 4],
        ]),
      },
    ];
    const next = copyRegion(s, "lower", { x: 5, y: 0 }, "copied");
    expect(next.regions[0]).toEqual(s.regions[0]);
    expect(next.regions[1].materialId).toBe(s.regions[0].materialId);
    expect(regionError(next, next.regions[1].points, "copied")).toBeNull();
    const overlap = copyRegion(s, "lower", { x: 1, y: 0 }, "overlap");
    expect(regionError(overlap, overlap.regions[1].points, "overlap")).toMatch(
      /sobrepõe/,
    );
    const outside = copyRegion(s, "lower", { x: 20, y: 0 }, "outside");
    expect(regionError(outside, outside.regions[1].points, "outside")).toMatch(
      /dentro/,
    );
    expect(s.regions).toHaveLength(1);
  });
});

describe("Faces verticais e arquivos existentes", () => {
  it("aceita degrau vertical com envelope de desenho explícito e sem NaN", () => {
    const p = layers(),
      s = p.sections[0];
    s.terrain = pts([
      [0, 10],
      [10, 10],
      [10, 6],
      [20, 6],
    ]);
    s.regions = [];
    expect(terrainError(s.terrain)).toBeNull();
    expect(elevation(s.terrain, 10)).toBe(10);
    expect(elevation(s.terrain, 10, "lower")).toBe(6);
    expect(elevation(s.terrain, 12)).toBe(6);
    expect(diagnose(p).filter((d) => d.level === "error")).toEqual([]);
    expect(parseProject(serializeProject(p))).toEqual(p);
    expect(
      regionError(
        s,
        pts([
          [9, 7],
          [11, 7],
          [11, 8],
          [9, 8],
        ]),
      ),
    ).toMatch(/dentro/);
  });
  it("rejeita retrocesso, ponto duplicado, balanço e face sem área na extremidade", () => {
    for (const rows of [
      [
        [0, 10],
        [10, 10],
        [10, 5],
        [10, 7],
        [20, 7],
      ],
      [
        [0, 10],
        [10, 10],
        [10, 10],
        [20, 5],
      ],
      [
        [0, 10],
        [10, 10],
        [9, 5],
        [20, 5],
      ],
      [
        [0, 10],
        [0, 5],
        [20, 5],
      ],
      [
        [0, 5],
        [20, 5],
        [20, 10],
      ],
    ])
      expect(terrainError(pts(rows))).toBeTruthy();
    expect(
      polygonError(
        pts([
          [0, 0],
          [4, 0],
          [2, 0],
          [2, 4],
          [0, 4],
        ]),
      ),
    ).toBeTruthy();
  });
  it("mantém precisão da área com coordenadas grandes", () => {
    const p = pts([
      [999999, 999999],
      [999999.001, 999999],
      [999999.001, 999999.001],
      [999999, 999999.001],
    ]);
    expect(signedArea(p)).toBeCloseTo(1e-6, 10);
    expect(polygonError(p)).toBeNull();
  });
  it("abre o exemplo versionado existente preservando os dados na migração", () => {
    const raw = readFileSync(
      new URL("../../examples/talude-duas-camadas.geo.json", import.meta.url),
      "utf8",
    );
    const p = parseProject(raw);
    expect(JSON.parse(serializeProject(p))).toMatchObject({
      ...JSON.parse(raw),
      version: 5,
    });
    expect(p.version).toBe(5);
  });
});
