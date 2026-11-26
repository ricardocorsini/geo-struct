import { withProfile, searchProfile } from "../fixtures/numerical-profile";
import { expect, test, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { serializeProject, type Project } from "../../src/domain/model";
import { fixture, save } from "../fixtures/equilibrium-ui";

function model() {
  const p = fixture();
  p.materials[0].cohesion = 0;
  const c = p.analysisCases[0];
  c.name = "Malha de conferência";
  c.surfaceMode = "search";
  c.methods = ["fellenius", "bishop"];
  c.search = {
    ...c.search,
    x: { min: 0, max: 0, step: null },
    y: { min: 4, max: 4, step: null },
    radius: { min: 3, max: 6.05, step: 1 },
  };
  return p;
}
const panel = (page: Page) => page.locator(".circular-search-panel");
async function select(page: Page, name = "Malha de conferência") {
  await page.getByRole("button", { name, exact: true }).click();
  if ((await panel(page).getAttribute("open")) === null)
    await panel(page).locator(":scope > summary").click();
  const settings = panel(page).locator(".search-profile");
  if (
    (await settings.count()) &&
    (await settings.getAttribute("open")) === null
  )
    await settings.locator(":scope > summary").click();
}
async function open(page: Page, p: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "busca.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(p)),
  });
  await select(page);
}
const field = (page: Page, label: string) =>
  page.getByLabel(`Busca · ${label}`, { exact: true });
async function profile(
  page: Page,
  { bishop = true, angle = "3", max = "100" } = {},
) {
  const values = [
    ["Tolerância geométrica (m)", "1e-8"],
    ["Abertura máxima por fatia (°)", angle],
    ["Limiar motriz τD (kN/m)", "0"],
    ["Tolerância de tração τt (kPa)", "0"],
    ["Faixa de quase empate em FS", "0,01"],
  ];
  if (bishop)
    values.push(
      ["Fator inicial F₀", "1,4"],
      ["Tolerância do resíduo τF", "1e-8"],
      ["Máximo de avaliações K", max],
      ["Limiar de singularidade τm", "0"],
    );
  for (const [label, value] of values) await field(page, label).fill(value);
}
const start = (page: Page) =>
  page.getByRole("button", { name: "Iniciar busca circular", exact: true });
const output = (page: Page) =>
  page.getByRole("region", {
    name: "Resultado da busca circular",
    exact: true,
  });

test("busca por método, inspeciona descartes e fatias, refina o círculo e preserva o arquivo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = model();
  await open(page, p);
  await profile(page);
  await expect(page.getByLabel("Tamanho da malha")).toContainText("4 círculos");
  await start(page).click();
  await expect(output(page)).toContainText(
    "4 círculos avaliados. Geometria preparada em 3.",
  );
  for (const name of ["Fellenius", "Bishop Simplificado"]) {
    const summary = output(page).getByRole("region", {
      name: `Busca · ${name}`,
      exact: true,
    });
    await expect(summary).toContainText("Menor FS na malha =");
    await expect(summary).toContainText("FS positivos admissíveis: 3");
  }
  await output(page)
    .getByRole("button", { name: "Ver círculos avaliados", exact: true })
    .click();
  const tableDialog = page.getByRole("dialog", {
    name: "Círculos avaliados na busca",
    exact: true,
  });
  await expect(
    tableDialog.getByLabel("Limites e passos da malha"),
  ).toContainText("último ponto 6 m");
  await expect(
    tableDialog
      .getByRole("table", { name: "Círculos avaliados" })
      .getByRole("row"),
  ).toHaveCount(5);
  await tableDialog.getByLabel("Filtrar círculos").selectOption("issues");
  await expect(
    tableDialog
      .getByRole("table", { name: "Círculos avaliados" })
      .getByRole("row"),
  ).toHaveCount(2);
  await tableDialog
    .getByRole("button", { name: "Inspecionar círculo 1", exact: true })
    .click();
  const rejected = page.getByRole("dialog", {
    name: "Inspeção do círculo 1",
    exact: true,
  });
  await expect(rejected.getByLabel("Diagnósticos do círculo")).toContainText(
    "não cruza o terreno",
  );
  await rejected
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();

  await output(page)
    .getByRole("button", {
      name: "Inspecionar mínimo de Bishop Simplificado",
      exact: true,
    })
    .click();
  const detail = page.getByRole("dialog", { name: /Inspeção do círculo/ });
  await expect(
    detail.getByRole("table", {
      name: "Parcelas de Bishop por fatia",
      exact: true,
    }),
  ).toBeVisible();
  expect((await detail.boundingBox())!.width).toBeLessThanOrEqual(960);
  await detail
    .getByText("Conferir refinamento das fatias", { exact: true })
    .click();
  await detail.getByLabel("Abertura refinada (°)").fill("1,5");
  await detail
    .getByRole("button", { name: "Recalcular círculo", exact: true })
    .click();
  await expect(
    detail.getByRole("region", { name: "Comparação do refinamento" }),
  ).toContainText("ΔFS");
  await detail
    .getByRole("button", { name: "Mostrar fatias no desenho", exact: true })
    .click();
  await expect(page.locator("[data-slice-preview]")).toHaveCount(1);
  expect(await save(page)).toEqual(withProfile(p, { search: searchProfile }));
  await field(page, "Faixa de quase empate em FS").fill("0");
  await expect(output(page)).toHaveCount(0);
  await expect(page.locator("[data-slice-preview]")).toHaveCount(0);
});

test("cancela um Worker com progresso e reinicia em outro caso sem resultado antigo", async ({
  page,
}) => {
  let p = model();
  const added = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = added.project;
  added.analysisCase.name = "Busca pequena";
  added.analysisCase.methods = ["fellenius"];
  const c = p.analysisCases[0];
  c.methods = ["fellenius"];
  c.search = {
    ...c.search,
    x: { min: -3, max: 3, step: 0.12 },
    y: { min: 3.5, max: 4.5, step: 0.05 },
    radius: { min: 4.8, max: 5.6, step: 0.1 },
  };
  await open(page, p);
  await profile(page, { bishop: false, angle: "0,75" });
  await expect(page.getByLabel("Tamanho da malha")).toContainText(
    "9639 círculos",
  );
  await start(page).click();
  const progress = page.getByRole("progressbar", {
    name: "Progresso da busca circular",
  });
  await expect(progress).toHaveAttribute("max", "9639");
  await expect
    .poll(async () => Number(await progress.getAttribute("value")))
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Cancelar busca", exact: true })
    .click();
  await expect(panel(page).getByRole("status")).toContainText(
    "Busca cancelada",
  );
  await expect(progress).toHaveCount(0);
  await expect(output(page)).toHaveCount(0);
  await select(page, "Busca pequena");
  await profile(page, { bishop: false });
  await start(page).click();
  await expect(output(page)).toContainText("4 círculos avaliados");
  await expect(
    output(page).getByRole("region", { name: "Busca · Bishop Simplificado" }),
  ).toHaveCount(0);
});

test("limite da malha, não convergência independente e invalidação por rascunho e histórico", async ({
  page,
}) => {
  const p = model();
  p.analysisCases[0].search.x = { min: 0, max: 100, step: 1 };
  p.analysisCases[0].search.y = { min: 4, max: 104, step: 1 };
  // Keep this scenario's undo focused on the grid operation, not profile entry.
  p.analysisCases[0].numericalProfile.search = structuredClone({
    ...searchProfile,
    bishop: { ...searchProfile.bishop, maxIterations: 1 },
  });
  await open(page, p);
  await field(page, "Tolerância geométrica (m)").fill("1e-8");
  await expect(panel(page).getByRole("alert")).toContainText(
    "excede o limite de 10.000",
  );
  await expect(start(page)).toBeDisabled();
  await page.getByLabel("Centro X máximo (m)", { exact: true }).fill("0");
  await page.getByLabel("Centro Z máximo (m)", { exact: true }).fill("4");
  await expect(panel(page)).toContainText("Aplique ou descarte o rascunho");
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
  if ((await panel(page).getAttribute("open")) === null)
    await panel(page).locator(":scope > summary").click();
  const settings = panel(page).locator(".search-profile");
  if (
    (await settings.count()) &&
    (await settings.getAttribute("open")) === null
  )
    await settings.locator(":scope > summary").click();
  await profile(page, { max: "1" });
  await start(page).click();
  await expect(
    output(page).getByRole("region", {
      name: "Busca · Fellenius",
      exact: true,
    }),
  ).toContainText("Menor FS na malha");
  const b = output(page).getByRole("region", {
    name: "Busca · Bishop Simplificado",
    exact: true,
  });
  await expect(b).toContainText("Nenhum FS positivo admissível");
  await expect(b).toContainText("cobertura parcial");
  await page.getByLabel("Raio máximo (m)", { exact: true }).fill("5");
  await expect(output(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(output(page)).toHaveCount(0);
  await start(page).click();
  await expect(output(page)).toContainText("4 círculos avaliados");
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await select(page);
  await expect(output(page)).toHaveCount(0);
  await field(page, "Tolerância geométrica (m)").fill("1e-8");
  await expect(panel(page).getByRole("alert")).toContainText(
    "excede o limite de 10.000",
  );
});
