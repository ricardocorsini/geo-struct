import { withGeometry } from "../fixtures/numerical-profile";
import { expect, test, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { newProject, type Project } from "../../src/domain/model";

function fixture(gamma: number | null = 10) {
  const base = newProject("Pressões nas bases");
  base.materials[0].gamma = 18;
  const s = base.sections[0];
  Object.assign(s, {
    terrain: [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ],
    base: -2,
    backgroundMaterialId: base.materials[0].id,
    waterMode: "piezometric",
    waterUnitWeight: gamma,
    water: [
      { x: -10, y: -0.5 },
      { x: 10, y: -0.5 },
    ],
    waterSource: "Hipótese de verificação",
    loadCondition: "none",
  });
  const { project: p, analysisCase: c } = addAnalysisCase(base, s.id);
  Object.assign(c, {
    name: "Círculo das pressões",
    description: "Pressões prescritas sem FS",
    direction: "left-to-right",
    methods: ["fellenius"],
    surfaceMode: "fixed",
    fixedCircle: { x: 0, y: 4, radius: 5 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return p;
}
async function selectCase(page: Page, name = "Círculo das pressões") {
  await page.getByRole("button", { name, exact: true }).click();
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
    name: "pressoes.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  return selectCase(page);
}
async function prepare(page: Page) {
  await page
    .getByLabel("Tolerância geométrica (m)", { exact: true })
    .fill("1e-8");
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("2,8");
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
}
async function inspect(page: Page) {
  await page
    .getByRole("button", { name: "Inspecionar fatias", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Inspeção das fatias",
    exact: true,
  });
  await dialog
    .locator("summary")
    .filter({ hasText: "Pressões de água" })
    .click();
  return dialog;
}
async function water(page: Page) {
  await page.getByRole("tab", { name: "Água e cargas", exact: true }).click();
  await page
    .getByRole("button", { name: "Condição de água", exact: true })
    .click();
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

test("inspeciona pressão, ponto do arco e origem na janela mínima sem gravar resultados", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = fixture();
  const panel = await open(page, p);
  await prepare(page);
  await expect(panel.getByLabel("Pressões de água preparadas")).toContainText(
    "0 a 5 kPa",
  );
  const count = await page.locator("[data-slice]").count();
  await page.getByLabel("Água no caso", { exact: true }).selectOption("dry");
  await expect(panel.getByLabel("Pressões de água preparadas")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preparar fatias", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  let dialog = await inspect(page);
  await expect(dialog.getByLabel("Condição de água na inspeção")).toContainText(
    "γw = 10 kN/m³",
  );
  await expect(dialog.getByLabel("Condição de água na inspeção")).toContainText(
    "Origem: Hipótese de verificação",
  );
  await expect(
    dialog.getByLabel("Cobertura da água na inspeção"),
  ).toContainText("sem extrapolação");
  await dialog.getByLabel("Fatia para inspecionar pressão").selectOption("13");
  const selected = dialog.getByLabel("Pressão da fatia selecionada");
  await expect(selected).toContainText("Z = -1 m");
  await expect(selected).toContainText("Cota piezométrica: -0,5 m");
  await expect(selected).toContainText("altura positiva usada: 0,5 m");
  await expect(selected).toContainText("Segmento 1");
  await expect(selected).toContainText("u = 5 kPa");
  await expect(
    dialog
      .getByRole("table", { name: "Pressões por fatia", exact: true })
      .getByRole("row")
      .nth(14)
      .getByRole("cell")
      .last(),
  ).toHaveText("5");
  await expect(
    dialog
      .getByRole("table", { name: "Fatias geométricas", exact: true })
      .getByRole("row")
      .nth(14)
      .getByRole("cell")
      .nth(9),
  ).toHaveText("5");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p, 2.8));
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("1,4");
  await expect(panel.getByLabel("Pressões de água preparadas")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  expect(await page.locator("[data-slice]").count()).toBeGreaterThan(count);
  dialog = await inspect(page);
  await expect(
    dialog.getByLabel("Resumo das pressões na inspeção"),
  ).toContainText("0 a 5 kPa");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p, 1.4));
});

test("edição de γw e histórico invalidam pressões sem modificar pesos", async ({
  page,
}) => {
  const p = fixture();
  const panel = await open(page, p);
  await prepare(page);
  const weight = await panel
    .getByLabel("Peso próprio total", { exact: true })
    .textContent();
  await water(page);
  await page
    .getByLabel("Peso específico da água γw (kN/m³)", { exact: true })
    .fill("20");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await expect(panel.getByLabel("Pressões de água preparadas")).toHaveCount(0);
  await prepare(page);
  await expect(panel.getByLabel("Pressões de água preparadas")).toContainText(
    "0 a 10 kPa",
  );
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toHaveText(weight!);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(panel.getByLabel("Pressões de água preparadas")).toContainText(
    "0 a 5 kPa",
  );
  expect(await save(page)).toEqual(withGeometry(p, 2.8));
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(panel.getByLabel("Pressões de água preparadas")).toContainText(
    "0 a 10 kPa",
  );
  p.sections[0].waterUnitWeight = 20;
  expect(await save(page)).toEqual(withGeometry(p, 2.8));
});

test("γw ausente mantém áreas e pesos e pode ser completado", async ({
  page,
}) => {
  const p = fixture(null);
  const panel = await open(page, p);
  await prepare(page);
  await expect(panel.getByLabel("Diagnósticos das pressões")).toContainText(
    "Informe o peso específico da água",
  );
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-slice]")).toHaveCount(27);
  const dialog = await inspect(page);
  await expect(dialog.getByLabel("Diagnósticos das pressões")).toContainText(
    "γw",
  );
  await expect(
    dialog.getByRole("table", { name: "Pressões por fatia", exact: true }),
  ).toHaveCount(0);
  const row = dialog
    .getByRole("table", { name: "Fatias geométricas", exact: true })
    .getByRole("row")
    .nth(14);
  await expect(row.getByRole("cell").nth(9)).toHaveText("Pendente");
  await expect(row.getByRole("cell").last()).not.toHaveText("Pendente");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p, 2.8));
  await water(page);
  await page
    .getByLabel("Peso específico da água γw (kN/m³)", { exact: true })
    .fill("10");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(panel.getByLabel("Pressões de água preparadas")).toContainText(
    "0 a 5 kPa",
  );
  await expect(panel.getByLabel("Diagnósticos das pressões")).toHaveCount(0);
});

test("carga acima do terreno é sinalizada e caso seco usa zero com dados de água inativos", async ({
  page,
}) => {
  const original = fixture();
  original.sections[0].water = [
    { x: -10, y: -0.5 },
    { x: 0, y: 0.1 },
    { x: 10, y: -0.5 },
  ];
  const duplicate = addAnalysisCase(
    original,
    original.sections[0].id,
    original.analysisCases[0].id,
  );
  Object.assign(duplicate.analysisCase, {
    name: "Caso seco",
    waterCondition: "dry",
    waterSource: "Hipótese seca explícita",
  });
  const p = duplicate.project;
  const panel = await open(page, p);
  await prepare(page);
  await expect(panel.getByLabel("Diagnósticos das pressões")).toContainText(
    "não distingue água confinada de lâmina externa",
  );
  await expect(panel.getByLabel("Diagnósticos das pressões")).toContainText(
    "X = 0 m",
  );
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toBeVisible();
  await selectCase(page, "Caso seco");
  await expect(panel.getByLabel("Pressões de água preparadas")).toHaveCount(0);
  await prepare(page);
  await expect(panel.getByLabel("Pressões de água preparadas")).toContainText(
    "0 a 0 kPa",
  );
  const dialog = await inspect(page);
  await expect(dialog.getByLabel("Condição de água na inspeção")).toContainText(
    "Condição seca explícita",
  );
  await expect(dialog.getByLabel("Condição de água na inspeção")).toContainText(
    "Hipótese seca explícita",
  );
  await expect(
    dialog.getByLabel("Condição de água na inspeção"),
  ).not.toContainText("γw =");
  await expect(
    dialog.getByRole("table", { name: "Pressões por fatia", exact: true }),
  ).toContainText("Inativa");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p, 2.8, [0, 1]));
  await selectCase(page);
  await prepare(page);
  await expect(panel.getByLabel("Diagnósticos das pressões")).toContainText(
    "acima do terreno",
  );
});

test("linha sem cobertura não fornece pressão zero e o trecho pode ser completado", async ({
  page,
}) => {
  const p = fixture();
  p.sections[0].water = [
    { x: -2, y: -0.5 },
    { x: 2, y: -0.5 },
  ];
  const panel = await open(page, p);
  await prepare(page);
  await expect(panel.getByLabel("Diagnósticos da geometria")).toContainText(
    "não cobre o intervalo",
  );
  await expect(panel.getByLabel("Pressões de água preparadas")).toHaveCount(0);
  await expect(page.locator("[data-slice]")).toHaveCount(0);
  await water(page);
  await page.getByLabel("X do ponto 1", { exact: true }).fill("-3");
  await page.getByLabel("X do ponto 2", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(panel.getByLabel("Pressões de água preparadas")).toContainText(
    "0 a 5 kPa",
  );
  p.sections[0].water = [
    { x: -3, y: -0.5 },
    { x: 3, y: -0.5 },
  ];
  expect(await save(page)).toEqual(withGeometry(p, 2.8));
});
