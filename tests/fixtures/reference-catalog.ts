import openstruct from "./reference-catalog/openstruct.json" with { type: "json" };
import stratified from "./reference-catalog/stratified-search.json" with { type: "json" };
import homogeneousWaterData from "./reference-catalog/homogeneous-water.json" with { type: "json" };
import { newProject, type Project } from "../../src/domain/model";
import { addAnalysisCase } from "../../src/domain/analysis";
import { prepareCoreInput } from "../../src/domain/core-input";
import {
  prepareFixedCircleGeometry,
  type GeometryProfile,
} from "../../src/core/fixed-circle";
import { prepareSliceWeights } from "../../src/core/slice-weights";
import { prepareSlicePressures } from "../../src/core/slice-pressures";
import { prepareSliceLoads } from "../../src/core/slice-loads";
import {
  prepareSliceMechanics,
  type SliceMechanicsPreparation,
} from "../../src/core/slice-mechanics";

export { openstruct, stratified };
export const homogeneousWater = {
  ...homogeneousWaterData,
  sourceUrl: homogeneousWaterData.provenance.implementationIssueUrl,
};
export type HomogeneousCase = Pick<
  (typeof openstruct.cases)[number],
  "id" | "sourceUrl" | "input"
>;
export const equilibriumProfile = {
  drivingThresholdKNPerM:
    openstruct.profiles.admissibility.drivingThresholdKNPerM,
  tensionToleranceKPa: openstruct.profiles.admissibility.tensionToleranceKPa,
};
export function bishopProfile(key: "P0" | "P1") {
  const p = openstruct.profiles[key];
  return {
    ...equilibriumProfile,
    initialFactor: p.F0,
    residualTolerance: p.residualTolerance,
    maxIterations: p.maxEvaluations,
    singularityThreshold: openstruct.profiles.admissibility.mThreshold,
  };
}

function withCase(
  base: Project,
  circle: { x: number; z: number; radius: number },
) {
  const { project, analysisCase } = addAnalysisCase(base, base.sections[0].id);
  Object.assign(analysisCase, {
    name: base.name,
    description: "Referência independente congelada; sem critério normativo.",
    methods: ["fellenius", "bishop"],
    direction: "left-to-right",
    surfaceMode: "fixed",
    fixedCircle: { x: circle.x, y: circle.z, radius: circle.radius },
    waterCondition: "section",
    loadCondition: "section",
  });
  return project;
}

// Apenas adapta dados publicados para o modelo. Nenhum expected vem do produto.
export function homogeneousProject(reference: HomogeneousCase) {
  const p = newProject(reference.id),
    input = reference.input;
  const material = input.material;
  if (material.strengthMode !== "effective")
    throw new Error("Referência fora do recorte homogêneo efetivo.");
  Object.assign(p.materials[0], {
    id: material.id,
    name: "Homogêneo efetivo",
    gamma: material.unitWeightKNPerM3,
    cohesion: material.cohesionKPa,
    friction: material.frictionAngleDegrees,
    mode: "effective",
    source: reference.sourceUrl,
  });
  Object.assign(p.sections[0], {
    terrain: input.terrain.map(({ x, z }) => ({ x, y: z })),
    base: input.baseElevationM,
    backgroundMaterialId: material.id,
    regions: [],
    waterMode: input.water.condition,
    water:
      input.water.condition === "dry"
        ? null
        : input.water.line.map(({ x, z }) => ({ x, y: z })),
    waterUnitWeight: input.water.unitWeightKNPerM3,
    waterSource: reference.sourceUrl,
    loadCondition: input.loads.length ? "loads" : "none",
    loads: input.loads.map((load) => ({
      id: load.id,
      name: load.id,
      x1: load.leftXM,
      x2: load.rightXM,
      q: load.intensityKPa,
      enabled: load.enabled,
      source: reference.sourceUrl,
    })),
  });
  return withCase(p, { ...input.circle.center, radius: input.circle.radiusM });
}

export function stratifiedProject(search = false) {
  const input = stratified.inputs,
    p = newProject(stratified.id);
  p.materials = Object.entries(input.materials).map(([id, material]) => ({
    id,
    name: material.name,
    color: id === "fill" ? "#d1a66d" : "#8b6f47",
    gamma: material.unitWeightKNPerM3,
    cohesion: material.cohesionKPa,
    friction: material.frictionDegrees,
    mode: "effective",
    source: "Entradas ilustrativas do GeoStruct; oráculo Python independente.",
  }));
  Object.assign(p.sections[0], {
    terrain: input.terrain.map(([x, y]) => ({ x, y })),
    base: input.domainBaseZM,
    backgroundMaterialId: "background",
    regions: [
      {
        id: "fill-region",
        name: "Aterro",
        materialId: "fill",
        points: input.fillPolygon.map(([x, y]) => ({ x, y })),
      },
    ],
    waterMode: input.water.type,
    water: input.water.line.map(([x, y]) => ({ x, y })),
    waterUnitWeight: input.water.unitWeightKNPerM3,
    waterSource: "Linha ilustrativa do GeoStruct",
    loadCondition: "loads",
    loads: [
      {
        id: "crest-load",
        name: "Carga de crista",
        x1: input.surcharge.fromXM,
        x2: input.surcharge.toXM,
        q: input.surcharge.intensityKPa,
        enabled: input.surcharge.enabled,
        source: "Carga ilustrativa do GeoStruct",
      },
    ],
  });
  const circle = input.fixedCircle;
  const project = withCase(p, {
    x: circle.centerXM,
    z: circle.centerZM,
    radius: circle.radiusM,
  });
  if (search) {
    const axis = (values: number[]) => ({
      min: values[0],
      max: values.at(-1)!,
      step: values[1] - values[0],
    });
    Object.assign(project.analysisCases[0], {
      surfaceMode: "search",
      search: {
        x: axis(input.searchAxes.centerXM),
        y: axis(input.searchAxes.centerZM),
        radius: axis(input.searchAxes.radiusM),
      },
    });
  }
  return project;
}

export function prepareReference(project: Project, profile: GeometryProfile) {
  const input = prepareCoreInput(project, project.analysisCases[0].id);
  if (!input.snapshot || input.diagnostics.some((d) => d.level === "error"))
    throw new Error(JSON.stringify(input.diagnostics));
  const geometry = prepareFixedCircleGeometry(input, profile);
  if (geometry.status !== "prepared")
    throw new Error(JSON.stringify(geometry.diagnostics));
  const weights = prepareSliceWeights(input, geometry);
  const pressures = prepareSlicePressures(input, geometry);
  const loads = prepareSliceLoads(input, geometry);
  const mechanics = prepareSliceMechanics(input, geometry, {
    weights,
    pressures,
    loads,
  });
  if (
    weights.status !== "prepared" ||
    pressures.status !== "prepared" ||
    loads.status !== "prepared" ||
    mechanics.status !== "prepared"
  ) {
    throw new Error(
      JSON.stringify({
        weights: weights.diagnostics,
        pressures: pressures.diagnostics,
        loads: loads.diagnostics,
        mechanics: mechanics.diagnostics,
      }),
    );
  }
  return { input, geometry, weights, pressures, loads, mechanics };
}

/**
 * Camada de equações SOMENTE: fatias prescritas pelo oráculo, sem chamar o
 * preparador geométrico do produto. A01/A01-B têm bloqueio topológico separado.
 * Não representa uma preparação bem-sucedida desses dois casos no GeoStruct.
 */
export function prescribedWaterSlices(
  reference: HomogeneousCase & {
    expected: (typeof openstruct.cases)[number]["expected"];
  },
) {
  if (reference.input.loads.length)
    throw new Error("Transcrição limitada aos controles de água sem carga.");
  const p = homogeneousProject(reference);
  const input = prepareCoreInput(p, p.analysisCases[0].id);
  if (!input.snapshot || input.diagnostics.some((d) => d.level === "error"))
    throw new Error(JSON.stringify(input.diagnostics));
  const applied = input.snapshot.input,
    center = reference.input.circle.center;
  const material = reference.input.material,
    e = reference.expected;
  const local = (point: { x: number; z: number }) => ({
    x: point.x - center.x,
    z: point.z - center.z,
  });
  const mechanics: Extract<SliceMechanicsPreparation, { status: "prepared" }> =
    {
      contract: "geostruct-slice-mechanics/1",
      stage: "mechanical-inputs-only",
      inputRevision: input.snapshot.revision,
      geometryContract: "geostruct-fixed-geometry/2",
      geometryProfile: openstruct.profiles.geometry,
      status: "prepared",
      diagnostics: [],
      mechanics: {
        origin: applied.origin,
        circleRadiusM: reference.input.circle.radiusM,
        frame: {
          origin: center,
          horizontal: "movement",
          up: "+Z",
          horizontalSign: 1,
          direction: "left-to-right",
        },
        approximation: {
          base: "chord",
          pressure: "constant-at-arc-midpoint",
          weightArm: "radius-sin-alpha",
        },
        units: {
          length: "m",
          stress: "kPa",
          force: "kN/m",
          moment: "kN·m/m",
          angle: "rad",
        },
        resistanceModes: ["effective"],
        water: applied.water,
        loadDefinitions: applied.loads,
        totalWeightKNPerM: e.totals.weightKNPerM,
        totalSurchargeKNPerM: 0,
        totalDownwardForceKNPerM: e.totals.weightKNPerM,
        slices: e.slices.map((s) => ({
          number: s.number,
          order: s.number,
          original: {
            leftX: s.left.x,
            rightX: s.right.x,
            basePoint: s.pressureSample,
          },
          local: {
            entry: local(s.left),
            exit: local(s.right),
            basePoint: local(s.pressureSample),
          },
          widthM: s.widthM,
          baseLengthM: s.baseLengthM,
          alphaRadians: s.alphaRadians,
          sinAlpha: s.sinAlpha,
          cosAlpha: s.cosAlpha,
          weightArmM: reference.input.circle.radiusM * s.sinAlpha,
          baseMaterial: {
            id: material.id,
            name: "Homogêneo efetivo",
            source: reference.sourceUrl,
            mode: "effective",
            cohesionKPa: material.cohesionKPa,
            frictionDegrees: material.frictionAngleDegrees,
            frictionRadians: (material.frictionAngleDegrees * Math.PI) / 180,
            tanPhi: Math.tan((material.frictionAngleDegrees * Math.PI) / 180),
          },
          weight: {
            number: s.number,
            areaM2: s.areaM2,
            weightKNPerM: s.weightKNPerM,
            materials: [
              {
                materialId: material.id,
                materialName: "Homogêneo efetivo",
                areaM2: s.areaM2,
                unitWeightKNPerM3: material.unitWeightKNPerM3,
                parameterSource: reference.sourceUrl,
                weightKNPerM: s.weightKNPerM,
                sources: [
                  {
                    regionId: null,
                    areaM2: s.areaM2,
                    weightKNPerM: s.weightKNPerM,
                  },
                ],
              },
            ],
          },
          water: {
            prescribed: {
              number: s.number,
              basePoint: s.pressureSample,
              piezometricZ: s.waterElevationM,
              signedHeadM: s.signedWaterHeadM,
              positiveHeadM: Math.max(0, s.signedWaterHeadM),
              pressureKPa: s.pressureKPa,
              waterSegmentIndex:
                s.waterSegment === null ? null : s.waterSegment - 1,
            },
            usedPressureKPa: s.pressureKPa,
            physicalBaseResultantKNPerM: s.pressureKPa * s.baseLengthM,
            usedBaseResultantKNPerM: s.pressureKPa * s.baseLengthM,
          },
          surcharge: {
            forceKNPerM: 0,
            momentDrivingKNmPerM: 0,
            contributions: [],
          },
          downwardForceKNPerM: s.weightKNPerM,
        })),
      },
    };
  return { input, mechanics };
}
