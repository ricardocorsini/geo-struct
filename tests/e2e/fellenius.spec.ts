import {
  withGeometry,
  withProfile,
  felleniusProfile,
} from "../fixtures/numerical-profile";
import { expect, test, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { serializeProject } from "../../src/domain/model";

import {
  fixture,
  select,
  open,
  prepare,
  calculate,
  save,
} from "../fixtures/equilibrium-ui";
const fs = (page: Page) =>
  page.getByLabel("Fator de segurança Fellenius", { exact: true });
const diagnostics = (page: Page) =>
  page.getByLabel("Diagnósticos de Fellenius", { exact: true });

test("calcula e inspeciona na janela mínima, exige limiares e preserva o arquivo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = fixture();
  await open(page, p);
  await prepare(page);
  await page
    .getByRole("button", { name: "Calcular Fellenius", exact: true })
    .click();
  await expect(diagnostics(page)).toContainText("Informe limiar motriz");
  await expect(fs(page)).toHaveCount(0);
  await calculate(page);
  await expect(fs(page)).toContainText("FS =");
  await page
    .getByRole("button", { name: "Inspecionar Fellenius", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Inspeção de Fellenius",
    exact: true,
  });
  await expect(dialog.getByLabel("Perfil de Fellenius")).toContainText(
    "τD = 0 kN/m · τt = 0 kPa",
  );
  await expect(dialog.getByLabel("Balanço de Fellenius")).toContainText(
    "D = ΣW sin α + ΣMq/R",
  );
  expect(
    await dialog
      .getByRole("table", { name: "Parcelas de Fellenius por fatia" })
      .getByRole("row")
      .count(),
  ).toBeGreaterThan(20);
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(960);
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(
    withProfile(withGeometry(p), { fellenius: felleniusProfile }),
  );
  await page.getByLabel("Limiar motriz τD (kN/m)", { exact: true }).fill("1e6");
  await expect(fs(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Calcular Fellenius", exact: true })
    .click();
  await expect(diagnostics(page)).toContainText("não supera o limiar");
  await calculate(page);
  await expect(fs(page)).toBeVisible();
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("1,5");
  await expect(fs(page)).toHaveCount(0);
  await prepare(page, "1,5");
  await calculate(page);
  await expect(fs(page)).toBeVisible();
  expect(await save(page)).toEqual(
    withProfile(withGeometry(p, 1.5), { fellenius: felleniusProfile }),
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "fellenius.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(p)),
  });
  await select(page);
  await expect(fs(page)).toHaveCount(0);
});

test("rascunho, edição de material e histórico invalidam o cálculo anterior", async ({
  page,
}) => {
  await open(page, fixture());
  await prepare(page);
  await calculate(page);
  const before = await fs(page).textContent();
  await page
    .getByLabel("Direção de deslizamento", { exact: true })
    .selectOption("right-to-left");
  await expect(fs(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await calculate(page);
  await expect(fs(page)).toHaveText(before!);
  await page
    .getByRole("button", { name: "Solo do talude", exact: true })
    .click();
  await page.getByLabel("Coesão c′ (kPa)", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await select(page);
  await expect(fs(page)).toHaveCount(0);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).not.toHaveText(before!);
  const after = await fs(page).textContent();
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await select(page);
  await expect(fs(page)).toHaveCount(0);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toHaveText(before!);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await select(page);
  await expect(fs(page)).toHaveCount(0);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toHaveText(after!);
});

test("método selecionado e casos isolam resultado, sentido e resistência nula", async ({
  page,
}) => {
  let p = fixture();
  const opposite = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = opposite.project;
  Object.assign(opposite.analysisCase, {
    name: "Sentido contrário",
    direction: "right-to-left",
  });
  const bishop = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = bishop.project;
  Object.assign(bishop.analysisCase, {
    name: "Somente Bishop",
    methods: ["bishop"],
  });
  await open(page, p);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toBeVisible();
  await select(page, "Sentido contrário");
  await expect(fs(page)).toHaveCount(0);
  await prepare(page);
  await calculate(page);
  await expect(diagnostics(page)).toContainText("não supera o limiar");
  await expect(fs(page)).toHaveCount(0);
  await select(page, "Somente Bishop");
  await prepare(page);
  await expect(
    page.getByRole("button", { name: "Calcular Fellenius", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Calcular Bishop", exact: true }),
  ).toBeEnabled();
  await select(page);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toBeVisible();
  expect(await save(page)).toEqual(
    withProfile(
      withGeometry(p, 3, [0, 1, 2]),
      { fellenius: felleniusProfile },
      [0, 1],
    ),
  );
});

test("resistência nula é FS zero destacado; tração mantém diagnósticos sem FS", async ({
  page,
}) => {
  const p = fixture();
  p.materials[0].cohesion = 0;
  p.materials[0].friction = 0;
  await open(page, p);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toContainText("Resistência nula · FS = 0");
  const wet = fixture();
  wet.name = "Caso de tração";
  wet.materials[0].gamma = 1;
  Object.assign(wet.sections[0], {
    waterMode: "piezometric",
    waterUnitWeight: 10,
    water: [
      { x: -10, y: 4 },
      { x: 10, y: -6 },
    ],
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "tracao.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(wet)),
  });
  await page
    .getByRole("dialog", { name: "Salvar alterações?", exact: true })
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Caso de tração", exact: true }),
  ).toBeVisible();
  await select(page);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toHaveCount(0);
  await expect(diagnostics(page)).toContainText("Tração na base");
  await page
    .getByRole("button", { name: "Inspecionar Fellenius", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Inspeção de Fellenius",
    exact: true,
  });
  await expect(dialog.getByLabel("Balanço de Fellenius")).toContainText(
    "FS indisponível",
  );
});
