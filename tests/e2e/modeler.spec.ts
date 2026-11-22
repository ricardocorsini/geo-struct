import { test, expect, type Page } from "@playwright/test";
import { exampleProject } from "../../src/domain/model";

const example = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar um exemplo" }).click();
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno" }),
  ).toBeVisible();
};
const loadProject = async (page: Page, p: unknown) => {
  await page.locator("input[type=file]").setInputFiles({
    name: "teste.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
};

test("abre exemplo com vista, materiais, água e cargas; alterna temas", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await example(page);
  await expect(page.locator("[data-pick=region]")).toHaveCount(1);
  await expect(page.locator("[data-pick=load]")).toHaveCount(1);
  await expect(page.locator(".diagnostics-toggle")).toContainText(
    "Sem pendências",
  );
  await page.getByRole("button", { name: "Usar tema escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Água", { exact: true }).uncheck();
  await expect(page.locator("[data-pick=water]")).toHaveCount(0);
  await page.getByRole("button", { name: "Usar tema claro" }).click();
  await page.getByLabel("Água", { exact: true }).check();
  expect(errors).toEqual([]);
});

test("cria projeto sem valores de solo presumidos e aplica coordenadas brasileiras", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await page.getByLabel("Nome do projeto").fill("Corte rodoviário");
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await page.getByText("Colar lista de coordenadas").click();
  await page
    .getByLabel("Lista de coordenadas")
    .fill("0 ; 20\n15,5 ; 20\n30 ; 8\n50 ; 8");
  await page.getByRole("button", { name: "Usar coordenadas" }).click();
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByLabel("X do ponto 2")).toHaveValue("15.5");
  await page.getByRole("button", { name: "Solo 1", exact: true }).click();
  await expect(page.getByLabel("Peso específico total γ (kN/m³)")).toHaveValue(
    "",
  );
  await page.getByLabel("Peso específico total γ (kN/m³)").fill("18,7");
  await page.getByLabel("Coesão c (kPa)").fill("6");
  await page.getByLabel("Atrito φ (°)").fill("29");
  await page.getByLabel("Origem dos parâmetros").fill("Ensaio de exemplo");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByLabel("Peso específico total γ (kN/m³)")).toHaveValue(
    "18.7",
  );
});

test("protege rascunho ao trocar seleção e mantém o modelo ao cancelar", async ({
  page,
}) => {
  await example(page);
  await page.getByLabel("Z do ponto 1").fill("24");
  await page
    .getByRole("button", { name: "Solo residual", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edição em andamento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(page.getByLabel("Z do ponto 1")).toHaveValue("24");
  await page
    .getByRole("button", { name: "Solo residual", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Descartar edição", exact: true })
    .click();
  await page.getByRole("button", { name: "Terreno", exact: true }).click();
  await expect(page.getByLabel("Z do ponto 1")).toHaveValue("22");
});

test("uma aplicação é um passo de histórico e não conflita com desfazer em campos", async ({
  page,
}) => {
  await example(page);
  await page.getByLabel("Z do ponto 1").fill("24");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByLabel("Z do ponto 1")).toHaveValue("22");
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(page.getByLabel("Z do ponto 1")).toHaveValue("24");
});

test("rejeita geometria inválida e conserva o rascunho para correção", async ({
  page,
}) => {
  await example(page);
  await page.getByLabel("X do ponto 2").fill("-1");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "coordenadas X devem crescer",
  );
  await expect(page.getByLabel("X do ponto 2")).toHaveValue("-1");
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByLabel("X do ponto 2")).toHaveValue("18");
});

test("arrasta vértice em uma transação sem pedir para descartar o próprio arraste", async ({
  page,
}) => {
  await example(page);
  const handle = page.locator('circle[data-vertex="0"]');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 25, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Z do ponto 1")).not.toHaveValue("22");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByLabel("Z do ponto 1")).toHaveValue("22");
});

test("cancela desenho com Escape sem modificar a seção", async ({ page }) => {
  await example(page);
  await page
    .getByRole("button", { name: "Região de solo", exact: true })
    .click();
  const canvas = page.getByRole("region", { name: "Editor da seção 2D" });
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 180, box.y + 180);
  await page.mouse.click(box.x + 220, box.y + 200);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-pick=region]")).toHaveCount(1);
  await expect(page.locator(".drawing-actions")).toHaveCount(0);
});

test("duplica seções com geometria independente e materiais compartilhados", async ({
  page,
}) => {
  await example(page);
  await page
    .getByRole("button", { name: "Duplicar seção", exact: true })
    .click();
  await page.getByLabel("Z do ponto 1").fill("25");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await page.getByRole("button", { name: "Seção A–A", exact: true }).click();
  await expect(page.getByLabel("Z do ponto 1")).toHaveValue("22");
  await page
    .getByRole("button", { name: "Seção A–A — cópia", exact: true })
    .click();
  await expect(page.getByLabel("Z do ponto 1")).toHaveValue("25");
});

test("arquivo inválido não substitui o projeto aberto", async ({ page }) => {
  await example(page);
  await loadProject(page, { format: "geostruct", version: 999 });
  await expect(
    page.getByRole("status", { name: "Notificação do aplicativo" }),
  ).toContainText("incompatível ou inválido");
  await expect(page.locator(".document-title")).toContainText(
    "Talude em duas camadas",
  );
  await expect(page.locator("[data-pick=region]")).toHaveCount(1);
});

test("salva e reabre o projeto sem perder água, cargas, estratos ou materiais", async ({
  page,
}) => {
  await example(page);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const file = await downloadPromise;
  const stream = (await file.createReadStream())!;
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  const saved = JSON.parse(text);
  expect(saved.sections[0].water).toHaveLength(4);
  expect(saved.sections[0].loads[0].q).toBe(20);
  expect(saved.sections[0].regions).toHaveLength(1);
  await page.getByRole("tab", { name: "Arquivo", exact: true }).click();
  await page
    .getByRole("button", { name: "Fechar projeto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Explorar um exemplo" }),
  ).toBeVisible();
  await loadProject(page, saved);
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno" }),
  ).toBeVisible();
  await expect(page.locator("[data-pick=region]")).toHaveCount(1);
});

test("protege fechamento e restaura somente mediante ação explícita", async ({
  page,
}) => {
  await example(page);
  await page.getByRole("tab", { name: "Arquivo", exact: true }).click();
  await page
    .getByRole("button", { name: "Fechar projeto", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Salvar alterações?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => !!localStorage.getItem("geostruct.recovery.v1")),
    )
    .toBe(true);
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Recuperar trabalho local/ }),
  ).toBeVisible();
  await expect(page.locator("[data-pick=region]")).toHaveCount(0);
  await page.getByRole("button", { name: /Recuperar trabalho local/ }).click();
  await expect(page.locator("[data-pick=region]")).toHaveCount(1);
});

test("relatório registra valores e limitações sem interpretar conteúdo como HTML", async ({
  page,
}) => {
  await page.goto("/");
  const p = exampleProject();
  p.name = "<img src=x onerror=alert(1)>";
  await loadProject(page, p);
  await page.getByRole("button", { name: "Entradas", exact: true }).click();
  await expect(page.locator("#project-report h1")).toHaveText(p.name);
  await expect(page.locator("#project-report img")).toHaveCount(0);
  await expect(page.locator("#project-report")).toContainText(
    "não contém cálculo de fator de segurança",
  );
});

test("mantém comandos essenciais alcançáveis na janela mínima", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await example(page);
  const pane = await page.locator(".inspector").boundingBox();
  expect(pane!.x + pane!.width).toBeLessThanOrEqual(961);
  const canvas = await page.locator(".model-canvas").boundingBox();
  expect(canvas!.width).toBeGreaterThan(260);
  expect(canvas!.height).toBeGreaterThan(180);
  await page.getByLabel("Z do ponto 1").fill("24");
  await expect(
    page.getByRole("button", { name: "Aplicar", exact: true }),
  ).toBeInViewport();
});
