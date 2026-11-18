import { withGeometry } from "../fixtures/numerical-profile";
import { expect, test, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { newProject, type Project } from "../../src/domain/model";

function fixture() {
  const base = newProject("Inspeção mecânica");
  Object.assign(base.materials[0], {
    name: "Solo da base",
    gamma: 18,
    cohesion: 5,
    friction: 30,
    mode: "effective",
    source: "Parâmetros de conferência",
  });
  const s = base.sections[0];
  Object.assign(s, {
    terrain: [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ],
    base: -2,
    backgroundMaterialId: base.materials[0].id,
    waterMode: "piezometric",
    waterUnitWeight: 10,
    water: [
      { x: -10, y: -0.5 },
      { x: 10, y: -0.5 },
    ],
    waterSource: "Hipótese piezométrica",
    loadCondition: "none",
  });
  const { project: p, analysisCase: c } = addAnalysisCase(base, s.id);
  Object.assign(c, {
    name: "Círculo mecânico",
    direction: "left-to-right",
    description: "Consolidação sem FS",
    methods: ["fellenius"],
    surfaceMode: "fixed",
    fixedCircle: { x: 0, y: 4, radius: 5 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return p;
}
async function selectCase(page: Page, name = "Círculo mecânico") {
  await page.getByRole("button", { name, exact: true }).click();
  const details = page.locator(".fixed-circle-preview");
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
  return page.getByRole("region", {
    name: "Geometria do círculo fixo",
    exact: true,
  });
}
async function open(page: Page, p: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "mecanica.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  return selectCase(page);
}
async function prepare(page: Page, angle = "2,8") {
  await page
    .getByLabel("Tolerância geométrica (m)", { exact: true })
    .fill("1e-8");
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill(angle);
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
    .filter({ hasText: /^Entrada mecânica$/ })
    .click();
  return dialog;
}
async function close(page: Page) {
  await page
    .getByRole("dialog", { name: "Inspeção das fatias", exact: true })
    .getByRole("button", { name: "Fechar janela", exact: true })
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

test("inspeciona entrada mecânica na janela mínima, respeita rascunho e não grava resultados", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = fixture();
  const panel = await open(page, p);
  await prepare(page);
  await expect(panel.getByLabel("Entrada mecânica preparada")).toContainText(
    "27 fatias",
  );
  await page
    .getByLabel("Direção de deslizamento", { exact: true })
    .selectOption("right-to-left");
  await expect(panel.getByLabel("Entrada mecânica preparada")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Inspecionar fatias", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  const dialog = await inspect(page);
  await expect(
    dialog.getByLabel("Referencial da entrada mecânica"),
  ).toContainText("esquerda → direita");
  await dialog
    .getByLabel("Fatia para inspecionar entrada mecânica")
    .selectOption("13");
  await expect(dialog.getByLabel("Geometria mecânica da fatia")).toContainText(
    "Fatia original 14",
  );
  const base = dialog.getByLabel("Resistência da base da fatia");
  await expect(base).toContainText("Tensões efetivas");
  await expect(base).toContainText("c = 5 kPa");
  await expect(base).toContainText("φ = 30°");
  await expect(base).toContainText("Parâmetros de conferência");
  const water = dialog.getByLabel("Água e forças da fatia");
  await expect(water).toContainText(
    "u física = 5 kPa · ue para resistência = 5 kPa",
  );
  const expectedU = (50 * Math.sin(Math.acos(0.9) / 19)).toLocaleString(
    "pt-BR",
    { maximumSignificantDigits: 8 },
  );
  await expect(water).toContainText(`U = uℓ = ${expectedU} kN/m`);
  const row = dialog
    .getByRole("table", { name: "Entradas mecânicas por fatia", exact: true })
    .getByRole("row")
    .nth(14);
  await expect(row.getByRole("cell").nth(10)).toHaveText("5");
  await expect(row.getByRole("cell").nth(11)).toHaveText("5");
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(960);
  await close(page);
  expect(await save(page)).toEqual(withGeometry(p, 2.8));
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("1,4");
  await expect(panel.getByLabel("Entrada mecânica preparada")).toHaveCount(0);
  await prepare(page, "1,4");
  expect(await page.locator("[data-slice]").count()).toBeGreaterThan(27);
  await expect(panel.getByLabel("Entrada mecânica preparada")).toBeVisible();
  expect(await save(page)).toEqual(withGeometry(p, 1.4));
  await page.locator("input[type=file]").setInputFiles({
    name: "mecanica.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await selectCase(page);
  await expect(panel.getByLabel("Entrada mecânica preparada")).toHaveCount(0);
  await prepare(page);
  await expect(panel.getByLabel("Entrada mecânica preparada")).toContainText(
    "27 fatias",
  );
});

test("alterar modo e desfazer/refazer atualizam ue sem apagar u, W ou a origem", async ({
  page,
}) => {
  const p = fixture();
  const panel = await open(page, p);
  await prepare(page);
  const weight = await panel
    .getByLabel("Peso próprio total", { exact: true })
    .textContent();
  await page.getByRole("button", { name: "Solo da base", exact: true }).click();
  await page
    .getByLabel("Parâmetros de resistência", { exact: true })
    .selectOption("total");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await expect(panel.getByLabel("Entrada mecânica preparada")).toHaveCount(0);
  await prepare(page);
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toHaveText(weight!);
  let dialog = await inspect(page);
  await dialog
    .getByLabel("Fatia para inspecionar entrada mecânica")
    .selectOption("13");
  await expect(dialog.getByLabel("Água e forças da fatia")).toContainText(
    "u física = 5 kPa · ue para resistência = 0 kPa",
  );
  await expect(dialog.getByLabel("Água e forças da fatia")).toContainText(
    "Ue = ueℓ = 0 kN/m",
  );
  await expect(dialog.getByLabel("Resistência da base da fatia")).toContainText(
    "φ = 30°",
  );
  await close(page);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  dialog = await inspect(page);
  await dialog
    .getByLabel("Fatia para inspecionar entrada mecânica")
    .selectOption("13");
  await expect(dialog.getByLabel("Água e forças da fatia")).toContainText(
    "ue para resistência = 5 kPa",
  );
  await close(page);
  expect(await save(page)).toEqual(withGeometry(p, 2.8));
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  dialog = await inspect(page);
  await dialog
    .getByLabel("Fatia para inspecionar entrada mecânica")
    .selectOption("13");
  await expect(dialog.getByLabel("Água e forças da fatia")).toContainText(
    "ue para resistência = 0 kPa",
  );
  await close(page);
  p.materials[0].mode = "total";
  expect(await save(page)).toEqual(withGeometry(p, 2.8));
});

test("coesão ausente bloqueia consolidação, preserva outras inspeções e aceita zero informado", async ({
  page,
}) => {
  const p = fixture();
  p.materials[0].cohesion = null;
  const panel = await open(page, p);
  await prepare(page);
  await expect(
    panel.getByLabel("Diagnósticos da entrada mecânica"),
  ).toContainText("Complete c, φ e o modo");
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByLabel("Pressões de água preparadas")).toContainText(
    "0 a 5 kPa",
  );
  let dialog = await inspect(page);
  await expect(
    dialog.getByLabel("Diagnósticos da entrada mecânica"),
  ).toContainText("Solo da base");
  await expect(
    dialog.getByRole("table", {
      name: "Entradas mecânicas por fatia",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("table", { name: "Fatias geométricas", exact: true }),
  ).toBeVisible();
  await close(page);
  expect(await save(page)).toEqual(withGeometry(p, 2.8));
  await page.getByRole("button", { name: "Solo da base", exact: true }).click();
  await page.getByLabel("Coesão c′ (kPa)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(panel.getByLabel("Entrada mecânica preparada")).toBeVisible();
  dialog = await inspect(page);
  await expect(dialog.getByLabel("Resistência da base da fatia")).toContainText(
    "c = 0 kPa",
  );
  await close(page);
});

test("casos isolam direção e água; sentido ausente mantém as preparações independentes", async ({
  page,
}) => {
  let p = fixture();
  const reversed = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = reversed.project;
  Object.assign(reversed.analysisCase, {
    name: "Caso invertido",
    direction: "right-to-left",
    waterCondition: "dry",
    waterSource: "Hipótese seca própria",
  });
  const missing = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = missing.project;
  Object.assign(missing.analysisCase, {
    name: "Caso sem sentido",
    direction: null,
  });
  const panel = await open(page, p);
  await prepare(page);
  const count = await page.locator("[data-slice]").count();
  await selectCase(page, "Caso invertido");
  await expect(panel.getByLabel("Entrada mecânica preparada")).toHaveCount(0);
  await prepare(page);
  const reversedCount = await page.locator("[data-slice]").count();
  let dialog = await inspect(page);
  await expect(
    dialog.getByLabel("Referencial da entrada mecânica"),
  ).toContainText("direita → esquerda");
  await expect(dialog.getByLabel("Geometria mecânica da fatia")).toContainText(
    `Ordem 1 · Fatia original ${reversedCount}`,
  );
  await expect(dialog.getByLabel("Água e forças da fatia")).toContainText(
    "Hipótese seca própria",
  );
  await expect(dialog.getByLabel("Água e forças da fatia")).toContainText(
    "u física = 0 kPa",
  );
  await close(page);
  await selectCase(page, "Caso sem sentido");
  await prepare(page);
  await expect(
    panel.getByLabel("Diagnósticos da entrada mecânica"),
  ).toContainText("Defina o sentido de movimento");
  await expect(panel.getByLabel("Pressões de água preparadas")).toContainText(
    "0 a 5 kPa",
  );
  await expect(panel.getByLabel("Sobrecargas preparadas")).toBeVisible();
  await selectCase(page);
  await prepare(page);
  await expect(page.locator("[data-slice]")).toHaveCount(count);
  dialog = await inspect(page);
  await expect(dialog.getByLabel("Geometria mecânica da fatia")).toContainText(
    "Ordem 1 · Fatia original 1",
  );
  await close(page);
  expect(await save(page)).toEqual(withGeometry(p, 2.8, [0, 1, 2]));
});
