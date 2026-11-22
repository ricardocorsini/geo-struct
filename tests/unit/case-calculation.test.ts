import { afterEach, describe, expect, it, vi } from "vitest";
import * as bishopCore from "../../src/core/bishop";
import * as felleniusCore from "../../src/core/fellenius";
import * as geometryCore from "../../src/core/fixed-circle";
import * as loadsCore from "../../src/core/slice-loads";
import * as mechanicsCore from "../../src/core/slice-mechanics";
import * as pressuresCore from "../../src/core/slice-pressures";
import * as weightsCore from "../../src/core/slice-weights";
import { runCircularSearch } from "../../src/core/circular-search";
import { defaultProject } from "../../src/domain/default-project";
import {
  emptyNumericalProfile,
  newMaterial,
  type Project,
} from "../../src/domain/model";
import {
  calculateFixedCase,
  getCaseCalculationReadiness,
  type FixedCaseReady,
} from "../../src/lib/case-calculation";
import { fixture } from "../fixtures/equilibrium";
import {
  bishopProfile,
  felleniusProfile,
  searchProfile,
} from "../fixtures/numerical-profile";

afterEach(() => vi.restoreAllMocks());

function fixedModel() {
  const p = fixture();
  p.analysisCases[0].numericalProfile = {
    ...emptyNumericalProfile(),
    geometry: { toleranceM: 1e-8, maxArcDegrees: 3 },
    fellenius: { ...felleniusProfile },
    bishop: { ...bishopProfile },
  };
  return p;
}

function readiness(p: Project = fixedModel(), dirty = false) {
  return getCaseCalculationReadiness(p, p.analysisCases[0].id, dirty);
}

function fixedReady(p = fixedModel()): FixedCaseReady {
  const ready = readiness(p);
  if (ready.status !== "ready" || ready.mode !== "fixed")
    throw new Error(JSON.stringify(ready));
  return ready;
}

describe("Prontidão para calcular o caso aplicado", () => {
  it("bloqueia rascunhos e ausência de caso sem produzir preparações", () => {
    const p = fixedModel();
    expect(readiness(p, true)).toMatchObject({
      status: "blocked",
      reason: "draft",
      preparation: null,
    });
    for (const id of [null, "inexistente"])
      expect(getCaseCalculationReadiness(p, id)).toMatchObject({
        status: "blocked",
        reason: "case-required",
      });
    expect(getCaseCalculationReadiness(null, null)).toMatchObject({
      status: "blocked",
      reason: "case-required",
    });
  });

  it("exige direção, métodos e superfície sem adotar escolhas automáticas", () => {
    const p = fixedModel();
    const c = p.analysisCases[0];
    c.direction = null;
    c.methods = [];
    expect(readiness(p)).toMatchObject({
      reason: "analysis-pending",
      missingFields: ["analysis.direction", "analysis.methods"],
    });
    c.direction = "left-to-right";
    c.methods = ["fellenius"];
    c.surfaceMode = null;
    expect(readiness(p)).toMatchObject({
      reason: "surface-pending",
      missingFields: ["surface.mode"],
    });
    c.surfaceMode = "fixed";
    c.fixedCircle.radius = null;
    expect(readiness(p)).toMatchObject({
      reason: "surface-pending",
      missingFields: ["surface.circle.radius"],
    });
  });

  it.each([
    ["gamma", "unitWeight"],
    ["cohesion", "cohesion"],
    ["friction", "frictionDegrees"],
    ["mode", "parameterMode"],
  ] as const)(
    "exige %s nos materiais usados e conserva o diagnóstico original",
    (field, key) => {
      const p = fixedModel();
      p.materials[0][field] = null;
      const result = readiness(p);
      expect(result).toMatchObject({
        status: "blocked",
        reason: "material-pending",
        missingFields: [`materials.${p.materials[0].id}.${key}`],
      });
      if (result.status !== "blocked") throw new Error("Esperado bloqueio");
      expect(result.diagnostics).toEqual(result.preparation?.diagnostics);
      expect(
        result.diagnostics.some((d) => d.target === p.materials[0].id),
      ).toBe(true);
    },
  );

  it("exige atribuição explícita sem bloquear materiais sem uso ou origem vazia", () => {
    const p = fixedModel();
    p.materials[0].source = "";
    p.materials.push(newMaterial());
    p.analysisCases[0].description = "";
    expect(readiness(p).status).toBe("ready");
    p.sections[0].backgroundMaterialId = null;
    expect(readiness(p)).toMatchObject({
      reason: "material-pending",
      missingFields: ["geometry.backgroundMaterialId"],
    });
  });

  it("confere água e cargas efetivas, preservando os dados inativos pendentes", () => {
    const p = fixedModel();
    const s = p.sections[0];
    s.loads.push({
      id: "faixa-pendente",
      name: "Faixa",
      x1: -4,
      x2: -2,
      q: null,
      enabled: false,
      source: "",
    });
    expect(readiness(p).status).toBe("ready");
    p.analysisCases[0].loadCondition = "selected";
    p.analysisCases[0].loadIds = ["faixa-pendente"];
    expect(readiness(p)).toMatchObject({
      reason: "conditions-pending",
      missingFields: ["loads.faixa-pendente.q"],
    });
    p.analysisCases[0].loadCondition = "none";
    s.waterMode = "piezometric";
    s.water = [];
    s.waterUnitWeight = null;
    expect(readiness(p)).toMatchObject({
      reason: "conditions-pending",
      missingFields: ["water.line", "water.unitWeight"],
    });
    p.analysisCases[0].waterCondition = "dry";
    expect(readiness(p).status).toBe("ready");
  });

  it("usa só os perfis dos métodos e do modo selecionados, sem preencher nulos", () => {
    const p = fixedModel();
    const c = p.analysisCases[0];
    c.numericalProfile = emptyNumericalProfile();
    c.numericalProfile.geometry = { toleranceM: 1e-8, maxArcDegrees: 3 };
    c.numericalProfile.fellenius = { ...felleniusProfile };
    c.methods = ["fellenius"];
    expect(fixedReady(p).profile.bishop).toBeNull();
    c.methods.push("bishop");
    expect(readiness(p)).toMatchObject({
      reason: "profile-pending",
      missingFields: expect.arrayContaining(["bishop.initialFactor"]),
    });
    expect(c.numericalProfile.bishop.initialFactor).toBeNull();
    c.methods = ["bishop"];
    c.numericalProfile.bishop = { ...bishopProfile };
    c.numericalProfile.fellenius.drivingThresholdKNPerM = null;
    expect(fixedReady(p).profile.fellenius).toBeNull();
    c.numericalProfile.geometry.toleranceM = null;
    expect(readiness(p)).toMatchObject({
      reason: "profile-pending",
      missingFields: ["geometry.toleranceM"],
    });
  });

  it("vincula a identidade ao projeto, caso, entrada e somente ao perfil efetivo", () => {
    const p = fixedModel();
    p.analysisCases[0].methods = ["fellenius"];
    const before = structuredClone(p);
    const first = fixedReady(p);
    expect(p).toEqual(before);
    p.analysisCases[0].numericalProfile.bishop.initialFactor = 2;
    p.analysisCases[0].numericalProfile.search.geometry.maxArcDegrees = 1;
    expect(fixedReady(p).identityKey).toBe(first.identityKey);
    p.analysisCases[0].numericalProfile.fellenius.tensionToleranceKPa = 0.1;
    const changedProfile = fixedReady(p);
    expect(changedProfile.inputRevision).toBe(first.inputRevision);
    expect(changedProfile.identityKey).not.toBe(first.identityKey);
    p.materials[0].gamma = 19;
    expect(fixedReady(p).identityKey).not.toBe(changedProfile.identityKey);
    const identity = JSON.parse(first.identityKey);
    expect(identity).toEqual({
      projectId: p.id,
      caseId: p.analysisCases[0].id,
      inputRevision: first.inputRevision,
      profile: first.profile,
    });
    expect(Object.isFrozen(first.profile)).toBe(true);
    expect(Object.isFrozen(p)).toBe(false);
  });

  it("prepara um pedido de busca compatível com o Worker sem executar círculos", () => {
    const p = defaultProject();
    const c = p.analysisCases[0];
    c.methods = ["fellenius"];
    c.numericalProfile.geometry = emptyNumericalProfile().geometry;
    c.numericalProfile.bishop = emptyNumericalProfile().bishop;
    c.numericalProfile.search = structuredClone(searchProfile);
    c.numericalProfile.search.bishop = emptyNumericalProfile().search.bishop;
    const evaluate = vi.spyOn(geometryCore, "prepareFixedCircleGeometry");
    const ready = readiness(p);
    expect(evaluate).not.toHaveBeenCalled();
    if (ready.status !== "ready" || ready.mode !== "search")
      throw new Error(JSON.stringify(ready));
    expect(ready.grid.total).toBe(27);
    expect(ready.profile.bishop).toBeNull();
    const request = {
      type: "run" as const,
      preparation: ready.preparation,
      profile: ready.profile,
    };
    const result = runCircularSearch(request.preparation, request.profile);
    expect(result.status).toBe("completed");
    c.numericalProfile.search.nearTieTolerance = null;
    expect(readiness(p)).toMatchObject({
      reason: "profile-pending",
      missingFields: ["search.nearTieTolerance"],
    });
  });

  it("recusa malha excedente antes de preparar qualquer geometria", () => {
    const p = defaultProject();
    p.analysisCases[0].search.x = { min: 0, max: 100, step: 1 };
    p.analysisCases[0].search.y = { min: 0, max: 100, step: 1 };
    const evaluate = vi.spyOn(geometryCore, "prepareFixedCircleGeometry");
    expect(readiness(p)).toMatchObject({ reason: "grid-invalid" });
    expect(evaluate).not.toHaveBeenCalled();
  });
});

describe("Cálculo único do círculo fixo", () => {
  it("compartilha cada preparação e a mecânica entre os métodos selecionados", () => {
    const ready = fixedReady();
    const prepares = [
      vi.spyOn(geometryCore, "prepareFixedCircleGeometry"),
      vi.spyOn(weightsCore, "prepareSliceWeights"),
      vi.spyOn(pressuresCore, "prepareSlicePressures"),
      vi.spyOn(loadsCore, "prepareSliceLoads"),
      vi.spyOn(mechanicsCore, "prepareSliceMechanics"),
    ];
    const fellenius = vi.spyOn(felleniusCore, "solveFellenius");
    const bishop = vi.spyOn(bishopCore, "solveBishop");
    const result = calculateFixedCase(ready);
    for (const prepare of prepares) expect(prepare).toHaveBeenCalledTimes(1);
    expect(result.geometry.status).toBe("prepared");
    expect(result.preparations?.mechanics.status).toBe("prepared");
    expect(fellenius).toHaveBeenCalledExactlyOnceWith(
      ready.preparation,
      result.preparations?.mechanics,
      ready.profile.fellenius,
    );
    expect(bishop).toHaveBeenCalledExactlyOnceWith(
      ready.preparation,
      result.preparations?.mechanics,
      ready.profile.bishop,
    );
    expect(result.methods.map((r) => r.method)).toEqual(ready.methods);
    expect(result).toMatchObject({
      caseId: ready.caseId,
      inputRevision: ready.inputRevision,
      identityKey: ready.identityKey,
      profile: ready.profile,
    });
    for (const method of result.methods) {
      expect(method.inputRevision).toBe(ready.inputRevision);
    }
    expect(result.methods).toEqual([
      felleniusCore.solveFellenius(
        ready.preparation,
        result.preparations!.mechanics,
        ready.profile.fellenius!,
      ),
      bishopCore.solveBishop(
        ready.preparation,
        result.preparations!.mechanics,
        ready.profile.bishop!,
      ),
    ]);
  });

  it("preserva Fellenius quando Bishop não converge e não avalia métodos desmarcados", () => {
    const p = fixedModel();
    p.analysisCases[0].numericalProfile.bishop.maxIterations = 1;
    const result = calculateFixedCase(fixedReady(p));
    expect(result.methods.find((m) => m.method === "fellenius")?.status).toBe(
      "calculated",
    );
    expect(result.methods.find((m) => m.method === "bishop")?.status).toBe(
      "nonconverged",
    );
    p.analysisCases[0].methods = ["fellenius"];
    const bishop = vi.spyOn(bishopCore, "solveBishop");
    expect(
      calculateFixedCase(fixedReady(p)).methods.map((m) => m.method),
    ).toEqual(["fellenius"]);
    expect(bishop).not.toHaveBeenCalled();
  });

  it("conserva geometria e pesos quando a pressão detecta água acima do terreno", () => {
    const p = fixedModel();
    Object.assign(p.sections[0], {
      waterMode: "piezometric",
      waterUnitWeight: 10,
      water: [
        { x: -10, y: 5.1 },
        { x: 10, y: -4.9 },
      ],
    });
    const result = calculateFixedCase(fixedReady(p));
    expect(result.geometry.status).toBe("prepared");
    expect(result.preparations?.weights.status).toBe("prepared");
    expect(result.preparations?.loads.status).toBe("prepared");
    expect(result.preparations?.pressures.status).toBe("blocked");
    expect(result.preparations?.pressures.diagnostics[0].code).toBe(
      "water-above-terrain",
    );
    expect(result.preparations?.mechanics.status).toBe("blocked");
    expect(result.methods).toEqual([]);
  });

  it("deixa a admissibilidade geométrica para o núcleo e conserva o bloqueio sem FS", () => {
    const p = fixedModel();
    p.analysisCases[0].fixedCircle.radius = 3;
    const ready = fixedReady(p);
    const result = calculateFixedCase(ready);
    expect(result.geometry.status).toBe("blocked");
    expect(result.geometry.diagnostics.length).toBeGreaterThan(0);
    expect(result.preparations).toBeNull();
    expect(result.methods).toEqual([]);
    expect(result.identityKey).toBe(ready.identityKey);
  });
});
