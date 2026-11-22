import { expect, test, type Locator, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { serializeProject, type Project } from "../../src/domain/model";
import { fixture, save } from "../fixtures/equilibrium-ui";
import { stratified, stratifiedProject } from "../fixtures/reference-catalog";

const workspace = (page: Page) =>
  page.getByRole("complementary", { name: "Resultados do caso", exact: true });
const resultsTab = (page: Page) =>
  page.getByRole("tab", { name: "Resultados", exact: true });
const availability = (page: Page) =>
  workspace(page).getByRole("status", {
    name: "Disponibilidade dos resultados",
    exact: true,
  });
const factor = (page: Page) =>
  workspace(page).getByLabel("Fator de segurança do resultado", {
    exact: true,
  });
const method = (page: Page) =>
  workspace(page).getByRole("combobox", {
    name: "Método do resultado",
    exact: true,
  });
const slice = (page: Page) =>
  workspace(page).getByRole("combobox", {
    name: "Fatia do resultado",
    exact: true,
  });
const comparison = (page: Page) =>
  workspace(page).getByRole("region", {
    name: "Comparação na mesma superfície",
    exact: true,
  });
const overlay = (
  page: Page,
  candidate: number | "fixed",
  selectedMethod: string,
) =>
  page.locator(
    `g[data-result-candidate='${candidate}'][data-result-method='${selectedMethod}']`,
  );

function withReferenceProfile(p: Project) {
  const profile = stratified.profile;
  for (const c of p.analysisCases)
    c.numericalProfile = {
      geometry: { ...profile.geometry },
      fellenius: { ...profile.equilibrium },
      bishop: { ...profile.equilibrium, ...profile.bishop },
      search: {
        geometry: { ...profile.geometry },
        equilibrium: { ...profile.equilibrium },
        bishop: { ...profile.bishop },
        nearTieTolerance: profile.nearTieTolerance,
      },
    };
  return p;
}

function model(search = false) {
  const p = withReferenceProfile(stratifiedProject(search));
  p.analysisCases[0].name = search
    ? "Busca de resultados"
    : "Fixo de resultados";
  return p;
}

function smallSearch() {
  const p = withReferenceProfile(fixture());
  p.materials[0].cohesion = 0;
  Object.assign(p.analysisCases[0], {
    name: "Busca com descarte",
    methods: ["fellenius", "bishop"],
    surfaceMode: "search",
    search: {
      x: { min: 0, max: 0, step: null },
      y: { min: 4, max: 4, step: null },
      radius: { min: 3, max: 6.05, step: 1 },
    },
  });
  return p;
}

async function open(page: Page, p: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "resultados.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(p)),
  });
  await selectCase(page, p.analysisCases[0].name);
}

async function selectCase(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

async function calculate(page: Page) {
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByRole("tabpanel", { name: "Análise", exact: true })
    .getByRole("button", { name: "Calcular caso", exact: true })
    .click();
  await expect(
    page.getByRole("status", {
      name: "Estado do cálculo do caso",
      exact: true,
    }),
  ).toHaveAttribute("data-status", "completed");
  await resultsTab(page).click();
}

async function selectCandidate(page: Page, number: number) {
  const input = workspace(page).getByRole("spinbutton", {
    name: "Superfície do resultado",
    exact: true,
  });
  await input.fill(String(number));
  await input.press("Enter");
  await expect(
    workspace(page).getByRole("region", {
      name: "Resultado da superfície selecionada",
      exact: true,
    }),
  ).toContainText(`Superfície ${number}`);
}

function displayedNumber(text: string) {
  const number = text.match(/[-+]?\d[\d.,]*(?:e[-+]?\d+)?/i);
  if (!number) throw new Error(`Número não encontrado: ${text}`);
  return Number(number[0].replaceAll(".", "").replace(",", "."));
}

async function expectNumber(locator: Locator, expected: number) {
  await expect
    .poll(async () =>
      Math.abs(displayedNumber((await locator.textContent()) ?? "") - expected),
    )
    .toBeLessThanOrEqual(1e-6);
}

function quantity(page: Page, label: string) {
  return workspace(page)
    .getByLabel("Grandezas da fatia selecionada", { exact: true })
    .getByText(label, { exact: true })
    .locator("..")
    .locator("dd");
}

async function expectNoFactor(page: Page) {
  await expect(factor(page)).toHaveCount(0);
  await expect(page.locator("g[data-result-candidate]")).toHaveCount(0);
}

test("o círculo fixo reúne métodos e referência numérica na janela mínima por teclado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = model();
  await open(page, p);
  await calculate(page);
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await resultsTab(page).focus();
  await page.keyboard.press("Enter");
  await expect(resultsTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(workspace(page)).toContainText("Fixo de resultados");
  await expect(
    workspace(page).getByLabel("Superfície do resultado", { exact: true }),
  ).toContainText("Círculo fixo");
  await method(page).selectOption("fellenius");
  await expectNumber(
    factor(page),
    stratified.fixedCircle.fellenius.factorOfSafety,
  );
  await expect(comparison(page)).toContainText("ΔFS");
  await expect(
    workspace(page).getByLabel("Validade do resultado", { exact: true }),
  ).toContainText("FS positivo admissível");
  await method(page).selectOption("bishop");
  await expectNumber(
    factor(page),
    stratified.fixedCircle.bishop.factorOfSafety,
  );
  await expect(overlay(page, "fixed", "bishop")).toHaveCount(1);
  const bounds = await workspace(page).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(960);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  expect(await save(page)).toEqual(p);
});

test("o exemplo distingue mínimos por método da comparação do círculo selecionado", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Abrir projeto padrão", exact: true })
    .click();
  await calculate(page);
  const minima = workspace(page).getByRole("region", {
    name: "Resultado da busca circular",
    exact: true,
  });
  await expect(minima).toContainText("27 círculos avaliados");
  for (const [key, label] of [
    ["fellenius", "Fellenius"],
    ["bishop", "Bishop Simplificado"],
  ] as const) {
    const ranking = minima.getByRole("region", {
      name: `Busca · ${label}`,
      exact: true,
    });
    await expect(ranking).toContainText("círculo 25");
    await expect(ranking).toContainText(
      "mínimo na borda amostrada (X, Z, raio)",
    );
    await expectNumber(
      ranking.locator("strong").first(),
      stratified.search.minima[key].factorOfSafety,
    );
  }
  await selectCandidate(page, 14);
  await method(page).selectOption("fellenius");
  await expectNumber(
    factor(page),
    stratified.fixedCircle.fellenius.factorOfSafety,
  );
  await expect(comparison(page)).toContainText("Comparação neste círculo");
  await expect(comparison(page)).toContainText(
    "mínimos de cada método na malha",
  );
  await expect(
    minima.getByRole("region", { name: "Busca · Fellenius", exact: true }),
  ).toContainText("círculo 25");

  await selectCase(page, "Talude — círculo fixo");
  await resultsTab(page).click();
  await expect(availability(page)).toContainText(
    "Nenhum resultado nesta sessão",
  );
  await expectNoFactor(page);
  await calculate(page);
  await method(page).selectOption("bishop");
  await expectNumber(
    factor(page),
    stratified.fixedCircle.bishop.factorOfSafety,
  );
});

test("superfície, método e fatia acompanham o SVG e as parcelas da referência", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await open(page, model(true));
  await calculate(page);
  // O candidato 14 é o mesmo círculo (32, 32, 25) da referência fixa independente.
  await selectCandidate(page, 14);
  await method(page).selectOption("fellenius");
  await slice(page).selectOption("5");
  await expect(
    overlay(page, 14, "fellenius").locator(
      "path[data-slice='5'][data-selected-slice='true']",
    ),
  ).toHaveCount(1);
  await expectNumber(
    quantity(page, "Peso próprio W (kN/m)"),
    stratified.fixedCircle.slices[4].weightKNPerM,
  );
  await expectNumber(
    quantity(page, "Normal usada (kN/m)"),
    stratified.fixedCircle.fellenius.slices[4].normalKNPerM,
  );
  await method(page).selectOption("bishop");
  await expectNumber(
    quantity(page, "Normal usada (kN/m)"),
    stratified.fixedCircle.bishop.slices[4].normalKNPerM,
  );
  await expect(
    overlay(page, 14, "bishop").locator(
      "path[data-slice='5'][data-selected-slice='true']",
    ),
  ).toHaveCount(1);

  await workspace(page)
    .getByRole("button", { name: "Inspeção completa", exact: true })
    .click();
  const inspection = page.getByRole("dialog", {
    name: "Inspeção completa do resultado",
    exact: true,
  });
  await expect(inspection).toContainText("Bishop Simplificado · superfície 14");
  const row = inspection
    .getByRole("table", { name: "Parcelas de Bishop por fatia", exact: true })
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "5 / 5", exact: true }) });
  await expectNumber(
    row.getByRole("cell").nth(6),
    stratified.fixedCircle.bishop.slices[4].normalKNPerM,
  );
  await inspection
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();

  await selectCandidate(page, 25);
  await expect(
    overlay(page, 25, "bishop").locator("path[data-slice]"),
  ).toHaveCount(22);
  await expect(overlay(page, 14, "bishop")).toHaveCount(0);
  await workspace(page)
    .getByRole("button", { name: "Selecionar fatia pela tabela", exact: true })
    .click();
  const table = page.getByRole("dialog", {
    name: "Fatias da superfície selecionada",
    exact: true,
  });
  await table
    .getByRole("button", { name: "Selecionar fatia 22", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(table).toHaveCount(0);
  await expect(slice(page)).toHaveValue("22");
  await expect(
    overlay(page, 25, "bishop").locator(
      "path[data-slice='22'][data-selected-slice='true']",
    ),
  ).toHaveCount(1);
  await expect(
    workspace(page).getByRole("region", {
      name: "Parcelas da fatia 22",
      exact: true,
    }),
  ).toContainText("Bishop Simplificado");
});

test("a seleção conserva resultados do caso correto e expõe rascunho, perfil e entrada desatualizados", async ({
  page,
}) => {
  const p = model();
  const added = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  added.analysisCase.name = "Outro caso de resultados";
  await open(page, added.project);
  await calculate(page);
  await selectCase(page, "Outro caso de resultados");
  await resultsTab(page).click();
  await expect(availability(page)).toContainText(
    "Nenhum resultado nesta sessão",
  );
  await expectNoFactor(page);
  await selectCase(page, "Fixo de resultados");
  await resultsTab(page).click();
  await expect(factor(page)).toBeVisible();

  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByLabel("Nome do caso", { exact: true })
    .fill("Fixo de resultados TESTE");
  await resultsTab(page).click();
  await expect(availability(page)).toContainText("Resultado desatualizado");
  await expectNoFactor(page);
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await expect(page.getByLabel("Nome do caso", { exact: true })).toHaveValue(
    "Fixo de resultados TESTE",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await resultsTab(page).click();
  await expect(factor(page)).toBeVisible();

  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByLabel("Bishop · Tolerância do resíduo τF", { exact: true })
    .fill("1e-9");
  await resultsTab(page).click();
  await expect(availability(page)).toContainText("Resultado desatualizado");
  await expectNoFactor(page);
  await selectCase(page, "Outro caso de resultados");
  await selectCase(page, "Fixo de resultados");
  await resultsTab(page).click();
  await expect(availability(page)).toContainText("Resultado desatualizado");
  await expectNoFactor(page);
  await calculate(page);
  await expect(factor(page)).toBeVisible();

  await selectCase(page, "Solo residual");
  await page
    .getByLabel("Peso específico total γ (kN/m³)", { exact: true })
    .fill("20");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page, "Fixo de resultados");
  await resultsTab(page).click();
  await expect(availability(page)).toContainText("Resultado desatualizado");
  await expectNoFactor(page);
  await calculate(page);
  await expect(factor(page)).toBeVisible();
});

test("não convergência conserva o diagnóstico sem apresentar a tentativa como FS", async ({
  page,
}) => {
  const p = model();
  p.analysisCases[0].numericalProfile.bishop.maxIterations = 1;
  await open(page, p);
  await calculate(page);
  await method(page).selectOption("bishop");
  await expect(
    workspace(page).getByLabel("Validade do resultado", { exact: true }),
  ).toContainText("Sem convergência");
  await expect(factor(page)).toHaveCount(0);
  await expect(
    workspace(page).getByLabel("Diagnósticos do resultado", { exact: true }),
  ).toContainText("Sem convergência em 1 avaliações");
  await expect(comparison(page)).not.toContainText("ΔFS");
  await slice(page).selectOption("5");
  await expect(
    workspace(page).getByLabel("Avaliação de Bishop da fatia", { exact: true }),
  ).toContainText("não é uma solução admissível");
  await expect(quantity(page, "Normal usada (kN/m)")).toHaveText("—");
  await method(page).selectOption("fellenius");
  await expectNumber(
    factor(page),
    stratified.fixedCircle.fellenius.factorOfSafety,
  );
});

test("resistência nula distingue Fellenius com FS zero de Bishop sem FS admissível", async ({
  page,
}) => {
  const p = model();
  for (const material of p.materials) material.friction = 0;
  await open(page, p);
  await calculate(page);
  await method(page).selectOption("fellenius");
  await expect(factor(page)).toContainText("Resistência nula · FS = 0");
  await expect(
    workspace(page).getByLabel("Validade do resultado", { exact: true }),
  ).toContainText("distinta de rejeição");
  await expect(comparison(page)).not.toContainText("ΔFS");
  await method(page).selectOption("bishop");
  await expect(factor(page)).toHaveCount(0);
  await expect(
    workspace(page).getByLabel("Validade do resultado", { exact: true }),
  ).toContainText("Resistência nula");
  await expect(
    workspace(page).getByRole("region", {
      name: "Resultado da superfície selecionada",
      exact: true,
    }),
  ).toContainText("Resistência nula");
});

test("rejeição e descarte geométrico preservam diagnósticos e retiram as fatias indisponíveis", async ({
  page,
}) => {
  const rejected = withReferenceProfile(fixture());
  rejected.analysisCases[0].methods = ["fellenius", "bishop"];
  await open(page, rejected);
  await calculate(page);
  await method(page).selectOption("bishop");
  await expect(factor(page)).toHaveCount(0);
  await expect(
    workspace(page).getByRole("region", {
      name: "Resultado da superfície selecionada",
      exact: true,
    }),
  ).toContainText("Rejeitado");
  await expect(
    workspace(page).getByLabel("Diagnósticos do resultado", { exact: true }),
  ).toContainText("Tração na base");
  await expect(comparison(page)).not.toContainText("ΔFS");
  await method(page).selectOption("fellenius");
  await expect(factor(page)).toBeVisible();

  await open(page, smallSearch());
  await calculate(page);
  await workspace(page)
    .getByRole("button", { name: "Ver superfícies avaliadas", exact: true })
    .click();
  const evaluated = page.getByRole("dialog", {
    name: "Círculos avaliados nos resultados",
    exact: true,
  });
  await evaluated
    .getByRole("combobox", { name: "Filtrar círculos", exact: true })
    .selectOption("issues");
  await evaluated
    .getByRole("button", { name: "Inspecionar círculo 1", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(evaluated).toHaveCount(0);
  await expect(
    workspace(page).getByLabel("Diagnósticos do resultado", { exact: true }),
  ).toContainText("não cruza o terreno");
  await expect(factor(page)).toHaveCount(0);
  await expect(slice(page)).toHaveCount(0);
  const rejectedOutline = overlay(page, 1, "fellenius");
  await expect(rejectedOutline).toHaveCount(1);
  await expect(
    rejectedOutline.locator("[data-result-circle='true']"),
  ).toHaveCount(1);
  await expect(rejectedOutline.locator("[data-result-arc='true']")).toHaveCount(
    0,
  );
  await expect(page.locator("path[data-slice]")).toHaveCount(0);
  await expect(
    workspace(page).getByRole("region", {
      name: "Resultado da busca circular",
      exact: true,
    }),
  ).toContainText("Descartes na geometria: 1");
});

test("o círculo fixo bloqueado conserva o contorno diagnóstico sem inventar FS ou fatias", async ({
  page,
}) => {
  const p = model();
  p.analysisCases[0].fixedCircle = { x: 32, y: 20, radius: 1 };
  await open(page, p);
  await calculate(page);
  await expect(
    workspace(page).getByLabel("Diagnósticos do resultado", { exact: true }),
  ).toContainText("não cruza o terreno");
  await expect(
    workspace(page).getByLabel("Validade do resultado", { exact: true }),
  ).toContainText("Sem FS admissível");
  await expect(factor(page)).toHaveCount(0);
  await expect(slice(page)).toHaveCount(0);
  await expect(page.locator("path[data-slice]")).toHaveCount(0);
  await expect(
    overlay(page, "fixed", "fellenius").locator("[data-result-circle='true']"),
  ).toHaveCount(1);
  await expect(comparison(page)).not.toContainText("ΔFS");
});

test("a aba acompanha a busca e o cancelamento sem mostrar resultados parciais", async ({
  page,
}) => {
  const p = smallSearch();
  const c = p.analysisCases[0];
  c.methods = ["fellenius"];
  c.numericalProfile.search.geometry.maxArcDegrees = 0.75;
  c.search = {
    x: { min: -3, max: 3, step: 0.12 },
    y: { min: 3.5, max: 4.5, step: 0.05 },
    radius: { min: 4.8, max: 5.6, step: 0.1 },
  };
  await open(page, p);
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByRole("tabpanel", { name: "Análise", exact: true })
    .getByRole("button", { name: "Calcular caso", exact: true })
    .click();
  await resultsTab(page).click();
  await expect(availability(page)).toContainText("Calculando caso");
  const progress = workspace(page).getByRole("progressbar", {
    name: "Progresso na aba Resultados",
    exact: true,
  });
  await expect(progress).toHaveAttribute("max", "9639");
  await expect
    .poll(async () => Number(await progress.getAttribute("value")))
    .toBeGreaterThan(0);
  await expectNoFactor(page);
  await page
    .getByRole("button", { name: "Cancelar cálculo", exact: true })
    .click();
  await expect(availability(page)).toContainText("Cálculo cancelado");
  await expect(workspace(page)).toContainText(
    "O resultado parcial foi descartado",
  );
  await expectNoFactor(page);
  await expect(progress).toHaveCount(0);
  expect(await save(page)).toEqual(p);
});
