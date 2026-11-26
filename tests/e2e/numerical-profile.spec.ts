import { expect, test, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import type { Project } from "../../src/domain/model";
import { fixture, open, save, select } from "../fixtures/equilibrium-ui";

function model() {
  const p = fixture();
  const c = p.analysisCases[0];
  c.methods = ["fellenius", "bishop"];
  c.numericalProfile = {
    geometry: { toleranceM: 1e-8, maxArcDegrees: 2.5 },
    fellenius: { drivingThresholdKNPerM: 0, tensionToleranceKPa: 0.2 },
    bishop: {
      initialFactor: 1.4,
      residualTolerance: 1e-8,
      maxIterations: 100,
      singularityThreshold: 0,
      drivingThresholdKNPerM: 0.01,
      tensionToleranceKPa: 0.3,
    },
    search: {
      geometry: { toleranceM: 1e-7, maxArcDegrees: 1.5 },
      equilibrium: { drivingThresholdKNPerM: 0.02, tensionToleranceKPa: 0.4 },
      bishop: {
        initialFactor: 1.7,
        residualTolerance: 1e-6,
        maxIterations: 80,
        singularityThreshold: 0.001,
      },
      nearTieTolerance: 0.02,
    },
  };
  const next = addAnalysisCase(p, c.sectionId, c.id);
  next.analysisCase.name = "Outro perfil";
  next.analysisCase.numericalProfile.bishop.initialFactor = 1.9;
  return next.project;
}

async function load(page: Page, p: unknown) {
  await page.locator("input[type=file]").setInputFiles({
    name: "perfis.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
}

async function setMode(page: Page, mode: "fixed" | "search") {
  await page
    .getByLabel("Definição da superfície", { exact: true })
    .selectOption(mode);
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
  const details = page.locator(
    mode === "search" ? ".circular-search-panel" : ".fixed-circle-preview",
  );
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
  const settings = details.locator(".search-profile");
  if (
    (await settings.count()) &&
    (await settings.getAttribute("open")) === null
  )
    await settings.locator(":scope > summary").click();
}

const bishopInitial = (page: Page) =>
  page.getByLabel("Bishop · Fator inicial F₀", { exact: true });

test("cada edição válida persiste sem remontar o campo e desfazer/refazer restaura o perfil do caso", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  await bishopInitial(page).fill("2.2");
  await expect(bishopInitial(page)).toBeFocused();
  await expect(bishopInitial(page)).toHaveValue("2.2");
  const edited = structuredClone(p);
  edited.analysisCases[0].numericalProfile.bishop.initialFactor = 2.2;
  expect(await save(page)).toEqual(edited);

  await select(page, "Outro perfil");
  await expect(bishopInitial(page)).toHaveValue("1.9");
  await select(page);
  await expect(bishopInitial(page)).toHaveValue("2.2");
  for (const [action, expected] of [
    ["Desfazer", p],
    ["Refazer", edited],
  ] as const) {
    await page.getByRole("tab", { name: "Geometria", exact: true }).click();
    await page.getByRole("button", { name: action, exact: true }).click();
    await select(page);
    await expect(bishopInitial(page)).toHaveValue(
      String(expected.analysisCases[0].numericalProfile.bishop.initialFactor),
    );
    expect(await save(page)).toEqual(expected);
  }
});

test("alternar modo/métodos e duplicar conserva perfis independentes em cada caso", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  await expect(
    page.getByLabel("Tolerância de tração τt (kPa)", { exact: true }),
  ).toHaveValue("0.2");
  await expect(
    page.getByLabel("Bishop · Tolerância de tração τt (kPa)", { exact: true }),
  ).toHaveValue("0.3");
  await setMode(page, "search");
  await expect(
    page.getByLabel("Busca · Fator inicial F₀", { exact: true }),
  ).toHaveValue("1.7");
  await expect(
    page.getByLabel("Busca · Tolerância geométrica (m)", { exact: true }),
  ).toHaveValue("1e-7");
  await expect(
    page.getByLabel("Busca · Tolerância de tração τt (kPa)", { exact: true }),
  ).toHaveValue("0.4");
  await page
    .getByLabel("Busca · Faixa de quase empate em FS", { exact: true })
    .fill("0,025");
  await setMode(page, "fixed");
  await expect(bishopInitial(page)).toHaveValue("1.4");
  await expect(
    page.getByLabel("Abertura máxima por fatia (°)", { exact: true }),
  ).toHaveValue("2.5");
  await page
    .getByRole("checkbox", {
      name: "Bishop Simplificado · principal",
      exact: true,
    })
    .uncheck();
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Bishop Simplificado · principal",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
  const expected = structuredClone(p);
  expected.analysisCases[0].numericalProfile.search.nearTieTolerance = 0.025;
  expect(await save(page)).toEqual(expected);

  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByRole("button", { name: "Gerenciar casos", exact: true })
    .click();
  const manager = page.getByRole("dialog", {
    name: "Casos de análise da seção",
  });
  await manager
    .getByRole("button", {
      name: "Duplicar Círculo de referência",
      exact: true,
    })
    .click();
  await manager
    .getByRole("button", {
      name: "Editar Círculo de referência — cópia",
      exact: true,
    })
    .click();
  await bishopInitial(page).fill("2.8");
  const duplicated = await save(page);
  expect(duplicated.analysisCases).toHaveLength(3);
  expect(duplicated.analysisCases[0]).toEqual(expected.analysisCases[0]);
  expect(duplicated.analysisCases[1]).toEqual(expected.analysisCases[1]);
  const copy = duplicated.analysisCases[2];
  expect(copy.id).not.toBe(p.analysisCases[0].id);
  expect(copy.numericalProfile).toEqual({
    ...expected.analysisCases[0].numericalProfile,
    bishop: {
      ...expected.analysisCases[0].numericalProfile.bishop,
      initialFactor: 2.8,
    },
  });
  await load(page, duplicated);
  await select(page, copy.name);
  await expect(bishopInitial(page)).toHaveValue("2.8");
  expect(await save(page)).toEqual(duplicated);
});

test("migração v4 comunica o perfil incompleto e não inventa limiares ou resultados", async ({
  page,
}) => {
  const p = fixture();
  const legacy = {
    ...p,
    version: 4,
    analysisCases: p.analysisCases.map(
      ({
        numericalProfile: _profile,
        search: { entryRange: _e, exitRange: _s, ...search },
        ...c
      }) => ({ ...c, search }),
    ),
  };
  await page.goto("/");
  await load(page, legacy);
  await expect(page.getByRole("status")).toContainText(
    "próximo salvamento usará a versão 6",
  );
  await select(page);
  await expect(
    page.getByText("Perfil de cálculo incompleto.", { exact: false }),
  ).toBeVisible();
  for (const label of [
    "Tolerância geométrica (m)",
    "Limiar motriz τD (kN/m)",
    "Tolerância de tração τt (kPa)",
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  await expect(
    page.getByLabel("Fator de segurança Fellenius", { exact: true }),
  ).toHaveCount(0);
  const saved = await save(page);
  expect(saved.version).toBe(6);
  expect(saved.sections).toEqual(p.sections);
  expect(saved.analysisCases[0]).toEqual(p.analysisCases[0]);
  await load(page, saved);
  await select(page);
  await expect(
    page.getByLabel("Limiar motriz τD (kN/m)", { exact: true }),
  ).toHaveValue("");
});

test("perfil inválido protege o rascunho e arquivo inválido preserva o projeto aberto", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  const max = page.getByLabel("Bishop · Máximo de avaliações K", {
    exact: true,
  });
  await max.fill("0");
  await expect(page.getByRole("alert")).toContainText("Corrija");
  const tolerance = page.getByLabel("Tolerância geométrica (m)", {
    exact: true,
  });
  await tolerance.fill("2e-8");
  await expect(max).toHaveValue("0");
  await tolerance.fill("1e-8");
  await expect(max).toHaveValue("0");
  await page.getByRole("button", { name: "Outro perfil", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Edição em andamento" });
  await expect(guard).toBeVisible();
  await guard
    .getByRole("button", { name: "Continuar editando", exact: true })
    .click();
  await expect(max).toHaveValue("0");
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("antes de salvar");
  expect(downloads).toEqual([]);
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(max).toHaveValue("100");
  expect(await save(page)).toEqual(p);

  const invalid: Project = structuredClone(p);
  invalid.analysisCases[0].numericalProfile.geometry.maxArcDegrees = 4;
  await load(page, invalid);
  await expect(page.getByRole("status")).toContainText(
    "incompatível ou inválido",
  );
  expect(await save(page)).toEqual(p);
});
