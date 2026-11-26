import { test, expect, type Page } from "@playwright/test";
import { exampleProject, type Project } from "../../src/domain/model";
import {
  addAnalysisCase,
  duplicateSectionWithCases,
} from "../../src/domain/analysis";

function fixture() {
  const base = exampleProject(),
    { project: p, analysisCase: c } = addAnalysisCase(
      base,
      base.sections[0].id,
    );
  Object.assign(c, {
    name: "Caso original",
    description: "Hipótese de teste",
    direction: "left-to-right",
    methods: ["bishop", "fellenius"],
    surfaceMode: "fixed",
    waterCondition: "section",
    loadCondition: "section",
  });
  c.fixedCircle = { x: 25, y: 25, radius: 20 };
  return { p, c };
}
async function open(page: Page, p: unknown) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "casos.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno" }),
  ).toBeVisible();
}
async function save(page: Page): Promise<Project> {
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const stream = (await (await promise).createReadStream())!;
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  return JSON.parse(text);
}
const apply = (page: Page) =>
  page.getByRole("button", { name: "Aplicar caso", exact: true }).click();
async function selectCase(page: Page, name = "Caso original") {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Caso de análise", exact: true }),
  ).toBeVisible();
}
async function manager(page: Page) {
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByRole("button", { name: "Gerenciar casos", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Casos de análise da seção" });
}
async function point(page: Page, x: number, z: number) {
  const entry = page.locator(".point-entry");
  if ((await entry.getAttribute("open")) === null)
    await entry.locator("summary").click();
  await entry.getByLabel("Primeira coordenada").fill(String(x));
  await entry.getByLabel("Segunda coordenada").fill(String(z));
  await entry
    .getByRole("button", { name: "Adicionar ponto", exact: true })
    .click();
}

test("cria caso explícito copiando círculo de tentativa, salva e relata sem modificar a seção", async ({
  page,
}) => {
  const p = exampleProject();
  p.sections[0].circle = { x: 25, y: 25, radius: 20 };
  await open(page, p);
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page.getByRole("button", { name: "Novo caso", exact: true }).click();
  await expect(
    page.getByLabel("Direção de deslizamento", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Centro X do caso (m)", { exact: true }),
  ).toHaveValue("");
  await page
    .getByLabel("Nome do caso", { exact: true })
    .fill("Verificação da crista");
  await page
    .getByLabel("Hipóteses do caso", { exact: true })
    .fill("Cenário de teste com dados cadastrados");
  await page
    .getByLabel("Direção de deslizamento", { exact: true })
    .selectOption("right-to-left");
  await page.getByRole("checkbox", { name: /Bishop Simplificado/ }).check();
  await page.getByRole("checkbox", { name: /Fellenius/ }).check();
  await page
    .getByLabel("Água no caso", { exact: true })
    .selectOption("section");
  await page
    .getByLabel("Sobrecargas no caso", { exact: true })
    .selectOption("section");
  await page
    .getByRole("button", { name: "Copiar círculo de tentativa", exact: true })
    .click();
  await apply(page);
  await expect(page.locator("[data-case-circle]")).toHaveAttribute("cx", "25");
  await expect(page.getByLabel("Prévia do caso")).toContainText(
    "Direita → esquerda",
  );
  const saved = await save(page);
  expect(saved.sections).toEqual(p.sections);
  expect(saved.analysisCases[0]).toMatchObject({
    direction: "right-to-left",
    methods: ["bishop", "fellenius"],
    fixedCircle: p.sections[0].circle,
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "reaberto.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await selectCase(page, "Verificação da crista");
  expect(await save(page)).toEqual(saved);
  await page.getByRole("button", { name: "Entradas", exact: true }).click();
  const report = page.locator("#project-report");
  await expect(report).toContainText(
    "Verificação da crista · somente entradas",
  );
  await expect(report).toContainText("geostruct/6");
  await expect(report).toContainText("Bishop Simplificado");
});

test("cenário seco sem cargas e cenário úmido com seleção preservam lançamentos da seção", async ({
  page,
}) => {
  const { p, c } = fixture();
  p.sections[0].waterMode = "dry";
  p.sections[0].loadCondition = "none";
  p.sections[0].loads[0].enabled = false;
  await open(page, p);
  await selectCase(page);
  await page
    .getByLabel("Água no caso", { exact: true })
    .selectOption("piezometric");
  await page
    .getByLabel("Origem da água no caso", { exact: true })
    .fill("Hipótese úmida de teste");
  await page
    .getByLabel("Sobrecargas no caso", { exact: true })
    .selectOption("selected");
  await page
    .getByLabel("Incluir Sobrecarga de crista", { exact: true })
    .check();
  await apply(page);
  await expect(page.locator("[data-pick=water]")).toHaveCount(2);
  await expect(page.locator("[data-pick=load]")).toHaveCount(1);
  const wet = await save(page);
  expect(wet.sections).toEqual(p.sections);
  expect(wet.analysisCases[0].id).toBe(c.id);
  await page.getByLabel("Água no caso", { exact: true }).selectOption("dry");
  await page
    .getByLabel("Sobrecargas no caso", { exact: true })
    .selectOption("none");
  await apply(page);
  await expect(page.locator("[data-pick=water]")).toHaveCount(0);
  await expect(page.locator("[data-pick=load]")).toHaveCount(0);
  const dry = await save(page);
  expect(dry.sections).toEqual(p.sections);
  expect(dry.analysisCases[0].loadIds).toEqual([p.sections[0].loads[0].id]);
  await page
    .getByRole("button", { name: "Voltar à seção base", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno" }),
  ).toBeVisible();
  await expect(page.getByLabel("Prévia do caso")).toHaveCount(0);
});

test("limites de busca recusam inversão e passo zero, protegem rascunho e preservam círculo inativo", async ({
  page,
}) => {
  const { p, c } = fixture();
  await open(page, p);
  await selectCase(page);
  await page
    .getByLabel("Definição da superfície", { exact: true })
    .selectOption("search");
  for (const [label, value] of [
    ["Centro X mínimo (m)", "30"],
    ["Centro X máximo (m)", "10"],
    ["Centro X passo (m)", "1"],
    ["Centro Z mínimo (m)", "25"],
    ["Centro Z máximo (m)", "25"],
    ["Raio mínimo (m)", "10"],
    ["Raio máximo (m)", "30"],
    ["Raio passo (m)", "1,5"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await apply(page);
  await expect(page.getByRole("alert")).toContainText(
    "máximo não pode ser menor",
  );
  await page
    .getByRole("button", { name: "Gerenciar casos", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edição em andamento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(
    page.getByLabel("Centro X máximo (m)", { exact: true }),
  ).toHaveValue("10");
  await page.getByLabel("Centro X máximo (m)", { exact: true }).fill("40");
  await page.getByLabel("Centro X passo (m)", { exact: true }).fill("0");
  await apply(page);
  await expect(page.getByRole("alert")).toContainText("passo deve ser maior");
  await page.getByLabel("Centro X passo (m)", { exact: true }).fill("0,5");
  await apply(page);
  await expect(page.locator("[data-case-search]")).toHaveCount(1);
  await expect(page.locator("[data-case-circle]")).toHaveCount(0);
  const search = await save(page);
  expect(search.analysisCases[0].fixedCircle).toEqual(c.fixedCircle);
  expect(search.analysisCases[0].search.y.step).toBeNull();
  expect(search.analysisCases[0].search.radius.step).toBe(1.5);
  await page
    .getByLabel("Definição da superfície", { exact: true })
    .selectOption("fixed");
  await apply(page);
  await expect(page.locator("[data-case-circle]")).toHaveCount(1);
  expect((await save(page)).analysisCases[0].search).toEqual(
    search.analysisCases[0].search,
  );
});

test("desenho do círculo do caso cancela sem perda e entra no histórico em uma operação", async ({
  page,
}) => {
  const { p, c } = fixture();
  p.sections[0].circle = { x: 1, y: 2, radius: 3 };
  await open(page, p);
  await selectCase(page);
  await page
    .getByRole("button", { name: "Desenhar círculo do caso", exact: true })
    .click();
  await point(page, 20, 20);
  await page.getByRole("region", { name: "Editor da seção 2D" }).focus();
  await page.keyboard.press("Escape");
  expect(await save(page)).toEqual(p);
  await page
    .getByRole("button", { name: "Desenhar círculo do caso", exact: true })
    .click();
  await point(page, 20, 20);
  await point(page, 35, 20);
  const edited = await save(page);
  expect(edited.analysisCases[0].fixedCircle).toEqual({
    x: 20,
    y: 20,
    radius: 15,
  });
  expect(edited.sections).toEqual(p.sections);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect(await save(page)).toEqual(p);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  expect(await save(page)).toEqual(edited);
  await selectCase(page);
  await expect(page.locator("[data-case-preview]")).toHaveAttribute(
    "data-case-preview",
    c.id,
  );
});

test("gerenciador duplica e exclui caso na janela mínima com restauração pelo histórico", async ({
  page,
}) => {
  const { p } = fixture();
  await page.setViewportSize({ width: 960, height: 640 });
  await open(page, p);
  const dialog = await manager(page);
  await dialog
    .getByRole("button", { name: "Duplicar Caso original", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Editar Caso original — cópia", exact: true })
    .click();
  await page
    .getByLabel("Nome do caso", { exact: true })
    .fill("Caso alternativo");
  await page.getByLabel("Centro X do caso (m)", { exact: true }).fill("30");
  await apply(page);
  const duplicated = await save(page);
  expect(duplicated.analysisCases[0]).toEqual(p.analysisCases[0]);
  expect(duplicated.analysisCases[1].fixedCircle.x).toBe(30);
  await manager(page);
  await dialog
    .getByRole("button", { name: "Excluir Caso alternativo", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Cancelar exclusão" }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Editar Caso alternativo",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Excluir Caso alternativo", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Confirmar exclusão" }).click();
  await dialog.getByRole("button", { name: "Fechar janela" }).click();
  expect(await save(page)).toEqual(p);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect(await save(page)).toEqual(duplicated);
});

test("impede exclusão de faixa referenciada até remover sua seleção guardada no caso", async ({
  page,
}) => {
  const { p, c } = fixture();
  c.loadCondition = "none";
  c.loadIds = [p.sections[0].loads[0].id];
  await open(page, p);
  await page.getByRole("tab", { name: "Água e cargas", exact: true }).click();
  await page
    .getByRole("button", { name: "Gerenciar cargas", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Sobrecargas da seção" });
  await dialog
    .getByRole("button", { name: "Excluir Sobrecarga de crista", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Caso original");
  await dialog.getByRole("button", { name: "Fechar janela" }).click();
  expect(await save(page)).toEqual(p);
  await selectCase(page);
  await page
    .getByLabel("Incluir Sobrecarga de crista", { exact: true })
    .uncheck();
  await apply(page);
  await page.getByRole("tab", { name: "Água e cargas", exact: true }).click();
  await page
    .getByRole("button", { name: "Gerenciar cargas", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Excluir Sobrecarga de crista", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Confirmar exclusão" }).click();
  await dialog.getByRole("button", { name: "Fechar janela" }).click();
  const result = await save(page);
  expect(result.sections[0].loads).toEqual([]);
  expect(result.analysisCases[0].loadIds).toEqual([]);
});

test("duplicação e exclusão de seção tratam os casos e referências na mesma operação", async ({
  page,
}) => {
  const { p, c } = fixture();
  c.loadCondition = "selected";
  c.loadIds = [p.sections[0].loads[0].id];
  await open(page, p);
  await page
    .getByRole("button", { name: "Duplicar seção", exact: true })
    .click();
  const copy = await save(page);
  expect(copy.analysisCases).toHaveLength(2);
  expect(copy.analysisCases[1].sectionId).toBe(copy.sections[1].id);
  expect(copy.analysisCases[1].loadIds).toEqual([copy.sections[1].loads[0].id]);
  await page
    .getByRole("button", { name: "Dados da seção", exact: true })
    .click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Excluir elemento?" });
  await expect(confirm).toContainText("1 caso(s)");
  await confirm.getByRole("button", { name: "Excluir", exact: true }).click();
  expect(await save(page)).toEqual(p);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect(await save(page)).toEqual(copy);
});

test("diagnóstico de caso de outra seção abre seu cadastro e protege edição de carga compartilhada", async ({
  page,
}) => {
  const { p, c } = fixture();
  c.loadCondition = "selected";
  c.loadIds = [p.sections[0].loads[0].id];
  p.sections[0].loadCondition = "none";
  const copy = duplicateSectionWithCases(p, p.sections[0].id).project;
  copy.analysisCases[1].direction = null;
  await open(page, copy);
  await page.locator(".diagnostics-toggle").click();
  await page
    .getByLabel("Diagnósticos")
    .getByRole("button", { name: /defina a direção de deslizamento/ })
    .click();
  await expect(
    page.getByLabel("Direção de deslizamento", { exact: true }),
  ).toHaveValue("");
  await expect(page.locator(".canvas-label")).toContainText(
    copy.sections[1].name,
  );
  await page
    .getByRole("button", { name: "Sobrecarga de crista", exact: true })
    .click();
  await page.getByLabel("X final (m)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Caso original");
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  expect(await save(page)).toEqual(copy);
});

test("recuperação v3 conserva todos os dados e mantém casos vazios até criação explícita", async ({
  page,
}) => {
  const { analysisCases, ...base } = exampleProject();
  const old = { ...base, version: 3 };
  old.sections[0].circle = { x: 10, y: 15, radius: 8 };
  await page.addInitScript(
    (p) =>
      localStorage.setItem(
        "geostruct.recovery.v1",
        JSON.stringify({ project: p, savedAt: "2026-11-17T16:00:00Z" }),
      ),
    old,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Recuperar trabalho local/ }).click();
  const saved = await save(page);
  expect(saved).toEqual({ ...old, version: 6, analysisCases: [] });
  const dialog = await manager(page);
  await expect(dialog).toContainText("Nenhum caso cadastrado");
});

test("entrada do núcleo usa dados aplicados e acompanha condições, arquivo e histórico", async ({
  page,
}) => {
  const { p } = fixture();
  await page.setViewportSize({ width: 960, height: 640 });
  await open(page, p);
  await selectCase(page);
  await page.locator(".core-input-preview summary").click();
  const input = page.getByRole("region", {
    name: "Entradas para o núcleo",
    exact: true,
  });
  await expect(input.getByRole("status")).toHaveText("Entradas reunidas");
  await expect(input).toContainText("2 materiais referenciados");
  await expect(input).toContainText("q = 20 kPa");
  await expect(input).toContainText("herdada da seção");
  expect(await save(page)).toEqual(p);

  await page
    .getByLabel("Sobrecargas no caso", { exact: true })
    .selectOption("none");
  await expect(input).toContainText("Há alterações em edição");
  await expect(input).toContainText("q = 20 kPa");
  await apply(page);
  await page.locator(".core-input-preview summary").click();
  await expect(input).toContainText("0 faixas ativas");
  await expect(input).not.toContainText("q = 20 kPa");
  const saved = await save(page);
  expect(saved.sections).toEqual(p.sections);
  expect(saved).not.toHaveProperty("snapshot");
  expect(saved.version).toBe(6);

  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  // Desfazer/refazer retorna à seção base; reabrir o caso confere a revisão atual.
  await selectCase(page);
  await page.locator(".core-input-preview summary").click();
  await expect(input).toContainText("q = 20 kPa");
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await selectCase(page);
  await page.locator(".core-input-preview summary").click();
  await expect(input).toContainText("0 faixas ativas");
  expect(await save(page)).toEqual(saved);
});

test("entrada incompleta mostra pendências e se atualiza ao editar material compartilhado", async ({
  page,
}) => {
  const { p } = fixture();
  p.materials[0].cohesion = null;
  p.sections[0].loads[0].q = 0;
  await open(page, p);
  await selectCase(page);
  await page.locator(".core-input-preview summary").click();
  const input = page.getByRole("region", {
    name: "Entradas para o núcleo",
    exact: true,
  });
  await expect(input.getByRole("status")).toHaveText("Entradas com pendências");
  await expect(input.getByLabel("Diagnósticos das entradas")).toContainText(
    "coesão",
  );
  await expect(input).toContainText("q = 0 kPa");
  await expect(input).toContainText("Esta conferência reúne entradas");
  await page
    .getByRole("button", { name: "Solo residual", exact: true })
    .click();
  await page.getByLabel("Coesão c′ (kPa)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await selectCase(page);
  await page.locator(".core-input-preview summary").click();
  await expect(input.getByRole("status")).toHaveText("Entradas reunidas");
  await expect(input).toContainText("q = 0 kPa");
});
