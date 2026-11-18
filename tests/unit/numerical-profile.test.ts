import { describe, expect, it } from "vitest";
import { isBishopIterationProfileValid } from "../../src/core/bishop";
import { isGeometryProfileValid } from "../../src/core/fixed-circle";
import { isEquilibriumProfileValid } from "../../src/core/limit-equilibrium";
import {
  addAnalysisCase,
  duplicateSectionWithCases,
} from "../../src/domain/analysis";
import {
  DEFAULT_PROJECT_PROFILE,
  defaultProject,
} from "../../src/domain/default-project";
import { commit, history, redo, undo } from "../../src/domain/history";
import {
  emptyNumericalProfile,
  newProject,
  numericalProfileSchema,
  projectSchema,
  readProject,
  serializeProject,
} from "../../src/domain/model";

function legacyV4() {
  const project = defaultProject();
  return {
    ...project,
    version: 4,
    analysisCases: project.analysisCases.map(({ numericalProfile, ...c }) => c),
  };
}

describe("Perfil numérico por caso", () => {
  it("cria grupos independentes e pendentes, preservando a abertura existente de 3°", () => {
    const empty = emptyNumericalProfile();
    expect(empty).toEqual({
      geometry: { toleranceM: null, maxArcDegrees: 3 },
      fellenius: { drivingThresholdKNPerM: null, tensionToleranceKPa: null },
      bishop: {
        drivingThresholdKNPerM: null,
        tensionToleranceKPa: null,
        initialFactor: null,
        residualTolerance: null,
        maxIterations: null,
        singularityThreshold: null,
      },
      search: {
        geometry: { toleranceM: null, maxArcDegrees: 3 },
        equilibrium: {
          drivingThresholdKNPerM: null,
          tensionToleranceKPa: null,
        },
        bishop: {
          initialFactor: null,
          residualTolerance: null,
          maxIterations: null,
          singularityThreshold: null,
        },
        nearTieTolerance: null,
      },
    });
    const project = newProject("Perfis independentes");
    const first = addAnalysisCase(project, project.sections[0].id);
    const second = addAnalysisCase(first.project, project.sections[0].id);
    first.analysisCase.numericalProfile.geometry.maxArcDegrees = 1;
    expect(
      first.analysisCase.numericalProfile.search.geometry.maxArcDegrees,
    ).toBe(3);
    expect(second.analysisCase.numericalProfile).toEqual(empty);
    expect(readProject(serializeProject(second.project)).project).toEqual(
      second.project,
    );
  });

  it("salva a precisão e os parâmetros independentes de cada modo e método", () => {
    const project = defaultProject();
    const [search, fixed] = project.analysisCases;
    search.numericalProfile.geometry.toleranceM = 0.0000123456789;
    search.numericalProfile.fellenius.drivingThresholdKNPerM = 0.02;
    search.numericalProfile.bishop.drivingThresholdKNPerM = 0.03;
    search.numericalProfile.search.equilibrium.drivingThresholdKNPerM = 0.04;
    search.numericalProfile.bishop.initialFactor = 1.2;
    search.numericalProfile.search.bishop.initialFactor = 1.7;
    search.numericalProfile.search.nearTieTolerance = 0.005;
    fixed.numericalProfile.geometry.maxArcDegrees = 1.5;
    fixed.numericalProfile.search.bishop.initialFactor = null;
    const before = structuredClone(project);

    const reopened = readProject(serializeProject(project));
    expect(reopened).toEqual({ project: before, migrated: false });
    expect(project).toEqual(before);
    expect(reopened.project.version).toBe(5);
    expect(
      reopened.project.analysisCases[0].numericalProfile.geometry.toleranceM,
    ).toBe(0.0000123456789);
    expect(fixed.numericalProfile.search.geometry).toEqual(
      DEFAULT_PROJECT_PROFILE.geometry,
    );
  });

  it("preenche o exemplo sem compartilhar os grupos entre casos ou aberturas", () => {
    const project = defaultProject();
    for (const c of project.analysisCases) {
      expect(c.numericalProfile).toEqual({
        geometry: DEFAULT_PROJECT_PROFILE.geometry,
        fellenius: DEFAULT_PROJECT_PROFILE.equilibrium,
        bishop: {
          ...DEFAULT_PROJECT_PROFILE.equilibrium,
          ...DEFAULT_PROJECT_PROFILE.bishop,
        },
        search: DEFAULT_PROJECT_PROFILE,
      });
    }
    const original = structuredClone(project.analysisCases[0].numericalProfile);
    const changed = project.analysisCases[1].numericalProfile;
    changed.geometry.toleranceM = 0.01;
    changed.bishop.maxIterations = 2;
    changed.search.geometry.maxArcDegrees = 2;
    expect(project.analysisCases[0].numericalProfile).toEqual(original);
    expect(defaultProject().analysisCases[0].numericalProfile).toEqual(
      original,
    );
  });

  it("duplica caso e seção com configurações próprias, mantendo o histórico completo", () => {
    const project = defaultProject();
    const c = project.analysisCases[0];
    c.numericalProfile.search.nearTieTolerance = 0.005;
    const duplicated = addAnalysisCase(project, c.sectionId, c.id);
    expect(duplicated.analysisCase.numericalProfile).toEqual(
      c.numericalProfile,
    );
    duplicated.analysisCase.numericalProfile.search.nearTieTolerance = 0.02;
    expect(
      duplicated.project.analysisCases[0].numericalProfile.search
        .nearTieTolerance,
    ).toBe(0.005);

    const sectionCopy = duplicateSectionWithCases(project, c.sectionId);
    const copiedCases = sectionCopy.project.analysisCases.filter(
      (item) => item.sectionId === sectionCopy.section.id,
    );
    expect(copiedCases.map((item) => item.numericalProfile)).toEqual(
      project.analysisCases.map((item) => item.numericalProfile),
    );
    copiedCases[0].numericalProfile.search.bishop.maxIterations = 5;
    expect(c.numericalProfile.search.bishop.maxIterations).toBe(100);

    const edited = structuredClone(project);
    edited.analysisCases[0].numericalProfile.search.bishop.maxIterations = 50;
    const h = commit(history(project), edited);
    expect(undo(h).present).toEqual(project);
    expect(redo(undo(h)).present).toEqual(edited);
    expect(
      readProject(serializeProject(redo(undo(h)).present)).project,
    ).toEqual(edited);
  });
});

describe("Validação dos parâmetros persistidos", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "recusa tolerância geométrica inválida %s nos dois modos",
    (value) => {
      const profile = emptyNumericalProfile();
      profile.geometry.toleranceM = value;
      expect(numericalProfileSchema.safeParse(profile).success).toBe(false);
      profile.geometry.toleranceM = null;
      profile.search.geometry.toleranceM = value;
      expect(numericalProfileSchema.safeParse(profile).success).toBe(false);
    },
  );

  it.each([
    ["geometry", "maxArcDegrees", 0],
    ["geometry", "maxArcDegrees", 3.00001],
    ["fellenius", "drivingThresholdKNPerM", -0.1],
    ["fellenius", "tensionToleranceKPa", Number.POSITIVE_INFINITY],
    ["bishop", "drivingThresholdKNPerM", -0.1],
    ["bishop", "tensionToleranceKPa", -0.1],
    ["bishop", "initialFactor", 0],
    ["bishop", "residualTolerance", 0],
    ["bishop", "maxIterations", 0],
    ["bishop", "maxIterations", 1001],
    ["bishop", "maxIterations", 1.5],
    ["bishop", "singularityThreshold", -0.1],
  ] as const)(
    "recusa %s.%s = %s mesmo com o método inativo",
    (group, field, value) => {
      const project = defaultProject();
      const c = project.analysisCases[0];
      c.methods = ["fellenius"];
      c.surfaceMode = "search";
      Object.assign(c.numericalProfile[group], { [field]: value });
      expect(projectSchema.safeParse(project).success).toBe(false);
      expect(() => serializeProject(project)).toThrow();
    },
  );

  it.each([
    ["geometry", "maxArcDegrees", 3.1],
    ["equilibrium", "drivingThresholdKNPerM", -1],
    ["equilibrium", "tensionToleranceKPa", -1],
    ["bishop", "initialFactor", 0],
    ["bishop", "residualTolerance", -1],
    ["bishop", "maxIterations", 1001],
    ["bishop", "maxIterations", 1.25],
    ["bishop", "singularityThreshold", -1],
  ] as const)(
    "recusa search.%s.%s = %s com círculo fixo ativo",
    (group, field, value) => {
      const project = defaultProject();
      const c = project.analysisCases[1];
      Object.assign(c.numericalProfile.search[group], { [field]: value });
      expect(() => readProject(JSON.stringify(project))).toThrow(
        /numericalProfile/,
      );
    },
  );

  it("recusa quase empate negativo, strings, campos ausentes e extras em cada grupo", () => {
    const valid = emptyNumericalProfile();
    const invalid: unknown[] = [
      { ...valid, unknown: 1 },
      { ...valid, geometry: { ...valid.geometry, toleranceM: "0,001" } },
      { ...valid, geometry: { toleranceM: null } },
      { ...valid, fellenius: { ...valid.fellenius, unknown: 1 } },
      { ...valid, bishop: { ...valid.bishop, unknown: 1 } },
      { ...valid, search: { ...valid.search, unknown: 1 } },
      {
        ...valid,
        search: {
          ...valid.search,
          geometry: { ...valid.search.geometry, unknown: 1 },
        },
      },
      {
        ...valid,
        search: {
          ...valid.search,
          equilibrium: { ...valid.search.equilibrium, unknown: 1 },
        },
      },
      { ...valid, search: { ...valid.search, bishop: null } },
      {
        ...valid,
        search: {
          ...valid.search,
          bishop: { ...valid.search.bishop, unknown: 1 },
        },
      },
      { ...valid, search: { ...valid.search, nearTieTolerance: -0.1 } },
      { ...valid, search: { ...valid.search, nearTieTolerance: Number.NaN } },
    ];
    for (const value of invalid)
      expect(numericalProfileSchema.safeParse(value).success).toBe(false);
    const encoded = serializeProject(defaultProject()).replace(
      '"toleranceM": 1e-8',
      '"toleranceM": 1e999',
    );
    expect(() => readProject(encoded)).toThrow(/numericalProfile/);
  });

  it("usa os mesmos limites dos perfis do núcleo para dados completos", () => {
    const profile = defaultProject().analysisCases[0].numericalProfile;
    for (const value of [0, 1e-8, 0.5, Number.POSITIVE_INFINITY]) {
      const geometry = { toleranceM: value, maxArcDegrees: 3 };
      expect(
        numericalProfileSchema.shape.geometry.safeParse(geometry).success,
      ).toBe(isGeometryProfileValid(geometry));
      const equilibrium = {
        drivingThresholdKNPerM: value,
        tensionToleranceKPa: value,
      };
      expect(
        numericalProfileSchema.shape.fellenius.safeParse(equilibrium).success,
      ).toBe(isEquilibriumProfileValid(equilibrium));
    }
    for (const value of [0, 1, 1.5, 1000, 1001, Number.NaN]) {
      const bishop = {
        initialFactor: 1.4,
        residualTolerance: 1e-8,
        maxIterations: value,
        singularityThreshold: 0,
      };
      expect(
        numericalProfileSchema.shape.search.shape.bishop.safeParse(bishop)
          .success,
      ).toBe(isBishopIterationProfileValid(bishop));
    }
    profile.geometry.maxArcDegrees = 3;
    profile.bishop.maxIterations = 1000;
    profile.search.bishop.maxIterations = 1000;
    profile.search.nearTieTolerance = 0;
    expect(numericalProfileSchema.safeParse(profile).success).toBe(true);
  });
});

describe("Migração estrita de geostruct/4", () => {
  it("conserva casos, desenho e referências, acrescentando somente perfis pendentes", () => {
    const old = legacyV4();
    const before = structuredClone(old);
    const { project, migrated } = readProject(JSON.stringify(old));
    expect(migrated).toBe(true);
    expect(project).toEqual({
      ...old,
      version: 5,
      analysisCases: old.analysisCases.map((c) => ({
        ...c,
        numericalProfile: emptyNumericalProfile(),
      })),
    });
    expect(old).toEqual(before);
    project.analysisCases[0].numericalProfile.search.geometry.toleranceM = 0.01;
    expect(
      project.analysisCases[1].numericalProfile.search.geometry.toleranceM,
    ).toBeNull();
    expect(readProject(serializeProject(project))).toEqual({
      project,
      migrated: false,
    });
  });

  it("recusa perfil novo, campo desconhecido e referência inválida em arquivo v4", () => {
    const old = legacyV4();
    const invalid = [
      { ...old, unknown: 1 },
      {
        ...old,
        analysisCases: [
          {
            ...old.analysisCases[0],
            numericalProfile: emptyNumericalProfile(),
          },
        ],
      },
      { ...old, analysisCases: [{ ...old.analysisCases[0], unknown: 1 }] },
      {
        ...old,
        analysisCases: [{ ...old.analysisCases[0], sectionId: "inexistente" }],
      },
      {
        ...old,
        analysisCases: [{ ...old.analysisCases[0], loadIds: ["inexistente"] }],
      },
    ];
    for (const value of invalid)
      expect(() => readProject(JSON.stringify(value))).toThrow(/inválido/);
  });

  it("exige perfil no formato 5 sem migrar silenciosamente arquivo incompleto", () => {
    const old = legacyV4();
    expect(() => readProject(JSON.stringify({ ...old, version: 5 }))).toThrow(
      /numericalProfile/,
    );
    const empty = { ...old, analysisCases: [] };
    expect(readProject(JSON.stringify(empty))).toEqual({
      project: { ...empty, version: 5 },
      migrated: true,
    });
  });
});
