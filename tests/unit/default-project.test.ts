import { expect, it } from "vitest";
import {
  evaluateSearchCircle,
  runCircularSearch,
  type CircularSearchProfile,
} from "../../src/core/circular-search";
import { prepareCoreInput } from "../../src/domain/core-input";
import {
  DEFAULT_PROJECT_PROFILE,
  defaultProject,
} from "../../src/domain/default-project";
import { readProject, serializeProject } from "../../src/domain/model";

it("abre o talude padrão com malha calculável e um círculo comparável, com água e carga ativas", () => {
  const project = defaultProject();
  const [search, fixed] = project.analysisCases;
  const serialized = serializeProject(project);
  expect(readProject(serialized)).toEqual({ project, migrated: false });
  const storedProfile = search.numericalProfile.search;
  expect(storedProfile).toEqual(DEFAULT_PROJECT_PROFILE);

  const preparation = prepareCoreInput(project, search.id);
  const result = runCircularSearch(
    preparation,
    storedProfile as CircularSearchProfile,
  );
  if (result.status !== "completed") throw new Error(result.diagnostic.message);
  expect(result.grid.total).toBe(27);
  expect(result.rankings).toHaveLength(2);
  for (const ranking of result.rankings)
    expect(ranking.minimum?.factorOfSafety).toBeGreaterThan(0);
  const reopened = readProject(serialized).project;
  const reopenedCase = reopened.analysisCases[0];
  expect(
    runCircularSearch(
      prepareCoreInput(reopened, reopenedCase.id),
      reopenedCase.numericalProfile.search as CircularSearchProfile,
    ),
  ).toEqual(result);

  const candidate = result.candidates.find(
    ({ location: { circle } }) =>
      circle.x === fixed.fixedCircle.x &&
      circle.z === fixed.fixedCircle.y &&
      circle.radius === fixed.fixedCircle.radius,
  )!;
  const detail = evaluateSearchCircle(
    preparation,
    DEFAULT_PROJECT_PROFILE,
    candidate.location,
  );
  expect(detail.methods.map((r) => r.status)).toEqual([
    "calculated",
    "calculated",
  ]);
  expect(
    detail.preparations?.pressures.pressures?.positivePressureCount,
  ).toBeGreaterThan(0);
  expect(detail.preparations?.loads.loads?.forceKNPerM).toBeGreaterThan(0);
  const fresh = defaultProject();
  expect(fresh.id).not.toBe(project.id);
  expect(fresh.analysisCases[0].id).not.toBe(search.id);
  expect(fresh.sections[0].backgroundMaterialId).toBe(fresh.materials[0].id);
});
