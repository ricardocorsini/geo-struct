import { test, expect, type Page } from "@playwright/test";
import { exampleProject } from "../../src/domain/model";
import { addAnalysisCase } from "../../src/domain/analysis";
async function openAudit(page: Page) {
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByRole("button", { name: "Conferir modelo", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Conferência dos lançamentos" });
}
test("conferência na janela mínima navega para casos ausentes sem alterar dados", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar um exemplo" }).click();
  const audit = await openAudit(page);
  await expect(audit).toContainText("nenhum caso de análise cadastrado");
  await audit.getByLabel("Severidade").selectOption("error");
  await expect(audit).toContainText("Nenhum item para este filtro.");
  await audit.getByLabel("Severidade").selectOption("all");
  await audit
    .getByRole("button", { name: /nenhum caso de análise cadastrado/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Casos de análise da seção" }),
  ).toBeVisible();
});
test("caso inclui material compartilhado pendente e navega ao cadastro", async ({
  page,
}) => {
  const base = exampleProject(),
    { project: p, analysisCase: c } = addAnalysisCase(
      base,
      base.sections[0].id,
    );
  p.materials[0].cohesion = null;
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "audit.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  const audit = await openAudit(page);
  await audit.getByLabel("Seção ou caso").selectOption(c.id);
  await audit
    .getByRole("button", {
      name: new RegExp(p.materials[0].name + ": informe"),
    })
    .click();
  await expect(page.getByLabel("Coesão c′ (kPa)")).toHaveValue("");
  await page.getByLabel("Coesão c′ (kPa)").fill("12");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await openAudit(page);
  await audit.getByLabel("Seção ou caso").selectOption(c.id);
  await expect(
    audit.getByRole("button", {
      name: new RegExp(p.materials[0].name + ": informe"),
    }),
  ).toHaveCount(0);
});
test("conferência protege rascunhos e importação inválida mantém o projeto", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar um exemplo" }).click();
  await page.getByLabel("Z do ponto 1").fill("24");
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByRole("button", { name: "Conferir modelo", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edição em andamento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(page.getByLabel("Z do ponto 1")).toHaveValue("24");
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  const bad = exampleProject();
  bad.analysisCases = [{ id: "invalid" } as never];
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(
    page.getByRole("status", { name: "Notificação do aplicativo" }),
  ).toContainText("inválido");
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno" }),
  ).toBeVisible();
  const audit = await openAudit(page);
  await expect(audit).toContainText("nenhum caso de análise cadastrado");
});
