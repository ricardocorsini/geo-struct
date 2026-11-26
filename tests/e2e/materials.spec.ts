import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  newProject,
  exampleProject,
  duplicateSection,
  type Project,
} from "../../src/domain/model";

function unassigned() {
  const p = newProject("Atribuição explícita");
  p.sections[0].base = 0;
  p.sections[0].terrain = [
    { x: 0, y: 10 },
    { x: 20, y: 10 },
  ];
  return p;
}
async function open(page: Page, p: unknown) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "materiais.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno" }),
  ).toBeVisible();
}
async function save(page: Page): Promise<Project> {
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const stream = (await (await promise).createReadStream())!;
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  return JSON.parse(text);
}
async function materials(page: Page) {
  await page.getByRole("tab", { name: "Materiais", exact: true }).click();
  await page
    .getByRole("button", { name: "Gerenciar materiais", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Materiais do projeto" });
}
async function region(page: Page) {
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page
    .getByRole("button", { name: "Região de solo", exact: true })
    .click();
  const entry = page.locator(".point-entry");
  await entry.locator("summary").click();
  for (const [x, z] of [
    [1, 1],
    [5, 1],
    [5, 5],
    [1, 5],
  ]) {
    await entry.getByLabel("Primeira coordenada").fill(String(x));
    await entry.getByLabel("Segunda coordenada").fill(String(z));
    await entry
      .getByRole("button", { name: "Adicionar ponto", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Região de solo" }),
  ).toBeVisible();
}

test("região nova não assume o primeiro material e a atribuição em lote tem histórico único", async ({
  page,
}) => {
  const p = unassigned();
  await open(page, p);
  await expect(page.getByLabel("Solo de fundo", { exact: true })).toHaveValue(
    "",
  );
  await region(page);
  await expect(
    page.getByLabel("Material da região", { exact: true }),
  ).toHaveValue("");
  const before = await save(page);
  expect(before.sections[0].regions[0].materialId).toBeNull();
  await page.getByRole("tab", { name: "Materiais", exact: true }).click();
  await page
    .getByRole("button", { name: "Atribuir material", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Atribuir material" });
  await dialog
    .getByLabel("Material a atribuir")
    .selectOption(`material:${p.materials[0].id}`);
  await expect(dialog).toContainText("faltam:");
  await dialog.getByRole("button", { name: "Marcar sem material" }).click();
  await dialog.getByRole("button", { name: "Aplicar atribuição" }).click();
  const after = await save(page);
  expect(after.sections[0].backgroundMaterialId).toBe(p.materials[0].id);
  expect(after.sections[0].regions[0].materialId).toBe(p.materials[0].id);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect(await save(page)).toEqual(before);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  expect(await save(page)).toEqual(after);
});

test("cadastro valida limites, preserva rascunhos e distingue parâmetros efetivos e totais", async ({
  page,
}) => {
  const p = exampleProject();
  await open(page, p);
  await page
    .getByRole("button", { name: "Solo residual", exact: true })
    .click();
  await expect(page.getByLabel("Coesão c′ (kPa)", { exact: true })).toHaveValue(
    "12",
  );
  await page.getByLabel("Atrito φ′ (°)", { exact: true }).fill("90");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("menor que 90°");
  await page.getByRole("tab", { name: "Materiais", exact: true }).click();
  await page
    .getByRole("button", { name: "Gerenciar materiais", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edição em andamento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(page.getByLabel("Atrito φ′ (°)", { exact: true })).toHaveValue(
    "90",
  );
  await page
    .getByLabel("Parâmetros de resistência", { exact: true })
    .selectOption("total");
  await expect(page.getByLabel("Coesão c (kPa)", { exact: true })).toHaveValue(
    "12",
  );
  await page.getByLabel("Atrito φ (°)", { exact: true }).fill("0");
  await page.getByLabel("Coesão c (kPa)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  const result = await save(page);
  expect(result.materials[0]).toEqual({
    ...p.materials[0],
    mode: "total",
    cohesion: 0,
    friction: 0,
  });
  const manager = await materials(page);
  await expect(
    manager.getByRole("row").filter({ hasText: "Solo residual" }),
  ).toContainText("Dados preenchidos");
});

test("duplicar material conserva origem e não altera os usos ou parâmetros do original", async ({
  page,
}) => {
  const p = exampleProject();
  await open(page, p);
  const manager = await materials(page);
  await manager
    .getByRole("button", { name: "Duplicar Solo residual", exact: true })
    .click();
  await expect(
    manager.getByRole("row").filter({ hasText: "Solo residual — cópia" }),
  ).toContainText("Sem uso");
  await manager
    .getByRole("button", { name: "Editar Solo residual — cópia", exact: true })
    .click();
  await page
    .getByLabel("Peso específico total γ (kN/m³)", { exact: true })
    .fill("21,7");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  const result = await save(page),
    copy = result.materials[2];
  expect(copy.id).not.toBe(p.materials[0].id);
  expect(copy.gamma).toBe(21.7);
  expect(copy.source).toBe(p.materials[0].source);
  expect(result.materials[0]).toEqual(p.materials[0]);
  expect(result.sections).toEqual(p.sections);
});

test("substitui e exclui material em todas as seções com uma única confirmação e desfazer", async ({
  page,
}) => {
  const p = exampleProject();
  p.sections.push(duplicateSection(p.sections[0]));
  await page.setViewportSize({ width: 960, height: 640 });
  await open(page, p);
  const manager = await materials(page);
  await manager
    .getByRole("button", { name: "Excluir Aterro compactado", exact: true })
    .click();
  await expect(
    manager.getByRole("button", { name: "Substituir e excluir" }),
  ).toBeDisabled();
  await manager
    .getByLabel("Material substituto")
    .selectOption(p.materials[0].id);
  await manager.getByRole("button", { name: "Substituir e excluir" }).click();
  await expect(
    manager.getByRole("button", {
      name: "Editar Aterro compactado",
      exact: true,
    }),
  ).toHaveCount(0);
  await manager.getByRole("button", { name: "Fechar janela" }).click();
  const result = await save(page);
  expect(result.materials).toHaveLength(1);
  for (const s of result.sections)
    expect(s.regions[0].materialId).toBe(p.materials[0].id);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect(await save(page)).toEqual(p);
});

test("exclui o último material sem uso e continua desenhando sem atribuição presumida", async ({
  page,
}) => {
  const p = unassigned();
  await open(page, p);
  const manager = await materials(page);
  await manager
    .getByRole("button", { name: "Excluir Solo 1", exact: true })
    .click();
  await manager.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(manager).toContainText("Nenhum material cadastrado");
  await manager.getByRole("button", { name: "Fechar janela" }).click();
  await region(page);
  const result = await save(page);
  expect(result.materials).toEqual([]);
  expect(result.sections[0].regions[0].materialId).toBeNull();
  await page.getByRole("button", { name: "Entradas", exact: true }).click();
  await expect(page.locator("#project-report")).toContainText("Sem material");
  await expect(page.locator("#project-report")).toContainText("geostruct/6");
});

test("localiza uma atribuição de outra seção pelo gerenciador", async ({
  page,
}) => {
  const p = exampleProject();
  p.sections.push(duplicateSection(p.sections[0]));
  await open(page, p);
  const manager = await materials(page),
    row = manager.getByRole("row").filter({ hasText: "Aterro compactado" });
  await row.locator("summary").click();
  await row
    .getByRole("button", {
      name: "Seção A–A — cópia · Camada de aterro",
      exact: true,
    })
    .click();
  await expect(page.locator(".canvas-label")).toContainText(
    "Seção A–A — cópia",
  );
  await expect(
    page.getByLabel("Material da região", { exact: true }),
  ).toHaveValue(p.materials[1].id);
});

test("leitura de v1 comunica migração e o salvamento v5 preserva todos os dados", async ({
  page,
}) => {
  const legacy = JSON.parse(
    readFileSync(
      new URL("../../examples/talude-duas-camadas.geo.json", import.meta.url),
      "utf8",
    ),
  );
  await open(page, legacy);
  await expect(page.getByRole("status")).toContainText(
    "versão anterior aberto",
  );
  const result = await save(page);
  expect(result).toMatchObject({ ...legacy, version: 6 });
  await page.locator("input[type=file]").setInputFiles({
    name: "v6.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(result)),
  });
  expect(await save(page)).toEqual(result);
});

test("recuperação local antiga também preserva materiais e referências", async ({
  page,
}) => {
  const legacy = JSON.parse(
    readFileSync(
      new URL("../../examples/talude-duas-camadas.geo.json", import.meta.url),
      "utf8",
    ),
  );
  await page.addInitScript(
    (p) =>
      localStorage.setItem(
        "geostruct.recovery.v1",
        JSON.stringify({ project: p, savedAt: "2026-11-17T10:00:00Z" }),
      ),
    legacy,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Recuperar trabalho local/ }).click();
  expect(await save(page)).toMatchObject({ ...legacy, version: 6 });
});
