import type { CircularSearchProfile } from "../core/circular-search";
import { addAnalysisCase } from "./analysis";
import { exampleProject, type AnalysisCase, type Project } from "./model";

export const DEFAULT_PROJECT_PROFILE = {
  geometry: { toleranceM: 1e-8, maxArcDegrees: 3 },
  equilibrium: { drivingThresholdKNPerM: 0, tensionToleranceKPa: 0 },
  bishop: {
    initialFactor: 1.4,
    residualTolerance: 1e-8,
    maxIterations: 100,
    singularityThreshold: 0,
  },
  nearTieTolerance: 0.01,
} as const satisfies CircularSearchProfile;

/** Um projeto novo a cada abertura, com dados ilustrativos para explorar o cálculo. */
export function defaultProject(): Project {
  const base = exampleProject();
  base.name = "Projeto padrão — talude em duas camadas";
  base.description =
    "Demonstração de estabilidade de um talude com dois solos, linha piezométrica e sobrecarga na crista.";
  for (const material of base.materials) material.cohesion = 0;

  const { project, analysisCase } = addAnalysisCase(base, base.sections[0].id);
  const setup: Partial<AnalysisCase> = {
    name: "Talude — busca circular",
    description:
      "Movimento da esquerda para a direita, com água e sobrecarga herdadas da seção. Os parâmetros dos solos são ilustrativos.",
    direction: "left-to-right",
    methods: ["fellenius", "bishop"],
    surfaceMode: "search",
    numericalProfile: {
      geometry: { ...DEFAULT_PROJECT_PROFILE.geometry },
      fellenius: { ...DEFAULT_PROJECT_PROFILE.equilibrium },
      bishop: {
        ...DEFAULT_PROJECT_PROFILE.equilibrium,
        ...DEFAULT_PROJECT_PROFILE.bishop,
      },
      search: structuredClone(DEFAULT_PROJECT_PROFILE),
    },
    waterCondition: "section",
    loadCondition: "section",
    fixedCircle: { x: 32, y: 32, radius: 25 },
    search: {
      x: { min: 30, max: 34, step: 2 },
      y: { min: 30, max: 34, step: 2 },
      radius: { min: 23, max: 27, step: 2 },
    },
  };
  Object.assign(analysisCase, setup);

  const fixed = addAnalysisCase(
    project,
    analysisCase.sectionId,
    analysisCase.id,
  );
  fixed.analysisCase.name = "Talude — círculo fixo";
  fixed.analysisCase.surfaceMode = "fixed";
  return fixed.project;
}
