import { expect, test, type Page } from "@playwright/test";
import { save } from "../fixtures/equilibrium-ui";

const openDefault = (page: Page) =>
  page.getByRole("button", { name: "Abrir projeto padrão", exact: true });
const fileTab = (page: Page) =>
  page.getByRole("tab", { name: "Arquivo", exact: true });

test("abre o padrão e calcula a busca e o círculo fixo sem digitar os perfis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  await openDefault(page).click();
  await expect(
    page.getByRole("tab", { name: "Análise", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Nome do caso")).toHaveValue(
    "Talude — busca circular",
  );
  await expect(page.getByLabel("Tamanho da malha")).toHaveText(/27 círculos/);
  const result = page.getByRole("region", {
    name: "Resultado da busca circular",
  });
  await expect(result).toHaveCount(0);
  await page
    .getByRole("button", { name: "Iniciar busca circular", exact: true })
    .click();
  await expect(result).toContainText("27 círculos avaliados");
  for (const method of ["Fellenius", "Bishop Simplificado"]) {
    await expect(
      result.getByRole("region", { name: `Busca · ${method}`, exact: true }),
    ).toContainText("Menor FS na malha =");
  }
  const searchSummary = await result.textContent();

  await page
    .getByRole("button", { name: "Talude — círculo fixo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  for (const method of ["Fellenius", "Bishop"]) {
    await page
      .getByRole("button", { name: `Calcular ${method}`, exact: true })
      .click();
    await expect(
      page.getByLabel(`Fator de segurança ${method}`, { exact: true }),
    ).toContainText("FS =");
  }
  await expect(page.getByLabel("Diferença entre métodos")).toBeVisible();
  const fixedFactors = await Promise.all(
    ["Fellenius", "Bishop"].map((method) =>
      page
        .getByLabel(`Fator de segurança ${method}`, { exact: true })
        .textContent(),
    ),
  );

  const project = await save(page);
  expect(project.version).toBe(5);
  expect(project.analysisCases.map((c) => c.surfaceMode)).toEqual([
    "search",
    "fixed",
  ]);
  expect(project.analysisCases[1].fixedCircle).toEqual({
    x: 32,
    y: 32,
    radius: 25,
  });

  // Abrir o arquivo salvo segue o fluxo de um projeto comum.
  await page.locator("input[type=file]").setInputFiles({
    name: "copia.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page
    .getByRole("button", { name: "Talude — busca circular", exact: true })
    .click();
  if (
    (await page.locator(".circular-search-panel").getAttribute("open")) === null
  )
    await page.locator(".circular-search-panel > summary").click();
  await page.locator(".search-profile > summary").click();
  await expect(
    page.getByLabel("Busca · Tolerância geométrica (m)", { exact: true }),
  ).toHaveValue("1e-8");
  for (const [label, value] of [
    ["Abertura máxima por fatia (°)", "3"],
    ["Limiar motriz τD (kN/m)", "0"],
    ["Tolerância de tração τt (kPa)", "0"],
    ["Faixa de quase empate em FS", "0.01"],
    ["Fator inicial F₀", "1.4"],
    ["Tolerância do resíduo τF", "1e-8"],
    ["Máximo de avaliações K", "100"],
    ["Limiar de singularidade τm", "0"],
  ])
    await expect(
      page.getByLabel(`Busca · ${label}`, { exact: true }),
    ).toHaveValue(value);
  await expect(
    page.getByRole("button", { name: "Iniciar busca circular", exact: true }),
  ).toBeEnabled();
  await expect(result).toHaveCount(0);
  await page
    .getByRole("button", { name: "Iniciar busca circular", exact: true })
    .click();
  await expect(result).toContainText("27 círculos avaliados");
  expect(await result.textContent()).toBe(searchSummary);
  await page
    .getByRole("button", { name: "Talude — círculo fixo", exact: true })
    .click();
  if (
    (await page.locator(".fixed-circle-preview").getAttribute("open")) === null
  )
    await page.locator(".fixed-circle-preview > summary").click();
  await expect(
    page.getByLabel("Tolerância geométrica (m)", { exact: true }),
  ).toHaveValue("1e-8");
  await expect(
    page.getByLabel("Limiar motriz τD (kN/m)", { exact: true }),
  ).toHaveValue("0");
  await expect(
    page.getByLabel("Bishop · Fator inicial F₀", { exact: true }),
  ).toHaveValue("1.4");
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
  for (const [index, method] of ["Fellenius", "Bishop"].entries()) {
    await page
      .getByRole("button", { name: `Calcular ${method}`, exact: true })
      .click();
    await expect(
      page.getByLabel(`Fator de segurança ${method}`, { exact: true }),
    ).toHaveText(fixedFactors[index]!);
  }
  expect(await save(page)).toEqual(project);
});

test("a aba Arquivo protege o rascunho e permite salvar o projeto anterior antes de abrir o padrão", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar um exemplo", exact: true })
    .click();
  const z = page.getByLabel("Z do ponto 1");
  await z.fill("24");
  await fileTab(page).click();
  await openDefault(page).click();
  const draft = page.getByRole("dialog", {
    name: "Edição em andamento",
    exact: true,
  });
  await draft
    .getByRole("button", { name: "Continuar editando", exact: true })
    .click();
  await expect(z).toHaveValue("24");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();

  await openDefault(page).click();
  const unsaved = page.getByRole("dialog", {
    name: "Salvar alterações?",
    exact: true,
  });
  await unsaved.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(z).toHaveValue("24");
  await openDefault(page).click();
  const download = page.waitForEvent("download");
  await unsaved
    .getByRole("button", { name: "Salvar e continuar", exact: true })
    .click();
  const stream = (await (await download).createReadStream())!;
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  const original = JSON.parse(text);
  expect(original.name).toBe("Talude em duas camadas");
  expect(original.sections[0].terrain[0].y).toBe(24);
  await expect(page.getByLabel("Nome do caso")).toHaveValue(
    "Talude — busca circular",
  );
  await expect(
    page.getByRole("button", { name: "Iniciar busca circular", exact: true }),
  ).toBeEnabled();
});
