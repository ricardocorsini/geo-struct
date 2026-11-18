import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  exampleProject,
  newProject,
  duplicateSection,
  readProject,
  serializeProject,
  projectSchema,
} from "../../src/domain/model";
import {
  activeWater,
  activeLoads,
  createLoad,
  duplicateLoad,
  enableLoad,
  removeLoad,
  setLoadCondition,
  setWaterMode,
  loadPending,
} from "../../src/domain/conditions";
import {
  diagnose,
  introducedError,
  loadOverlaps,
} from "../../src/domain/geometry";
import { history, commit, undo, redo } from "../../src/domain/history";

const legacy = () =>
  JSON.parse(
    readFileSync(
      new URL("../../examples/talude-duas-camadas.geo.json", import.meta.url),
      "utf8",
    ),
  );

describe("Condições explícitas e preservação", () => {
  it("projeto novo não assume ausência de água ou cargas", () => {
    const p = newProject("Condições"),
      s = p.sections[0];
    expect(s).toMatchObject({
      waterMode: "unspecified",
      waterUnitWeight: null,
      waterSource: "",
      loadCondition: "unspecified",
    });
    expect(
      diagnose(p).filter((d) => ["water", "loads"].includes(d.target)),
    ).toHaveLength(2);
    expect(readProject(serializeProject(p)).project).toEqual(p);
  });
  it("alternar seca/piezométrica preserva a linha e seus dados sem compartilhar objetos", () => {
    const s = exampleProject().sections[0],
      before = structuredClone(s);
    const dry = setWaterMode(s, "dry");
    expect(activeWater(dry)).toBeNull();
    expect(setWaterMode(dry, "piezometric")).toEqual(s);
    dry.water![0].y = 100;
    expect(s).toEqual(before);
  });
  it("desativar todas as cargas preserva valores e a habilitação individual", () => {
    const s = exampleProject().sections[0];
    const next = setLoadCondition(s, "none");
    expect(activeLoads(next)).toEqual([]);
    expect(next.loads).toEqual(s.loads);
    expect(setLoadCondition(next, "loads")).toEqual(s);
    expect(activeLoads(setLoadCondition(s, "unspecified"))).toEqual([]);
  });
  it("nova carga começa sem intensidade e ativa a condição da seção", () => {
    const s = newProject("Novo").sections[0];
    const { section, load } = createLoad(s, 1, 5);
    expect(load).toMatchObject({
      x1: 1,
      x2: 5,
      q: null,
      source: "",
      enabled: true,
    });
    expect(section.loadCondition).toBe("loads");
    expect(loadPending(load)).toEqual([
      "intensidade q",
      "origem da sobrecarga",
    ]);
    load.q = 0;
    load.source = "Hipótese explicitada";
    expect(loadPending(load)).toEqual([]);
    expect(s.loads).toEqual([]);
  });
  it("cópia desabilitada conserva origem, tem ID próprio e não duplica carregamento ativo", () => {
    const s = exampleProject().sections[0],
      { section, load } = duplicateLoad(s, s.loads[0].id);
    expect(load.id).not.toBe(s.loads[0].id);
    expect(load).toMatchObject({
      enabled: false,
      q: 20,
      source: s.loads[0].source,
    });
    expect(activeLoads(section)).toEqual(s.loads);
    expect(loadOverlaps(section)).toEqual([]);
    expect(loadOverlaps(enableLoad(section, load.id, true))).toHaveLength(1);
    expect(section.loads[1].enabled).toBe(false);
  });
  it("remover a última faixa mantém condição pendente até uma decisão explícita", () => {
    const p = exampleProject();
    p.sections[0] = removeLoad(p.sections[0], p.sections[0].loads[0].id);
    expect(p.sections[0].loadCondition).toBe("loads");
    expect(diagnose(p)).toContainEqual(
      expect.objectContaining({ target: "loads", level: "warning" }),
    );
    p.sections[0] = setLoadCondition(p.sections[0], "none");
    expect(diagnose(p)).toEqual([]);
  });
  it("alterações de condições e cargas são isoladas por seção e reversíveis", () => {
    const p = exampleProject();
    p.sections.push(duplicateSection(p.sections[0]));
    const next = structuredClone(p);
    next.sections[0] = setWaterMode(
      setLoadCondition(next.sections[0], "none"),
      "dry",
    );
    const h = commit(history(p), next);
    expect(undo(h).present).toEqual(p);
    expect(redo(undo(h)).present).toEqual(next);
    expect(next.sections[1]).toEqual(p.sections[1]);
  });
  it("respeita limite de faixas e recusa IDs inexistentes sem mutar o original", () => {
    const s = exampleProject().sections[0];
    s.loads = Array.from({ length: 100 }, (_, i) => ({
      ...s.loads[0],
      id: `load-${i}`,
      name: `Faixa ${i}`,
    }));
    expect(() => createLoad(s, 1, 2)).toThrow(/100/);
    expect(() => duplicateLoad(s, s.loads[0].id)).toThrow(/100/);
    expect(() => enableLoad(s, "missing", true)).toThrow(/existe/);
    expect(() => removeLoad(s, "missing")).toThrow(/existe/);
    expect(s.loads).toHaveLength(100);
  });
});

describe("Conferência de água e cargas", () => {
  it("condição seca exige origem, mas dispensa peso específico e linha", () => {
    const p = exampleProject(),
      s = p.sections[0];
    s.waterMode = "dry";
    s.water = null;
    s.waterUnitWeight = null;
    s.waterSource = "";
    expect(diagnose(p).filter((d) => d.target === "water")).toEqual([
      expect.objectContaining({
        level: "warning",
        message: expect.stringContaining("origem"),
      }),
    ]);
    s.waterSource = "Hipótese seca para este caso";
    expect(diagnose(p)).toEqual([]);
  });
  it("linha incompleta e peso específico vazio são pendências salváveis", () => {
    const p = exampleProject(),
      s = p.sections[0];
    s.water = [{ x: 0, y: 2 }];
    s.waterUnitWeight = null;
    expect(diagnose(p).filter((d) => d.target === "water")).toHaveLength(2);
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
  it.each([0, -1, 101, Infinity, NaN])(
    "recusa peso específico da água %s",
    (weight) => {
      const p = exampleProject();
      p.sections[0].waterUnitWeight = weight;
      expect(projectSchema.safeParse(p).success).toBe(false);
    },
  );
  it.each([-1, 1000001, Infinity, NaN])("recusa intensidade %s", (q) => {
    const p = exampleProject();
    p.sections[0].loads[0].q = q;
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
  it("q vazio é pendência e zero é informação explícita, sem conversão", () => {
    const p = exampleProject(),
      load = p.sections[0].loads[0];
    load.q = null;
    expect(diagnose(p)).toContainEqual(
      expect.objectContaining({ target: load.id, level: "warning" }),
    );
    expect(
      readProject(serializeProject(p)).project.sections[0].loads[0].q,
    ).toBeNull();
    load.q = 0;
    expect(diagnose(p)).toEqual([
      expect.objectContaining({ target: load.id, level: "info" }),
    ]);
    expect(
      readProject(serializeProject(p)).project.sections[0].loads[0].q,
    ).toBe(0);
  });
  it("água acima do terreno é detectada no vértice interior e no lado baixo de face vertical", () => {
    const p = exampleProject(),
      s = p.sections[0];
    s.regions = [];
    s.loads = [];
    s.loadCondition = "none";
    s.terrain = [
      { x: 0, y: 10 },
      { x: 10, y: 2 },
      { x: 20, y: 10 },
    ];
    s.water = [
      { x: 0, y: 5 },
      { x: 20, y: 5 },
    ];
    expect(
      diagnose(p).some((d) => d.message.includes("acima do terreno")),
    ).toBe(true);
    s.terrain = [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 2 },
      { x: 20, y: 2 },
    ];
    expect(
      diagnose(p).some((d) => d.message.includes("acima do terreno")),
    ).toBe(true);
    s.water = [
      { x: 0, y: 1 },
      { x: 20, y: 1 },
    ];
    expect(diagnose(p)).toEqual([]);
  });
  it("linha e faixas inativas não geram erros geométricos; reativação inválida é detectada", () => {
    const p = exampleProject(),
      s = p.sections[0];
    s.waterMode = "dry";
    s.water = [
      { x: 5, y: 2 },
      { x: 1, y: 2 },
    ];
    s.loadCondition = "none";
    s.loads[0].x2 = 100;
    expect(diagnose(p)).toEqual([]);
    const next = structuredClone(p);
    next.sections[0].waterMode = "piezometric";
    expect(introducedError(p, next)?.target).toBe("water");
    next.sections[0].waterMode = "dry";
    next.sections[0].loadCondition = "loads";
    expect(introducedError(p, next)?.target).toBe(s.loads[0].id);
    next.sections[0].loads[0].enabled = false;
    expect(diagnose(next).some((d) => d.level === "error")).toBe(false);
  });
  it("sobreposição compara apenas faixas ativas e exclui contato nas bordas", () => {
    const p = exampleProject(),
      s = p.sections[0];
    s.loads = [
      { ...s.loads[0], id: "a", x1: 0, x2: 10 },
      { ...s.loads[0], id: "b", x1: 10, x2: 15 },
      { ...s.loads[0], id: "c", x1: 5, x2: 7 },
      { ...s.loads[0], id: "d", x1: 0, x2: 60, enabled: false },
    ];
    expect(loadOverlaps(s)).toEqual([
      { firstId: "a", secondId: "c", x1: 5, x2: 7 },
    ]);
    expect(diagnose(p)).toContainEqual(
      expect.objectContaining({ target: "loads", level: "warning" }),
    );
  });
  it("um erro de água de outra seção não mascara uma nova ativação inválida", () => {
    const before = exampleProject();
    before.sections[0].water = [
      { x: 5, y: 2 },
      { x: 1, y: 2 },
    ];
    const other = duplicateSection(before.sections[0]);
    other.name = before.sections[0].name;
    other.waterMode = "dry";
    before.sections.push(other);
    const after = structuredClone(before);
    after.sections[1].waterMode = "piezometric";
    expect(introducedError(before, after)?.sectionId).toBe(other.id);
  });
});

describe("Condições de água/cargas e migração", () => {
  it.each([1, 2])(
    "migra v%s preservando IDs, geometria, materiais e q = 0",
    (version) => {
      const old = legacy();
      old.version = version;
      old.sections[0].loads[0].q = 0;
      const { project, migrated } = readProject(JSON.stringify(old));
      expect(migrated).toBe(true);
      expect(project).toMatchObject({ ...old, version: 5 });
      expect(project.sections[0]).toMatchObject({
        waterMode: "piezometric",
        waterUnitWeight: null,
        waterSource: "",
        loadCondition: "loads",
      });
      expect(project.sections[0].loads[0]).toEqual({
        ...old.sections[0].loads[0],
        enabled: true,
        source: "",
      });
      expect(readProject(serializeProject(project))).toEqual({
        project,
        migrated: false,
      });
    },
  );
  it.each([1, 2])(
    "v%s sem linha ou cargas permanece não definido",
    (version) => {
      const old = legacy();
      old.version = version;
      old.sections[0].water = null;
      old.sections[0].loads = [];
      const { project } = readProject(JSON.stringify(old));
      expect(project.sections[0]).toMatchObject({
        waterMode: "unspecified",
        loadCondition: "unspecified",
      });
    },
  );
  it("aceita as pendências de materiais permitidas em v2 sem inventar valores", () => {
    const old = legacy();
    old.version = 2;
    old.materials = [];
    old.sections[0].backgroundMaterialId = null;
    old.sections[0].regions[0].materialId = null;
    const { project } = readProject(JSON.stringify(old));
    expect(project.materials).toEqual([]);
    expect(project.sections[0].regions[0].materialId).toBeNull();
  });
  it.each([1, 2, 3])(
    "não descarta campos de água/carga desconhecidos em v%s",
    (version) => {
      const { analysisCases, ...v3 } = exampleProject();
      const p = version === 3 ? v3 : legacy();
      p.version = version;
      p.sections[0].loads[0].direction = "horizontal";
      expect(() => readProject(JSON.stringify(p))).toThrow(/inválido/);
    },
  );
  it("declaração v2 não pode ocultar intensidade nula ou campos novos", () => {
    const p = legacy();
    p.version = 2;
    p.sections[0].loads[0].q = null;
    expect(() => readProject(JSON.stringify(p))).toThrow(/inválido/);
    p.sections[0].loads[0].q = 0;
    p.sections[0].waterMode = "dry";
    expect(() => readProject(JSON.stringify(p))).toThrow(/inválido/);
  });
});
