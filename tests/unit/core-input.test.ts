import { describe, expect, it } from "vitest";
import {
  exampleProject,
  newSection,
  readProject,
  serializeProject,
  type Project,
} from "../../src/domain/model";
import { addAnalysisCase } from "../../src/domain/analysis";
import { auditProject } from "../../src/domain/audit";
import { history, commit, undo, redo } from "../../src/domain/history";
import {
  prepareCoreInput,
  isCoreInputCurrent,
} from "../../src/domain/core-input";

function fixture() {
  const base = exampleProject();
  const { project: p, analysisCase: c } = addAnalysisCase(
    base,
    base.sections[0].id,
  );
  Object.assign(c, {
    description:
      "Caso próprio para testar a transferência de entradas; sem FS de referência.",
    direction: "right-to-left",
    methods: ["bishop", "fellenius"],
    surfaceMode: "fixed",
    fixedCircle: { x: 25, y: 30, radius: 20 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return { p, c, s: p.sections[0] };
}
function snapshot(p: Project, id: string) {
  const result = prepareCoreInput(p, id);
  if (!result.snapshot) throw new Error(JSON.stringify(result.diagnostics));
  return result.snapshot;
}

describe("contrato de entrada do núcleo", () => {
  it("registra unidades, origem e coordenadas X/Z sem espelhar, arredondar ou calcular", () => {
    const { p, c, s } = fixture();
    c.fixedCircle.x = -12.345678901;
    const result = prepareCoreInput(p, c.id);
    expect(result.status).toBe("collected");
    const input = result.snapshot!.input;
    expect(input.origin).toEqual({
      projectFormat: "geostruct/5",
      project: { id: p.id, name: p.name },
      section: { id: s.id, name: s.name },
      analysisCase: { id: c.id, name: c.name },
    });
    expect(input.units).toEqual({
      length: "m",
      force: "kN",
      stress: "kPa",
      unitWeight: "kN/m³",
      angle: "deg",
    });
    expect(input.geometry.terrain[0]).toEqual({ x: 0, z: 22 });
    expect(input.geometry.regions[0].points[0]).toEqual({ x: 0, z: 15 });
    expect(input.geometry.regions[0].materialId).toBe(p.materials[1].id);
    expect(input.surface).toEqual({
      mode: "fixed",
      circle: { x: -12.345678901, z: 30, radius: 20 },
    });
    expect(input.analysis.direction).toBe("right-to-left");
    expect(input.materials[0]).toMatchObject({
      unitWeight: 19,
      cohesion: 12,
      frictionDegrees: 28,
      parameterMode: "effective",
      source: p.materials[0].source,
    });
    expect(input.water.line![0]).toEqual({ x: 0, z: 12 });
    expect(input.water.source).toBe(s.waterSource);
    expect(input.loads.items[0]).toMatchObject({
      id: s.loads[0].id,
      x1: 5,
      x2: 14,
      q: 20,
      source: s.loads[0].source,
    });
    expect(input.stage).toBe("inputs-only");
    expect(input).not.toHaveProperty("results");
    expect(input).not.toHaveProperty("numericalProfile");
  });

  it("mantém uma cópia imutável sem congelar ou modificar o projeto", () => {
    const { p, c, s } = fixture();
    const original = structuredClone(p);
    const prepared = prepareCoreInput(p, c.id);
    const input = prepared.snapshot!.input;
    expect(p).toEqual(original);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(input.geometry.terrain[0])).toBe(true);
    expect(Object.isFrozen(input.materials[0])).toBe(true);
    expect(Object.isFrozen(input.analysis.methods)).toBe(true);
    expect(() => Object.assign(input.loads.items[0], { q: 99 })).toThrow();
    s.loads[0].q = 99;
    s.terrain[0].y = 23;
    c.methods.splice(0, 1);
    expect(input.loads.items[0].q).toBe(20);
    expect(input.geometry.terrain[0].z).toBe(22);
    expect(input.analysis.methods).toEqual(["bishop", "fellenius"]);
    expect(JSON.parse(JSON.stringify(prepared))).toEqual(prepared);
  });

  it("resolve a seleção própria mesmo quando linha e faixa estão inativas na seção", () => {
    const { p, c, s } = fixture();
    s.waterMode = "dry";
    s.loadCondition = "none";
    s.loads[0].enabled = false;
    c.waterCondition = "piezometric";
    c.waterSource = "Levantamento do caso";
    c.loadCondition = "selected";
    c.loadIds = [s.loads[0].id];
    const prepared = prepareCoreInput(p, c.id);
    expect(prepared.status).toBe("collected");
    expect(prepared.snapshot!.input.water).toMatchObject({
      selection: "piezometric",
      mode: "piezometric",
      source: "Levantamento do caso",
      unitWeight: 9.81,
    });
    expect(prepared.snapshot!.input.loads.items).toHaveLength(1);
    expect(s.loads[0].enabled).toBe(false);
    c.waterCondition = "dry";
    c.loadCondition = "none";
    const dry = snapshot(p, c.id).input;
    expect(dry.water).toEqual({
      selection: "dry",
      mode: "dry",
      source: "Levantamento do caso",
      line: null,
      unitWeight: null,
    });
    expect(dry.loads.items).toEqual([]);
    expect(c.loadIds).toEqual([s.loads[0].id]);
    expect(s.water).not.toBeNull();
  });

  it("não transforma condição não definida, seleção vazia ou campos nulos em defaults", () => {
    const base = exampleProject();
    base.sections[0].circle = { x: 1, y: 2, radius: 3 };
    const { project: p, analysisCase: c } = addAnalysisCase(
      base,
      base.sections[0].id,
    );
    p.sections[0].backgroundMaterialId = null;
    const prepared = prepareCoreInput(p, c.id);
    expect(prepared.status).toBe("pending");
    expect(prepared.snapshot!.input).toMatchObject({
      analysis: { direction: null, methods: [] },
      surface: { mode: null },
      geometry: { backgroundMaterialId: null },
      water: { selection: null, mode: "unspecified", line: null },
      loads: { selection: null, condition: "unspecified", items: [] },
    });
    c.loadCondition = "selected";
    const selected = prepareCoreInput(p, c.id);
    expect(selected.snapshot!.input.loads.condition).toBe("loads");
    expect(
      selected.diagnostics.some((d) =>
        d.message.includes("ao menos uma faixa"),
      ),
    ).toBe(true);
  });

  it("distingue coesão, atrito e sobrecarga zero de campos pendentes", () => {
    const { p, c, s } = fixture();
    p.materials[0].cohesion = 0;
    p.materials[0].friction = 0;
    p.materials[0].mode = "total";
    s.loads[0].q = 0;
    const zero = prepareCoreInput(p, c.id);
    expect(zero.status).toBe("collected");
    expect(zero.snapshot!.input.materials[0]).toMatchObject({
      cohesion: 0,
      frictionDegrees: 0,
      parameterMode: "total",
    });
    expect(zero.snapshot!.input.loads.items[0].q).toBe(0);
    s.loads[0].q = null;
    p.materials[0].gamma = null;
    const pending = prepareCoreInput(p, c.id);
    expect(pending.status).toBe("pending");
    expect(pending.snapshot!.input.loads.items[0].q).toBeNull();
    expect(pending.snapshot!.input.materials[0].unitWeight).toBeNull();
    expect(pending.snapshot!.revision).not.toBe(zero.snapshot!.revision);
  });

  it("preserva a busca declarada com eixo fixo e passo nulo sem gerar candidatos", () => {
    const { p, c } = fixture();
    c.surfaceMode = "search";
    c.search = {
      x: { min: 0, max: 10, step: 0.3 },
      y: { min: 30, max: 30, step: null },
      radius: { min: 20, max: 25, step: 2 },
    };
    const prepared = prepareCoreInput(p, c.id);
    expect(prepared.status).toBe("collected");
    expect(prepared.snapshot!.input.surface).toEqual({
      mode: "search",
      axes: { x: c.search.x, z: c.search.y, radius: c.search.radius },
    });
    expect(prepared.snapshot!.input.surface).not.toHaveProperty("circle");
    expect(prepared.snapshot!.input.surface).not.toHaveProperty("candidates");
    c.search.x.step = null;
    expect(prepareCoreInput(p, c.id).status).toBe("pending");
    c.search.x.max = -1;
    expect(
      prepareCoreInput(p, c.id).diagnostics.some((d) => d.level === "error"),
    ).toBe(true);
  });

  it("reutiliza a conferência do caso, inclusive erros geométricos e origem ausente", () => {
    const { p, c, s } = fixture();
    s.base = 100;
    s.waterSource = "";
    p.materials[0].source = "";
    const prepared = prepareCoreInput(p, c.id);
    const expected = auditProject(p).find(
      (scope) => scope.id === c.id,
    )!.diagnostics;
    expect(prepared.status).toBe("pending");
    expect(prepared.diagnostics.map(({ code, ...d }) => d)).toEqual(expected);
    expect(prepared.diagnostics.some((d) => d.level === "error")).toBe(true);
    expect(prepared.snapshot!.input.geometry.baseZ).toBe(100);
  });

  it("conserva faces verticais sem aplicar uma convenção física", () => {
    const { p, c, s } = fixture();
    s.regions = [];
    s.terrain = [
      { x: 0, y: 20 },
      { x: 10, y: 20 },
      { x: 10, y: 10 },
      { x: 40, y: 10 },
    ];
    c.waterCondition = "dry";
    c.waterSource = "Hipótese de teste";
    c.loadCondition = "none";
    const prepared = prepareCoreInput(p, c.id);
    expect(prepared.status).toBe("collected");
    expect(prepared.snapshot!.input.geometry.terrain).toEqual([
      { x: 0, z: 20 },
      { x: 10, z: 20 },
      { x: 10, z: 10 },
      { x: 40, z: 10 },
    ]);
  });
});

describe("integridade e revisão das entradas", () => {
  it.each([
    [
      "referência de material",
      (p: Project) => {
        p.sections[0].backgroundMaterialId = "ausente";
      },
    ],
    [
      "referência de seção",
      (p: Project) => {
        p.analysisCases[0].sectionId = "ausente";
      },
    ],
    [
      "ID duplicado",
      (p: Project) => {
        p.sections[0].id = p.id;
      },
    ],
    [
      "número não finito",
      (p: Project) => {
        p.materials[0].gamma = Infinity;
      },
    ],
    [
      "campo desconhecido",
      (p: Project) => {
        Object.assign(p.analysisCases[0], { factorOfSafety: 1.5 });
      },
    ],
    [
      "faixa de outra seção mesmo inativa",
      (p: Project) => {
        const s = newSection();
        s.loads = [{ ...p.sections[0].loads[0], id: "faixa-outra-secao" }];
        p.sections.push(s);
        p.analysisCases[0].loadCondition = "none";
        p.analysisCases[0].loadIds = [s.loads[0].id];
      },
    ],
  ] as const)("recusa %s sem descartar dados silenciosamente", (_, corrupt) => {
    const { p, c } = fixture();
    corrupt(p);
    const prepared = prepareCoreInput(p, c.id);
    expect(prepared.status).toBe("unavailable");
    expect(prepared.snapshot).toBeNull();
    expect(prepared.diagnostics[0].code).toBe("invalid-project");
  });

  it("sinaliza caso ausente e exige migração prévia de arquivos antigos", () => {
    const { p, c } = fixture();
    expect(prepareCoreInput(p, "ausente")).toMatchObject({
      status: "unavailable",
      snapshot: null,
      diagnostics: [{ code: "case-not-found" }],
    });
    const { analysisCases, ...old } = p;
    const v3 = { ...old, version: 3 };
    expect(prepareCoreInput(v3, c.id).status).toBe("unavailable");
    const migrated = readProject(JSON.stringify(v3));
    expect(migrated.migrated).toBe(true);
    expect(prepareCoreInput(migrated.project, c.id).diagnostics[0].code).toBe(
      "case-not-found",
    );
    const added = addAnalysisCase(
      migrated.project,
      migrated.project.sections[0].id,
    );
    expect(prepareCoreInput(added.project, added.analysisCase.id).status).toBe(
      "pending",
    );
  });

  it("produz revisão idêntica após leitura, cópia e mudança da ordem das chaves JSON", () => {
    const { p, c } = fixture();
    const prepared = snapshot(p, c.id);
    const reordered = Object.fromEntries(Object.entries(p).reverse());
    expect(isCoreInputCurrent(reordered, prepared)).toBe(true);
    expect(snapshot(readProject(serializeProject(p)).project, c.id)).toEqual(
      prepared,
    );
    expect(JSON.parse(prepared.revision)).toEqual(prepared.input);
  });

  it.each([
    [
      "geometria abaixo da tolerância do editor",
      (p: Project) => {
        p.sections[0].terrain[0].y += 1e-9;
      },
    ],
    [
      "material compartilhado",
      (p: Project) => {
        p.materials[0].gamma = 20;
      },
    ],
    [
      "origem dos parâmetros",
      (p: Project) => {
        p.materials[0].source = "Revisão de ensaio";
      },
    ],
    [
      "linha herdada",
      (p: Project) => {
        p.sections[0].water![0].y = 11;
      },
    ],
    [
      "faixa herdada",
      (p: Project) => {
        p.sections[0].loads[0].q = 21;
      },
    ],
    [
      "direção",
      (p: Project) => {
        p.analysisCases[0].direction = "left-to-right";
      },
    ],
    [
      "círculo",
      (p: Project) => {
        p.analysisCases[0].fixedCircle.radius = 21;
      },
    ],
    [
      "hipótese",
      (p: Project) => {
        p.analysisCases[0].description = "Nova hipótese";
      },
    ],
    [
      "exclusão do caso",
      (p: Project) => {
        p.analysisCases = [];
      },
    ],
  ] as const)("detecta alteração de %s", (_, change) => {
    const { p, c } = fixture();
    const old = snapshot(p, c.id);
    change(p);
    expect(isCoreInputCurrent(p, old)).toBe(false);
  });

  it("isola dados de outras seções, materiais sem uso e configurações guardadas", () => {
    const { p, c, s } = fixture();
    c.waterCondition = "dry";
    c.waterSource = "Hipótese seca";
    c.loadCondition = "none";
    const old = snapshot(p, c.id);
    s.water = [
      { x: 0, y: 1 },
      { x: 10, y: 1 },
    ];
    s.waterUnitWeight = null;
    s.loads[0].q = null;
    s.circle = { x: 0, y: 0, radius: 1 };
    c.search.x.min = -100;
    c.loadIds = [s.loads[0].id];
    p.materials[0].color = "#123456";
    p.materials.push({ ...p.materials[0], id: "sem-uso", gamma: null });
    p.sections.push(newSection());
    const added = addAnalysisCase(p, p.sections[1].id).project;
    expect(isCoreInputCurrent(added, old)).toBe(true);
    expect(prepareCoreInput(added, c.id).status).toBe("collected");
    expect(snapshot(added, c.id).input.materials).toHaveLength(2);
  });

  it("acompanha desfazer/refazer pelo conteúdo e não por um contador ou relógio", () => {
    const { p, c } = fixture();
    const old = snapshot(p, c.id);
    const next = structuredClone(p);
    next.sections[0].loads[0].q = 30;
    const changed = commit(history(p), next);
    expect(isCoreInputCurrent(changed.present, old)).toBe(false);
    const restored = undo(changed);
    expect(isCoreInputCurrent(restored.present, old)).toBe(true);
    expect(isCoreInputCurrent(redo(restored).present, old)).toBe(false);
  });
});
