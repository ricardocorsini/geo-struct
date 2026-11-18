import { withGeometry } from "../fixtures/numerical-profile";
import { test, expect, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { newProject, type Project } from "../../src/domain/model";

function fixture(gamma: number | null = 20) {
  const base = newProject("Pesos por material");
  base.materials[0].gamma = 18;
  base.materials[0].source = "Hipótese do fundo";
  base.materials.push({
    ...base.materials[0],
    id: "inclusion",
    name: "Solo da inclusão",
    gamma,
    source: "Hipótese da inclusão",
  });
  const s = base.sections[0];
  s.terrain = [
    { x: -10, y: 0 },
    { x: 10, y: 0 },
  ];
  s.base = -2;
  s.backgroundMaterialId = base.materials[0].id;
  s.waterMode = "dry";
  s.waterSource = "Caso analítico";
  s.loadCondition = "none";
  s.regions.push({
    id: "region",
    name: "Região interna",
    materialId: "inclusion",
    points: [
      { x: -1, y: -0.4 },
      { x: 1, y: -0.4 },
      { x: 1, y: -0.2 },
      { x: -1, y: -0.2 },
    ],
  });
  const { project: p, analysisCase: c } = addAnalysisCase(base, s.id);
  Object.assign(c, {
    name: "Círculo dos pesos",
    description: "Peso próprio, sem FS",
    direction: "left-to-right",
    methods: ["fellenius"],
    surfaceMode: "fixed",
    fixedCircle: { x: 0, y: 4, radius: 5 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return p;
}
async function selectCase(page: Page) {
  await page
    .getByRole("button", { name: "Círculo dos pesos", exact: true })
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
    name: "pesos.geo.json",
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
    .filter({ hasText: "Pesos por fatia" })
    .click();
  return dialog;
}
async function save(page: Page): Promise<Project> {
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const stream = (await (await download).createReadStream())!;
  let content = "";
  for await (const chunk of stream) content += chunk.toString();
  return JSON.parse(content);
}

test("consulta pesos, γ e origens por fatia, sem alterar o projeto ou misturar casos", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const original = fixture();
  const duplicate = addAnalysisCase(
    original,
    original.sections[0].id,
    original.analysisCases[0].id,
  );
  duplicate.analysisCase.name = "Outro caso";
  const p = duplicate.project;
  const panel = await open(page, p);
  await prepare(page);
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toContainText("74,375499 kN/m");
  await page.getByLabel("Centro Z do caso (m)", { exact: true }).fill("4,1");
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preparar fatias", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Centro Z do caso (m)", { exact: true }).fill("4");
  // O inspetor exige aplicar ou descartar, mesmo ao repetir o valor original.
  await expect(
    page.getByRole("button", { name: "Preparar fatias", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toContainText("74,375499 kN/m");
  let dialog = await inspect(page);
  await expect(
    dialog.getByLabel("Peso próprio total na inspeção", { exact: true }),
  ).toContainText("74,375499 kN/m");
  const totals = dialog.getByRole("table", {
    name: "Pesos totais por material",
    exact: true,
  });
  const row = totals.getByRole("row").filter({ hasText: "Solo da inclusão" });
  await expect(row.getByRole("cell").nth(2)).toHaveText("20");
  await expect(row.getByRole("cell").nth(3)).toHaveText("8");
  await expect(row).toContainText("Origem de γ: Hipótese da inclusão");
  await expect(row).toContainText("Região interna: 0,4 m² → 8 kN/m");
  await dialog
    .getByLabel("Fatia para inspecionar pesos", { exact: true })
    .selectOption("12");
  await expect(
    dialog
      .getByRole("table", {
        name: "Pesos por material da fatia 13",
        exact: true,
      })
      .getByRole("row"),
  ).toHaveCount(3);
  await expect(
    dialog
      .getByRole("table", { name: "Fatias geométricas", exact: true })
      .getByRole("row")
      .nth(13)
      .getByRole("cell")
      .last(),
  ).not.toHaveText("Pendente");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p));
  await page.getByRole("button", { name: "Outro caso", exact: true }).click();
  await expect(
    page.getByLabel("Peso próprio total", { exact: true }),
  ).toHaveCount(0);
  await selectCase(page);
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toContainText("74,375499 kN/m");
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("1,5");
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  dialog = await inspect(page);
  await expect(
    dialog.getByLabel("Peso próprio total na inspeção", { exact: true }),
  ).toContainText("74,375499 kN/m");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p, 1.5));
});

test("editar γ invalida os pesos e desfazer/refazer recupera as contribuições correspondentes", async ({
  page,
}) => {
  const p = fixture();
  const panel = await open(page, p);
  await prepare(page);
  await page
    .getByRole("button", { name: "Solo da inclusão", exact: true })
    .click();
  await page
    .getByLabel("Peso específico total γ (kN/m³)", { exact: true })
    .fill("22");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toHaveCount(0);
  await prepare(page);
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toContainText("75,175499 kN/m");
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toContainText("74,375499 kN/m");
  expect(await save(page)).toEqual(withGeometry(p));
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toContainText("75,175499 kN/m");
  p.materials[1].gamma = 22;
  expect(await save(page)).toEqual(withGeometry(p));
});

test("γ ausente bloqueia somente pesos e pode ser completado sem perder áreas", async ({
  page,
}) => {
  const p = fixture(null);
  const panel = await open(page, p);
  await prepare(page);
  await expect(page.locator("[data-slice]")).toHaveCount(25);
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByLabel("Diagnósticos dos pesos")).toContainText(
    "Informe o peso específico total de Solo da inclusão",
  );
  const dialog = await inspect(page);
  await expect(
    dialog.getByLabel("Peso próprio total na inspeção", { exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("Diagnósticos dos pesos")).toContainText(
    "Solo da inclusão",
  );
  await expect(
    dialog
      .getByRole("table", { name: "Fatias geométricas", exact: true })
      .getByRole("row")
      .nth(13)
      .getByRole("cell")
      .last(),
  ).toHaveText("Pendente");
  await dialog
    .locator("summary")
    .filter({ hasText: "Áreas por material" })
    .click();
  await expect(
    dialog.getByRole("table", {
      name: "Áreas totais por material",
      exact: true,
    }),
  ).toContainText("Região interna: 0,4 m²");
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(withGeometry(p));
  await page
    .getByRole("button", { name: "Solo da inclusão", exact: true })
    .click();
  await page
    .getByLabel("Peso específico total γ (kN/m³)", { exact: true })
    .fill("20");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toContainText("74,375499 kN/m");
  await expect(panel.getByLabel("Diagnósticos dos pesos")).toHaveCount(0);
});
