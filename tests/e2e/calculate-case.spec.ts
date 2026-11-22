import { expect, test, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { serializeProject, type Project } from "../../src/domain/model";
import { fixture, save } from "../fixtures/equilibrium-ui";
import {
  bishopProfile,
  felleniusProfile,
  searchProfile,
  withGeometry,
  withProfile,
} from "../fixtures/numerical-profile";

const state = (page: Page) =>
  page.getByRole("status", { name: "Estado do cálculo do caso", exact: true });
const calculate = (page: Page) =>
  page
    .getByRole("tabpanel", { name: "Análise", exact: true })
    .getByRole("button", { name: "Calcular caso", exact: true });
const cancel = (page: Page) =>
  page.getByRole("button", { name: "Cancelar cálculo", exact: true });
const searchResult = (page: Page) =>
  page.getByRole("region", {
    name: "Resultado da busca circular",
    exact: true,
  });
const factor = (page: Page, method: "Fellenius" | "Bishop") =>
  page.getByLabel(`Fator de segurança ${method}`, { exact: true });
const audit = (page: Page) =>
  page.getByRole("dialog", {
    name: "Conferência dos lançamentos",
    exact: true,
  });

function fixedProject() {
  const p = fixture();
  p.materials[0].cohesion = 0;
  p.analysisCases[0].name = "Círculo central";
  p.analysisCases[0].methods = ["fellenius", "bishop"];
  return withProfile(withGeometry(p), {
    fellenius: felleniusProfile,
    bishop: bishopProfile,
  });
}

function searchProject(long = false) {
  const p = fixedProject();
  const c = p.analysisCases[0];
  c.name = "Busca central";
  c.methods = ["fellenius"];
  c.surfaceMode = "search";
  c.numericalProfile.search = structuredClone(searchProfile);
  c.search = long
    ? {
        x: { min: -3, max: 3, step: 0.12 },
        y: { min: 3.5, max: 4.5, step: 0.05 },
        radius: { min: 4.8, max: 5.6, step: 0.1 },
      }
    : {
        x: { min: 0, max: 0, step: null },
        y: { min: 4, max: 4, step: null },
        radius: { min: 3, max: 6.05, step: 1 },
      };
  if (long) c.numericalProfile.search.geometry.maxArcDegrees = 0.75;
  return p;
}

async function selectCase(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
}

async function open(page: Page, p: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "calcular-caso.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(p)),
  });
  await selectCase(page, p.analysisCases[0].name);
}

async function expectBothFactors(page: Page) {
  for (const method of ["Fellenius", "Bishop"] as const)
    await expect(factor(page, method)).toContainText("FS =");
  await expect(
    page.getByLabel("Diferença entre métodos", { exact: true }),
  ).toContainText("ΔFS");
}

async function showDetails(page: Page, mode: "fixed" | "search") {
  const details = page.locator(
    mode === "fixed" ? ".fixed-circle-preview" : ".circular-search-panel",
  );
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
}

async function waitForProgress(page: Page) {
  const progress = page.getByRole("progressbar", {
    name: "Progresso da busca circular",
    exact: true,
  });
  await expect(state(page)).toHaveAttribute("data-status", "calculating");
  await expect(progress).toHaveAttribute("max", "9639");
  await expect
    .poll(async () => Number(await progress.getAttribute("value")))
    .toBeGreaterThan(0);
  return progress;
}

test("o comando central calcula a busca padrão por teclado na janela mínima", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Abrir projeto padrão", exact: true })
    .click();
  const before = await save(page);
  await expect(state(page)).toHaveAttribute("data-status", "ready");
  const details = page.locator(".circular-search-panel");
  if ((await details.getAttribute("open")) !== null)
    await details.locator(":scope > summary").click();
  await expect(calculate(page)).toBeVisible();
  const bounds = await calculate(page).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(960);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  await calculate(page).focus();
  await page.keyboard.press("Enter");
  await expect(state(page)).toHaveAttribute("data-status", "completed");
  await showDetails(page, "search");
  await expect(searchResult(page)).toContainText("27 círculos avaliados");
  for (const method of ["Fellenius", "Bishop Simplificado"])
    await expect(
      searchResult(page).getByRole("region", {
        name: `Busca · ${method}`,
        exact: true,
      }),
    ).toContainText("Menor FS na malha =");
  expect(await save(page)).toEqual(before);
});

test("uma ação central prepara o círculo e calcula somente os métodos selecionados", async ({
  page,
}) => {
  const p = fixedProject();
  await open(page, p);
  const details = page.locator(".fixed-circle-preview");
  if ((await details.getAttribute("open")) !== null)
    await details.locator(":scope > summary").click();
  await expect(factor(page, "Fellenius")).toHaveCount(0);
  await expect(factor(page, "Bishop")).toHaveCount(0);
  await calculate(page).click();
  await expect(state(page)).toHaveAttribute("data-status", "completed");
  await showDetails(page, "fixed");
  await expectBothFactors(page);
  expect(await save(page)).toEqual(p);

  await page
    .getByRole("checkbox", {
      name: "Bishop Simplificado · principal",
      exact: true,
    })
    .uncheck();
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
  await calculate(page).click();
  await expect(state(page)).toHaveAttribute("data-status", "completed");
  await expect(factor(page, "Fellenius")).toContainText("FS =");
  await expect(factor(page, "Bishop")).toHaveCount(0);
  await expect(
    page.getByLabel("Diferença entre métodos", { exact: true }),
  ).toHaveCount(0);
});

test("perfil pendente abre a conferência e permite corrigir o caso antes de calcular", async ({
  page,
}) => {
  const p = fixedProject();
  p.analysisCases[0].numericalProfile.bishop.initialFactor = null;
  await open(page, p);
  await expect(state(page)).toHaveAttribute("data-status", "pending");
  await calculate(page).click();
  await expect(audit(page)).toBeVisible();
  await audit(page)
    .getByRole("combobox", { name: "Seção ou caso", exact: true })
    .selectOption(p.analysisCases[0].id);
  await expect(factor(page, "Fellenius")).toHaveCount(0);
  await expect(factor(page, "Bishop")).toHaveCount(0);
  await audit(page)
    .getByRole("button", { name: /perfil numérico do círculo fixo/i })
    .first()
    .click();
  await expect(audit(page)).toHaveCount(0);
  await expect(page.getByLabel("Nome do caso", { exact: true })).toHaveValue(
    "Círculo central",
  );
  await page
    .getByLabel("Bishop · Fator inicial F₀", { exact: true })
    .fill("1.4");
  await expect(state(page)).toHaveAttribute("data-status", "ready");
  await calculate(page).click();
  await expect(state(page)).toHaveAttribute("data-status", "completed");
  await expectBothFactors(page);
});

test("clicar no comando pendente preserva o rascunho do caso e o perfil inválido", async ({
  page,
}) => {
  await open(page, fixedProject());
  const name = page.getByLabel("Nome do caso", { exact: true });
  await name.fill("Círculo em edição");
  await expect(state(page)).toHaveAttribute("data-status", "pending");
  await calculate(page).click();
  await expect(name).toHaveValue("Círculo em edição");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(state(page)).toContainText(/aplique|rascunho|edição/i);
  await expect(factor(page, "Fellenius")).toHaveCount(0);
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
  await expect(state(page)).toHaveAttribute("data-status", "ready");
  await calculate(page).click();
  await expectBothFactors(page);

  const maximum = page.getByLabel("Bishop · Máximo de avaliações K", {
    exact: true,
  });
  await maximum.fill("0");
  await expect(state(page)).toHaveAttribute("data-status", "pending");
  await calculate(page).click();
  await expect(maximum).toHaveValue("0");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(factor(page, "Bishop")).toHaveCount(0);
  await maximum.fill("100");
  // Restaurar o perfil original recupera o resultado guardado da mesma identidade.
  await expect(state(page)).toHaveAttribute("data-status", "completed");
  await expectBothFactors(page);
});

test("a busca central informa progresso e cancela sem publicar resultado parcial", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = searchProject(true);
  await open(page, p);
  await calculate(page).click();
  const progress = await waitForProgress(page);
  await expect(cancel(page)).toBeVisible();
  const bounds = await cancel(page).boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(960);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  await cancel(page).click();
  await expect(state(page)).toHaveAttribute("data-status", "cancelled");
  await expect(progress).toHaveCount(0);
  await expect(searchResult(page)).toHaveCount(0);
  await expect(cancel(page)).toHaveCount(0);
  await expect(calculate(page)).toBeEnabled();
  expect(await save(page)).toEqual(p);
});

test("trocar de caso durante a busca permite outra execução sem receber resultado antigo", async ({
  page,
}) => {
  const p = searchProject(true);
  const added = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  added.analysisCase.name = "Busca curta";
  added.analysisCase.search = searchProject().analysisCases[0].search;
  added.analysisCase.numericalProfile.search = structuredClone(searchProfile);
  await open(page, added.project);
  await calculate(page).click();
  await waitForProgress(page);
  await selectCase(page, "Busca curta");
  await expect(state(page)).toHaveAttribute("data-status", "ready");
  await expect(searchResult(page)).toHaveCount(0);
  await expect(cancel(page)).toHaveCount(0);
  await calculate(page).click();
  await expect(state(page)).toHaveAttribute("data-status", "completed");
  await expect(searchResult(page)).toContainText("4 círculos avaliados");
  await expect(searchResult(page)).not.toContainText("9639");
  await expect(
    searchResult(page).getByRole("region", {
      name: "Busca · Bishop Simplificado",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(await save(page)).toEqual(added.project);
});

test("alterar perfil ou entrada compartilhada invalida o resultado e a conferência leva à correção", async ({
  page,
}) => {
  const p = fixedProject();
  await open(page, p);
  await calculate(page).click();
  await expectBothFactors(page);
  await page
    .getByLabel("Bishop · Tolerância do resíduo τF", { exact: true })
    .fill("1e-9");
  await expect(state(page)).toHaveAttribute("data-status", "ready");
  await expect(factor(page, "Bishop")).toHaveCount(0);
  await expect(
    page.getByLabel("Diferença entre métodos", { exact: true }),
  ).toHaveCount(0);
  await calculate(page).click();
  await expectBothFactors(page);

  await page
    .getByRole("button", { name: "Solo do talude", exact: true })
    .click();
  await page
    .getByLabel("Peso específico total γ (kN/m³)", { exact: true })
    .fill("");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page, "Círculo central");
  await expect(state(page)).toHaveAttribute("data-status", "pending");
  await expect(factor(page, "Fellenius")).toHaveCount(0);
  await expect(factor(page, "Bishop")).toHaveCount(0);
  await calculate(page).click();
  await expect(audit(page)).toBeVisible();
  await audit(page)
    .getByRole("combobox", { name: "Seção ou caso", exact: true })
    .selectOption(p.analysisCases[0].id);
  await audit(page)
    .getByRole("button", { name: /Solo do talude:.*peso específico/i })
    .click();
  await expect(audit(page)).toHaveCount(0);
  await page
    .getByLabel("Peso específico total γ (kN/m³)", { exact: true })
    .fill("18");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page, "Círculo central");
  // Restaurar a entrada original recupera o resultado guardado da mesma identidade.
  await expect(state(page)).toHaveAttribute("data-status", "completed");
  await expectBothFactors(page);
});
