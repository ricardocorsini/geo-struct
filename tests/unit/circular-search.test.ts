import { describe, expect, it } from "vitest";
import {
  evaluateSearchCircle,
  rankSearchCandidates,
  runCircularSearch,
  type CircularSearchProfile,
  type SearchCandidate,
  type SearchProgress,
} from "../../src/core/circular-search";
import {
  MAX_SEARCH_CANDIDATES,
  prepareSearchGrid,
  searchLocation,
  type SearchBounds,
} from "../../src/core/search-grid";
import { solveBishop } from "../../src/core/bishop";
import { solveFellenius } from "../../src/core/fellenius";
import { prepareCoreInput } from "../../src/domain/core-input";
import { serializeProject } from "../../src/domain/model";
import { copy, fixture, prepare } from "../fixtures/equilibrium";

const fixed = (value: number) => ({ min: value, max: value, step: null });
const axis = (min: number, max: number, step: number) => ({ min, max, step });
const bounds: SearchBounds = {
  x: fixed(0),
  z: fixed(4),
  radius: axis(3, 6.05, 1),
};
const bishop = {
  initialFactor: 1.4,
  residualTolerance: 1e-8,
  maxIterations: 100,
  singularityThreshold: 0,
};
const profile: CircularSearchProfile = {
  geometry: { toleranceM: 1e-8, maxArcDegrees: 3 },
  equilibrium: { drivingThresholdKNPerM: 0, tensionToleranceKPa: 0 },
  bishop,
  nearTieTolerance: 0.01,
};

function gridOf(b: SearchBounds) {
  const p = prepareSearchGrid(b, profile.geometry.toleranceM);
  if (p.status === "blocked") throw new Error(p.message);
  return p.grid;
}
function model() {
  const p = fixture();
  p.materials[0].cohesion = 0;
  const c = p.analysisCases[0];
  c.surfaceMode = "search";
  c.search = {
    ...c.search,
    x: { ...bounds.x },
    y: { ...bounds.z },
    radius: { ...bounds.radius },
  };
  return p;
}
const applied = (p = model()) => prepareCoreInput(p, p.analysisCases[0].id);
function completed(
  input = applied(),
  parameters = profile,
  progress?: (p: SearchProgress) => void,
) {
  const result = runCircularSearch(input, parameters, progress);
  if (result.status !== "completed") throw new Error(result.diagnostic.message);
  return result;
}

describe("malha circular", () => {
  it("faz o raio variar primeiro, inclui o extremo alinhado e mantém eixo fixo sem passo", () => {
    const grid = gridOf({
      x: axis(-1, 1, 2),
      z: fixed(4),
      radius: axis(0.1, 0.3, 0.1),
    });
    const circles = Array.from(
      { length: grid.total },
      (_, i) => searchLocation(grid, i + 1).circle,
    );
    expect(circles).toEqual([
      { x: -1, z: 4, radius: 0.1 },
      { x: -1, z: 4, radius: 0.2 },
      { x: -1, z: 4, radius: 0.3 },
      { x: 1, z: 4, radius: 0.1 },
      { x: 1, z: 4, radius: 0.2 },
      { x: 1, z: 4, radius: 0.3 },
    ]);
    expect(
      searchLocation(
        gridOf({ x: axis(0, 1, 1), z: axis(4, 5, 1), radius: axis(5, 6, 1) }),
        3,
      ),
    ).toEqual({
      number: 3,
      indices: { x: 0, z: 1, radius: 0 },
      circle: { x: 0, z: 5, radius: 5 },
    });
  });

  it("só ajusta o extremo quando um ponto está dentro da tolerância", () => {
    expect(gridOf(bounds).axes.radius.values).toEqual([3, 4, 5, 6]);
    expect(
      gridOf({ ...bounds, radius: axis(3, 6 - 5e-9, 1) }).axes.radius.values,
    ).toEqual([3, 4, 5, 6 - 5e-9]);
    expect(
      gridOf({ ...bounds, radius: axis(3, 6 + 5e-9, 1) }).axes.radius.values,
    ).toEqual([3, 4, 5, 6 + 5e-9]);
    expect(
      gridOf({ ...bounds, radius: axis(3, 3.1, 1) }).axes.radius.values,
    ).toEqual([3]);
  });

  it("recusa eixos inválidos, passos irresolvíveis e tolerância que confunde pontos", () => {
    for (const radius of [
      { min: null, max: 6, step: 1 },
      axis(6, 5, 1),
      axis(0, 5, 1),
      axis(4, 6, 0),
      axis(4, 6, Infinity),
      axis(4, NaN, 1),
    ])
      expect(prepareSearchGrid({ ...bounds, radius }, 1e-8)).toMatchObject({
        status: "blocked",
        code: "invalid-axis",
      });
    expect(
      prepareSearchGrid({ ...bounds, x: { min: 0, max: 1, step: null } }, 1e-8),
    ).toMatchObject({ code: "invalid-axis" });
    expect(prepareSearchGrid(bounds, 0.5)).toMatchObject({
      code: "invalid-tolerance",
    });
    expect(prepareSearchGrid(bounds, 0)).toMatchObject({
      code: "invalid-tolerance",
    });
    expect(
      prepareSearchGrid({ ...bounds, x: axis(1e6 - 1, 1e6, 1e-12) }, 1e-13),
    ).toMatchObject({ code: "grid-resolution" });
  });

  it("recusa a malha excedente inteira antes de enumerar círculos", () => {
    const larger = { x: axis(0, 100, 1), z: axis(0, 100, 1), radius: fixed(5) };
    expect(prepareSearchGrid(larger, 1e-8)).toMatchObject({
      code: "grid-limit",
    });
    expect(
      prepareSearchGrid(
        { ...bounds, x: axis(0, MAX_SEARCH_CANDIDATES, 1) },
        1e-8,
      ),
    ).toMatchObject({ code: "grid-limit" });
    expect(
      gridOf({ x: axis(0, 99, 1), z: axis(0, 99, 1), radius: fixed(5) }).total,
    ).toBe(MAX_SEARCH_CANDIDATES);
    const p = model(),
      progress: SearchProgress[] = [];
    p.analysisCases[0].search = {
      ...p.analysisCases[0].search,
      x: larger.x,
      y: larger.z,
      radius: larger.radius,
    };
    expect(
      runCircularSearch(applied(p), profile, (p) => progress.push(p)),
    ).toMatchObject({ status: "blocked", diagnostic: { code: "grid-limit" } });
    expect(progress).toEqual([]);
  });
});

describe("classificação da malha", () => {
  it("classifica pelo valor bruto, mantém primeiro entre iguais e separa quase empates, falhas e nulos", () => {
    const grid = gridOf({ ...bounds, x: axis(0, 6, 1), radius: fixed(5) });
    // Roteiro de mesa independente do cálculo, ampliando CA5–CA6 da especificação.
    const rows: SearchCandidate[] = [
      [1.2, 1.35],
      [1.19, 1.1],
      [1.19, 1.11],
      [1.190000004, 1.09],
      [0, 0],
      [null, null],
      [null, null],
    ].map(([f, b], i) => ({
      location: searchLocation(grid, i + 1),
      sliceCount: i === 6 ? null : 30,
      entryX: null,
      exitX: null,
      filteredOut: false,
      issues: [],
      methods:
        i === 6
          ? []
          : [
              {
                method: "fellenius",
                factorOfSafety: f,
                status:
                  f === 0
                    ? "zero-resistance"
                    : f === null
                      ? "rejected"
                      : "calculated",
                evaluations: null,
                residual: null,
              },
              {
                method: "bishop",
                factorOfSafety: b === 0 ? null : b,
                status:
                  b === 0
                    ? "zero-resistance"
                    : b === null
                      ? "nonconverged"
                      : "calculated",
                evaluations: 5,
                residual: 0,
              },
            ],
    }));
    const f = rankSearchCandidates(rows, grid, "fellenius", 0.000001);
    const b = rankSearchCandidates(rows, grid, "bishop", 0.02);
    expect(f.minimum).toMatchObject({
      factorOfSafety: 1.19,
      location: { number: 2 },
      boundaryAxes: [],
    });
    expect(f.ties.map((t) => t.number)).toEqual([3, 4]);
    expect(f.ties[0].difference).toBe(0);
    expect(f.ties[1].difference).toBeGreaterThan(0);
    expect(
      rankSearchCandidates(rows, grid, "fellenius", 0).ties.map(
        (t) => t.number,
      ),
    ).toEqual([3]);
    expect(f).toMatchObject({ eligible: 4, zeroResistance: 1, failed: 1 });
    expect(b.minimum).toMatchObject({
      factorOfSafety: 1.09,
      location: { number: 4 },
    });
    expect(b).toMatchObject({ eligible: 4, zeroResistance: 1, failed: 1 });
  });

  it("reconhece a borda efetivamente amostrada e não sinaliza os eixos fixos", () => {
    const grid = gridOf(bounds);
    const rows: SearchCandidate[] = [1.4, 1.3, 1.2, 1.1].map((value, i) => ({
      location: searchLocation(grid, i + 1),
      sliceCount: 2,
      entryX: null,
      exitX: null,
      filteredOut: false,
      issues: [],
      methods: [
        {
          method: "fellenius",
          status: "calculated",
          factorOfSafety: value,
          evaluations: null,
          residual: null,
        },
      ],
    }));
    const r = rankSearchCandidates(rows, grid, "fellenius", 0);
    expect(r.minimum).toMatchObject({
      location: { circle: { radius: 6 } },
      boundaryAxes: ["radius"],
    });
  });
});

describe("busca com as preparações e solvers de produção", () => {
  it("avalia a malha inteira em ordem, reaproveita resultados do círculo fixo e conserva a origem", () => {
    const p = model(),
      input = applied(p),
      before = serializeProject(p);
    const progress: SearchProgress[] = [];
    const r = completed(input, profile, (state) => progress.push(state));
    expect(progress).toEqual(
      [0, 1, 2, 3, 4].map((completed) => ({ completed, total: 4 })),
    );
    expect(r.inputRevision).toBe(input.snapshot!.revision);
    expect(r.candidates.map((c) => c.location.circle.radius)).toEqual([
      3, 4, 5, 6,
    ]);
    expect(r.geometricCount).toBe(3);
    expect(r.reasons).toContainEqual(
      expect.objectContaining({
        stage: "geometry",
        code: "no-intersections",
        count: 1,
      }),
    );
    for (const candidate of r.candidates.slice(1)) {
      const { x, z, radius } = candidate.location.circle,
        fixedProject = copy(p);
      fixedProject.analysisCases[0].surfaceMode = "fixed";
      fixedProject.analysisCases[0].fixedCircle = { x, y: z, radius };
      const fixedInputs = prepare(fixedProject, profile.geometry.maxArcDegrees);
      const expected = [
        solveFellenius(
          fixedInputs.input,
          fixedInputs.mechanics,
          profile.equilibrium,
        ),
        solveBishop(fixedInputs.input, fixedInputs.mechanics, {
          ...profile.equilibrium,
          ...bishop,
        }),
      ];
      expect(candidate.methods.map((r) => r.factorOfSafety)).toEqual(
        expected.map((r) => r.factorOfSafety),
      );
      expect(expected.every((r) => r.status === "calculated")).toBe(true);
    }
    expect(
      r.rankings.every((item) => item.eligible === 3 && item.minimum !== null),
    ).toBe(true);
    expect(completed(input)).toEqual(r);
    expect(Object.isFrozen(r.candidates)).toBe(true);
    expect(Object.isFrozen(profile)).toBe(false);
    expect(serializeProject(p)).toBe(before);
  });

  it("distingue ausência de geometria, não convergência e resistência nula", () => {
    const p = model();
    p.analysisCases[0].search.radius = fixed(3);
    const empty = completed(applied(p));
    expect(empty.rankings.map((r) => r.status)).toEqual([
      "no-surface",
      "no-surface",
    ]);
    p.analysisCases[0].search.radius = fixed(5);
    const noBishop = completed(applied(p), {
      ...profile,
      bishop: { ...bishop, maxIterations: 1 },
    });
    expect(noBishop.rankings.map((r) => r.status)).toEqual([
      "minimum",
      "no-factor",
    ]);
    expect(noBishop.rankings[1].failed).toBe(1);
    expect(noBishop.candidates[0].methods[1]).toMatchObject({
      status: "nonconverged",
      factorOfSafety: null,
      evaluations: 1,
    });
    p.materials[0].friction = 0;
    const zero = completed(applied(p));
    expect(
      zero.rankings.map((r) => [r.status, r.zeroResistance, r.failed]),
    ).toEqual([
      ["no-factor", 1, 0],
      ["no-factor", 1, 0],
    ]);
    expect(zero.candidates[0].methods.map((r) => r.factorOfSafety)).toEqual([
      0,
      null,
    ]);
  });

  it("distingue o círculo tangente e o momento nulo em terreno horizontal simétrico", () => {
    const p = model();
    p.sections[0].terrain = [
      { x: -20, y: 2 },
      { x: 20, y: 2 },
    ];
    p.analysisCases[0].search = {
      ...p.analysisCases[0].search,
      x: fixed(0),
      y: fixed(10),
      radius: axis(7, 10, 3),
    };
    const input = applied(p),
      result = completed(input);
    expect(result.geometricCount).toBe(1);
    expect(result.rankings.map((ranking) => ranking.status)).toEqual([
      "no-factor",
      "no-factor",
    ]);
    const detail = evaluateSearchCircle(
      input,
      profile,
      result.candidates[1].location,
    );
    expect(detail.geometry.intersections.map((hit) => hit.point.x)).toEqual([
      expect.closeTo(-6, 12),
      expect.closeTo(6, 12),
    ]);
    // Os pesos simétricos produzem parcelas motrizes de sinais opostos.
    expect(
      detail.methods.every(
        (r) =>
          r.factorOfSafety === null &&
          r.diagnostics.some(
            (d) =>
              d.code === "invalid-driving" || d.code === "unresolved-driving",
          ),
      ),
    ).toBe(true);
    p.sections[0].terrain = [
      { x: -20, y: 0 },
      { x: 20, y: 0 },
    ];
    expect(completed(applied(p)).rankings.map((r) => r.status)).toEqual([
      "no-surface",
      "no-surface",
    ]);
  });

  it("preserva falhas locais na água e calcula os demais candidatos", () => {
    const p = model();
    Object.assign(p.sections[0], {
      waterMode: "piezometric",
      waterUnitWeight: 10,
      water: [
        { x: -5, y: 1.5 },
        { x: 3, y: -2.5 },
      ],
    });
    const uncovered = completed(applied(p));
    expect(uncovered.geometricCount).toBe(2);
    expect(uncovered.reasons).toContainEqual(
      expect.objectContaining({
        stage: "geometry",
        code: "water-coverage",
        count: 1,
      }),
    );
    p.sections[0].water = [
      { x: -10, y: 4 },
      { x: -5.7, y: 3.1 },
      { x: -5.2, y: 1.6 },
      { x: 10, y: -6 },
    ];
    const r = completed(applied(p));
    expect(r.geometricCount).toBe(3);
    expect(r.reasons).toContainEqual(
      expect.objectContaining({
        stage: "pressures",
        code: "water-above-terrain",
        count: 1,
      }),
    );
    expect(
      r.rankings.map((item) => [item.status, item.eligible, item.failed]),
    ).toEqual([
      ["minimum", 2, 1],
      ["minimum", 2, 1],
    ]);
  });

  it("valida o perfil dos métodos selecionados antes de começar e permite Fellenius sozinho", () => {
    const p = model(),
      input = applied(p),
      calls: SearchProgress[] = [];
    expect(
      runCircularSearch(input, { ...profile, bishop: null }, (progress) =>
        calls.push(progress),
      ),
    ).toMatchObject({
      status: "blocked",
      diagnostic: { code: "invalid-profile" },
    });
    expect(
      runCircularSearch(input, { ...profile, nearTieTolerance: NaN }),
    ).toMatchObject({ diagnostic: { code: "invalid-profile" } });
    expect(calls).toEqual([]);
    p.analysisCases[0].methods = ["fellenius"];
    expect(
      completed(applied(p), { ...profile, bishop: null }).rankings.map(
        (r) => r.method,
      ),
    ).toEqual(["fellenius"]);
  });

  it("reproduz os dados do círculo selecionado e compara uma discretização refinada", () => {
    const input = applied(),
      result = completed(input);
    const best = result.rankings[1].minimum!.location;
    const detail = evaluateSearchCircle(input, profile, best);
    const finer = evaluateSearchCircle(
      input,
      { ...profile, geometry: { ...profile.geometry, maxArcDegrees: 1.5 } },
      best,
    );
    expect(detail.methods[1].factorOfSafety).toBe(
      result.rankings[1].minimum!.factorOfSafety,
    );
    expect(finer.geometry.geometry!.slices.length).toBeGreaterThan(
      detail.geometry.geometry!.slices.length,
    );
    expect(finer.methods[1].status).toBe("calculated");
    expect(
      Math.abs(
        finer.methods[1].factorOfSafety! - detail.methods[1].factorOfSafety!,
      ),
    ).toBeLessThan(0.005);
    expect(result.profile.geometry.maxArcDegrees).toBe(3);
    expect(input.snapshot!.input.surface.mode).toBe("search");
  });
});
