import { expect, test, type Page } from "@playwright/test";
import type { Project } from "../../src/domain/model";

async function openDefault(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Abrir projeto padrão", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Caso de análise", exact: true }),
  ).toBeVisible();
}

async function saveProject(page: Page): Promise<Project> {
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const stream = (await (await download).createReadStream())!;
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  return JSON.parse(text);
}

test("marca trechos de entrada/saída, exibe no desenho, filtra candidatos, destaca borda e refina regiões", async ({
  page,
}) => {
  await openDefault(page);

  await page.getByLabel("Entrada X mínimo (m)", { exact: true }).fill("12");
  await page.getByLabel("Entrada X máximo (m)", { exact: true }).fill("20");
  await page.getByLabel("Saída X mínimo (m)", { exact: true }).fill("35");
  await page.getByLabel("Saída X máximo (m)", { exact: true }).fill("48");
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();

  await expect(page.locator('[data-search-limit="entry"]')).toBeVisible();
  await expect(page.locator('[data-search-limit="exit"]')).toBeVisible();
  await expect(page.getByLabel("Prévia do caso")).toContainText(
    "Entrada: 12–20 m · Saída: 35–48 m",
  );

  // Salvar e reabrir preserva os trechos aplicados
  const saved = await saveProject(page);
  expect(saved.version).toBe(6);
  expect(saved.analysisCases[0].search.entryRange).toEqual({
    min: 12,
    max: 20,
  });
  expect(saved.analysisCases[0].search.exitRange).toEqual({ min: 35, max: 48 });

  // Executar busca clássica com filtragem e verificar diagnóstico + aviso de borda
  await page
    .getByRole("button", { name: "Iniciar busca circular", exact: true })
    .click();
  const results = page.getByRole("region", {
    name: "Resultado da busca circular",
  });
  await expect(results).toContainText("Busca concluída.");
  await expect(results).toContainText(
    "Descartes por trechos de entrada/saída:",
  );
  await expect(results.locator(".boundary-warning").first()).toBeVisible();

  await results
    .getByRole("button", { name: "Ajustar limites da busca", exact: true })
    .first()
    .click();
  await expect(
    page.getByLabel("Centro X mínimo (m)", { exact: true }),
  ).toBeFocused();

  // Limpar trechos para executar refinamento multi-regiões
  await page
    .getByRole("button", { name: "Limpar trechos", exact: true })
    .click();
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();

  await page
    .getByRole("button", { name: "Refinar regiões", exact: true })
    .click();
  const refined = page.getByRole("region", {
    name: "Resultado da busca circular",
  });
  await expect(refined).toContainText("Refinamento concluído.");
  await expect(refined).toContainText("região(ões) visitada(s)");
  await expect(refined).toContainText("Menor FS na cobertura refinada =");

  await refined.locator(".search-refinement summary").click();
  await expect(
    refined.getByRole("list", { name: "Lista de regiões refinadas" }),
  ).toContainText("Etapa 2");

  // Repetir execução mantém o botão disponível e resultado reprodutível
  await expect(
    page.getByRole("button", { name: "Repetir refinamento", exact: true }),
  ).toBeVisible();
});
