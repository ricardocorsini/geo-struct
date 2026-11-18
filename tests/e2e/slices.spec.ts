import { withGeometry } from "../fixtures/numerical-profile";
import { test, expect, type Page } from "@playwright/test";
import { newProject, type Project } from "../../src/domain/model";
import { addAnalysisCase } from "../../src/domain/analysis";

function fixture() {
  const base = newProject("Geometria analítica");
  const s = base.sections[0];
  s.terrain = [
    { x: -10, y: 0 },
    { x: 10, y: 0 },
  ];
  s.base = -2;
  s.backgroundMaterialId = base.materials[0].id;
  s.waterMode = "dry";
  s.waterSource = "Caso geométrico próprio";
  s.loadCondition = "none";
  const { project: p, analysisCase: c } = addAnalysisCase(base, s.id);
  Object.assign(c, {
    name: "Círculo analítico",
    description: "Geometria, sem FS",
    direction: "left-to-right",
    methods: ["fellenius"],
    surfaceMode: "fixed",
    fixedCircle: { x: 0, y: 4, radius: 5 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return { p, c };
}
async function selectCase(page: Page) {
  await page
    .getByRole("button", { name: "Círculo analítico", exact: true })
    .click();
  if (
    (await page.locator(".fixed-circle-preview").getAttribute("open")) === null
  )
    await page.locator(".fixed-circle-preview > summary").click();
  return page.getByRole("region", {
    name: "Geometria do círculo fixo",
    exact: true,
  });
}
async function open(page: Page, p: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "geometria.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  return selectCase(page);
}
async function save(page: Page): Promise<Project> {
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const stream = (await (await download).createReadStream())!;
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  return JSON.parse(text);
}
async function prepare(page: Page) {
  await page
    .getByLabel("Tolerância geométrica (m)", { exact: true })
    .fill("0,00000001");
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
}

test("prepara, desenha e inspeciona o segmento circular sem alterar o arquivo", async ({
  page,
}) => {
  const { p } = fixture();
  await page.setViewportSize({ width: 960, height: 640 });
  const panel = await open(page, p);
  await expect(
    page.getByRole("button", { name: "Preparar fatias", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Abertura máxima por fatia (°)", { exact: true }),
  ).toHaveValue("3");
  await prepare(page);
  await expect(panel).toContainText("25 fatias preparadas");
  await expect(page.locator("[data-slice]")).toHaveCount(25);
  await page
    .getByRole("button", { name: "Inspecionar fatias", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Inspeção das fatias",
    exact: true,
  });
  await expect(dialog).toContainText("4,0875277 m²");
  await expect(
    dialog
      .getByRole("table", { name: "Fatias geométricas", exact: true })
      .getByRole("row"),
  ).toHaveCount(26);
  await dialog
    .locator("summary")
    .filter({ hasText: "Origem dos cortes" })
    .click();
  await expect(
    dialog.getByRole("table", { name: "Origem dos cortes", exact: true }),
  ).toContainText("Encontro com terreno");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p));
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("1,5");
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  await expect(panel).toContainText("50 fatias preparadas");
  await expect(page.locator("[data-slice]")).toHaveCount(50);
  expect(await save(page)).toEqual(withGeometry(p, 1.5));
});

test("rascunho não prepara fatias e uma alteração aplicada oculta a geometria antiga", async ({
  page,
}) => {
  const { p } = fixture();
  const panel = await open(page, p);
  await prepare(page);
  await page.getByLabel("Centro Z do caso (m)", { exact: true }).fill("5");
  await expect(
    page.getByRole("button", { name: "Preparar fatias", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
  await expect(panel).toContainText("Aplique ou descarte o rascunho");
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
  if (
    (await page.locator(".fixed-circle-preview").getAttribute("open")) === null
  )
    await page.locator(".fixed-circle-preview > summary").click();
  await expect(panel).not.toContainText("25 fatias preparadas");
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  await expect(panel.getByLabel("Diagnósticos da geometria")).toContainText(
    "tangência",
  );
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await selectCase(page);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  await expect(page.locator("[data-slice]")).toHaveCount(25);
  expect(await save(page)).toEqual(withGeometry(p));
});

test("alteração compartilhada invalida a prévia e o círculo antigo não passa para outro caso", async ({
  page,
}) => {
  const { p, c } = fixture();
  const duplicate = addAnalysisCase(p, p.sections[0].id, c.id);
  duplicate.analysisCase.name = "Outro círculo";
  const panel = await open(page, duplicate.project);
  await prepare(page);
  await expect(page.locator("[data-slice]")).toHaveCount(25);
  await page
    .getByRole("button", { name: "Outro círculo", exact: true })
    .click();
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
  await selectCase(page);
  await expect(page.locator("[data-slice]")).toHaveCount(25);
  await page.getByRole("button", { name: "Solo 1", exact: true }).click();
  await page
    .getByLabel("Peso específico total γ (kN/m³)", { exact: true })
    .fill("19");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await expect(panel).not.toContainText("25 fatias preparadas");
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  await expect(page.locator("[data-slice]")).toHaveCount(25);
});

test("perfil inválido e limite operacional produzem diagnóstico sem truncar fatias", async ({
  page,
}) => {
  const { p } = fixture();
  const panel = await open(page, p);
  await page
    .getByLabel("Tolerância geométrica (m)", { exact: true })
    .fill("-1");
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  await expect(panel.getByLabel("Diagnósticos da geometria")).toContainText(
    "tolerância geométrica positiva",
  );
  await page
    .getByLabel("Tolerância geométrica (m)", { exact: true })
    .fill("1e-8");
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("0,00000001");
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  await expect(panel.getByLabel("Diagnósticos da geometria")).toContainText(
    "limite operacional de 2000",
  );
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
  expect(await save(page)).toEqual(withGeometry(p, 1e-8));
});

function inclusionFixture(assigned = true) {
  const { p } = fixture();
  p.materials.push({
    ...p.materials[0],
    id: "inclusion",
    name: "Solo da inclusão",
  });
  p.sections[0].regions.push({
    id: "internal-region",
    name: "Região interna",
    materialId: assigned ? "inclusion" : null,
    points: [
      { x: -1, y: -0.4 },
      { x: 1, y: -0.4 },
      { x: 1, y: -0.2 },
      { x: -1, y: -0.2 },
    ],
  });
  return p;
}

async function inspectMaterials(page: Page) {
  await page
    .getByRole("button", { name: "Inspecionar fatias", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Inspeção das fatias",
    exact: true,
  });
  await dialog
    .locator("summary")
    .filter({ hasText: "Áreas por material" })
    .click();
  return dialog;
}

test("inspeciona áreas e origens por material, preservando o arquivo e os totais sob refinamento", async ({
  page,
}) => {
  const p = inclusionFixture();
  await page.setViewportSize({ width: 960, height: 640 });
  await open(page, p);
  await prepare(page);
  let dialog = await inspectMaterials(page);
  const totals = dialog.getByRole("table", {
    name: "Áreas totais por material",
    exact: true,
  });
  await expect(totals.getByRole("row")).toHaveCount(3);
  const inclusion = totals
    .getByRole("row")
    .filter({ hasText: "Solo da inclusão" });
  await expect(inclusion.getByRole("cell").nth(1)).toHaveText("0,4");
  await expect(inclusion).toContainText("Região interna: 0,4 m²");
  await expect(totals).toContainText("Solo de fundo");
  await expect(
    dialog.getByLabel("Conservação da área total", { exact: true }),
  ).toContainText("soma das subáreas: 4,0875277 m²");
  await dialog
    .getByLabel("Fatia para inspecionar materiais", { exact: true })
    .selectOption("12");
  const slice = dialog.getByRole("table", {
    name: "Áreas por material da fatia 13",
    exact: true,
  });
  await expect(slice.getByRole("row")).toHaveCount(3);
  await expect(slice).toContainText("Região interna");
  await expect(dialog).toContainText("Material na base da fatia 13: Solo 1");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p));
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("1,5");
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  dialog = await inspectMaterials(page);
  await expect(
    dialog
      .getByRole("table", { name: "Áreas totais por material", exact: true })
      .getByRole("row")
      .filter({ hasText: "Solo da inclusão" })
      .getByRole("cell")
      .nth(1),
  ).toHaveText("0,4");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p, 1.5));
});

test("atribuição acima da base é obrigatória e acompanha aplicar, desfazer e refazer", async ({
  page,
}) => {
  const p = inclusionFixture(false);
  const panel = await open(page, p);
  await prepare(page);
  await expect(panel.getByLabel("Diagnósticos da geometria")).toContainText(
    "Atribua material a Região interna",
  );
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Região interna", exact: true })
    .click();
  await page
    .getByLabel("Material da região", { exact: true })
    .selectOption("inclusion");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  let dialog = await inspectMaterials(page);
  await expect(
    dialog.getByRole("table", {
      name: "Áreas totais por material",
      exact: true,
    }),
  ).toContainText("Região interna: 0,4 m²");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await selectCase(page);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  await expect(panel.getByLabel("Diagnósticos da geometria")).toContainText(
    "Atribua material a Região interna",
  );
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
  expect(await save(page)).toEqual(withGeometry(p));
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await selectCase(page);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  dialog = await inspectMaterials(page);
  await expect(
    dialog.getByRole("table", {
      name: "Áreas totais por material",
      exact: true,
    }),
  ).toContainText("Região interna: 0,4 m²");
});
