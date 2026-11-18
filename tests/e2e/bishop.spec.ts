import {
  withGeometry,
  withProfile,
  felleniusProfile,
  bishopProfile,
} from "../fixtures/numerical-profile";
import { expect, test, type Page } from "@playwright/test";
import {
  fixture,
  select,
  open,
  prepare,
  calculate,
  save,
} from "../fixtures/equilibrium-ui";
import { addAnalysisCase } from "../../src/domain/analysis";
import { serializeProject } from "../../src/domain/model";
function model() {
  const p = fixture();
  p.materials[0].cohesion = 0;
  p.analysisCases[0].methods = ["fellenius", "bishop"];
  return p;
}
const field = (page: Page, label: string) =>
  page.getByLabel(`Bishop · ${label}`, { exact: true });
const fs = (page: Page) =>
  page.getByLabel("Fator de segurança Bishop", { exact: true });
const diff = (page: Page) =>
  page.getByLabel("Diferença entre métodos", { exact: true });
const diagnostics = (page: Page) =>
  page.getByLabel("Diagnósticos de Bishop", { exact: true });
async function bishop(
  page: Page,
  {
    initial = "1.4",
    tolerance = "1e-8",
    max = "100",
    singularity = "0",
    driving = "0",
    tension = "0",
  } = {},
) {
  for (const [label, value] of [
    ["Fator inicial F₀", initial],
    ["Tolerância do resíduo τF", tolerance],
    ["Máximo de avaliações K", max],
    ["Limiar de singularidade τm", singularity],
    ["Limiar motriz τD (kN/m)", driving],
    ["Tolerância de tração τt (kPa)", tension],
  ])
    await field(page, label).fill(value);
  await page
    .getByRole("button", { name: "Calcular Bishop", exact: true })
    .click();
}
async function both(page: Page) {
  await calculate(page);
  await bishop(page);
}

test("Bishop calcula e inspeciona o perfil, trajetória e fatias na janela mínima sem mudar o arquivo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = model();
  await open(page, p);
  await prepare(page);
  await page
    .getByRole("button", { name: "Calcular Bishop", exact: true })
    .click();
  await expect(diagnostics(page)).toContainText("Informe F₀ e τF");
  await expect(fs(page)).toHaveCount(0);
  await both(page);
  await expect(fs(page)).toContainText("FS =");
  await expect(diff(page)).toContainText("ΔFS");
  await page
    .getByRole("button", { name: "Inspecionar Bishop", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Inspeção de Bishop",
    exact: true,
  });
  await expect(dialog.getByLabel("Perfil de Bishop")).toContainText("F₀ = 1,4");
  await expect(dialog.getByLabel("Balanço de Bishop")).toContainText("G(F)");
  expect(
    await dialog
      .getByRole("table", { name: "Trajetória de Bishop" })
      .getByRole("row")
      .count(),
  ).toBeGreaterThan(2);
  expect(
    await dialog
      .getByRole("table", { name: "Parcelas de Bishop por fatia" })
      .getByRole("row")
      .count(),
  ).toBeGreaterThan(20);
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(960);
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(
    withProfile(withGeometry(p), {
      fellenius: felleniusProfile,
      bishop: bishopProfile,
    }),
  );
  await field(page, "Tolerância do resíduo τF").fill("1e-9");
  await expect(fs(page)).toHaveCount(0);
  await expect(diff(page)).toHaveCount(0);
  await expect(
    page.getByLabel("Fator de segurança Fellenius", { exact: true }),
  ).toBeVisible();
  await bishop(page, { tension: "1" });
  await expect(fs(page)).toBeVisible();
  await expect(diff(page)).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Comparação no mesmo círculo" }),
  ).toContainText("limiares τD ou τt são diferentes");
  await bishop(page);
  await expect(diff(page)).toBeVisible();
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("1.5");
  await expect(fs(page)).toHaveCount(0);
  await expect(diff(page)).toHaveCount(0);
  await prepare(page, "1.5");
  await both(page);
  await expect(diff(page)).toBeVisible();
  expect(await save(page)).toEqual(
    withProfile(withGeometry(p, 1.5), {
      fellenius: felleniusProfile,
      bishop: bishopProfile,
    }),
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "bishop.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(p)),
  });
  await select(page);
  await expect(fs(page)).toHaveCount(0);
  await expect(diff(page)).toHaveCount(0);
});

test("interrupção por K e singularidade exibe tentativas sem apresentar FS válido", async ({
  page,
}) => {
  await open(page, model());
  await prepare(page);
  await calculate(page);
  await bishop(page, { max: "1" });
  await expect(diagnostics(page)).toContainText(
    "Sem convergência em 1 avaliações",
  );
  await expect(fs(page)).toHaveCount(0);
  await expect(diff(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Inspecionar Bishop", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Inspeção de Bishop",
    exact: true,
  });
  await expect(dialog.getByLabel("Balanço de Bishop")).toContainText(
    "FS indisponível",
  );
  await expect(
    dialog
      .getByRole("table", { name: "Trajetória de Bishop" })
      .getByRole("row"),
  ).toHaveCount(2);
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await bishop(page, { singularity: "2" });
  await expect(diagnostics(page)).toContainText("não supera τm na avaliação 1");
  await expect(fs(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Inspecionar Bishop", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Inspeção de Bishop",
    exact: true,
  });
  await expect(
    dialog
      .getByRole("table", { name: "Trajetória de Bishop" })
      .getByRole("row"),
  ).toHaveCount(2);
  await expect(
    dialog.getByRole("table", { name: "Parcelas de Bishop por fatia" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await bishop(page);
  await expect(fs(page)).toBeVisible();
  await expect(diff(page)).toBeVisible();
});

test("Bishop funciona sozinho e isola casos, sentido e resistência nula", async ({
  page,
}) => {
  let p = model();
  p.analysisCases[0].methods = ["bishop"];
  const second = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = second.project;
  Object.assign(second.analysisCase, {
    name: "Sentido contrário",
    direction: "right-to-left",
  });
  await open(page, p);
  await prepare(page);
  await bishop(page);
  await expect(fs(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Calcular Fellenius", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Comparação no mesmo círculo" }),
  ).toHaveCount(0);
  await select(page, "Sentido contrário");
  await expect(fs(page)).toHaveCount(0);
  await prepare(page);
  await bishop(page);
  await expect(diagnostics(page)).toContainText("não supera o limiar");
  await expect(fs(page)).toHaveCount(0);
  await select(page);
  await prepare(page);
  await bishop(page);
  await expect(fs(page)).toBeVisible();
  expect(await save(page)).toEqual(
    withProfile(withGeometry(p, 3, [0, 1]), { bishop: bishopProfile }, [0, 1]),
  );
  p = model();
  p.materials[0].friction = 0;
  await page.locator("input[type=file]").setInputFiles({
    name: "zero.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(p)),
  });
  await select(page);
  await prepare(page);
  await both(page);
  await expect(fs(page)).toHaveCount(0);
  await expect(diagnostics(page)).toContainText("Resistência física nula");
  await expect(diff(page)).toHaveCount(0);
  await expect(
    page.getByLabel("Fator de segurança Fellenius", { exact: true }),
  ).toContainText("FS = 0");
});

test("rascunhos, materiais e desfazer/refazer invalidam Bishop e a comparação", async ({
  page,
}) => {
  await open(page, model());
  await prepare(page);
  await both(page);
  const before = await fs(page).textContent();
  await page
    .getByLabel("Direção de deslizamento", { exact: true })
    .selectOption("right-to-left");
  await expect(fs(page)).toHaveCount(0);
  await expect(diff(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await both(page);
  await expect(fs(page)).toHaveText(before!);
  await page
    .getByRole("button", { name: "Solo do talude", exact: true })
    .click();
  await page.getByLabel("Atrito φ′ (°)", { exact: true }).fill("35");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await select(page);
  await expect(fs(page)).toHaveCount(0);
  await expect(diff(page)).toHaveCount(0);
  await prepare(page);
  await both(page);
  await expect(fs(page)).not.toHaveText(before!);
  const after = await fs(page).textContent();
  for (const [action, text] of [
    ["Desfazer", before],
    ["Refazer", after],
  ]) {
    await page.getByRole("tab", { name: "Geometria", exact: true }).click();
    await page.getByRole("button", { name: action!, exact: true }).click();
    await select(page);
    await expect(fs(page)).toHaveCount(0);
    await expect(diff(page)).toHaveCount(0);
    await prepare(page);
    await both(page);
    await expect(fs(page)).toHaveText(text!);
    await expect(diff(page)).toBeVisible();
  }
});

test("convergência com tração rejeita Bishop mesmo quando Fellenius tem resultado", async ({
  page,
}) => {
  const p = model();
  p.materials[0].cohesion = 5;
  await open(page, p);
  await prepare(page);
  await both(page);
  await expect(
    page.getByLabel("Fator de segurança Fellenius", { exact: true }),
  ).toBeVisible();
  await expect(fs(page)).toHaveCount(0);
  await expect(diagnostics(page)).toContainText("Tração na base");
  await expect(diff(page)).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Comparação no mesmo círculo" }),
  ).toContainText("Rejeitado");
  await page
    .getByRole("button", { name: "Inspecionar Bishop", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Inspeção de Bishop",
    exact: true,
  });
  await expect(
    dialog.getByLabel("Diagnósticos na inspeção de Bishop"),
  ).toContainText("solução convergida");
  await expect(
    dialog.getByRole("table", { name: "Parcelas de Bishop por fatia" }),
  ).toBeVisible();
});
