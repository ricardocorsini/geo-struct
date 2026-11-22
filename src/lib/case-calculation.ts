import {
  isBishopIterationProfileValid,
  solveBishop,
  type BishopProfile,
  type BishopResult,
} from "../core/bishop";
import type {
  CircularSearchProfile,
  SearchMethod,
} from "../core/circular-search";
import {
  solveFellenius,
  type FelleniusProfile,
  type FelleniusResult,
} from "../core/fellenius";
import {
  isGeometryProfileValid,
  prepareFixedCircleGeometry,
  type FixedCirclePreparation,
  type GeometryProfile,
} from "../core/fixed-circle";
import { freeze } from "../core/immutable";
import type {
  Immutable,
  InputDiagnostic,
  InputPreparation,
} from "../core/input";
import { isEquilibriumProfileValid } from "../core/limit-equilibrium";
import { prepareSearchGrid, type SearchGrid } from "../core/search-grid";
import {
  prepareSliceLoads,
  type SliceLoadPreparation,
} from "../core/slice-loads";
import {
  prepareSliceMechanics,
  type SliceMechanicsPreparation,
} from "../core/slice-mechanics";
import {
  prepareSlicePressures,
  type SlicePressurePreparation,
} from "../core/slice-pressures";
import {
  prepareSliceWeights,
  type SliceWeightPreparation,
} from "../core/slice-weights";
import { prepareCoreInput } from "../domain/core-input";
import type { Project } from "../domain/model";

export type CaseCalculationBlockReason =
  | "draft"
  | "case-required"
  | "input-unavailable"
  | "model-error"
  | "analysis-pending"
  | "material-pending"
  | "conditions-pending"
  | "surface-pending"
  | "profile-pending"
  | "grid-invalid";

type ReadyCase = {
  status: "ready";
  projectId: string;
  caseId: string;
  inputRevision: string;
  /** Inclui o perfil efetivo, que não pertence à revisão de CoreInput. */
  identityKey: string;
  preparation: InputPreparation;
  methods: readonly SearchMethod[];
};

export type FixedCaseReady = Immutable<
  ReadyCase & {
    mode: "fixed";
    profile: {
      geometry: GeometryProfile;
      fellenius: FelleniusProfile | null;
      bishop: BishopProfile | null;
    };
  }
>;

export type SearchCaseReady = Immutable<
  ReadyCase & {
    mode: "search";
    profile: CircularSearchProfile;
    grid: SearchGrid;
  }
>;

export type CaseCalculationReadiness =
  | FixedCaseReady
  | SearchCaseReady
  | Immutable<{
      status: "blocked";
      reason: CaseCalculationBlockReason;
      message: string;
      missingFields: string[];
      preparation: InputPreparation | null;
      diagnostics: InputDiagnostic[];
    }>;

/** Copia os grupos; nunca converte pendência nula em zero ou usa padrões. */
function requiredNumbers<T extends Record<string, number | null>>(
  group: T,
  path: string,
  missingFields: string[],
): { [K in keyof T]: number } {
  for (const [key, value] of Object.entries(group))
    if (value === null) missingFields.push(`${path}.${key}`);
  // Só é consumido após verificar missingFields; os demais limites vêm do schema e núcleo.
  return { ...group } as { [K in keyof T]: number };
}

/** Confere dados aplicados. Pronto não significa admissibilidade ou um FS válido. */
export function getCaseCalculationReadiness(
  project: Project | null,
  caseId: string | null,
  dirty = false,
): CaseCalculationReadiness {
  const blocked = (
    reason: CaseCalculationBlockReason,
    message: string,
    preparation: InputPreparation | null = null,
    missingFields: string[] = [],
  ): CaseCalculationReadiness =>
    freeze({
      status: "blocked" as const,
      reason,
      message,
      missingFields,
      preparation,
      diagnostics: preparation ? [...preparation.diagnostics] : [],
    });
  if (dirty)
    return blocked(
      "draft",
      "Aplique ou descarte os rascunhos antes de calcular o caso.",
    );
  const analysisCase = project?.analysisCases.find((c) => c.id === caseId);
  if (!project || !analysisCase)
    return blocked(
      "case-required",
      "Selecione um caso de análise para calcular.",
    );
  const preparation = prepareCoreInput(project, analysisCase.id);
  if (!preparation.snapshot)
    return blocked(
      "input-unavailable",
      preparation.diagnostics[0]?.message ??
        "A entrada do caso está indisponível.",
      preparation,
    );
  const { input, revision: inputRevision } = preparation.snapshot;
  const modelError = preparation.diagnostics.find((d) => d.level === "error");
  if (modelError)
    return blocked("model-error", modelError.message, preparation);
  const analysisMissing: string[] = [];
  if (!input.analysis.direction) analysisMissing.push("analysis.direction");
  if (!input.analysis.methods.length) analysisMissing.push("analysis.methods");
  if (analysisMissing.length)
    return blocked(
      "analysis-pending",
      "Defina o sentido do movimento e ao menos um método no caso aplicado.",
      preparation,
      analysisMissing,
    );
  const materialMissing: string[] = [];
  if (input.geometry.backgroundMaterialId === null)
    materialMissing.push("geometry.backgroundMaterialId");
  for (const region of input.geometry.regions)
    if (region.materialId === null)
      materialMissing.push(`geometry.regions.${region.id}.materialId`);
  for (const material of input.materials)
    for (const key of [
      "unitWeight",
      "cohesion",
      "frictionDegrees",
      "parameterMode",
    ] as const)
      if (material[key] === null)
        materialMissing.push(`materials.${material.id}.${key}`);
  if (materialMissing.length)
    return blocked(
      "material-pending",
      "Complete as atribuições de material e γ, c, φ e modo resistente dos materiais usados na seção.",
      preparation,
      materialMissing,
    );
  const conditionsMissing: string[] = [];
  if (input.water.mode === "unspecified") conditionsMissing.push("water.mode");
  if (input.water.mode === "piezometric") {
    if (!input.water.line || input.water.line.length < 2)
      conditionsMissing.push("water.line");
    if (input.water.unitWeight === null)
      conditionsMissing.push("water.unitWeight");
  }
  if (input.loads.condition === "unspecified")
    conditionsMissing.push("loads.condition");
  if (input.loads.condition === "loads" && !input.loads.items.length)
    conditionsMissing.push("loads.items");
  for (const load of input.loads.items)
    if (load.q === null) conditionsMissing.push(`loads.${load.id}.q`);
  if (conditionsMissing.length)
    return blocked(
      "conditions-pending",
      "Complete as condições de água e sobrecargas, incluindo os valores ativos.",
      preparation,
      conditionsMissing,
    );
  const surface = input.surface;
  if (surface.mode === null)
    return blocked(
      "surface-pending",
      "Escolha círculo fixo ou busca circular no caso aplicado.",
      preparation,
      ["surface.mode"],
    );
  const common = {
    status: "ready" as const,
    projectId: input.origin.project.id,
    caseId: analysisCase.id,
    inputRevision,
    preparation,
    methods: [...input.analysis.methods],
  };
  const identity = (profile: unknown) =>
    JSON.stringify({
      projectId: common.projectId,
      caseId: common.caseId,
      inputRevision,
      profile,
    });
  const missingFields: string[] = [];
  const saved = analysisCase.numericalProfile;
  if (surface.mode === "fixed") {
    const circleMissing = Object.entries(surface.circle)
      .filter(([, value]) => value === null)
      .map(([key]) => `surface.circle.${key}`);
    if (circleMissing.length)
      return blocked(
        "surface-pending",
        "Complete o centro X/Z e o raio do círculo fixo.",
        preparation,
        circleMissing,
      );
    const profile = {
      geometry: requiredNumbers(saved.geometry, "geometry", missingFields),
      fellenius: input.analysis.methods.includes("fellenius")
        ? requiredNumbers(saved.fellenius, "fellenius", missingFields)
        : null,
      bishop: input.analysis.methods.includes("bishop")
        ? requiredNumbers(saved.bishop, "bishop", missingFields)
        : null,
    };
    if (
      missingFields.length ||
      !isGeometryProfileValid(profile.geometry) ||
      (profile.fellenius && !isEquilibriumProfileValid(profile.fellenius)) ||
      (profile.bishop &&
        (!isEquilibriumProfileValid(profile.bishop) ||
          !isBishopIterationProfileValid(profile.bishop)))
    )
      return blocked(
        "profile-pending",
        "Complete o perfil numérico do círculo fixo e dos métodos selecionados.",
        preparation,
        missingFields,
      );
    return freeze({
      ...common,
      mode: "fixed" as const,
      profile,
      identityKey: identity(profile),
    });
  }
  const profile: CircularSearchProfile = {
    geometry: requiredNumbers(
      saved.search.geometry,
      "search.geometry",
      missingFields,
    ),
    equilibrium: requiredNumbers(
      saved.search.equilibrium,
      "search.equilibrium",
      missingFields,
    ),
    bishop: input.analysis.methods.includes("bishop")
      ? requiredNumbers(saved.search.bishop, "search.bishop", missingFields)
      : null,
    nearTieTolerance: saved.search.nearTieTolerance ?? NaN,
  };
  if (saved.search.nearTieTolerance === null)
    missingFields.push("search.nearTieTolerance");
  if (
    missingFields.length ||
    !isGeometryProfileValid(profile.geometry) ||
    !isEquilibriumProfileValid(profile.equilibrium) ||
    (profile.bishop && !isBishopIterationProfileValid(profile.bishop)) ||
    !Number.isFinite(profile.nearTieTolerance) ||
    profile.nearTieTolerance < 0
  )
    return blocked(
      "profile-pending",
      "Complete o perfil numérico da busca e dos métodos selecionados.",
      preparation,
      missingFields,
    );
  const grid = prepareSearchGrid(surface.axes, profile.geometry.toleranceM);
  if (grid.status === "blocked")
    return blocked("grid-invalid", grid.message, preparation, ["surface.axes"]);
  return freeze({
    ...common,
    mode: "search" as const,
    profile,
    grid: grid.grid,
    identityKey: identity(profile),
  });
}

export type FixedCaseCalculation = Immutable<{
  projectId: string;
  caseId: string;
  inputRevision: string;
  identityKey: string;
  profile: FixedCaseReady["profile"];
  preparation: InputPreparation;
  geometry: FixedCirclePreparation;
  preparations: {
    weights: SliceWeightPreparation;
    pressures: SlicePressurePreparation;
    loads: SliceLoadPreparation;
    mechanics: SliceMechanicsPreparation;
  } | null;
  methods: (FelleniusResult | BishopResult)[];
}>;

/** Prepara uma vez por execução; os métodos recebem a mesma entrada mecânica. */
export function calculateFixedCase(
  ready: FixedCaseReady,
): FixedCaseCalculation {
  const { preparation, profile } = ready;
  const geometry = prepareFixedCircleGeometry(preparation, profile.geometry);
  const common = {
    projectId: ready.projectId,
    caseId: ready.caseId,
    inputRevision: ready.inputRevision,
    identityKey: ready.identityKey,
    profile,
    preparation,
    geometry,
  };
  const methods: (FelleniusResult | BishopResult)[] = [];
  if (geometry.status !== "prepared")
    return freeze({ ...common, preparations: null, methods });
  const weights = prepareSliceWeights(preparation, geometry);
  const pressures = prepareSlicePressures(preparation, geometry);
  const loads = prepareSliceLoads(preparation, geometry);
  const mechanics = prepareSliceMechanics(preparation, geometry, {
    weights,
    pressures,
    loads,
  });
  if (mechanics.status === "prepared")
    for (const method of ready.methods)
      methods.push(
        method === "fellenius"
          ? solveFellenius(preparation, mechanics, profile.fellenius!)
          : solveBishop(preparation, mechanics, profile.bishop!),
      );
  return freeze({
    ...common,
    preparations: { weights, pressures, loads, mechanics },
    methods,
  });
}
