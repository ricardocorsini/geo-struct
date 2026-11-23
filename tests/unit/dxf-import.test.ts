import { describe, expect, it } from "vitest";
import {
  importDxfContours,
  type DxfAssignment,
} from "../../src/domain/dxf-import";
import {
  newProject,
  duplicateSection,
  parseProject,
  serializeProject,
} from "../../src/domain/model";
import { commit, history, undo, redo } from "../../src/domain/history";
import { addAnalysisCase } from "../../src/domain/analysis";

const box = (x1 = 1, x2 = 4, z1 = 1, z2 = 4) => [
  { x: x1, y: z1 },
  { x: x2, y: z1 },
  { x: x2, y: z2 },
  { x: x1, y: z2 },
];
function fixture() {
  let p = newProject("DXF");
  p.sections[0].base = 0;
  p.sections[0].terrain = [
    { x: 0, y: 10 },
    { x: 20, y: 10 },
  ];
  p.sections[0].regions = [
    { id: "solo", name: "Solo", materialId: p.materials[0].id, points: box() },
  ];
  p.sections.push(duplicateSection(p.sections[0]));
  p = addAnalysisCase(p, p.sections[0].id).project;
  p.analysisCases[0].numericalProfile.geometry.toleranceM = 0.002;
  p.analysisCases[0].numericalProfile.bishop.initialFactor = 1.7;
  return p;
}
function region(points = box(5, 8)): DxfAssignment {
  return {
    entityId: "R",
    target: { kind: "region", id: "solo" },
    points,
    closed: true,
  };
}
const terrain: DxfAssignment = {
  entityId: "T",
  target: { kind: "terrain" },
  points: [
    { x: 0, y: 9 },
    { x: 20, y: 9 },
  ],
  closed: false,
};

describe("Importação DXF atômica", () => {
  it("aplica terreno e regiões, preserva dados/IDs/seções e desfaz tudo em uma operação", () => {
    const p = fixture(),
      before = structuredClone(p),
      s = p.sections[0];
    const assignments: DxfAssignment[] = [
      terrain,
      region(),
      {
        entityId: "N",
        target: {
          kind: "new-region",
          id: "nova",
          name: "Camada",
          materialId: null,
        },
        points: box(10, 13),
        closed: true,
      },
    ];
    const next = importDxfContours(p, s.id, assignments);
    expect(p).toEqual(before);
    expect(next.sections[0]).toMatchObject({
      id: s.id,
      terrain: terrain.points,
      base: s.base,
      backgroundMaterialId: s.backgroundMaterialId,
      regions: [
        {
          id: "solo",
          name: "Solo",
          materialId: s.regions[0].materialId,
          points: box(5, 8),
        },
        { id: "nova", name: "Camada", materialId: null, points: box(10, 13) },
      ],
    });
    expect(next.sections[1]).toEqual(p.sections[1]);
    expect(next.materials).toEqual(p.materials);
    expect(next.analysisCases).toEqual(p.analysisCases);
    expect(parseProject(serializeProject(next))).toEqual(next);
    const h = commit(history(p), next);
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toEqual(p);
    expect(redo(undo(h)).present).toEqual(next);
    assignments[1].points[0].x = 999;
    expect(next.sections[0].regions[0].points[0].x).toBe(5);
  });
  it("valida a seção final quando terreno e região só são válidos juntos", () => {
    const p = fixture();
    const next = importDxfContours(p, p.sections[0].id, [
      {
        ...terrain,
        points: [
          { x: 30, y: 10 },
          { x: 50, y: 10 },
        ],
      },
      region(box(31, 34)),
    ]);
    expect(next.sections[0].terrain[0].x).toBe(30);
    expect(next.sections[0].regions[0].points[0].x).toBe(31);
  });
  it("remove só o vértice de fechamento exatamente repetido", () => {
    const p = fixture(),
      points = box(5, 8);
    points.push({ ...points[0] });
    const next = importDxfContours(p, p.sections[0].id, [region(points)]);
    expect(next.sections[0].regions[0].points).toEqual(box(5, 8));
  });
  it("recusa sobreposição, auto-interseção e região fora do domínio sem aplicação parcial", () => {
    const p = fixture(),
      before = structuredClone(p);
    for (const points of [
      box(19, 21),
      [
        { x: 1, y: 1 },
        { x: 5, y: 5 },
        { x: 1, y: 5 },
        { x: 5, y: 1 },
      ],
    ]) {
      expect(() =>
        importDxfContours(p, p.sections[0].id, [terrain, region(points)]),
      ).toThrow();
      expect(p).toEqual(before);
    }
    expect(() =>
      importDxfContours(p, p.sections[0].id, [
        region(),
        {
          entityId: "N",
          target: {
            kind: "new-region",
            id: "nova",
            name: "Sobreposta",
            materialId: null,
          },
          points: box(6, 9),
          closed: true,
        },
      ]),
    ).toThrow(/sobrepõe/);
    expect(p).toEqual(before);
  });
  it("recusa terreno fechado, região aberta, retorno em X e base incompatível", () => {
    const p = fixture();
    for (const assignment of [
      { ...terrain, closed: true },
      { ...region(), closed: false },
      {
        ...terrain,
        points: [
          { x: 0, y: 9 },
          { x: 20, y: 9 },
          { x: 10, y: 8 },
        ],
      },
      {
        ...terrain,
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
      },
    ])
      expect(() =>
        importDxfContours(p, p.sections[0].id, [assignment]),
      ).toThrow();
  });
  it("recusa entidades/destinos repetidos e alvos inexistentes", () => {
    const p = fixture(),
      s = p.sections[0];
    expect(() => importDxfContours(p, "inexistente", [terrain])).toThrow(
      /seção existente/,
    );
    expect(() => importDxfContours(p, s.id, [])).toThrow(/entidade/);
    expect(() => importDxfContours(p, s.id, [terrain, terrain])).toThrow(
      /único destino/,
    );
    expect(() =>
      importDxfContours(p, s.id, [terrain, { ...terrain, entityId: "T2" }]),
    ).toThrow(/mesmo contorno/);
    expect(() =>
      importDxfContours(p, s.id, [
        { ...region(), target: { kind: "region", id: "ausente" } },
      ]),
    ).toThrow(/região existente/);
  });
  it("não aceita material inexistente ou ID global duplicado", () => {
    const p = fixture();
    for (const target of [
      {
        kind: "new-region" as const,
        id: "nova",
        name: "Nova",
        materialId: "ausente",
      },
      {
        kind: "new-region" as const,
        id: p.sections[1].id,
        name: "Nova",
        materialId: null,
      },
    ])
      expect(() =>
        importDxfContours(p, p.sections[0].id, [{ ...region(), target }]),
      ).toThrow();
  });
  it("recusa pontos não finitos, coordenadas além do limite e mais de 500 vértices", () => {
    const p = fixture();
    for (const points of [
      [
        { x: 0, y: 9 },
        { x: Infinity, y: 9 },
      ],
      [
        { x: 0, y: 9 },
        { x: 1000001, y: 9 },
      ],
      Array.from({ length: 501 }, (_, i) => ({ x: i, y: 9 })),
    ])
      expect(() =>
        importDxfContours(p, p.sections[0].id, [{ ...terrain, points }]),
      ).toThrow();
  });
  it("respeita o limite de 64 regiões e não propaga correspondências antigas", () => {
    const p = fixture();
    const assignments: DxfAssignment[] = Array.from({ length: 65 }, (_, i) => ({
      entityId: `e${i}`,
      target: {
        kind: "new-region",
        id: `r${i}`,
        name: `R${i}`,
        materialId: null,
      },
      points: box(),
      closed: true,
    }));
    expect(() => importDxfContours(p, p.sections[0].id, assignments)).toThrow();
    const next = importDxfContours(p, p.sections[0].id, [
      region(box(0, 5, 0, 8)),
    ]);
    expect(next.sections[0].terrain).toEqual(p.sections[0].terrain);
  });
});
