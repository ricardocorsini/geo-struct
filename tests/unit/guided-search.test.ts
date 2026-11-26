import { describe, expect, it } from "vitest";
import {
  runCircularSearch,
  runRefinedCircularSearch,
} from "../../src/core/circular-search";
import { prepareCoreInput } from "../../src/domain/core-input";
import {
  DEFAULT_PROJECT_PROFILE,
  defaultProject,
} from "../../src/domain/default-project";
import { commit, history, redo, undo } from "../../src/domain/history";
import { readProject, serializeProject } from "../../src/domain/model";

describe("Busca guiada por trechos e refinamento de regiões", () => {
  it("filtra candidatos fora dos trechos com diagnóstico específico e conserva a busca clássica quando livres", () => {
    const project = defaultProject();
    const c = project.analysisCases[0];
    const classic = runCircularSearch(
      prepareCoreInput(project, c.id),
      DEFAULT_PROJECT_PROFILE,
    );
    expect(classic.status).toBe("completed");
    if (classic.status !== "completed") return;
    expect(classic.filteredCount).toBe(0);

    // Restringir entrada e saída a um trecho estreito para forçar descartes por limites
    c.search.entryRange = { min: 14, max: 18 };
    c.search.exitRange = { min: 36, max: 42 };
    const guided = runCircularSearch(
      prepareCoreInput(project, c.id),
      DEFAULT_PROJECT_PROFILE,
    );
    expect(guided.status).toBe("completed");
    if (guided.status !== "completed") return;

    expect(guided.filteredCount).toBeGreaterThan(0);
    expect(
      guided.reasons.some(
        (r) =>
          r.stage === "limits" &&
          (r.code === "entry-outside-limit" || r.code === "exit-outside-limit"),
      ),
    ).toBe(true);
    expect(
      guided.candidates.some(
        (cand) => cand.filteredOut && cand.methods.length === 0,
      ),
    ).toBe(true);
  });

  it("respeita a direção direita-para-esquerda ao classificar entrada e saída", () => {
    const project = defaultProject();
    const c = project.analysisCases[0];
    c.direction = "right-to-left";
    // Na direção -X, a entrada está no extremo direito (X maior) e a saída no esquerdo (X menor).
    c.search.entryRange = { min: 35, max: 60 };
    c.search.exitRange = { min: 0, max: 25 };
    const res = runCircularSearch(
      prepareCoreInput(project, c.id),
      DEFAULT_PROJECT_PROFILE,
    );
    expect(res.status).toBe("completed");
    if (res.status !== "completed") return;
    const valid = res.candidates.filter(
      (cand) => !cand.filteredOut && cand.sliceCount !== null,
    );
    for (const cand of valid) {
      expect(cand.entryX!).toBeGreaterThan(cand.exitX!);
      expect(cand.entryX!).toBeGreaterThanOrEqual(35 - 1e-8);
      expect(cand.exitX!).toBeLessThanOrEqual(25 + 1e-8);
    }
  });

  it("refina várias regiões candidatas de forma determinística e respeita orçamento", () => {
    const project = defaultProject();
    const c = project.analysisCases[0];
    const prep = prepareCoreInput(project, c.id);
    const config = {
      stages: 2,
      topRegions: 2,
      subdivisionFactor: 2,
      maxTotalCandidates: 400,
    };

    const run1 = runRefinedCircularSearch(
      prep,
      DEFAULT_PROJECT_PROFILE,
      config,
    );
    const run2 = runRefinedCircularSearch(
      prep,
      DEFAULT_PROJECT_PROFILE,
      config,
    );
    expect(run1.status).toBe("completed");
    expect(run2).toEqual(run1);
    if (run1.status !== "completed") return;

    expect(run1.refinement).toBeDefined();
    expect(run1.refinement!.regions.length).toBeGreaterThanOrEqual(2);
    expect(run1.refinement!.regions[0]).toMatchObject({
      stage: 1,
      regionIndex: 1,
      evaluatedCount: 27,
    });
    expect(run1.refinement!.uniqueEvaluated).toBeLessThanOrEqual(
      config.maxTotalCandidates,
    );

    const classic = runCircularSearch(prep, DEFAULT_PROJECT_PROFILE);
    expect(classic.status).toBe("completed");
    if (classic.status !== "completed") return;
    const classicMin = classic.rankings[1].minimum!.factorOfSafety;
    const refinedMin = run1.rankings[1].minimum!.factorOfSafety;
    expect(refinedMin).toBeLessThanOrEqual(classicMin + 1e-12);
  });

  it("reproduz comparação de resolução (27 vs 125) separada da ampliação do domínio no projeto padrão", () => {
    const p27 = defaultProject();
    const c27 = p27.analysisCases[0];
    const r27 = runCircularSearch(
      prepareCoreInput(p27, c27.id),
      DEFAULT_PROJECT_PROFILE,
    );

    const p125 = defaultProject();
    const c125 = p125.analysisCases[0];
    c125.search.x.step = 1;
    c125.search.y.step = 1;
    c125.search.radius.step = 1;
    const r125 = runCircularSearch(
      prepareCoreInput(p125, c125.id),
      DEFAULT_PROJECT_PROFILE,
    );

    const pExpanded = defaultProject();
    const cExp = pExpanded.analysisCases[0];
    cExp.search.x = { min: 30, max: 38, step: 1 };
    cExp.search.y = { min: 30, max: 38, step: 1 };
    cExp.search.radius = { min: 21, max: 28, step: 1 };
    const rExp = runCircularSearch(
      prepareCoreInput(pExpanded, cExp.id),
      DEFAULT_PROJECT_PROFILE,
    );

    expect(r27.status).toBe("completed");
    expect(r125.status).toBe("completed");
    expect(rExp.status).toBe("completed");
    if (
      r27.status !== "completed" ||
      r125.status !== "completed" ||
      rExp.status !== "completed"
    )
      return;

    expect(r27.grid.total).toBe(27);
    expect(r125.grid.total).toBe(125);
    expect(rExp.grid.total).toBe(9 * 9 * 8);
    expect(rExp.rankings[1].minimum!.boundaryAxes).toContain("z");
  });

  it("persiste trechos no formato v6 e preserva histórico desfazer/refazer", () => {
    const project = defaultProject();
    const edited = structuredClone(project);
    edited.analysisCases[0].search.entryRange = { min: 10, max: 22 };
    edited.analysisCases[0].search.exitRange = { min: 34, max: 48 };

    const reopened = readProject(serializeProject(edited));
    expect(reopened).toEqual({ project: edited, migrated: false });

    const h = commit(history(project), edited);
    expect(undo(h).present).toEqual(project);
    expect(redo(undo(h)).present).toEqual(edited);
  });
});
