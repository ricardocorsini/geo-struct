import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  exampleProject,
  projectSchema,
  readProject,
  serializeProject,
  type AnalysisCase,
} from "../../src/domain/model";
import {
  addAnalysisCase,
  removeAnalysisCase,
  duplicateSectionWithCases,
  removeSectionWithCases,
  resolveCaseSection,
  loadCaseUses,
  caseIssues,
} from "../../src/domain/analysis";
import { activeLoads, activeWater } from "../../src/domain/conditions";
import { diagnose, introducedError } from "../../src/domain/geometry";
import { history, commit, undo, redo } from "../../src/domain/history";

function fixture() {
  const base = exampleProject(),
    { project: p, analysisCase: c } = addAnalysisCase(
      base,
      base.sections[0].id,
    );
  Object.assign(c, {
    name: "Caso úmido",
    description: "Hipótese ilustrativa para teste",
    direction: "left-to-right",
    methods: ["bishop", "fellenius"],
    surfaceMode: "fixed",
    waterCondition: "section",
    loadCondition: "section",
  });
  c.fixedCircle = { x: 25, y: 25, radius: 20 };
  return { p, c, s: p.sections[0] };
}
describe("Identidade e cenários", () => {
  it("cria caso pendente sem deduzir direção, métodos, condições ou copiar círculo", () => {
    const original = exampleProject();
    original.sections[0].circle = { x: 1, y: 2, radius: 3 };
    const { project, analysisCase: c } = addAnalysisCase(
      original,
      original.sections[0].id,
    );
    expect(c).toMatchObject({
      direction: null,
      methods: [],
      surfaceMode: null,
      waterCondition: null,
      loadCondition: null,
      loadIds: [],
      fixedCircle: { x: null, y: null, radius: null },
    });
    expect(original.analysisCases).toEqual([]);
    expect(project.sections).toEqual(original.sections);
    expect(readProject(serializeProject(project)).project).toEqual(project);
    expect(caseIssues(c).length).toBeGreaterThan(0);
  });
  it("salva casos completos sem resultados ou normalização das coordenadas ao inverter o sentido", () => {
    const { p, c } = fixture();
    c.direction = "right-to-left";
    c.fixedCircle.x = -35;
    expect(diagnose(p)).toEqual([]);
    expect(readProject(serializeProject(p))).toEqual({
      project: p,
      migrated: false,
    });
    expect(c.fixedCircle.x).toBe(-35);
    expect("results" in c).toBe(false);
  });
  it("herança acompanha os dados atuais da seção, sem alterá-los", () => {
    const { p, c, s } = fixture();
    s.loads[0].q = 35;
    s.water![0].y = 11;
    const before = structuredClone(p),
      resolved = resolveCaseSection(s, c);
    expect(activeLoads(resolved)[0].q).toBe(35);
    expect(activeWater(resolved)![0].y).toBe(11);
    resolved.loads[0].q = 99;
    expect(p).toEqual(before);
  });
  it("casos seco/úmido e seleção de faixas independem da condição e habilitação da seção", () => {
    const { p, c, s } = fixture();
    s.waterMode = "dry";
    s.loadCondition = "none";
    s.loads[0].enabled = false;
    c.waterCondition = "piezometric";
    c.waterSource = "Medição de teste";
    c.loadCondition = "selected";
    c.loadIds = [s.loads[0].id];
    const before = structuredClone(p),
      resolved = resolveCaseSection(s, c);
    expect(activeWater(resolved)).toEqual(s.water);
    expect(activeLoads(resolved)).toHaveLength(1);
    expect(resolved.waterSource).toBe("Medição de teste");
    c.waterCondition = "dry";
    c.loadCondition = "none";
    expect(activeWater(resolveCaseSection(s, c))).toBeNull();
    expect(activeLoads(resolveCaseSection(s, c))).toEqual([]);
    expect(c.loadIds).toEqual([s.loads[0].id]);
    expect(p.sections).toEqual(before.sections);
  });
  it("duplica casos com IDs próprios sem compartilhar configs ou mudar referências", () => {
    const { p, c, s } = fixture();
    c.loadCondition = "selected";
    c.loadIds = [s.loads[0].id];
    const { project, analysisCase: copy } = addAnalysisCase(p, s.id, c.id);
    expect(copy.id).not.toBe(c.id);
    expect(copy.sectionId).toBe(c.sectionId);
    expect(copy.loadIds).toEqual(c.loadIds);
    copy.fixedCircle.x = 100;
    copy.search.x.min = -50;
    copy.loadIds = [];
    expect(project.analysisCases[0]).toEqual(c);
    expect(c.fixedCircle.x).toBe(25);
    expect(c.search.x.min).toBeNull();
  });
  it("excluir caso conserva dados da seção, com desfazer/refazer integral", () => {
    const { p, c } = fixture(),
      next = removeAnalysisCase(p, c.id),
      h = commit(history(p), next);
    expect(next.analysisCases).toEqual([]);
    expect(next.sections).toEqual(p.sections);
    expect(undo(h).present).toEqual(p);
    expect(redo(undo(h)).present).toEqual(next);
  });
  it("duplica seção e casos remapeando todas as referências, inclusive seleções guardadas", () => {
    const { p, c, s } = fixture();
    c.loadIds = [s.loads[0].id];
    c.loadCondition = "none";
    const { project, section } = duplicateSectionWithCases(p, s.id),
      copy = project.analysisCases[1];
    expect(copy.sectionId).toBe(section.id);
    expect(copy.id).not.toBe(c.id);
    expect(copy.loadIds).toEqual([section.loads[0].id]);
    expect(copy.loadIds).not.toEqual(c.loadIds);
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(p.sections).toHaveLength(1);
    expect(project.analysisCases[0]).toEqual(c);
    expect(project.sections[0]).toEqual(s);
    expect(removeSectionWithCases(project, s.id).analysisCases).toEqual([copy]);
  });
  it("limite impede duplicação parcial de seção com casos", () => {
    const { p, c, s } = fixture();
    p.analysisCases = Array.from({ length: 100 }, (_, i) => ({
      ...structuredClone(c),
      id: `case-${i}`,
    }));
    const before = structuredClone(p);
    expect(() => duplicateSectionWithCases(p, s.id)).toThrow(/100 casos/);
    expect(() => addAnalysisCase(p, s.id)).toThrow(/100 casos/);
    expect(p).toEqual(before);
  });
  it("rejeita seção/caso inexistente e não remove a única seção", () => {
    const { p, c, s } = fixture();
    expect(() => addAnalysisCase(p, "missing")).toThrow();
    expect(() => addAnalysisCase(p, s.id, "missing")).toThrow();
    expect(() => removeAnalysisCase(p, "missing")).toThrow();
    expect(() => removeSectionWithCases(p, s.id)).toThrow();
    expect(() => resolveCaseSection({ ...s, id: "other" }, c)).toThrow(
      /outra seção/,
    );
  });
  it("lista usos guardados e não permite referências penduradas nem faixas de outra seção", () => {
    const { p, c, s } = fixture();
    c.loadIds = [s.loads[0].id];
    c.loadCondition = "none";
    expect(loadCaseUses(p, s.loads[0].id)).toEqual([c]);
    const next = structuredClone(p);
    next.sections[0].loads = [];
    expect(projectSchema.safeParse(next).success).toBe(false);
    const duplicated = duplicateSectionWithCases(p, s.id).project;
    duplicated.analysisCases[1].loadIds = [s.loads[0].id];
    expect(() => readProject(JSON.stringify(duplicated))).toThrow(
      /outra seção/,
    );
  });
});
describe("Conferência das entradas de casos", () => {
  it("superfície fixa incompleta permanece salvável e identificada", () => {
    const { p, c } = fixture();
    c.fixedCircle.radius = null;
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(diagnose(p)).toContainEqual(
      expect.objectContaining({
        target: c.id,
        level: "warning",
        message: expect.stringContaining("complete o centro"),
      }),
    );
  });
  it.each([0, -1, 1000001, Infinity, NaN])(
    "recusa raio estrutural inválido %s mesmo guardado",
    (value) => {
      const { p, c } = fixture();
      c.surfaceMode = "search";
      c.fixedCircle.radius = value;
      expect(projectSchema.safeParse(p).success).toBe(false);
    },
  );
  it.each([0, -1, Infinity, NaN])(
    "recusa passo inválido %s sem assumir passo padrão",
    (value) => {
      const { p, c } = fixture();
      c.search.x.step = value;
      expect(projectSchema.safeParse(p).success).toBe(false);
    },
  );
  it("aceita eixo de busca fixo sem passo, mas exige passo em intervalo não nulo", () => {
    const { p, c } = fixture();
    c.surfaceMode = "search";
    c.search = {
      ...c.search,
      x: { min: 0, max: 10, step: null },
      y: { min: 20, max: 20, step: null },
      radius: { min: 10, max: 20, step: 1 },
    };
    expect(caseIssues(c)).toEqual([
      { level: "warning", message: "Centro X: informe o passo da busca." },
    ]);
    c.search.x.step = 0.5;
    expect(diagnose(p)).toEqual([]);
    expect(
      readProject(serializeProject(p)).project.analysisCases[0].search,
    ).toEqual(c.search);
  });
  it("troca de modo conserva dados e acusa limites invertidos quando ativos", () => {
    const { p, c } = fixture();
    c.search = {
      ...c.search,
      x: { min: 10, max: 0, step: 1 },
      y: { min: 20, max: 30, step: 1 },
      radius: { min: 10, max: 20, step: 1 },
    };
    expect(diagnose(p)).toEqual([]);
    const next = structuredClone(p);
    next.analysisCases[0].surfaceMode = "search";
    expect(introducedError(p, next)?.target).toBe(c.id);
    expect(next.analysisCases[0].fixedCircle).toEqual(c.fixedCircle);
    expect(next.analysisCases[0].search.x).toEqual({
      min: 10,
      max: 0,
      step: 1,
    });
  });
  it("seleção explícita vazia não significa ausência de cargas", () => {
    const { p, c } = fixture();
    c.loadCondition = "selected";
    c.loadIds = [];
    expect(
      diagnose(p).some(
        (d) => d.target === c.id && d.message.includes("selecione ao menos"),
      ),
    ).toBe(true);
    c.loadCondition = "none";
    expect(diagnose(p)).toEqual([]);
  });
  it("diagnostica água e cargas do cenário, incluindo lançamentos inativos na seção", () => {
    const { p, c, s } = fixture();
    s.waterMode = "dry";
    s.loadCondition = "none";
    s.loads[0].x2 = 100;
    s.water = [
      { x: 10, y: 30 },
      { x: 50, y: 30 },
    ];
    c.waterCondition = "piezometric";
    c.waterSource = "Hipótese do caso";
    c.loadCondition = "selected";
    c.loadIds = [s.loads[0].id];
    const diagnostics = diagnose(p).filter((d) => d.target === c.id);
    expect(diagnostics.some((d) => d.message.includes("não cobre"))).toBe(true);
    expect(
      diagnostics.some((d) => d.message.includes("acima do terreno")),
    ).toBe(true);
    expect(
      diagnostics.some(
        (d) => d.level === "error" && d.message.includes("limites da faixa"),
      ),
    ).toBe(true);
  });
  it("mudança na seção que invalidaria um caso é identificada sem mutar a entrada", () => {
    const { p, c, s } = fixture();
    s.loadCondition = "none";
    c.loadCondition = "selected";
    c.loadIds = [s.loads[0].id];
    const next = structuredClone(p);
    next.sections[0].loads[0].x2 = 100;
    expect(introducedError(p, next)?.target).toBe(c.id);
    expect(s.loads[0].x2).toBe(14);
  });
  it("identidade de caso faz parte da unicidade global e coleções não aceitam duplicatas", () => {
    const { p, c, s } = fixture();
    c.id = s.id;
    expect(projectSchema.safeParse(p).success).toBe(false);
    c.id = "case";
    c.methods = ["bishop", "bishop"];
    expect(projectSchema.safeParse(p).success).toBe(false);
    c.methods = ["bishop"];
    c.loadIds = [s.loads[0].id, s.loads[0].id];
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
});
describe("Migração para v6", () => {
  const legacy = () =>
    JSON.parse(
      readFileSync(
        new URL("../../examples/talude-duas-camadas.geo.json", import.meta.url),
        "utf8",
      ),
    );
  it.each([1, 2])(
    "v%s preserva desenho e dados, sem criar cenário automaticamente",
    (version) => {
      const old = legacy();
      old.version = version;
      old.sections[0].circle = { x: 10, y: 20, radius: 5 };
      const { project, migrated } = readProject(JSON.stringify(old));
      expect(migrated).toBe(true);
      expect(project).toMatchObject({ ...old, version: 6, analysisCases: [] });
    },
  );
  it("v3 preserva integralmente dados, inativos e pendências, acrescentando lista vazia", () => {
    const { analysisCases, ...data } = exampleProject();
    data.sections[0].waterMode = "dry";
    data.sections[0].loadCondition = "none";
    data.sections[0].loads[0].q = null;
    const old = { ...data, version: 3 };
    const result = readProject(JSON.stringify(old));
    expect(result).toEqual({
      project: { ...old, version: 6, analysisCases: [] },
      migrated: true,
    });
  });
  it("v5 preserva casos e busca, acrescentando trechos nulos", () => {
    const { p, c } = fixture();
    const { entryRange: _e, exitRange: _s, ...v5Search } = c.search;
    const old = {
      ...p,
      version: 5,
      analysisCases: [{ ...c, search: v5Search }],
    };
    const result = readProject(JSON.stringify(old));
    expect(result).toEqual({
      project: {
        ...old,
        version: 6,
        analysisCases: [
          {
            ...c,
            search: {
              ...v5Search,
              entryRange: { min: null, max: null },
              exitRange: { min: null, max: null },
            },
          },
        ],
      },
      migrated: true,
    });
  });
  it("v6 não descarta campo desconhecido de caso nem aceita referência ausente", () => {
    const { p, c } = fixture();
    const data = JSON.parse(serializeProject(p));
    data.analysisCases[0].solverResult = 1.5;
    expect(() => readProject(JSON.stringify(data))).toThrow();
    c.sectionId = "missing";
    expect(() => serializeProject(p)).toThrow(/Seção inexistente/);
  });
  it("versão antiga com dados de caso novos é recusada sem perda silenciosa", () => {
    const { p } = fixture();
    expect(() => readProject(JSON.stringify({ ...p, version: 3 }))).toThrow(
      /inválido/,
    );
  });
});
