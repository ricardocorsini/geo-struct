import type { NumericalProfile, Project } from "../../src/domain/model";

/** Expected saved inputs: calculation results and every other project field stay unchanged. */
export function withProfile(
  project: Project,
  profile: Partial<NumericalProfile>,
  cases = [0],
): Project {
  const expected = structuredClone(project);
  for (const index of cases)
    Object.assign(
      expected.analysisCases[index].numericalProfile,
      structuredClone(profile),
    );
  return expected;
}

export function withGeometry(project: Project, maxArcDegrees = 3, cases = [0]) {
  return withProfile(
    project,
    { geometry: { toleranceM: 1e-8, maxArcDegrees } },
    cases,
  );
}

export const felleniusProfile = {
  drivingThresholdKNPerM: 0,
  tensionToleranceKPa: 0,
} as const;

export const bishopProfile = {
  ...felleniusProfile,
  initialFactor: 1.4,
  residualTolerance: 1e-8,
  maxIterations: 100,
  singularityThreshold: 0,
} as const;

export const searchProfile = {
  geometry: { toleranceM: 1e-8, maxArcDegrees: 3 },
  equilibrium: { ...felleniusProfile },
  bishop: {
    initialFactor: 1.4,
    residualTolerance: 1e-8,
    maxIterations: 100,
    singularityThreshold: 0,
  },
  nearTieTolerance: 0.01,
} as const;
