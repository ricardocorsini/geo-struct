import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  newProject,
  newSection,
  newMaterial,
  exampleProject,
  duplicateSection,
  projectSchema,
  parseProject,
  readProject,
  serializeProject,
  materialSchema,
} from "../../src/domain/model";
import {
  addMaterial,
  assignMaterial,
  removeMaterial,
  materialPending,
  materialUses,
} from "../../src/domain/materials";
import { diagnose } from "../../src/domain/geometry";
import { history, commit, undo, redo } from "../../src/domain/history";

describe("Cadastro e atribuição explícita", () => {
  it("novo projeto e novas seções não presumem material ou tipo de resistência", () => {
    const p = newProject("P");
    expect(p.sections[0].backgroundMaterialId).toBeNull();
    expect(newSection().backgroundMaterialId).toBeNull();
    expect(newMaterial().mode).toBeNull();
    expect(materialPending(p.materials[0])).toHaveLength(5);
    expect(
      diagnose(p).some((d) => d.message.includes("solo de fundo sem material")),
    ).toBe(true);
  });
  it("zero de coesão/atrito é dado preenchido e tipo de resistência é obrigatório no cadastro completo", () => {
    const m = {
      ...newMaterial(),
      gamma: 18,
      cohesion: 0,
      friction: 0,
      source: "Ensaio",
    };
    expect(materialPending(m)).toEqual(["tipo de parâmetros de resistência"]);
    expect(materialPending({ ...m, mode: "total" })).toEqual([]);
    expect(materialPending({ ...m, mode: "effective", source: "  " })).toEqual([
      "origem dos parâmetros",
    ]);
  });
  it.each([
    ["gamma", 0],
    ["gamma", -1],
    ["gamma", 101],
    ["gamma", Infinity],
    ["cohesion", -1],
    ["cohesion", 1e6 + 1],
    ["cohesion", NaN],
    ["friction", -1],
    ["friction", 90],
    ["friction", Infinity],
  ])(
    "recusa parâmetro inválido %s=%s sem coagir ou arredondar",
    (field, value) => {
      expect(
        materialSchema.safeParse({ ...newMaterial(), [field]: value }).success,
      ).toBe(false);
    },
  );
  it("atribui em lote somente à seção escolhida em uma transação", () => {
    const p = exampleProject(),
      s = p.sections[0];
    p.sections.push(duplicateSection(s));
    const next = assignMaterial(
      p,
      s.id,
      [{ kind: "background" }, { kind: "region", id: s.regions[0].id }],
      p.materials[1].id,
    );
    expect(next.sections[0].backgroundMaterialId).toBe(p.materials[1].id);
    expect(next.sections[0].regions[0].materialId).toBe(p.materials[1].id);
    expect(next.sections[1]).toEqual(p.sections[1]);
    expect(next.sections[0].terrain).toEqual(s.terrain);
    const h = commit(history(p), next);
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toEqual(p);
    expect(redo(undo(h)).present).toEqual(next);
  });
  it("pode retirar explicitamente uma atribuição e identifica região e seção da pendência", () => {
    const p = exampleProject(),
      s = p.sections[0];
    const next = assignMaterial(
      p,
      s.id,
      [{ kind: "region", id: s.regions[0].id }],
      null,
    );
    expect(projectSchema.safeParse(next).success).toBe(true);
    expect(diagnose(next)).toContainEqual(
      expect.objectContaining({
        target: s.regions[0].id,
        sectionId: s.id,
        level: "warning",
      }),
    );
    expect(next.sections[0].backgroundMaterialId).toBe(s.backgroundMaterialId);
  });
  it("rejeita lote inválido por inteiro, sem mudar o original", () => {
    const p = exampleProject(),
      before = structuredClone(p);
    expect(() =>
      assignMaterial(
        p,
        p.sections[0].id,
        [{ kind: "background" }, { kind: "region", id: "missing" }],
        null,
      ),
    ).toThrow(/regiões/);
    expect(p).toEqual(before);
    expect(() => assignMaterial(p, p.sections[0].id, [], null)).toThrow(
      /destino/,
    );
    expect(() =>
      assignMaterial(p, p.sections[0].id, [{ kind: "background" }], "missing"),
    ).toThrow(/material existente/);
  });
  it("duplicação de material mantém parâmetros e origem sem novas atribuições", () => {
    const p = exampleProject(),
      original = structuredClone(p);
    const a = addMaterial(p, p.materials[0].id),
      b = addMaterial(a.project, p.materials[0].id);
    expect(a.material.id).not.toBe(p.materials[0].id);
    expect({
      ...a.material,
      id: p.materials[0].id,
      name: p.materials[0].name,
    }).toEqual(p.materials[0]);
    expect(b.material.name).not.toBe(a.material.name);
    expect(materialUses(b.project, a.material.id)).toEqual([]);
    expect(b.project.sections).toEqual(p.sections);
    expect(p).toEqual(original);
  });
  it("exclusão de material em uso exige substituto válido", () => {
    const p = exampleProject(),
      id = p.materials[0].id;
    for (const replacement of [undefined, id, "missing"])
      expect(() => removeMaterial(p, id, replacement)).toThrow(/substituir/);
    expect(p.materials).toHaveLength(2);
  });
  it("substituição e exclusão percorrem todas as seções preservando IDs e histórico", () => {
    const p = exampleProject();
    p.sections.push(duplicateSection(p.sections[0]));
    const oldId = p.materials[1].id,
      newId = p.materials[0].id;
    expect(materialUses(p, oldId)).toHaveLength(2);
    const next = removeMaterial(p, oldId, newId);
    expect(next.materials).toHaveLength(1);
    expect(materialUses(next, oldId)).toEqual([]);
    expect(materialUses(next, newId)).toHaveLength(4);
    expect(next.sections.map((s) => s.regions[0].id)).toEqual(
      p.sections.map((s) => s.regions[0].id),
    );
    expect(next.sections[1].regions[0].points).toEqual(
      p.sections[1].regions[0].points,
    );
    expect(undo(commit(history(p), next)).present).toEqual(p);
    expect(parseProject(serializeProject(next))).toEqual(next);
  });
  it("último material sem uso pode ser excluído e projeto incompleto continua salvável", () => {
    const p = newProject("Geometria primeiro");
    const next = removeMaterial(p, p.materials[0].id);
    expect(next.materials).toEqual([]);
    expect(parseProject(serializeProject(next))).toEqual(next);
    expect(addMaterial(next).project.materials).toHaveLength(1);
  });
  it("limite de materiais é preservado na criação e duplicação", () => {
    const p = newProject("P");
    p.materials = Array.from({ length: 100 }, () => newMaterial());
    expect(() => addMaterial(p)).toThrow(/100/);
    expect(() => addMaterial(p, p.materials[0].id)).toThrow(/100/);
  });
});

describe("Migração de arquivos de materiais", () => {
  const legacy = () =>
    JSON.parse(
      readFileSync(
        new URL("../../examples/talude-duas-camadas.geo.json", import.meta.url),
        "utf8",
      ),
    );
  it("migra v1 preservando integralmente os dados, inclusive referências e tipo de parâmetros", () => {
    const old = legacy(),
      result = readProject(JSON.stringify(old));
    expect(result.migrated).toBe(true);
    expect(result.project).toMatchObject({ ...old, version: 5 });
    expect(readProject(serializeProject(result.project))).toEqual({
      project: result.project,
      migrated: false,
    });
  });
  it("não aceita nulos nem referências inválidas disfarçados de versão antiga", () => {
    const old = legacy();
    old.sections[0].backgroundMaterialId = null;
    expect(() => parseProject(JSON.stringify(old))).toThrow(/inválido/);
    old.sections[0].backgroundMaterialId = "missing";
    expect(() => parseProject(JSON.stringify(old))).toThrow(
      /Material inexistente/,
    );
  });
  it("não descarta silenciosamente campos de material desconhecidos", () => {
    for (const p of [legacy(), exampleProject()]) {
      Object.assign(p.materials[0], { gammaSaturated: 22 });
      expect(() => parseProject(JSON.stringify(p))).toThrow(/gammaSaturated/);
    }
  });
  it("tipo total mantém c e φ informados sem converter para outros modelos", () => {
    const p = exampleProject();
    p.materials[0].mode = "total";
    p.materials[0].cohesion = 31.123456789;
    p.materials[0].friction = 9.87654321;
    expect(parseProject(serializeProject(p)).materials[0]).toEqual(
      p.materials[0],
    );
  });
});
