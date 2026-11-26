import { test, expect, type Page } from "@playwright/test";
import {
  exampleProject,
  duplicateSection,
  type Project,
} from "../../src/domain/model";
import { readFileSync } from "node:fs";

async function open(page: Page, p: unknown) {
  await page.goto("/");
  await reopen(page, p);
}
async function reopen(page: Page, p: unknown) {
  await page.locator("input[type=file]").setInputFiles({
    name: "condicoes.geo.json",
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
async function water(page: Page) {
  await page.getByRole("tab", { name: "Água e cargas", exact: true }).click();
  await page
    .getByRole("button", { name: "Condição de água", exact: true })
    .click();
}
async function loads(page: Page) {
  await page.getByRole("tab", { name: "Água e cargas", exact: true }).click();
  await page
    .getByRole("button", { name: "Gerenciar cargas", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Sobrecargas da seção" });
}
async function point(page: Page, x: number, z: number) {
  const entry = page.locator(".point-entry");
  if ((await entry.getAttribute("open")) === null)
    await entry.locator("summary").click();
  await entry.getByLabel("Primeira coordenada").fill(String(x));
  await entry.getByLabel("Segunda coordenada").fill(String(z));
  await entry
    .getByRole("button", { name: "Adicionar ponto", exact: true })
    .click();
}
const apply = (page: Page) =>
  page.getByRole("button", { name: "Aplicar", exact: true }).click();

test("condição seca conserva linha e origem, remove desenho e tem histórico e persistência", async ({
  page,
}) => {
  const p = exampleProject();
  await open(page, p);
  await water(page);
  await page
    .getByLabel("Condição de água", { exact: true })
    .selectOption("dry");
  await apply(page);
  await expect(page.locator('[data-pick="water"]')).toHaveCount(0);
  await expect(page.locator("[data-vertex]")).toHaveCount(0);
  const dry = await save(page);
  expect(dry.sections[0]).toEqual({ ...p.sections[0], waterMode: "dry" });
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect(await save(page)).toEqual(p);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  expect(await save(page)).toEqual(dry);
  await reopen(page, dry);
  await expect(page.locator('[data-pick="water"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Entradas", exact: true }).click();
  await expect(page.locator("#project-report")).toContainText("Condição seca");
  await expect(page.locator("#project-report")).toContainText(
    "Linha guardada, inativa",
  );
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await water(page);
  await page
    .getByLabel("Condição de água", { exact: true })
    .selectOption("piezometric");
  await apply(page);
  expect(await save(page)).toEqual(p);
});

test("água valida peso e geometria sem perder rascunho e informa cobertura parcial", async ({
  page,
}) => {
  const p = exampleProject();
  await open(page, p);
  await water(page);
  await page
    .getByLabel("Peso específico da água γw (kN/m³)", { exact: true })
    .fill("0");
  await apply(page);
  await expect(page.getByRole("alert")).toContainText("maior que zero");
  await page
    .getByRole("button", { name: "Gerenciar cargas", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edição em andamento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(
    page.getByLabel("Peso específico da água γw (kN/m³)", { exact: true }),
  ).toHaveValue("0");
  await page
    .getByLabel("Peso específico da água γw (kN/m³)", { exact: true })
    .fill("9,9");
  await page
    .getByLabel("Origem da condição de água", { exact: true })
    .fill("Hipótese ilustrativa de teste");
  await page.getByText("Colar lista de coordenadas", { exact: true }).click();
  await page.getByLabel("Lista de coordenadas").fill("10 ; 30\n50 ; 30");
  await page.getByRole("button", { name: "Usar coordenadas" }).click();
  await apply(page);
  const result = await save(page);
  expect(result.sections[0].waterUnitWeight).toBe(9.9);
  await page.locator(".diagnostics-toggle").click();
  await expect(page.getByLabel("Diagnósticos")).toContainText(
    "não cobre toda a seção",
  );
  await expect(page.getByLabel("Diagnósticos")).toContainText(
    "acima do terreno",
  );
  await page.getByLabel("X do ponto 2").fill("10");
  await apply(page);
  await expect(page.getByRole("alert")).toContainText(
    "coordenadas X devem crescer",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  expect(await save(page)).toEqual(result);
});

test("desenhar linha ativa condição piezométrica sem inventar peso ou origem", async ({
  page,
}) => {
  const p = exampleProject();
  Object.assign(p.sections[0], {
    water: null,
    waterMode: "unspecified",
    waterUnitWeight: null,
    waterSource: "",
  });
  await open(page, p);
  await page.getByRole("tab", { name: "Água e cargas", exact: true }).click();
  await page
    .locator("#ribbon-panel")
    .getByRole("button", { name: "Linha piezométrica", exact: true })
    .click();
  await point(page, 0, 3);
  await point(page, 60, 3);
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(
    page.getByLabel("Condição de água", { exact: true }),
  ).toHaveValue("piezometric");
  const result = await save(page);
  expect(result.sections[0]).toMatchObject({
    waterMode: "piezometric",
    waterUnitWeight: null,
    waterSource: "",
    water: [
      { x: 0, y: 3 },
      { x: 60, y: 3 },
    ],
  });
});

test("nova sobrecarga mantém q vazio, recusa negativo e distingue zero de força desenhada", async ({
  page,
}) => {
  const p = exampleProject();
  p.sections[0].loads = [];
  p.sections[0].loadCondition = "none";
  await open(page, p);
  const manager = await loads(page);
  await manager.getByRole("button", { name: "Desenhar nova faixa" }).click();
  await point(page, 5, 22);
  await point(page, 10, 22);
  await expect(
    page.getByRole("heading", { name: "Sobrecarga", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Sobrecarga q (kPa)", { exact: true }),
  ).toHaveValue("");
  const pending = await save(page);
  expect(pending.sections[0].loads[0].q).toBeNull();
  expect(pending.sections[0].loadCondition).toBe("loads");
  await expect(page.locator('[data-pick="load"]')).toContainText(
    "q não informado",
  );
  await expect(page.locator('[data-pick="load"] path')).toHaveCount(2);
  await page.getByLabel("Sobrecarga q (kPa)", { exact: true }).fill("-1");
  await apply(page);
  await expect(page.getByRole("alert")).toContainText("não pode ser negativa");
  await page.getByLabel("Sobrecarga q (kPa)", { exact: true }).fill("0");
  await page
    .getByLabel("Origem da sobrecarga", { exact: true })
    .fill("Carga nula explicitada no teste");
  await apply(page);
  const zero = await save(page);
  expect(zero.sections[0].loads[0].q).toBe(0);
  await expect(page.locator('[data-pick="load"]')).toContainText("0 kPa");
  await expect(page.locator('[data-pick="load"] path')).toHaveCount(2);
  await page.getByLabel("Sobrecarga q (kPa)", { exact: true }).fill("12,5");
  await apply(page);
  expect(await page.locator('[data-pick="load"] path').count()).toBeGreaterThan(
    2,
  );
  const result = await save(page);
  await reopen(page, result);
  expect(await save(page)).toEqual(result);
});

test("gerencia cópias, sobreposição, ativação e exclusão na janela mínima sem alterar outra seção", async ({
  page,
}) => {
  const p = exampleProject();
  p.sections.push(duplicateSection(p.sections[0]));
  await page.setViewportSize({ width: 960, height: 640 });
  await open(page, p);
  const manager = await loads(page);
  await manager
    .getByRole("button", { name: "Duplicar Sobrecarga de crista", exact: true })
    .click();
  const copy = manager
    .getByRole("row")
    .filter({ hasText: "Sobrecarga de crista — cópia" });
  await expect(copy).toContainText("Inativa");
  await expect(manager).not.toContainText("Confira as sobreposições");
  await manager
    .getByLabel("Habilitar Sobrecarga de crista — cópia", { exact: true })
    .check();
  await expect(manager).toContainText("Confira as sobreposições");
  await manager.getByLabel("Condição de sobrecargas").selectOption("none");
  await expect(copy).toContainText("Inativa");
  await expect(manager).not.toContainText("Confira as sobreposições");
  await manager
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(page.locator('[data-pick="load"]')).toHaveCount(0);
  const inactive = await save(page);
  expect(inactive.sections[0].loads).toHaveLength(2);
  expect(inactive.sections[1]).toEqual(p.sections[1]);
  await loads(page);
  await manager.getByLabel("Condição de sobrecargas").selectOption("loads");
  await manager
    .getByRole("button", {
      name: "Excluir Sobrecarga de crista — cópia",
      exact: true,
    })
    .click();
  await manager.getByRole("button", { name: "Cancelar exclusão" }).click();
  await expect(copy).toBeVisible();
  await manager
    .getByRole("button", {
      name: "Excluir Sobrecarga de crista — cópia",
      exact: true,
    })
    .click();
  await manager.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(copy).toHaveCount(0);
  await manager
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(p);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await save(page)).sections[0].loads).toHaveLength(2);
});

test("ativar faixa fora do terreno mostra erro local e mantém a condição anterior", async ({
  page,
}) => {
  const p = exampleProject();
  p.sections[0].loadCondition = "none";
  p.sections[0].loads[0].x2 = 100;
  await open(page, p);
  const manager = await loads(page);
  await manager.getByLabel("Condição de sobrecargas").selectOption("loads");
  await expect(manager.getByRole("alert")).toContainText("limites da faixa");
  await expect(manager.getByLabel("Condição de sobrecargas")).toHaveValue(
    "none",
  );
  await manager
    .getByRole("button", { name: "Editar Sobrecarga de crista", exact: true })
    .click();
  await page.getByLabel("X final (m)", { exact: true }).fill("14");
  await apply(page);
  await loads(page);
  await manager.getByLabel("Condição de sobrecargas").selectOption("loads");
  await expect(manager.getByRole("alert")).toHaveCount(0);
  await manager
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(page.locator('[data-pick="load"]')).toHaveCount(1);
});

test("diagnóstico abre cargas da seção correspondente e excluir última faixa deixa pendência", async ({
  page,
}) => {
  const p = exampleProject(),
    other = duplicateSection(p.sections[0]);
  other.loadCondition = "unspecified";
  p.sections.push(other);
  await open(page, p);
  await page.locator(".diagnostics-toggle").click();
  await page
    .getByLabel("Diagnósticos")
    .getByRole("button", { name: /defina a condição de sobrecargas/ })
    .click();
  const manager = page.getByRole("dialog", { name: "Sobrecargas da seção" });
  await expect(manager).toContainText(other.name);
  await manager.getByLabel("Condição de sobrecargas").selectOption("loads");
  await manager
    .getByRole("button", { name: "Excluir Sobrecarga de crista", exact: true })
    .click();
  await manager.getByRole("button", { name: "Confirmar exclusão" }).click();
  await manager
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(page.getByLabel("Diagnósticos")).toContainText(
    "nenhuma sobrecarga está ativa",
  );
  const result = await save(page);
  expect(result.sections[0]).toEqual(p.sections[0]);
  expect(result.sections[1]).toMatchObject({
    loads: [],
    loadCondition: "loads",
  });
});

test("v2 sem água ou cargas abre como não definido e relatório identifica as pendências", async ({
  page,
}) => {
  const legacy = JSON.parse(
    readFileSync(
      new URL("../../examples/talude-duas-camadas.geo.json", import.meta.url),
      "utf8",
    ),
  );
  legacy.version = 2;
  legacy.sections[0].water = null;
  legacy.sections[0].loads = [];
  await open(page, legacy);
  await expect(page.getByRole("status")).toContainText("versão 6");
  const result = await save(page);
  expect(result.version).toBe(6);
  expect(result.sections[0]).toMatchObject({
    waterMode: "unspecified",
    loadCondition: "unspecified",
  });
  await page.getByRole("button", { name: "Entradas", exact: true }).click();
  const report = page.locator("#project-report");
  await expect(report).toContainText("Água não definida");
  await expect(report).toContainText("Cargas não definidas");
  await expect(report).toContainText("geostruct/6");
});
