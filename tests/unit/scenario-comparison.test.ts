import { describe, expect, it } from "vitest";
import { runCircularSearch } from "../../src/core/circular-search";
import {
  addAnalysisCase,
  describeEffectiveWater,
  duplicateSectionWithCases,
  resolveCaseSection,
} from "../../src/domain/analysis";
import {
  buildScenarioComparison,
  isCaseRunCurrent,
  type CaseRunRecord,
} from "../../src/domain/case-comparison";
import { prepareCoreInput } from "../../src/domain/core-input";
import { defaultProject } from "../../src/domain/default-project";
import { commit, history, redo, undo } from "../../src/domain/history";
import { readProject, serializeProject } from "../../src/domain/model";
import { runCasesBatch } from "../../src/lib/batch-cases";

function makeTwoWaterCases() {
  const project = defaultProject();
  const baseCase = project.analysisCases[1]; // círculo fixo
  baseCase.name = "NA Baixo";
  baseCase.waterCondition = "case-piezometric";
  baseCase.waterUnitWeight = 9.81;
  baseCase.waterSource = "Piezômetro A (cota baixa)";
  baseCase.water = [
    { x: 0, y: 8 },
    { x: 60, y: 4 },
  ];

  const dup = addAnalysisCase(project, baseCase.sectionId, baseCase.id);
  dup.analysisCase.name = "NA Alto";
  dup.analysisCase.waterSource = "Piezômetro B (cota elevada)";
  dup.analysisCase.water = [
    { x: 0, y: 20 },
    { x: 18, y: 20 },
    { x: 38, y: 10 },
    { x: 60, y: 10 },
  ];
  return dup.project;
}

describe("Linhas piezométricas por caso e comparação de cenários", () => {
  it("mantém dois casos na mesma seção com linhas e origens distintas sem duplicar a seção", () => {
    const project = makeTwoWaterCases();
    expect(project.sections).toHaveLength(1);
    const [low, high] = [project.analysisCases[1], project.analysisCases[2]];

    const section = project.sections[0];
    expect(resolveCaseSection(section, low).water).toEqual(low.water);
    expect(resolveCaseSection(section, high).water).toEqual(high.water);
    expect(describeEffectiveWater(section, low)).toMatchObject({
      originKind: "case",
      originLabel: "Própria do caso",
      source: "Piezômetro A (cota baixa)",
      pointCount: 2,
      unitWeight: 9.81,
    });

    const reopened = readProject(serializeProject(project));
    expect(reopened).toEqual({ project, migrated: false });
    expect(reopened.project.sections).toHaveLength(1);

    const edited = structuredClone(project);
    edited.analysisCases[1].water = [
      { x: 0, y: 6 },
      { x: 60, y: 3 },
    ];
    const h = commit(history(project), edited);
    expect(undo(h).present).toEqual(project);
    expect(redo(undo(h)).present).toEqual(edited);

    const sectionCopy = duplicateSectionWithCases(project, section.id);
    expect(sectionCopy.project.sections).toHaveLength(2);
    expect(
      sectionCopy.project.analysisCases.filter(
        (c) => c.sectionId === sectionCopy.section.id,
      )[1].water,
    ).toEqual(low.water);
  });

  it("alterar a água de um caso invalida apenas a revisão desse caso", () => {
    const project = makeTwoWaterCases();
    const [, low, high] = project.analysisCases;
    const lowRev = prepareCoreInput(project, low.id).snapshot!.revision;
    const highRev = prepareCoreInput(project, high.id).snapshot!.revision;

    const runs: Record<string, CaseRunRecord> = {
      [low.id]: {
        caseId: low.id,
        sectionId: low.sectionId,
        state: "completed",
        inputRevision: lowRev,
        profileRevision: JSON.stringify(low.numericalProfile),
        surfaceMode: "fixed",
        methods: [],
        warnings: [],
      },
      [high.id]: {
        caseId: high.id,
        sectionId: high.sectionId,
        state: "completed",
        inputRevision: highRev,
        profileRevision: JSON.stringify(high.numericalProfile),
        surfaceMode: "fixed",
        methods: [],
        warnings: [],
      },
    };

    expect(isCaseRunCurrent(project, runs[low.id])).toBe(true);
    expect(isCaseRunCurrent(project, runs[high.id])).toBe(true);

    const modified = structuredClone(project);
    modified.analysisCases[1].water = [
      { x: 0, y: 11 },
      { x: 60, y: 5 },
    ];
    expect(isCaseRunCurrent(modified, runs[low.id])).toBe(false);
    expect(isCaseRunCurrent(modified, runs[high.id])).toBe(true);

    const rows = buildScenarioComparison(
      modified,
      modified.sections[0].id,
      [low.id, high.id],
      runs,
    );
    expect(rows.map((r) => r.statusKind)).toEqual(["outdated", "current"]);
  });

  it("calcula em lote cenários fixos e de busca, isolando falhas/pendências", async () => {
    const project = makeTwoWaterCases();
    const [searchCase, low, high] = project.analysisCases;
    const pending = addAnalysisCase(project, project.sections[0].id);
    pending.analysisCase.name = "Caso pendente";

    const records: Record<string, CaseRunRecord> = {};
    const handle = runCasesBatch({
      project: pending.project,
      caseIds: [searchCase.id, low.id, pending.analysisCase.id, high.id],
      onUpdate: (caseId, record) => {
        records[caseId] = record;
      },
      searchRunner: (request, receive) => {
        const result = runCircularSearch(
          request.preparation,
          request.profile,
          (progress) => receive({ type: "progress", progress }),
        );
        receive({ type: "result", result });
        return () => {};
      },
    });
    await handle.done;

    expect(records[searchCase.id].state).toBe("completed");
    expect(records[low.id].state).toBe("completed");
    expect(records[pending.analysisCase.id].state).toBe("blocked");
    expect(records[high.id].state).toBe("completed");

    const lowBishop = records[low.id].methods.find(
      (m) => m.method === "bishop",
    )!.factorOfSafety!;
    const highBishop = records[high.id].methods.find(
      (m) => m.method === "bishop",
    )!.factorOfSafety!;
    expect(highBishop).toBeLessThan(lowBishop);

    const rows = buildScenarioComparison(
      pending.project,
      pending.project.sections[0].id,
      [searchCase.id, low.id, pending.analysisCase.id, high.id],
      records,
    );
    expect(rows.map((r) => [r.analysisCase.name, r.statusKind])).toEqual([
      [searchCase.name, "current"],
      [low.name, "current"],
      [high.name, "current"],
      [pending.analysisCase.name, "blocked"],
    ]);
  });

  it("cancela lote em andamento preservando casos já concluídos", async () => {
    const project = makeTwoWaterCases();
    const [searchCase, low, high] = project.analysisCases;
    const records: Record<string, CaseRunRecord> = {};
    let cancelFn: (() => void) | null = null;

    const handle = runCasesBatch({
      project,
      caseIds: [low.id, searchCase.id, high.id],
      onUpdate: (caseId, record) => {
        records[caseId] = record;
      },
      searchRunner: () => {
        // Simula busca assíncrona interrompida antes da resposta final
        queueMicrotask(() => cancelFn?.());
        return () => {};
      },
    });
    cancelFn = handle.cancel;
    await handle.done;

    expect(records[low.id].state).toBe("completed");
    expect(records[searchCase.id].state).toBe("cancelled");
    expect(records[high.id].state).toBe("cancelled");
  });
});
