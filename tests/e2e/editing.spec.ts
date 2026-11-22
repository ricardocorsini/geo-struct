import { test, expect, type Page } from "@playwright/test";
import { newProject, type Project } from "../../src/domain/model";

function fixture() {
  const p = newProject("Edição de camadas");
  const s = p.sections[0];
  s.base = 0;
  s.terrain = [
    { x: 0, y: 10 },
    { x: 20, y: 10 },
  ];
  s.waterMode = "piezometric";
  s.water = [
    { x: 0, y: 2 },
    { x: 20, y: 2 },
  ];
  s.regions = [
    {
      id: "lower",
      name: "Camada inferior",
      materialId: p.materials[0].id,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 5 },
        { x: 10, y: 5 },
        { x: 0, y: 5 },
      ],
    },
    {
      id: "upper",
      name: "Camada superior",
      materialId: p.materials[0].id,
      points: [
        { x: 0, y: 5 },
        { x: 5, y: 5 },
        { x: 20, y: 5 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
      ],
    },
  ];
  return p;
}
async function open(page: Page, p = fixture()) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "interfaces.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno" }),
  ).toBeVisible();
  return p;
}
async function saved(page: Page): Promise<Project> {
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const file = await promise,
    stream = (await file.createReadStream())!;
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  return JSON.parse(text);
}
async function point(page: Page, x: string, z: string, mode = "absolute") {
  const entry = page.locator(".point-entry");
  if ((await entry.getAttribute("open")) === null)
    await entry.locator("summary").click();
  await entry.getByLabel("Tipo de coordenadas").selectOption(mode);
  await entry.getByLabel("Primeira coordenada").fill(x);
  await entry.getByLabel("Segunda coordenada").fill(z);
  await entry.getByRole("button", { name: "Adicionar ponto" }).click();
}
async function cancel(page: Page) {
  await page.getByRole("region", { name: "Editor da seção 2D" }).focus();
  await page.keyboard.press("Escape");
}

test("edição por tabela acompanha a interface vizinha e desfaz como um único passo", async ({
  page,
}) => {
  const original = await open(page);
  await page
    .getByRole("button", { name: "Camada inferior", exact: true })
    .click();
  await page.getByLabel("Z do ponto 4").fill("6");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  const edited = await saved(page);
  expect(edited.sections[0].regions[1].points).toContainEqual({ x: 5, y: 5.5 });
  expect(edited.sections[0].regions[1].points).toContainEqual({ x: 10, y: 6 });
  expect(edited.sections[0].water).toEqual(original.sections[0].water);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect(await saved(page)).toEqual(original);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  expect(await saved(page)).toEqual(edited);
});

test("inserção e exclusão gráficas atingem ambos os lados da interface", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Camada inferior", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inserir vértice", exact: true })
    .click();
  const edge = page.locator('[data-edge="2"]'),
    box = (await edge.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByLabel("X do ponto 6")).toBeVisible();
  const inserted = await saved(page);
  const p = inserted.sections[0].regions[0].points[3];
  expect(p).toEqual({ x: 15, y: 5 });
  expect(inserted.sections[0].regions[1].points).toContainEqual(p);
  await page
    .getByRole("button", { name: "Excluir vértice", exact: true })
    .click();
  await page.locator('circle[data-vertex="3"]').click();
  await expect(page.getByLabel("X do ponto 6")).toHaveCount(0);
  const removed = await saved(page);
  expect(removed.sections[0].regions[1].points).not.toContainEqual(p);
});

test("divide uma camada por coordenadas e reabre as duas regiões com material e IDs", async ({
  page,
}) => {
  const original = await open(page);
  await page
    .getByRole("button", { name: "Camada inferior", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dividir região", exact: true })
    .click();
  await point(page, "0", "3");
  await point(page, "20", "3");
  await expect(page.locator('[data-pick="region"]')).toHaveCount(3);
  const split = await saved(page);
  expect(split.sections[0].regions[0].id).toBe("lower");
  expect(split.sections[0].regions[2].materialId).toBe(
    original.materials[0].id,
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "dividido.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(split)),
  });
  expect(await saved(page)).toEqual(split);
});

test("cópia fora da seção é recusada e Escape preserva o projeto", async ({
  page,
}) => {
  const original = await open(page);
  await page
    .getByRole("button", { name: "Camada inferior", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Copiar região", exact: true })
    .click();
  await point(page, "0", "0");
  await point(page, "100", "0");
  await expect(
    page.getByRole("status", { name: "Notificação do aplicativo" }),
  ).toContainText("inteiramente dentro");
  await expect(page.locator('[data-pick="region"]')).toHaveCount(2);
  await cancel(page);
  expect(await saved(page)).toEqual(original);
});

test("move um contorno por deslocamento relativo e protege o desenho em andamento", async ({
  page,
}) => {
  const original = await open(page);
  await page
    .getByRole("button", { name: "Linha piezométrica", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mover contorno", exact: true })
    .click();
  await point(page, "0", "2");
  await page.getByRole("button", { name: "Terreno", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Edição em andamento" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continuar editando", exact: true })
    .click();
  await point(page, "0", "1,25", "relative");
  const moved = await saved(page);
  expect(moved.sections[0].water).toEqual([
    { x: 0, y: 3.25 },
    { x: 20, y: 3.25 },
  ]);
  expect(moved.sections[0].regions).toEqual(original.sections[0].regions);
});

test("medição por distância e ângulo não modifica nem suja o arquivo", async ({
  page,
}) => {
  const original = await open(page);
  await page.getByRole("button", { name: "Medir", exact: true }).click();
  await point(page, "1", "2");
  await point(page, "5", "90", "polar");
  await expect(page.getByLabel("Medição")).toContainText("Distância 5 m");
  await expect(page.getByLabel("Medição")).toContainText("ΔZ 5 m");
  await expect(page.locator(".document-title")).not.toContainText("●");
  expect(await saved(page)).toEqual(original);
});

test("configura precisão e desenha terreno vertical por entrada numérica na janela mínima", async ({
  page,
}) => {
  const p = newProject("Face vertical");
  p.sections[0].base = 0;
  await page.setViewportSize({ width: 960, height: 640 });
  await open(page, p);
  await page.getByRole("button", { name: "Precisão", exact: true }).click();
  await page.getByLabel("Passo da grade de captura (m)").fill("0,25");
  await page.getByLabel("Restringir a horizontal/vertical").check();
  await page.getByRole("button", { name: "Aplicar precisão" }).click();
  await page
    .getByRole("button", { name: "Perfil do terreno", exact: true })
    .click();
  await point(page, "0", "10");
  await point(page, "10", "10");
  await point(page, "10", "6");
  await point(page, "20", "6");
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  const result = await saved(page);
  expect(result.sections[0].terrain).toEqual([
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 6 },
    { x: 20, y: 6 },
  ]);
  await page.getByRole("button", { name: "Precisão", exact: true }).click();
  await expect(page.getByLabel("Passo da grade de captura (m)")).toHaveValue(
    "0.25",
  );
  await expect(
    page.getByLabel("Restringir a horizontal/vertical"),
  ).toBeChecked();
});
