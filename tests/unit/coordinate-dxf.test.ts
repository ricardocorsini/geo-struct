import { describe, expect, it } from "vitest";
import {
  MAX_DXF_BYTES,
  MAX_DXF_GROUPS,
  convertDxfPoints,
  parseDxf,
  type DxfEntity,
} from "../../src/domain/coordinate-dxf";

type Pair = readonly [number, string | number];
const encode = (pairs: readonly Pair[]) =>
  pairs.map(([c, v]) => `${c}\n${v}\n`).join("");
const drawing = (body: Pair[], before: Pair[] = []) =>
  encode([
    ...before,
    [0, "SECTION"],
    [2, "ENTITIES"],
    ...body,
    [0, "ENDSEC"],
    [0, "EOF"],
  ]);
const lw = (extra: Pair[] = []): Pair[] => [
  [0, "LWPOLYLINE"],
  [5, "A1"],
  [8, "TERRENO"],
  [90, 3],
  [10, 0],
  [20, 12],
  [10, 8],
  [20, 12],
  [10, 18],
  [20, 6],
  ...extra,
];
const poly = (extra: Pair[] = [], vertexExtra: Pair[] = []): Pair[] => [
  [0, "POLYLINE"],
  [8, "SOLO"],
  [66, 1],
  [10, 0],
  [20, 0],
  [30, 0],
  ...extra,
  [0, "VERTEX"],
  [10, 1],
  [20, 2],
  [30, 0],
  ...vertexExtra,
  [0, "VERTEX"],
  [10, 5],
  [20, 2],
  [30, 0],
  [0, "VERTEX"],
  [10, 5],
  [20, 6],
  [30, 0],
  [0, "SEQEND"],
];
const only = (pairs: Pair[]) => parseDxf(drawing(pairs)).entities[0];
const error = (pairs: Pair[]) => {
  const entity = only(pairs);
  expect(entity.points).toEqual([]);
  expect(entity.error).toBeTruthy();
  return entity.error;
};

describe("DXF de polilinhas retas", () => {
  it("lê vértices, camada e identidade determinística sem aplicar unidade ou origem", () => {
    const text = drawing(lw());
    const doc = parseDxf(text);
    expect(doc).toEqual({
      insUnits: null,
      version: null,
      entities: [
        {
          id: "dxf-1",
          type: "LWPOLYLINE",
          layer: "TERRENO",
          closed: false,
          points: [
            { x: 0, y: 12 },
            { x: 8, y: 12 },
            { x: 18, y: 6 },
          ],
          error: null,
        },
      ],
    });
    expect(parseDxf(text)).toEqual(doc);
  });

  it("lê BOM, CRLF e metadados do HEADER sem deduzir a unidade de conversão", () => {
    const text = drawing(lw(), [
      [0, "SECTION"],
      [2, "HEADER"],
      [9, "$ACADVER"],
      [1, "AC1032"],
      [9, "$INSUNITS"],
      [70, 4],
      [0, "ENDSEC"],
    ]);
    const doc = parseDxf("\uFEFF" + text.replace(/\n/g, "\r\n"));
    expect(doc.insUnits).toBe(4);
    expect(doc.version).toBe("AC1032");
    expect(doc.entities[0].points[1]).toEqual({ x: 8, y: 12 });
    expect(() =>
      convertDxfPoints(doc.entities[0], { unit: "", originX: 0, originZ: 0 }),
    ).toThrow("unidade");
  });

  it.each([1, 129])(
    "preserva o fechamento pelo flag %i sem adicionar um vértice",
    (flag) => {
      const entity = only(lw([[70, flag]]));
      expect(entity.closed).toBe(true);
      expect(entity.points).toHaveLength(3);
      expect(entity.error).toBeNull();
    },
  );

  it("lê POLYLINE 2D e sua sequência VERTEX/SEQEND como uma entidade", () => {
    const doc = parseDxf(drawing([...poly([[70, 1]]), ...lw()]));
    expect(doc.entities).toHaveLength(2);
    expect(doc.entities[0]).toMatchObject({
      type: "POLYLINE",
      layer: "SOLO",
      closed: true,
      error: null,
      points: [
        { x: 1, y: 2 },
        { x: 5, y: 2 },
        { x: 5, y: 6 },
      ],
    });
    expect(doc.entities[1].id).toBe("dxf-2");
  });

  it("não depende da ordem de propriedades e não usa pontos de grupos de aplicação", () => {
    const doc = parseDxf(
      drawing([
        [0, "LWPOLYLINE"],
        [10, 0],
        [20, 10],
        [10, 5],
        [20, 7],
        [102, "{APP"],
        [10, 999],
        [20, 999],
        [70, 100],
        [102, "}"],
        [90, 2],
        [8, "Seção com acento"],
        [70, 128],
        [210, 0],
        [220, 0],
        [230, 1],
      ]),
    );
    expect(doc.entities[0]).toMatchObject({
      layer: "Seção com acento",
      error: null,
      points: [
        { x: 0, y: 10 },
        { x: 5, y: 7 },
      ],
    });
  });

  it("mantém entidades incompatíveis visíveis e uma vizinha válida intacta", () => {
    const doc = parseDxf(
      drawing(
        [
          [0, "ARC"],
          [8, "ARCO"],
          [10, 1],
          [20, 2],
          [40, 3],
          [0, "INSERT"],
          [8, "BLOCO"],
          [2, "talude"],
          ...lw(),
        ],
        [[0, "SECTION"], [2, "BLOCKS"], ...lw(), [0, "ENDSEC"]],
      ),
    );
    expect(doc.entities).toHaveLength(3);
    expect(doc.entities.map((e) => e.type)).toEqual([
      "ARC",
      "INSERT",
      "LWPOLYLINE",
    ]);
    expect(
      doc.entities.slice(0, 2).every((e) => e.error && !e.points.length),
    ).toBe(true);
    expect(doc.entities[2].error).toBeNull();
    expect(doc.entities[2].points).toHaveLength(3);
  });

  it.each(["LINE", "SPLINE", "CIRCLE", "ELLIPSE", "3DFACE", "HATCH"])(
    "lista %s como incompatível",
    (type) => {
      expect(
        error([
          [0, type],
          [8, "auxiliar"],
        ]),
      ).toContain(type);
    },
  );

  it("identidades não colidem quando duas entidades repetem o handle", () => {
    const entities = parseDxf(drawing([...lw(), ...lw()])).entities;
    expect(entities.map((e) => e.id)).toEqual(["dxf-1", "dxf-2"]);
  });

  it("ignora XDATA documentado e recusa coordenadas de aplicação fora do contrato", () => {
    const good = only(
      lw([
        [1001, "APP"],
        [1000, "nota"],
        [1010, 123],
        [1020, 456],
      ]),
    );
    expect(good.error).toBeNull();
    expect(good.points).toHaveLength(3);
    const bad = lw([
      [1001, "APP"],
      [10, 123],
      [20, 456],
    ]);
    expect(error(bad)).toContain("XDATA");
    const color = only(
      lw([
        [420, 16777215],
        [440, 33554432],
      ]),
    );
    expect(color.error).toBeNull();
    expect(color.points).toEqual(good.points);
  });

  it.each([42, 40, 41, 43])(
    "recusa bulge/largura no código %i, sem geometria parcial",
    (code) => {
      expect(error(lw([[code, 0.5]]))).toMatch(/bulge|largura/);
    },
  );

  it.each([30, 38, 39])(
    "recusa elevação/espessura não nula no código %i",
    (code) => {
      expect(error(lw([[code, 2]]))).toMatch(/Elevação|espessura/);
    },
  );

  it.each(
    ([[[210, 1]], [[220, 1]], [[230, -1]], [[230, 0]]] as Pair[][]).map(
      (extra) => ({ extra }),
    ),
  )("não projeta silenciosamente um OCS diferente: $extra", ({ extra }) => {
    expect(error(lw(extra))).toMatch(/OCS|normal/);
  });

  it.each(
    ([[[67, 1]], [[410, "Layout1"]]] as Pair[][]).map((extra) => ({ extra })),
  )("recusa o espaço de papel: $extra", ({ extra }) => {
    expect(error(lw(extra))).toMatch(/papel|layout/);
  });

  it.each([2, 4, 8, 16, 32, 64, 256, -1, 65536])(
    "recusa flags LWP incompatíveis %i",
    (flag) => {
      expect(error(lw([[70, flag]]))).toMatch(/flags|3D|malha/);
    },
  );

  it.each([2, 4, 8, 16, 32, 64])(
    "recusa POLYLINE com fit/3D/mesh %i",
    (flag) => {
      expect(error(poly([[70, flag]]))).toMatch(/flags|3D|malha/);
    },
  );

  it.each(
    (
      [
        [[70, 32]],
        [[70, 1]],
        [[42, 1]],
        [[41, 1]],
        [[100, "AcDb3dPolylineVertex"]],
      ] as Pair[][]
    ).map((extra) => ({ extra })),
  )(
    "recusa toda a POLYLINE se um VERTEX for incompatível: $extra",
    ({ extra }) => {
      expect(error(poly([], extra))).toBeTruthy();
    },
  );

  it("recusa coordenada 3D de um VERTEX", () => {
    const body = poly();
    const firstVertex = body.findIndex(([c, v]) => c === 0 && v === "VERTEX");
    body[firstVertex + 3] = [30, 2];
    expect(error(body)).toMatch(/XY/);
  });

  it.each(["NaN", "Infinity", "1e999", "1,5", "0x10", ""])(
    "recusa número DXF inválido %j",
    (value) => {
      const pairs = lw();
      pairs[4] = [10, value];
      expect(error(pairs)).toMatch(/numérico finito/);
    },
  );

  it.each(["2.5", "1e1", "NaN", "-2", "0", "501"])(
    "recusa contagem 90 inválida %j",
    (value) => {
      const pairs = lw();
      pairs[3] = [90, value];
      expect(error(pairs)).toMatch(/inteiro|500|contagem/);
    },
  );

  it("recusa coordenada Y ausente e contagem ou flag duplicado", () => {
    expect(
      error(lw().filter(([code], i) => !(code === 20 && i === 5))),
    ).toContain("pares X/Y");
    expect(error(lw([[90, 3]]))).toContain("repetido");
    expect(
      error(
        lw([
          [70, 0],
          [70, 0],
        ]),
      ),
    ).toContain("repetido");
  });

  it.each([
    {
      coordinates: [
        [10, 0],
        [10, 20],
        [20, 10],
        [20, 8],
      ] as Pair[],
    },
    {
      coordinates: [
        [20, 10],
        [10, 0],
        [10, 20],
        [20, 8],
      ] as Pair[],
    },
  ])(
    "não repara uma sequência ambígua de coordenadas: $coordinates",
    ({ coordinates }) => {
      expect(
        error([[0, "LWPOLYLINE"], [8, "perfil"], [90, 2], ...coordinates]),
      ).toContain("sequência 10/20");
    },
  );

  it("recusa camada ausente e grupo de aplicação incompleto", () => {
    expect(error(lw().filter(([code]) => code !== 8))).toContain("camada");
    expect(error(lw([[102, "{APP"]]))).toContain("incompleto");
  });

  it("uma POLYLINE sem SEQEND não rouba a entidade válida seguinte", () => {
    const incomplete = poly().slice(0, -1);
    const doc = parseDxf(drawing([...incomplete, ...lw()]));
    expect(doc.entities).toHaveLength(2);
    expect(doc.entities[0].error).toContain("SEQEND");
    expect(doc.entities[0].points).toEqual([]);
    expect(doc.entities[1].error).toBeNull();
  });

  it("recusa um SEQEND inconsistente no espaço de papel", () => {
    expect(error([...poly(), [67, 1]])).toContain("papel");
  });

  it("preserva espaços no nome da camada sem reunir camadas distintas", () => {
    const text = drawing([
      ...lw(),
      ...lw().map(([c, v]): Pair => [c, c === 8 ? " TERRENO " : v]),
    ]);
    const doc = parseDxf(text);
    expect(doc.entities.map((e) => e.layer)).toEqual(["TERRENO", " TERRENO "]);
    expect(doc.entities.every((e) => e.error === null)).toBe(true);
    expect(new Set(doc.entities.map((e) => e.layer)).size).toBe(2);
  });

  it("admite 500 pontos e recusa excesso na mesma entidade, sem truncar", () => {
    const body = (n: number): Pair[] => [
      [0, "LWPOLYLINE"],
      [8, "perfil"],
      [90, n],
      ...Array.from({ length: n }, (_, i): Pair[] => [
        [10, i],
        [20, 10],
      ]).flat(),
    ];
    expect(only(body(500)).points).toHaveLength(500);
    expect(error(body(501))).toContain("500");
    const p = (n: number): Pair[] => [
      [0, "POLYLINE"],
      [8, "perfil"],
      ...Array.from({ length: n }, (_, i): Pair[] => [
        [0, "VERTEX"],
        [10, i],
        [20, 10],
      ]).flat(),
      [0, "SEQEND"],
    ];
    expect(only(p(500)).points).toHaveLength(500);
    expect(error(p(501))).toContain("500");
  });
});

describe("estrutura e limites do documento DXF", () => {
  it.each([
    ["0\nSECTION\n2\nENTITIES\n0\nENDSEC\n", /EOF/],
    ["0\nSECTION\n2\nENTITIES\n0\nEOF\n", /ENDSEC/],
    ["0\nEOF\n", /ENTITIES/],
    ["0\nSECTION\nENTITIES\n0\nENDSEC\n0\nEOF\n", /código|valor/],
    ["0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n0\nLINE\n", /após o EOF/],
    [
      "0\nSECTION\n2\nENTITIES\n0\nSECTION\n2\nOTHER\n0\nENDSEC\n0\nEOF\n",
      /ENDSEC/,
    ],
    ["-1\nLINE\n0\nEOF\n", /código/],
    ["10000\nLINE\n0\nEOF\n", /código/],
    ["0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0", /valor/],
    ["AutoCAD Binary DXF\r\n\x1a\0", /binário/],
  ])("recusa arquivo malformado %j", (text, pattern) => {
    expect(() => parseDxf(text)).toThrow(pattern);
  });

  it("não combina duas seções ENTITIES nem aceita metadados contraditórios", () => {
    expect(() =>
      parseDxf(
        drawing(lw(), [
          [0, "SECTION"],
          [2, "ENTITIES"],
          [0, "ENDSEC"],
        ]),
      ),
    ).toThrow("repetida");
    const head: Pair[] = [
      [0, "SECTION"],
      [2, "HEADER"],
      [9, "$INSUNITS"],
      [70, 4],
      [9, "$INSUNITS"],
      [70, 6],
      [0, "ENDSEC"],
    ];
    expect(() => parseDxf(drawing(lw(), head))).toThrow("repetida");
    head.splice(4, 2);
    head[3] = [70, "NaN"];
    expect(() => parseDxf(drawing(lw(), head))).toThrow("inteiro");
  });

  it("limita entidades, bytes UTF-8 e grupos, incluindo comentários", () => {
    expect(() =>
      parseDxf(drawing(Array.from({ length: 201 }, () => lw()).flat())),
    ).toThrow("200 entidades");
    expect(() => parseDxf("é".repeat(MAX_DXF_BYTES / 2 + 1))).toThrow("2 MiB");
    expect(() =>
      parseDxf("999\n\n".repeat(MAX_DXF_GROUPS + 1) + drawing([])),
    ).toThrow("250.000 grupos");
  });
});

describe("conversão explícita XY → X/Z", () => {
  it.each([
    ["m", 1],
    ["cm", 0.01],
    ["mm", 0.001],
  ] as const)(
    "subtrai a origem em unidades do arquivo antes de converter %s",
    (unit, factor) => {
      const entity = only(lw());
      const before = structuredClone(entity);
      expect(
        convertDxfPoints(entity, { unit, originX: 8, originZ: 6 }),
      ).toEqual([
        { x: -8 * factor, y: 6 * factor },
        { x: 0, y: 6 * factor },
        { x: 10 * factor, y: 0 },
      ]);
      expect(entity).toEqual(before);
    },
  );

  it("preserva Z positivo e permite retirar uma origem topográfica grande", () => {
    const entity: DxfEntity = {
      ...only(lw()),
      points: [
        { x: 700_000_000, y: 8_000_010_000 },
        { x: 700_020_000, y: 8_000_008_000 },
      ],
    };
    expect(
      convertDxfPoints(entity, {
        unit: "mm",
        originX: 700_000_000,
        originZ: 8_000_000_000,
      }),
    ).toEqual([
      { x: 0, y: 10 },
      { x: 20, y: 8 },
    ]);
  });

  it("recusa entidade incompatível, origem inválida e coordenada convertida fora dos limites", () => {
    expect(() =>
      convertDxfPoints(only(lw([[42, 1]])), {
        unit: "m",
        originX: 0,
        originZ: 0,
      }),
    ).toThrow("bulge");
    expect(() =>
      convertDxfPoints(only(lw()), { unit: "m", originX: NaN, originZ: 0 }),
    ).toThrow("origem");
    expect(() =>
      convertDxfPoints(only(lw()), { unit: "m", originX: -1e6, originZ: 0 }),
    ).toThrow("1.000.000");
    const bad = {
      ...only(lw()),
      points: [
        { x: Infinity, y: 1 },
        { x: 2, y: 3 },
      ],
    };
    expect(() =>
      convertDxfPoints(bad, { unit: "mm", originX: 0, originZ: 0 }),
    ).toThrow("Ponto 1");
  });
});
