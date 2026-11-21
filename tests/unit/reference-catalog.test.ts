import { describe, expect, it } from "vitest";
import { solveFellenius } from "../../src/core/fellenius";
import { solveBishop } from "../../src/core/bishop";
import { runCircularSearch } from "../../src/core/circular-search";
import { prepareCoreInput } from "../../src/domain/core-input";
import { prepareFixedCircleGeometry } from "../../src/core/fixed-circle";
import {
  openstruct,
  homogeneousWater,
  stratified,
  homogeneousProject,
  stratifiedProject,
  prepareReference,
  equilibriumProfile,
  bishopProfile,
  prescribedWaterSlices,
} from "../fixtures/reference-catalog";

// Margens absolutas por grandeza para este catálogo SI, não limiares do motor.
const tolerance = {
  length: 1e-9,
  area: 1e-8,
  force: 1e-7,
  stress: 1e-8,
  moment: 1e-6,
  angle: 1e-10,
  coefficient: 1e-10,
  fs: 1e-9,
};
function close(actual: number | null, expected: number, limit: number) {
  expect(actual).not.toBeNull();
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(limit);
}
const fs = (actual: number | null, expected: number) =>
  close(actual, expected, tolerance.fs);

describe("catálogo independente OpenStruct (preparação e equações, com limites explícitos)", () => {
  for (const reference of [...openstruct.cases, homogeneousWater]) {
    describe(reference.id, () => {
      const run = () =>
        prepareReference(
          homogeneousProject(reference),
          openstruct.profiles.geometry,
        );
      const prescribed = reference.id === "A01" || reference.id === "A01-B";
      it(
        prescribed
          ? "expõe o bloqueio de cortes quase coincidentes da fonte, sem fundi-los"
          : "reproduz cortes, áreas, pesos, pressão e cargas com braço próprio por fatia",
        () => {
          if (prescribed) {
            const project = homogeneousProject(reference);
            const input = prepareCoreInput(
              project,
              project.analysisCases[0].id,
            );
            expect(input.diagnostics.some((d) => d.level === "error")).toBe(
              false,
            );
            // O aviso a montante não é apagado; a massa analisada é a jusante.
            expect(input.diagnostics.some((d) => d.level === "warning")).toBe(
              true,
            );
            const geometry = prepareFixedCircleGeometry(
              input,
              openstruct.profiles.geometry,
            );
            expect(geometry.status).toBe("blocked");
            expect(geometry.geometry).toBeNull();
            expect(geometry.diagnostics.map((d) => d.code)).toEqual([
              "cuts-too-close",
            ]);
            return;
          }
          const p = run(),
            e = reference.expected,
            geometry = p.geometry.geometry;
          expect(geometry.slices).toHaveLength(e.sliceCount);
          expect(p.geometry.intersections).toHaveLength(e.intersections.length);
          expect(p.mechanics.mechanics.slices).toHaveLength(e.sliceCount);
          expect(p.weights.weights.slices).toHaveLength(e.sliceCount);
          expect(p.pressures.pressures.slices).toHaveLength(e.sliceCount);
          expect(p.loads.loads.slices).toHaveLength(e.sliceCount);
          expect(geometry.cuts).toHaveLength(e.cutsXM.length);
          geometry.cuts.forEach((c, i) =>
            close(c.x, e.cutsXM[i], tolerance.length),
          );
          p.geometry.intersections.forEach((point, i) => {
            close(point.point.x, e.intersections[i].x, tolerance.length);
            close(point.point.z, e.intersections[i].z, tolerance.length);
          });
          close(geometry.areaM2, e.totals.areaM2, tolerance.area);
          close(
            p.weights.weights.totalWeightKNPerM,
            e.totals.weightKNPerM,
            tolerance.force,
          );
          close(
            p.loads.loads.forceKNPerM,
            e.totals.loadKNPerM,
            tolerance.force,
          );
          close(
            p.loads.loads.momentDrivingKNmPerM,
            e.totals.loadDrivingMomentKN,
            tolerance.moment,
          );
          const input = p.input.snapshot.input;
          expect(input.geometry.terrain).toEqual(reference.input.terrain);
          expect(input.materials[0].unitWeight).toBe(
            reference.input.material.unitWeightKNPerM3,
          );
          expect(input.analysis.direction).toBe(reference.input.movement);
          expect(input.water.mode).toBe(reference.input.water.condition);
          expect(input.loads.items).toHaveLength(reference.input.loads.length);
          if (reference.id === "H-W05") {
            expect(p.pressures.pressures.positivePressureCount).toBeGreaterThan(
              0,
            );
          }
          geometry.slices.forEach((s, i) => {
            const e = reference.expected.slices[i],
              m = p.mechanics.mechanics.slices[i];
            expect(s.number).toBe(e.number);
            expect(m.number).toBe(e.number);
            close(s.left.x, e.left.x, tolerance.length);
            close(s.left.baseZ, e.left.z, tolerance.length);
            close(s.right.x, e.right.x, tolerance.length);
            close(s.right.baseZ, e.right.z, tolerance.length);
            close(s.arcMidpoint.x, e.pressureSample.x, tolerance.length);
            close(s.arcMidpoint.z, e.pressureSample.z, tolerance.length);
            close(s.areaM2, e.areaM2, tolerance.area);
            close(m.widthM, e.widthM, tolerance.length);
            close(m.baseLengthM, e.baseLengthM, tolerance.length);
            close(m.alphaRadians, e.alphaRadians, tolerance.angle);
            close(m.weight.weightKNPerM, e.weightKNPerM, tolerance.force);
            close(m.water.usedPressureKPa, e.pressureKPa, tolerance.stress);
            const water = m.water.prescribed;
            // Catálogo numera segmentos de água desde 1; core desde 0.
            expect(water.waterSegmentIndex).toBe(
              e.waterSegment === null ? null : e.waterSegment - 1,
            );
            if (reference.input.water.condition === "dry")
              expect(water.signedHeadM).toBeNull();
            else close(water.signedHeadM, e.signedWaterHeadM, tolerance.length);
            close(m.surcharge.forceKNPerM, e.loadKNPerM, tolerance.force);
            close(
              m.surcharge.momentDrivingKNmPerM,
              e.loadDrivingMomentKN,
              tolerance.moment,
            );
            expect(m.surcharge.contributions).toHaveLength(
              e.loadContributions.length,
            );
            m.surcharge.contributions.forEach((q, j) => {
              const expected = e.loadContributions[j];
              expect(q.loadId).toBe(expected.loadId);
              close(
                q.applicationPoint.x,
                expected.application.x,
                tolerance.length,
              );
              close(
                q.applicationPoint.z,
                expected.application.z,
                tolerance.length,
              );
              close(q.armDrivingM, expected.drivingArmM, tolerance.length);
              close(q.forceKNPerM, expected.forceKNPerM, tolerance.force);
              close(
                q.momentDrivingKNmPerM,
                expected.drivingMomentKN,
                tolerance.moment,
              );
            });
          });
        },
      );

      for (const key of ["P0", "P1"] as const) {
        it(`confere Fellenius e Bishop ${key}${prescribed ? " nas fatias prescritas" : " após preparo completo"}, histórico e admissibilidade no F avaliado`, () => {
          const p = prescribed ? prescribedWaterSlices(reference) : run(),
            e = reference.expected,
            f = solveFellenius(p.input, p.mechanics, equilibriumProfile);
          expect(f.status).toBe("calculated");
          fs(f.factorOfSafety, e.fellenius.mathematicalFS);
          expect(f.calculation).not.toBeNull();
          const calculation = f.calculation!;
          expect(calculation.slices).toHaveLength(e.sliceCount);
          close(
            calculation.drivingKNPerM,
            e.totals.drivingKNPerM,
            tolerance.force,
          );
          close(
            calculation.weightDrivingKNPerM,
            e.totals.weightDrivingKNPerM,
            tolerance.force,
          );
          close(
            calculation.loadDrivingKNPerM,
            e.totals.loadDrivingKNPerM,
            tolerance.force,
          );
          calculation.slices.forEach((s, i) => {
            const row = e.slices[i];
            expect(s.input.number).toBe(row.number);
            close(
              s.normalForResistanceKNPerM,
              row.felleniusNormalForceKNPerM,
              tolerance.force,
            );
            close(
              s.normalStressKPa,
              row.felleniusNormalStressKPa,
              tolerance.stress,
            );
            close(
              s.cohesionResistanceKNPerM,
              row.cohesionKNPerM,
              tolerance.force,
            );
            close(
              s.frictionResistanceKNPerM,
              row.felleniusFrictionKNPerM,
              tolerance.force,
            );
            close(s.drivingKNPerM, row.drivingKNPerM, tolerance.force);
          });
          const b = solveBishop(p.input, p.mechanics, bishopProfile(key)),
            expected = e.bishop[key];
          expect(b.status).toBe(
            expected.eligibleFS === null ? "rejected" : "calculated",
          );
          if (expected.eligibleFS === null) {
            expect(b.factorOfSafety).toBeNull();
            expect(b.diagnostics.some((d) => d.code === "base-tension")).toBe(
              true,
            );
          } else fs(b.factorOfSafety, expected.eligibleFS);
          expect(b.iterations).toHaveLength(expected.evaluations);
          b.iterations.forEach((s, i) => {
            const e = expected.history[i];
            expect(s.iteration).toBe(e.k);
            fs(s.trialFactor, e.F);
            fs(s.updatedFactor, e.G);
            fs(s.residual, e.residual);
            close(s.minM, e.minM, tolerance.coefficient);
          });
          const evaluation = b.calculation?.evaluation;
          expect(evaluation).toBeTruthy();
          expect(evaluation!.slices).toHaveLength(e.sliceCount);
          fs(evaluation!.trialFactor, expected.F);
          fs(evaluation!.updatedFactor, expected.G);
          fs(evaluation!.residual, expected.residual);
          expect(evaluation!.residual).toBeLessThanOrEqual(
            bishopProfile(key).residualTolerance,
          );
          evaluation!.slices.forEach((s, i) => {
            const row = expected.slicesAtReturnedF[i];
            expect(s.input.number).toBe(row.slice);
            close(s.m, row.m, tolerance.coefficient);
            close(
              s.normalForResistanceKNPerM,
              row.normalForceKNPerM,
              tolerance.force,
            );
            close(s.normalStressKPa, row.normalStressKPa, tolerance.stress);
          });
          close(
            Math.min(...evaluation!.slices.map((s) => s.normalStressKPa!)),
            expected.minNormalStressKPa,
            tolerance.stress,
          );
        });
      }
    });
  }
});

describe("referência estratificada própria com água, carga e busca independente", () => {
  const profile = stratified.profile;
  for (const reference of [stratified, stratified.refinement]) {
    const fixed = reference.fixedCircle,
      angle = fixed.maxArcDegrees;
    it(`reproduz ${fixed.sliceCount} fatias e os dois métodos a ${angle}°`, () => {
      const p = prepareReference(stratifiedProject(), {
        ...profile.geometry,
        maxArcDegrees: angle,
      });
      const g = p.geometry.geometry;
      expect(g.slices).toHaveLength(fixed.sliceCount);
      expect(p.mechanics.mechanics.slices).toHaveLength(fixed.sliceCount);
      close(g.cuts[0].x, fixed.entryXM, tolerance.length);
      close(g.cuts.at(-1)!.x, fixed.exitXM, tolerance.length);
      close(g.areaM2, fixed.totals.areaM2, tolerance.area);
      close(
        p.weights.weights.totalWeightKNPerM,
        fixed.totals.weightKNPerM,
        tolerance.force,
      );
      close(
        p.loads.loads.forceKNPerM,
        fixed.totals.surchargeKNPerM,
        tolerance.force,
      );
      close(
        p.loads.loads.momentDrivingKNmPerM,
        fixed.totals.surchargeMomentKNMPerM,
        tolerance.moment,
      );
      for (const id of ["background", "fill"] as const) {
        close(
          g.materialAreas.find((m) => m.materialId === id)!.areaM2,
          fixed.totals.materialAreasM2[id],
          tolerance.area,
        );
      }
      g.slices.forEach((s, i) => {
        const e = fixed.slices[i],
          m = p.mechanics.mechanics.slices[i];
        expect(s.number).toBe(e.number);
        expect(m.number).toBe(e.number);
        close(s.left.x, e.leftXM, tolerance.length);
        close(s.right.x, e.rightXM, tolerance.length);
        close(s.left.topZ, e.topLeftZM, tolerance.length);
        close(s.right.topZ, e.topRightZM, tolerance.length);
        close(s.left.baseZ, e.baseLeftZM, tolerance.length);
        close(s.right.baseZ, e.baseRightZM, tolerance.length);
        close(s.chordLengthM, e.chordLengthM, tolerance.length);
        close(s.arcLengthM, e.arcLengthM, tolerance.length);
        close(s.areaM2, e.areaM2, tolerance.area);
        close(s.arcMidpoint.x, e.midpoint.xM, tolerance.length);
        close(s.arcMidpoint.z, e.midpoint.zM, tolerance.length);
        expect(s.baseMaterialId).toBe(e.baseMaterial);
        for (const id of ["background", "fill"] as const) {
          close(
            s.materialAreas.find((m) => m.materialId === id)?.areaM2 ?? 0,
            e.materialAreasM2[id],
            tolerance.area,
          );
        }
        close(m.alphaRadians, e.alphaRadians, tolerance.angle);
        close(m.weight.weightKNPerM, e.weightKNPerM, tolerance.force);
        close(m.water.usedPressureKPa, e.pressureKPa, tolerance.stress);
        close(m.water.prescribed.signedHeadM, e.waterHeadM, tolerance.length);
        close(
          m.water.physicalBaseResultantKNPerM,
          e.waterForceKNPerM,
          tolerance.force,
        );
        close(
          m.water.usedBaseResultantKNPerM,
          e.waterForceKNPerM,
          tolerance.force,
        );
        close(m.surcharge.forceKNPerM, e.surchargeKNPerM, tolerance.force);
        close(
          m.surcharge.momentDrivingKNmPerM,
          e.surchargeMomentKNMPerM,
          tolerance.moment,
        );
        if (e.surchargeKNPerM > 0)
          close(
            m.surcharge.contributions[0].applicationPoint.x,
            e.surchargeApplicationXM!,
            tolerance.length,
          );
      });
      const f = solveFellenius(p.input, p.mechanics, profile.equilibrium);
      expect(f.status).toBe(fixed.fellenius.status);
      fs(f.factorOfSafety, fixed.fellenius.factorOfSafety!);
      close(
        f.calculation!.drivingKNPerM,
        fixed.totals.drivingKNPerM,
        tolerance.force,
      );
      expect(f.calculation!.slices).toHaveLength(fixed.sliceCount);
      f.calculation!.slices.forEach((s, i) => {
        close(
          s.normalStressKPa,
          fixed.fellenius.slices[i].stressKPa,
          tolerance.stress,
        );
        close(
          s.resistanceKNPerM,
          fixed.fellenius.slices[i].resistanceKNPerM,
          tolerance.force,
        );
      });
      const b = solveBishop(p.input, p.mechanics, {
        ...profile.equilibrium,
        ...profile.bishop,
      });
      expect(b.status).toBe(fixed.bishop.status);
      fs(b.factorOfSafety, fixed.bishop.factorOfSafety!);
      expect(b.iterations).toHaveLength(fixed.bishop.iterations);
      expect(b.calculation!.evaluation!.slices).toHaveLength(fixed.sliceCount);
      b.iterations.forEach((s, i) => {
        fs(s.trialFactor, fixed.bishop.history[i].evaluatedFactor);
        fs(s.updatedFactor, fixed.bishop.history[i].update);
        fs(s.residual, fixed.bishop.history[i].residual);
      });
      b.calculation!.evaluation!.slices.forEach((s, i) => {
        close(s.m, fixed.bishop.slices[i].m, tolerance.coefficient);
        close(
          s.normalForResistanceKNPerM,
          fixed.bishop.slices[i].normalKNPerM,
          tolerance.force,
        );
        close(
          s.normalStressKPa,
          fixed.bishop.slices[i].stressKPa,
          tolerance.stress,
        );
      });
    });

    it(`confere os 27 candidatos e o mínimo amostrado independente a ${angle}°`, () => {
      const project = stratifiedProject(true);
      const input = prepareCoreInput(project, project.analysisCases[0].id);
      const result = runCircularSearch(input, {
        ...profile,
        geometry: { ...profile.geometry, maxArcDegrees: angle },
      });
      if (result.status !== "completed")
        throw new Error(JSON.stringify(result));
      expect(result.grid.total).toBe(27);
      expect(result.geometricCount).toBe(27);
      expect(result.candidates).toHaveLength(
        reference.search.candidates.length,
      );
      result.candidates.forEach((s, i) => {
        const e = reference.search.candidates[i];
        expect(s.location.number).toBe(e.number);
        expect(s.location.indices).toEqual({
          x: e.gridIndices.centerX,
          z: e.gridIndices.centerZ,
          radius: e.gridIndices.radius,
        });
        expect(s.location.circle).toEqual({
          x: e.circle.centerXM,
          z: e.circle.centerZM,
          radius: e.circle.radiusM,
        });
        expect(s.sliceCount).toBe(e.sliceCount);
        expect(s.issues).toEqual([]);
        expect(s.methods).toHaveLength(2);
        for (const method of ["fellenius", "bishop"] as const) {
          const actual = s.methods.find((m) => m.method === method)!;
          expect(actual.status).toBe(e[method].status);
          fs(actual.factorOfSafety, e[method].factorOfSafety!);
          if (method === "bishop") {
            expect(actual.evaluations).toBe(e.bishop.iterations);
            fs(actual.residual, e.bishop.residual!);
          }
        }
      });
      for (const method of ["fellenius", "bishop"] as const) {
        const ranking = result.rankings.find((r) => r.method === method)!,
          e = reference.search.minima[method]!;
        expect(ranking.status).toBe("minimum");
        expect(ranking.eligible).toBe(27);
        expect(ranking.failed).toBe(0);
        expect(ranking.zeroResistance).toBe(0);
        expect(ranking.minimum!.location.number).toBe(e.candidateNumber);
        fs(ranking.minimum!.factorOfSafety, e.factorOfSafety!);
        expect(ranking.minimum!.boundaryAxes).toEqual(["x", "z", "radius"]);
        expect(ranking.ties).toEqual([]);
      }
    });
  }
  it("preserva a rejeição por modos mistos, sem transformar G-02 em referência positiva", () => {
    const p = stratifiedProject();
    p.materials.find((m) => m.id === "fill")!.mode = "total";
    const prepared = prepareReference(p, profile.geometry);
    for (const result of [
      solveFellenius(prepared.input, prepared.mechanics, profile.equilibrium),
      solveBishop(prepared.input, prepared.mechanics, {
        ...profile.equilibrium,
        ...profile.bishop,
      }),
    ]) {
      expect(result.status).toBe("rejected");
      expect(result.factorOfSafety).toBeNull();
      expect(result.diagnostics.some((d) => d.code === "mixed-modes")).toBe(
        true,
      );
    }
  });
});
