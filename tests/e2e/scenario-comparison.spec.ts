import { expect, test, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { defaultProject } from "../../src/domain/default-project";
import type { Project } from "../../src/domain/model";

async function openProject(page: Page, project: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "cenarios.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno" }),
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

test("compara cenários com linhas piezométricas próprias na mesma seção, calcula em lote e detecta desatualização", async ({
  page,
}) => {
  const base = defaultProject();
  const fixedCase = base.analysisCases[1];
  fixedCase.name = "Cenário NA baixo";

  const extra = addAnalysisCase(base, fixedCase.sectionId, fixedCase.id);
  extra.analysisCase.name = "Cenário NA elevado";
  const project = extra.project;

  await openProject(page, project);

  // Configurar linha piezométrica própria no primeiro caso
  await page
    .getByRole("button", { name: "Cenário NA baixo", exact: true })
    .click();
  await page
    .getByLabel("Água no caso", { exact: true })
    .selectOption("case-piezometric");
  await page
    .getByLabel("Peso específico da água γw do caso (kN/m³)", { exact: true })
    .fill("9,81");
  await page
    .getByLabel("Coordenadas da linha piezométrica do caso (X ; Z em m)", {
      exact: true,
    })
    .fill("0 ; 8\n60 ; 4");
  await page
    .getByLabel("Origem da água no caso", { exact: true })
    .fill("Piezômetro P1");
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
  await expect(page.getByLabel("Prévia do caso")).toContainText(
    "Própria do caso · Piezômetro P1",
  );

  // Configurar linha piezométrica própria no segundo caso
  await page
    .getByRole("button", { name: "Cenário NA elevado", exact: true })
    .click();
  await page
    .getByLabel("Água no caso", { exact: true })
    .selectOption("case-piezometric");
  await page
    .getByLabel("Peso específico da água γw do caso (kN/m³)", { exact: true })
    .fill("9,81");
  await page
    .getByLabel("Coordenadas da linha piezométrica do caso (X ; Z em m)", {
      exact: true,
    })
    .fill("0 ; 20\n18 ; 20\n38 ; 10\n60 ; 10");
  await page
    .getByLabel("Origem da água no caso", { exact: true })
    .fill("Piezômetro P2");
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
  await expect(page.getByLabel("Prévia do caso")).toContainText(
    "Própria do caso · Piezômetro P2",
  );

  // Abrir Comparar cenários, calcular apenas os dois casos fixos selecionados
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByRole("button", { name: "Comparar cenários", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Casos de análise da seção",
  });
  await expect(dialog).toBeVisible();

  await dialog
    .getByLabel("Selecionar Talude — busca circular para lote", {
      exact: true,
    })
    .uncheck();
  await dialog
    .getByRole("button", { name: /Calcular selecionados \(2\)/ })
    .click();

  const table = dialog.getByRole("table", {
    name: "Tabela comparativa de cenários",
  });
  const lowRow = table.locator("tr", { hasText: "Cenário NA baixo" });
  const highRow = table.locator("tr", { hasText: "Cenário NA elevado" });

  await expect(lowRow).toContainText("Piezômetro P1");
  await expect(highRow).toContainText("Piezômetro P2");
  await expect(lowRow.locator("[data-case-status='current']")).toHaveText(
    "Atualizado",
  );
  await expect(highRow.locator("[data-case-status='current']")).toHaveText(
    "Atualizado",
  );
  await expect(lowRow).toContainText("FS =");
  await expect(highRow).toContainText("FS =");

  // Fechar diálogo, alterar água do primeiro caso e conferir que apenas ele fica desatualizado
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cenário NA baixo", exact: true })
    .click();
  await page
    .getByLabel("Coordenadas da linha piezométrica do caso (X ; Z em m)", {
      exact: true,
    })
    .fill("0 ; 6\n60 ; 3");
  await page.getByRole("button", { name: "Aplicar caso", exact: true }).click();

  await page
    .getByRole("button", { name: "Comparar cenários", exact: true })
    .click();
  const reopenedDialog = page.getByRole("dialog", {
    name: "Casos de análise da seção",
  });
  const tableAfter = reopenedDialog.getByRole("table", {
    name: "Tabela comparativa de cenários",
  });
  await expect(
    tableAfter
      .locator("tr", { hasText: "Cenário NA baixo" })
      .locator("[data-case-status='outdated']"),
  ).toHaveText("Desatualizado");
  await expect(
    tableAfter
      .locator("tr", { hasText: "Cenário NA elevado" })
      .locator("[data-case-status='current']"),
  ).toHaveText("Atualizado");

  await reopenedDialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();

  // Salvar e reabrir sem duplicar a seção
  const saved = await saveProject(page);
  expect(saved.version).toBe(6);
  expect(saved.sections).toHaveLength(1);
  expect(saved.analysisCases).toHaveLength(3);

  await openProject(page, saved);
  const resaved = await saveProject(page);
  expect(resaved).toEqual(saved);
});
