import { withGeometry } from "../fixtures/numerical-profile";
import { expect, test, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { newProject, type Project } from "../../src/domain/model";

function fixture(q: number | null = 20) {
  const base = newProject("Resultantes das sobrecargas");
  base.materials[0].gamma = 18;
  const section = base.sections[0];
  Object.assign(section, {
    terrain: [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ],
    base: -2,
    backgroundMaterialId: base.materials[0].id,
    waterMode: "dry",
    waterSource: "Hipótese seca",
    loadCondition: "loads",
    loads: [
      {
        id: "left-load",
        name: "Faixa esquerda",
        x1: -2,
        x2: 0,
        q,
        source: "Verificação independente",
        enabled: true,
      },
    ],
  });
  const { project: p, analysisCase: c } = addAnalysisCase(base, section.id);
  Object.assign(c, {
    name: "Círculo das cargas",
    description: "Sobrecargas sem FS",
    direction: "left-to-right",
    methods: ["fellenius"],
    surfaceMode: "fixed",
    fixedCircle: { x: 0, y: 4, radius: 5 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return p;
}
async function selectCase(page: Page, name = "Círculo das cargas") {
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
    name: "sobrecargas.geo.json",
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
    .filter({ hasText: "Sobrecargas por fatia" })
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

test("inspeciona forças, pontos e braços com sinais na janela mínima, sem persistir resultados", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = fixture();
  p.sections[0].loads.push({
    id: "right-load",
    name: "Faixa direita",
    x1: 0,
    x2: 2,
    q: 10,
    source: "Outra origem",
    enabled: true,
  });
  const panel = await open(page, p);
  await prepare(page);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "60 kN/m",
  );
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "20 kN·m/m",
  );
  const count = await page.locator("[data-slice]").count();
  const dialog = await inspect(page);
  await expect(dialog.getByLabel("Convenção dos momentos")).toContainText(
    "anti-horário (esquerda → direita)",
  );
  const strips = dialog.getByRole("table", {
    name: "Totais por faixa de sobrecarga",
    exact: true,
  });
  const left = strips.getByRole("row").filter({ hasText: "Faixa esquerda" });
  const right = strips.getByRole("row").filter({ hasText: "Faixa direita" });
  await expect(left).toContainText("Verificação independente");
  await expect(left.getByRole("cell").nth(4)).toHaveText("40");
  await expect(left.getByRole("cell").nth(5)).toHaveText("40");
  await expect(right.getByRole("cell").nth(5)).toHaveText("-20");
  const select = dialog.getByLabel("Fatia para inspecionar sobrecargas");
  const labels = await select.locator("option").allTextContents();
  const loaded = labels.findIndex((t) => !t.includes("· 0 kN/m"));
  expect(loaded).toBeGreaterThanOrEqual(0);
  await select.selectOption(String(loaded));
  const contributions = dialog.getByRole("table", {
    name: "Contribuições de sobrecarga da fatia",
    exact: true,
  });
  await expect(contributions).toContainText("Faixa esquerda");
  await expect(contributions).toContainText("left-load");
  await expect(
    contributions.getByRole("columnheader", {
      name: "X aplicação (m)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    contributions.getByRole("columnheader", { name: "d CCW (m)", exact: true }),
  ).toBeAttached();
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(960);
  await close(page);
  expect(await save(page)).toEqual(withGeometry(p));
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("1,5");
  await expect(panel.getByLabel("Sobrecargas preparadas")).toHaveCount(0);
  await prepare(page);
  expect(await page.locator("[data-slice]").count()).toBeGreaterThan(count);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "60 kN/m",
  );
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "20 kN·m/m",
  );
  // Reabrir o arquivo elimina a prévia, mantendo apenas as entradas.
  await page.locator("input[type=file]").setInputFiles({
    name: "sobrecargas.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page
    .getByRole("dialog", { name: "Salvar alterações?", exact: true })
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await selectCase(page);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toHaveCount(0);
  await prepare(page);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "60 kN/m",
  );
});

test("edição de q e desfazer/refazer invalidam resultantes preservando peso e arquivo", async ({
  page,
}) => {
  const p = fixture();
  const panel = await open(page, p);
  await prepare(page);
  const weight = await panel
    .getByLabel("Peso próprio total", { exact: true })
    .textContent();
  await page
    .getByRole("button", { name: "Faixa esquerda", exact: true })
    .click();
  await page.getByLabel("Sobrecarga q (kPa)", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toHaveCount(0);
  await prepare(page);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "60 kN/m",
  );
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toHaveText(weight!);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  // O histórico remonta o inspetor: selecionar o caso antes de abrir sua preparação.
  await selectCase(page);
  await prepare(page);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "40 kN/m",
  );
  expect(await save(page)).toEqual(withGeometry(p));
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "60 kN/m",
  );
  p.sections[0].loads[0].q = 30;
  expect(await save(page)).toEqual(withGeometry(p));
});

test("q ausente não vira zero; completar com zero conserva largura e origem", async ({
  page,
}) => {
  const p = fixture(null);
  const panel = await open(page, p);
  await prepare(page);
  await expect(panel.getByLabel("Diagnósticos das sobrecargas")).toContainText(
    "Nulo não significa zero",
  );
  await expect(
    panel.getByLabel("Peso próprio total", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByLabel("Pressões de água preparadas")).toBeVisible();
  let dialog = await inspect(page);
  await expect(dialog.getByLabel("Diagnósticos das sobrecargas")).toContainText(
    "Faixa esquerda",
  );
  await expect(
    dialog.getByRole("table", {
      name: "Totais por faixa de sobrecarga",
      exact: true,
    }),
  ).toHaveCount(0);
  await close(page);
  expect(await save(page)).toEqual(withGeometry(p));
  await page
    .getByRole("button", { name: "Faixa esquerda", exact: true })
    .click();
  await page.getByLabel("Sobrecarga q (kPa)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await prepare(page);
  await expect(panel.getByLabel("Diagnósticos das sobrecargas")).toHaveCount(0);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "0 kN/m",
  );
  dialog = await inspect(page);
  const row = dialog
    .getByRole("table", { name: "Totais por faixa de sobrecarga", exact: true })
    .getByRole("row")
    .nth(1);
  await expect(row.getByRole("cell").nth(2)).toHaveText("0");
  await expect(row.getByRole("cell").nth(3)).toHaveText("2");
  await close(page);
});

test("rascunho e condições próprias isolam faixas, ausência explícita e sentido pendente", async ({
  page,
}) => {
  let p = fixture();
  p.sections[0].loads.push({
    id: "inactive",
    name: "Faixa desabilitada",
    x1: 0,
    x2: 2,
    q: 30,
    enabled: false,
    source: "Hipótese própria",
  });
  const own = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = own.project;
  Object.assign(own.analysisCase, {
    name: "Caso próprio",
    loadCondition: "selected",
    loadIds: ["inactive"],
    direction: "right-to-left",
  });
  const absent = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = absent.project;
  Object.assign(absent.analysisCase, {
    name: "Caso sem cargas",
    loadCondition: "none",
    direction: null,
  });
  const panel = await open(page, p);
  await prepare(page);
  await page
    .getByLabel("Sobrecargas no caso", { exact: true })
    .selectOption("none");
  await expect(panel.getByLabel("Sobrecargas preparadas")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preparar fatias", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "40 kN/m",
  );
  await selectCase(page, "Caso próprio");
  await expect(panel.getByLabel("Sobrecargas preparadas")).toHaveCount(0);
  await prepare(page);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "60 kN/m",
  );
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "-60 kN·m/m",
  );
  let dialog = await inspect(page);
  await expect(
    dialog.getByLabel("Condição de sobrecargas na inspeção"),
  ).toContainText("própria do caso");
  await expect(dialog.getByLabel("Convenção dos momentos")).toContainText(
    "horário (direita → esquerda)",
  );
  await expect(
    dialog.getByLabel("Resumo das sobrecargas na inspeção"),
  ).toContainText("Momento no sentido do movimento: 60 kN·m/m");
  await expect(
    dialog.getByRole("table", {
      name: "Totais por faixa de sobrecarga",
      exact: true,
    }),
  ).toContainText("Hipótese própria");
  await close(page);
  await selectCase(page, "Caso sem cargas");
  await prepare(page);
  await expect(panel.getByLabel("Sobrecargas preparadas")).toContainText(
    "0 kN/m",
  );
  dialog = await inspect(page);
  await expect(
    dialog.getByLabel("Condição de sobrecargas na inspeção"),
  ).toContainText("Sem sobrecargas por escolha explícita");
  await expect(dialog.getByLabel("Convenção dos momentos")).toContainText(
    "Sentido não definido",
  );
  await close(page);
  expect(await save(page)).toEqual(withGeometry(p, 3, [0, 1, 2]));
});
