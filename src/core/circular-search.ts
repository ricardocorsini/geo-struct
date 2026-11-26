import type { Circle } from "./circle-geometry";
import type { CoreInput, Immutable, InputPreparation } from "./input";
import { freeze } from "./immutable";
import {
  isGeometryProfileValid,
  prepareFixedCircleGeometry,
  type GeometryProfile,
} from "./fixed-circle";
import {
  MAX_BISHOP_ITERATIONS,
  isBishopIterationProfileValid,
  solveBishop,
  type BishopIterationProfile,
  type BishopResult,
} from "./bishop";
import { solveFellenius, type FelleniusResult } from "./fellenius";
import {
  isEquilibriumProfileValid,
  type EquilibriumProfile,
  type EquilibriumDiagnostic,
} from "./limit-equilibrium";
import { prepareSliceWeights } from "./slice-weights";
import { prepareSlicePressures } from "./slice-pressures";
import { prepareSliceLoads } from "./slice-loads";
import { prepareSliceMechanics } from "./slice-mechanics";
import {
  MAX_SEARCH_CANDIDATES,
  prepareSearchGrid,
  searchLocation,
  SEARCH_AXES,
  type SearchAxis,
  type SearchBounds,
  type SearchGrid,
  type SearchLocation,
} from "./search-grid";

export type SearchMethod = CoreInput["analysis"]["methods"][number];
export type CircularSearchProfile = {
  geometry: GeometryProfile;
  equilibrium: EquilibriumProfile;
  bishop: BishopIterationProfile | null;
  nearTieTolerance: number;
};
export type RefinementConfig = {
  stages: number;
  topRegions: number;
  subdivisionFactor: number;
  maxTotalCandidates: number;
};
export type RefinementRegionRecord = Immutable<{
  stage: number;
  regionIndex: number;
  seedCircle: Circle | null;
  bounds: SearchBounds;
  evaluatedCount: number;
  reusedCount: number;
}>;
export type SolverResult = BishopResult | FelleniusResult;
type SearchStage =
  | "geometry"
  | "limits"
  | "weights"
  | "pressures"
  | "loads"
  | "mechanics"
  | SearchMethod;
type SearchIssue = Immutable<EquilibriumDiagnostic & { stage: SearchStage }>;
type IssueSummary = SearchIssue & { readonly occurrences: number };
type ReasonCount = {
  stage: SearchStage;
  code: string;
  level: "error" | "warning";
  message: string;
  count: number;
};
export type SearchMethodResult = Immutable<{
  method: SearchMethod;
  status: SolverResult["status"];
  factorOfSafety: number | null;
  evaluations: number | null;
  residual: number | null;
}>;
export type SearchCandidate = Immutable<{
  location: SearchLocation;
  sliceCount: number | null;
  entryX: number | null;
  exitX: number | null;
  filteredOut: boolean;
  methods: SearchMethodResult[];
  issues: IssueSummary[];
}>;
export type SearchRanking = Immutable<{
  method: SearchMethod;
  status: "minimum" | "no-surface" | "no-factor";
  minimum: {
    location: SearchLocation;
    factorOfSafety: number;
    boundaryAxes: SearchAxis[];
  } | null;
  eligible: number;
  zeroResistance: number;
  failed: number;
  ties: { number: number; difference: number }[];
}>;
export type CircularSearchResult = Immutable<
  {
    contract: "geostruct-circular-search/1";
    inputRevision: string | null;
    profile: CircularSearchProfile;
  } & (
    | { status: "blocked"; diagnostic: { code: string; message: string } }
    | {
        status: "completed";
        origin: CoreInput["origin"];
        direction: NonNullable<CoreInput["analysis"]["direction"]>;
        grid: SearchGrid;
        candidates: SearchCandidate[];
        geometricCount: number;
        filteredCount: number;
        rankings: SearchRanking[];
        reasons: ReasonCount[];
        refinement?: {
          config: RefinementConfig;
          regions: RefinementRegionRecord[];
          budgetReached: boolean;
          uniqueEvaluated: number;
        };
      }
  )
>;
export type SearchProgress = { completed: number; total: number };

type StageDiagnostic = Omit<EquilibriumDiagnostic, "level"> & {
  level?: EquilibriumDiagnostic["level"];
};
function collectIssues(
  stage: SearchStage,
  diagnostics: readonly StageDiagnostic[],
): SearchIssue[] {
  return diagnostics.map((d) => ({ ...d, stage, level: d.level ?? "error" }));
}

/** Usa as mesmas etapas do círculo fixo, com uma revisão própria do candidato. */
export function evaluateSearchCircle(
  preparation: InputPreparation,
  profile: CircularSearchProfile,
  location: SearchLocation,
) {
  if (
    !preparation.snapshot ||
    preparation.snapshot.input.surface.mode !== "search"
  )
    throw new Error("Entrada de busca circular indisponível.");
  const input: CoreInput = {
    ...preparation.snapshot.input,
    surface: { mode: "fixed", circle: location.circle },
  };
  const fixed: InputPreparation = {
    ...preparation,
    snapshot: { input, revision: JSON.stringify(input) },
  };
  const geometry = prepareFixedCircleGeometry(fixed, profile.geometry);
  const methods: SolverResult[] = [];
  const issues = collectIssues("geometry", geometry.diagnostics);
  if (geometry.status !== "prepared")
    return {
      location,
      geometry,
      entryX: null,
      exitX: null,
      filteredOut: false,
      preparations: null,
      methods,
      issues,
    };

  const minX = geometry.geometry.slices[0].left.x;
  const maxX = geometry.geometry.slices.at(-1)!.right.x;
  const entryX = input.analysis.direction === "right-to-left" ? maxX : minX;
  const exitX = input.analysis.direction === "right-to-left" ? minX : maxX;
  const { limits } = preparation.snapshot.input.surface;
  const tol = profile.geometry.toleranceM;
  if (
    limits.entry.min !== null &&
    limits.entry.max !== null &&
    (entryX < limits.entry.min - tol || entryX > limits.entry.max + tol)
  ) {
    issues.push({
      stage: "limits",
      code: "entry-outside-limit",
      level: "error",
      message:
        "Entrada da superfície fora do trecho admissível definido no caso.",
    });
  }
  if (
    limits.exit.min !== null &&
    limits.exit.max !== null &&
    (exitX < limits.exit.min - tol || exitX > limits.exit.max + tol)
  ) {
    issues.push({
      stage: "limits",
      code: "exit-outside-limit",
      level: "error",
      message:
        "Saída da superfície fora do trecho admissível definido no caso.",
    });
  }
  if (issues.some((i) => i.stage === "limits")) {
    return {
      location,
      geometry,
      entryX,
      exitX,
      filteredOut: true,
      preparations: null,
      methods,
      issues,
    };
  }

  const weights = prepareSliceWeights(fixed, geometry);
  const pressures = prepareSlicePressures(fixed, geometry);
  const loads = prepareSliceLoads(fixed, geometry);
  const mechanics = prepareSliceMechanics(fixed, geometry, {
    weights,
    pressures,
    loads,
  });
  issues.push(
    ...collectIssues("weights", weights.diagnostics),
    ...collectIssues("pressures", pressures.diagnostics),
    ...collectIssues("loads", loads.diagnostics),
  );
  // Quando uma dependência falha, seus diagnósticos explicam o bloqueio real.
  if (issues.length === 0)
    issues.push(...collectIssues("mechanics", mechanics.diagnostics));
  if (mechanics.status === "prepared") {
    for (const method of input.analysis.methods) {
      const result =
        method === "fellenius"
          ? solveFellenius(fixed, mechanics, profile.equilibrium)
          : solveBishop(fixed, mechanics, {
              ...profile.equilibrium,
              ...profile.bishop!,
            });
      methods.push(result);
      issues.push(...collectIssues(method, result.diagnostics));
    }
  }
  return {
    location,
    geometry,
    entryX,
    exitX,
    filteredOut: false,
    preparations: { weights, pressures, loads, mechanics },
    methods,
    issues,
  };
}

export type SearchCircleEvaluation = ReturnType<typeof evaluateSearchCircle>;

function reasonKey(issue: SearchIssue): string {
  return `${issue.stage}:${issue.code}:${issue.level}`;
}

function summarizeCandidate(
  evaluation: SearchCircleEvaluation,
): SearchCandidate {
  const grouped = new Map<string, IssueSummary>();
  for (const issue of evaluation.issues) {
    const key = reasonKey(issue);
    const first = grouped.get(key);
    grouped.set(
      key,
      first
        ? { ...first, occurrences: first.occurrences + 1 }
        : { ...issue, occurrences: 1 },
    );
  }
  return {
    location: evaluation.location,
    sliceCount: evaluation.geometry.geometry?.slices.length ?? null,
    entryX: evaluation.entryX,
    exitX: evaluation.exitX,
    filteredOut: evaluation.filteredOut,
    methods: evaluation.methods.map((r) => ({
      method: r.method,
      status: r.status,
      factorOfSafety: r.factorOfSafety,
      evaluations: r.method === "bishop" ? r.iterations.length : null,
      residual:
        r.method === "bishop"
          ? (r.calculation?.evaluation?.residual ?? null)
          : null,
    })),
    issues: [...grouped.values()],
  };
}

type SampledExtents = Record<
  SearchAxis,
  { min: number; max: number; variable: boolean; toleranceM: number }
>;

export function rankSearchCandidates(
  candidates: readonly SearchCandidate[],
  grid: SearchGrid,
  method: SearchMethod,
  nearTieTolerance: number,
  sampledExtents?: SampledExtents,
): SearchRanking {
  const valid: { location: SearchLocation; factorOfSafety: number }[] = [];
  let minimum: (typeof valid)[number] | null = null;
  let geometric = 0,
    zeroResistance = 0,
    failed = 0;
  for (const candidate of candidates) {
    if (candidate.sliceCount === null || candidate.filteredOut) continue;
    geometric++;
    const result = candidate.methods.find((r) => r.method === method);
    if (result?.status === "zero-resistance") {
      zeroResistance++;
      continue;
    }
    if (
      result?.status !== "calculated" ||
      result.factorOfSafety === null ||
      !Number.isFinite(result.factorOfSafety) ||
      result.factorOfSafety <= 0
    ) {
      failed++;
      continue;
    }
    const entry = {
      location: candidate.location,
      factorOfSafety: result.factorOfSafety,
    };
    valid.push(entry);
    if (
      !minimum ||
      entry.factorOfSafety < minimum.factorOfSafety ||
      (entry.factorOfSafety === minimum.factorOfSafety &&
        entry.location.number < minimum.location.number)
    )
      minimum = entry;
  }
  const counts = { method, eligible: valid.length, zeroResistance, failed };
  if (!minimum)
    return {
      ...counts,
      status: geometric === 0 ? "no-surface" : "no-factor",
      minimum: null,
      ties: [],
    };
  const best = minimum;
  const boundaryAxes = SEARCH_AXES.filter((key) => {
    if (sampledExtents) {
      const ext = sampledExtents[key];
      if (!ext.variable) return false;
      const circleCoord =
        key === "x"
          ? best.location.circle.x
          : key === "z"
            ? best.location.circle.z
            : best.location.circle.radius;
      return (
        Math.abs(circleCoord - ext.min) <= ext.toleranceM ||
        Math.abs(circleCoord - ext.max) <= ext.toleranceM
      );
    }
    const axis = grid.axes[key],
      index = best.location.indices[key];
    return (
      axis.min !== axis.max && (index === 0 || index === axis.values.length - 1)
    );
  });
  const ties = valid.flatMap(({ location, factorOfSafety }) => {
    const difference = factorOfSafety - best.factorOfSafety;
    return location.number !== best.location.number &&
      difference <= nearTieTolerance
      ? [{ number: location.number, difference }]
      : [];
  });
  return {
    ...counts,
    status: "minimum",
    minimum: { ...best, boundaryAxes },
    ties,
  };
}

function validateSearchInput(
  preparation: InputPreparation,
  profile: CircularSearchProfile,
) {
  const input = preparation.snapshot?.input;
  const error = preparation.diagnostics.find((d) => d.level === "error");
  if (error)
    return { ok: false as const, code: "model-error", message: error.message };
  if (
    !input ||
    input.contract !== "geostruct-input/1" ||
    input.surface.mode !== "search"
  )
    return {
      ok: false as const,
      code: "search-required",
      message: "Aplique um caso configurado para busca circular.",
    };
  if (!input.analysis.direction || !input.analysis.methods.length)
    return {
      ok: false as const,
      code: "missing-analysis",
      message: "Defina o sentido e ao menos um método no caso aplicado.",
    };
  if (
    input.water.mode === "unspecified" ||
    input.loads.condition === "unspecified" ||
    (input.loads.condition === "loads" && input.loads.items.length === 0)
  )
    return {
      ok: false as const,
      code: "conditions-pending",
      message: "Defina a água e as sobrecargas no caso aplicado.",
    };
  if (
    input.water.mode === "piezometric" &&
    (!input.water.line ||
      input.water.line.length < 2 ||
      input.water.unitWeight === null ||
      !Number.isFinite(input.water.unitWeight) ||
      input.water.unitWeight <= 0)
  )
    return {
      ok: false as const,
      code: "water-pending",
      message: "Informe a linha piezométrica e o peso específico da água.",
    };
  if (!isGeometryProfileValid(profile.geometry))
    return {
      ok: false as const,
      code: "invalid-profile",
      message:
        "Informe tolerância geométrica positiva e abertura angular maior que zero e de até 3°.",
    };
  if (!isEquilibriumProfileValid(profile.equilibrium))
    return {
      ok: false as const,
      code: "invalid-profile",
      message:
        "Informe limiar motriz e tolerância de tração finitos e não negativos.",
    };
  if (
    !Number.isFinite(profile.nearTieTolerance) ||
    profile.nearTieTolerance < 0
  )
    return {
      ok: false as const,
      code: "invalid-profile",
      message: "Informe uma faixa de quase empate finita e não negativa.",
    };
  if (
    input.analysis.methods.includes("bishop") &&
    (!profile.bishop || !isBishopIterationProfileValid(profile.bishop))
  )
    return {
      ok: false as const,
      code: "invalid-profile",
      message: `Informe F₀ e τF finitos e positivos, K inteiro de 1 a ${MAX_BISHOP_ITERATIONS} e τm finito não negativo.`,
    };
  const plan = prepareSearchGrid(
    input.surface.axes,
    profile.geometry.toleranceM,
  );
  if (plan.status === "blocked")
    return { ok: false as const, code: plan.code, message: plan.message };
  return {
    ok: true as const,
    input: input as CoreInput & {
      surface: Extract<CoreInput["surface"], { mode: "search" }>;
    },
    grid: plan.grid,
  };
}

function recordReasons(
  reasons: Map<string, ReasonCount>,
  issues: SearchCandidate["issues"],
) {
  for (const issue of issues) {
    const key = reasonKey(issue);
    const row = reasons.get(key);
    if (row) row.count++;
    else
      reasons.set(key, {
        stage: issue.stage,
        code: issue.code,
        level: issue.level,
        message: issue.message,
        count: 1,
      });
  }
}

/** Avalia a malha inteira. Cancelamento da execução fica no Worker que hospeda o núcleo. */
export function runCircularSearch(
  preparation: InputPreparation,
  profile: CircularSearchProfile,
  onProgress?: (progress: SearchProgress) => void,
): CircularSearchResult {
  const common = {
    contract: "geostruct-circular-search/1" as const,
    inputRevision: preparation.snapshot?.revision ?? null,
    profile: structuredClone(profile),
  };
  const blocked = (code: string, message: string): CircularSearchResult =>
    freeze({
      ...common,
      status: "blocked" as const,
      diagnostic: { code, message },
    });
  const check = validateSearchInput(preparation, profile);
  if (!check.ok) return blocked(check.code, check.message);

  const { input, grid } = check;
  const candidates: SearchCandidate[] = [];
  const reasons = new Map<string, ReasonCount>();
  let geometricCount = 0;
  let filteredCount = 0;
  onProgress?.({ completed: 0, total: grid.total });
  for (let number = 1; number <= grid.total; number++) {
    const location = searchLocation(grid, number);
    const candidate = summarizeCandidate(
      evaluateSearchCircle(preparation, profile, location),
    );
    candidates.push(candidate);
    if (candidate.filteredOut) filteredCount++;
    else if (candidate.sliceCount !== null) geometricCount++;
    recordReasons(reasons, candidate.issues);
    onProgress?.({ completed: number, total: grid.total });
  }
  return freeze({
    ...common,
    status: "completed" as const,
    origin: structuredClone(input.origin),
    direction: input.analysis.direction!,
    grid,
    candidates,
    geometricCount,
    filteredCount,
    rankings: input.analysis.methods.map((method) =>
      rankSearchCandidates(candidates, grid, method, profile.nearTieTolerance),
    ),
    reasons: [...reasons.values()],
  });
}

function circleKey(circle: Circle, toleranceM: number): string {
  const q = (v: number) => Math.round(v / toleranceM);
  return `${q(circle.x)}:${q(circle.z)}:${q(circle.radius)}`;
}

function pickRefinementSeeds(
  candidates: readonly SearchCandidate[],
  primaryMethod: SearchMethod,
  topRegions: number,
  currentSteps: Record<SearchAxis, number | null>,
): SearchCandidate[] {
  const eligible = candidates
    .filter((c) => !c.filteredOut && c.sliceCount !== null)
    .map((c) => ({
      candidate: c,
      fs: c.methods.find((m) => m.method === primaryMethod)?.factorOfSafety,
    }))
    .filter(
      (item): item is { candidate: SearchCandidate; fs: number } =>
        item.fs !== null &&
        item.fs !== undefined &&
        Number.isFinite(item.fs) &&
        item.fs > 0,
    )
    .sort((a, b) =>
      a.fs !== b.fs
        ? a.fs - b.fs
        : a.candidate.location.number - b.candidate.location.number,
    )
    .map((item) => item.candidate);

  const chosen: SearchCandidate[] = [];
  for (const item of eligible) {
    if (chosen.length >= topRegions) break;
    const farEnough = chosen.every((seed) =>
      SEARCH_AXES.some((axis) => {
        const step = currentSteps[axis];
        if (!step) return false;
        const coordA =
          axis === "x"
            ? item.location.circle.x
            : axis === "z"
              ? item.location.circle.z
              : item.location.circle.radius;
        const coordB =
          axis === "x"
            ? seed.location.circle.x
            : axis === "z"
              ? seed.location.circle.z
              : seed.location.circle.radius;
        return Math.abs(coordA - coordB) >= step * 0.99;
      }),
    );
    if (farEnough) chosen.push(item);
  }
  if (chosen.length < topRegions) {
    for (const item of eligible) {
      if (chosen.length >= topRegions) break;
      if (!chosen.includes(item)) chosen.push(item);
    }
  }
  return chosen;
}

/** Refinamento determinístico de várias regiões candidatas com orçamento explícito. */
export function runRefinedCircularSearch(
  preparation: InputPreparation,
  profile: CircularSearchProfile,
  config: RefinementConfig,
  onProgress?: (progress: SearchProgress) => void,
): CircularSearchResult {
  const common = {
    contract: "geostruct-circular-search/1" as const,
    inputRevision: preparation.snapshot?.revision ?? null,
    profile: structuredClone(profile),
  };
  const blocked = (code: string, message: string): CircularSearchResult =>
    freeze({
      ...common,
      status: "blocked" as const,
      diagnostic: { code, message },
    });
  if (
    !Number.isInteger(config.stages) ||
    config.stages < 2 ||
    config.stages > 5 ||
    !Number.isInteger(config.topRegions) ||
    config.topRegions < 1 ||
    config.topRegions > 5 ||
    !Number.isInteger(config.subdivisionFactor) ||
    config.subdivisionFactor < 2 ||
    config.subdivisionFactor > 4 ||
    !Number.isInteger(config.maxTotalCandidates) ||
    config.maxTotalCandidates < 1 ||
    config.maxTotalCandidates > MAX_SEARCH_CANDIDATES
  ) {
    return blocked(
      "invalid-refinement",
      `Configure etapas (2 a 5), regiões (1 a 5), subdivisão (2 a 4) e orçamento (1 a ${MAX_SEARCH_CANDIDATES}).`,
    );
  }

  const check = validateSearchInput(preparation, profile);
  if (!check.ok) return blocked(check.code, check.message);
  const { input, grid: baseGrid } = check;
  if (baseGrid.total > config.maxTotalCandidates) {
    return blocked(
      "refinement-budget",
      `A malha inicial (${baseGrid.total}) excede o orçamento máximo (${config.maxTotalCandidates}). Aumente o orçamento ou reduza a malha inicial.`,
    );
  }

  const tol = profile.geometry.toleranceM;
  const candidates: SearchCandidate[] = [];
  const seen = new Set<string>();
  const reasons = new Map<string, ReasonCount>();
  const regions: RefinementRegionRecord[] = [];
  let geometricCount = 0;
  let filteredCount = 0;
  let budgetReached = false;

  const evalPoint = (
    location: SearchLocation,
  ): "evaluated" | "reused" | "budget" => {
    const key = circleKey(location.circle, tol);
    if (seen.has(key)) return "reused";
    if (candidates.length >= config.maxTotalCandidates) {
      budgetReached = true;
      return "budget";
    }
    seen.add(key);
    const sequentialLocation: SearchLocation = {
      ...location,
      number: candidates.length + 1,
    };
    const candidate = summarizeCandidate(
      evaluateSearchCircle(preparation, profile, sequentialLocation),
    );
    candidates.push(candidate);
    if (candidate.filteredOut) filteredCount++;
    else if (candidate.sliceCount !== null) geometricCount++;
    recordReasons(reasons, candidate.issues);
    onProgress?.({
      completed: candidates.length,
      total: config.maxTotalCandidates,
    });
    return "evaluated";
  };

  onProgress?.({ completed: 0, total: config.maxTotalCandidates });
  let stage1Eval = 0;
  for (let n = 1; n <= baseGrid.total; n++) {
    const status = evalPoint(searchLocation(baseGrid, n));
    if (status === "evaluated") stage1Eval++;
  }
  regions.push({
    stage: 1,
    regionIndex: 1,
    seedCircle: null,
    bounds: structuredClone(input.surface.axes),
    evaluatedCount: stage1Eval,
    reusedCount: 0,
  });

  const primaryMethod: SearchMethod = input.analysis.methods.includes("bishop")
    ? "bishop"
    : "fellenius";
  let currentSteps: Record<SearchAxis, number | null> = {
    x: baseGrid.axes.x.step,
    z: baseGrid.axes.z.step,
    radius: baseGrid.axes.radius.step,
  };

  for (let stage = 2; stage <= config.stages && !budgetReached; stage++) {
    const seeds = pickRefinementSeeds(
      candidates,
      primaryMethod,
      config.topRegions,
      currentSteps,
    );
    if (!seeds.length) break;

    const nextSteps: Record<SearchAxis, number | null> = {
      x: currentSteps.x ? currentSteps.x / config.subdivisionFactor : null,
      z: currentSteps.z ? currentSteps.z / config.subdivisionFactor : null,
      radius: currentSteps.radius
        ? currentSteps.radius / config.subdivisionFactor
        : null,
    };

    for (let r = 0; r < seeds.length && !budgetReached; r++) {
      const seed = seeds[r].location.circle;
      const axisBounds = (
        center: number,
        prevStep: number | null,
        nextStep: number | null,
        baseAxis: SearchBounds[SearchAxis],
        isRadius = false,
      ) => {
        if (
          prevStep === null ||
          nextStep === null ||
          baseAxis.min === baseAxis.max
        ) {
          return { min: center, max: center, step: null };
        }
        const half = prevStep;
        const min = isRadius ? Math.max(tol, center - half) : center - half;
        const max = center + half;
        return { min, max, step: nextStep };
      };

      const bounds: SearchBounds = {
        x: axisBounds(
          seed.x,
          currentSteps.x,
          nextSteps.x,
          input.surface.axes.x,
        ),
        z: axisBounds(
          seed.z,
          currentSteps.z,
          nextSteps.z,
          input.surface.axes.z,
        ),
        radius: axisBounds(
          seed.radius,
          currentSteps.radius,
          nextSteps.radius,
          input.surface.axes.radius,
          true,
        ),
      };
      const subPlan = prepareSearchGrid(bounds, tol);
      if (subPlan.status !== "ready") continue;

      let evaluatedCount = 0;
      let reusedCount = 0;
      for (let n = 1; n <= subPlan.grid.total; n++) {
        const res = evalPoint(searchLocation(subPlan.grid, n));
        if (res === "evaluated") evaluatedCount++;
        else if (res === "reused") reusedCount++;
        else break;
      }
      regions.push({
        stage,
        regionIndex: r + 1,
        seedCircle: seed,
        bounds,
        evaluatedCount,
        reusedCount,
      });
    }
    currentSteps = nextSteps;
  }

  onProgress?.({ completed: candidates.length, total: candidates.length });

  const xs = candidates.map((c) => c.location.circle.x);
  const zs = candidates.map((c) => c.location.circle.z);
  const rs = candidates.map((c) => c.location.circle.radius);
  const extents: SampledExtents = {
    x: {
      min: Math.min(...xs),
      max: Math.max(...xs),
      variable: baseGrid.axes.x.min !== baseGrid.axes.x.max,
      toleranceM: tol,
    },
    z: {
      min: Math.min(...zs),
      max: Math.max(...zs),
      variable: baseGrid.axes.z.min !== baseGrid.axes.z.max,
      toleranceM: tol,
    },
    radius: {
      min: Math.min(...rs),
      max: Math.max(...rs),
      variable: baseGrid.axes.radius.min !== baseGrid.axes.radius.max,
      toleranceM: tol,
    },
  };

  return freeze({
    ...common,
    status: "completed" as const,
    origin: structuredClone(input.origin),
    direction: input.analysis.direction!,
    grid: baseGrid,
    candidates,
    geometricCount,
    filteredCount,
    rankings: input.analysis.methods.map((method) =>
      rankSearchCandidates(
        candidates,
        baseGrid,
        method,
        profile.nearTieTolerance,
        extents,
      ),
    ),
    reasons: [...reasons.values()],
    refinement: {
      config: { ...config },
      regions,
      budgetReached,
      uniqueEvaluated: candidates.length,
    },
  });
}
