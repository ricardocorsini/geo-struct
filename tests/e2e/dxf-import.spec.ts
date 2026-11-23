import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import {
  newProject,
  newSection,
  type Point,
  type Project,
} from "../../src/domain/model";

const terrain: Point[] = [
  { x: 0, y: 10 },
  { x: 10, y: 10 },
  { x: 20, y: 8 },
];
const box = (x1: number, x2: number): Point[] => [
  { x: x1, y: 1 },
  { x: x2, y: 1 },
  { x: x2, y: 4 },
  { x: x1, y: 4 },
];
const example = (name: string) =>
  readFileSync(new URL(`../../examples/${name}`, import.meta.url));
const modal = (page: Page) =>
  page.getByRole("dialog", { name: "Importar DXF", exact: true });
const apply = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Aplicar contornos", exact: true });
const destination = (dialog: Locator, entity: string) =>
  dialog.getByLabel(`Destino de ${entity}`, { exact: true });
const coordinates = (dialog: Locator) =>
  dialog.getByRole("table", {
    name: "Coordenadas DXF convertidas em metros",
    exact: true,
  });

function model(): Project {
  let p = newProject("DXF — exemplo próprio");
  Object.assign(p.sections[0], {
    name: "Seção A–A",
    base: 0,
    terrain: [
      { x: 0, y: 12 },
      { x: 20, y: 12 },
    ],
    backgroundMaterialId: p.materials[0].id,
    waterMode: "dry",
    waterSource: "Hipótese ilustrativa",
    loadCondition: "none",
    regions: [
      {
        id: "existing",
        name: "Região existente",
        materialId: p.materials[0].id,
        points: box(12, 16),
      },
    ],
  });
  const other = newSection("Seção B–B");
  Object.assign(other, {
    base: 0,
    terrain: [
      { x: 0, y: 16 },
      { x: 30, y: 16 },
    ],
    waterMode: "dry",
    loadCondition: "none",
  });
  p.sections.push(other);
  p = addAnalysisCase(p, p.sections[0].id).project;
  p.analysisCases[0].name = "Caso com perfil próprio";
  p.analysisCases[0].numericalProfile.geometry.toleranceM = 0.001;
  p.analysisCases[0].numericalProfile.bishop.initialFactor = 1.2;
  return p;
}

async function open(page: Page, p: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "dxf.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno", exact: true }),
  ).toBeVisible();
}
async function save(page: Page): Promise<Project> {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const stream = (await (await pending).createReadStream())!;
  let json = "";
  for await (const chunk of stream) json += chunk.toString();
  return JSON.parse(json);
}
async function begin(page: Page) {
  await page.getByRole("button", { name: "Importar DXF", exact: true }).click();
  await expect(modal(page)).toBeVisible();
  return modal(page);
}
async function upload(
  dialog: Locator,
  buffer = example("secao-polilinhas-m.dxf"),
  name = "secao.dxf",
) {
  await dialog
    .getByLabel("Arquivo DXF", { exact: true })
    .setInputFiles({ name, mimeType: "application/dxf", buffer });
  await expect(
    dialog.getByRole("status").filter({ hasText: name }),
  ).toBeVisible();
}
async function configure(
  dialog: Locator,
  unit = "m",
  originX = "0",
  originZ = "0",
) {
  await dialog.getByLabel("Unidade do DXF", { exact: true }).selectOption(unit);
  await dialog.getByLabel("Origem X no DXF", { exact: true }).fill(originX);
  await dialog.getByLabel("Origem Y no DXF (Z)", { exact: true }).fill(originZ);
}
async function confirm(dialog: Locator) {
  await dialog
    .getByLabel("Conferi unidades e referencial", { exact: true })
    .check();
}
async function expectCoordinates(dialog: Locator, points: Point[]) {
  await expect(coordinates(dialog).getByRole("row")).toHaveCount(
    points.length + 1,
  );
  for (const [i, point] of points.entries()) {
    const cells = coordinates(dialog)
      .getByRole("row")
      .nth(i + 1)
      .getByRole("cell");
    await expect(cells.nth(1)).toHaveText(String(point.x));
    await expect(cells.nth(2)).toHaveText(String(point.y));
  }
}
async function newRegion(
  dialog: Locator,
  entity: string,
  name: string,
  material: string,
) {
  await destination(dialog, entity).selectOption("new-region");
  await dialog
    .getByLabel(`Nome da região ${entity}`, { exact: true })
    .fill(name);
  await dialog
    .getByLabel(`Material da região ${entity}`, { exact: true })
    .selectOption(material);
}

test("DXF aplica terreno e duas regiões em lote, preserva perfis/seções e desfaz/refaz em um passo", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  const dialog = await begin(page);
  await upload(dialog);
  await expect(
    dialog.getByLabel("Unidade do DXF", { exact: true }),
  ).toHaveValue("");
  for (let i = 1; i <= 4; i++)
    await expect(destination(dialog, `dxf-${i}`)).toHaveValue("ignore");
  await expect(apply(dialog)).toBeDisabled();
  await expect(dialog.getByText(/Não importável:.*ARC/)).toBeVisible();
  await configure(dialog);
  await destination(dialog, "dxf-1").selectOption("terrain");
  await newRegion(dialog, "dxf-2", "Solo A", `material:${p.materials[0].id}`);
  await newRegion(dialog, "dxf-3", "Solo B", "none");
  await expect(apply(dialog)).toBeDisabled();
  await confirm(dialog);
  await expectCoordinates(dialog, terrain);
  await dialog
    .getByLabel("Entidade para conferir coordenadas", { exact: true })
    .selectOption("dxf-3");
  await expectCoordinates(dialog, box(6, 9));
  await expect(page.locator(".document-title")).not.toContainText("●");
  await apply(dialog).click();
  await expect(dialog).toHaveCount(0);
  const actual = await save(page);
  expect(actual.version).toBe(5);
  const expected = structuredClone(p);
  expected.sections[0].terrain = terrain;
  const added = actual.sections[0].regions.slice(1);
  expect(added).toHaveLength(2);
  expect(added[0].id).not.toBe(added[1].id);
  expected.sections[0].regions.push(
    {
      id: added[0].id,
      name: "Solo A",
      materialId: p.materials[0].id,
      points: box(1, 4),
    },
    { id: added[1].id, name: "Solo B", materialId: null, points: box(6, 9) },
  );
  expect(actual).toEqual(expected);
  for (const [action, state] of [
    ["Desfazer", p],
    ["Refazer", expected],
  ] as const) {
    await page.getByRole("tab", { name: "Geometria", exact: true }).click();
    await page.getByRole("button", { name: action, exact: true }).click();
    expect(await save(page)).toEqual(state);
  }
});

for (const unit of ["cm", "mm"]) {
  test(`DXF ${unit} exige unidade/origem explícitas e reconfirma após trocar o referencial`, async ({
    page,
  }) => {
    const p = model();
    if (unit === "mm") p.sections[0].regions = [];
    await open(page, p);
    const dialog = await begin(page);
    await upload(dialog, example("secao-origem-cm.dxf"));
    await expect(
      dialog.getByLabel("Unidade do DXF", { exact: true }),
    ).toHaveValue("");
    await expect(
      dialog.getByLabel("Conferi unidades e referencial", { exact: true }),
    ).toBeDisabled();
    await configure(dialog, unit, "1000", "2000");
    await destination(dialog, "dxf-1").selectOption("terrain");
    const expectedPoints =
      unit === "cm"
        ? terrain
        : [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 2, y: 0.8 },
          ];
    await expectCoordinates(dialog, expectedPoints);
    await confirm(dialog);
    await dialog.getByLabel("Origem X no DXF", { exact: true }).fill("900");
    await expect(
      dialog.getByLabel("Conferi unidades e referencial", { exact: true }),
    ).not.toBeChecked();
    await expect(apply(dialog)).toBeDisabled();
    await dialog.getByLabel("Origem X no DXF", { exact: true }).fill("1000");
    await confirm(dialog);
    await apply(dialog).click();
    const expected = structuredClone(p);
    expected.sections[0].terrain = expectedPoints;
    expect(await save(page)).toEqual(expected);
  });
}

test("filtrar camadas não seleciona nem remove destinos e material novo precisa de escolha explícita", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  const dialog = await begin(page);
  await upload(dialog);
  await configure(dialog);
  await destination(dialog, "dxf-1").selectOption("terrain");
  await confirm(dialog);
  await dialog
    .getByLabel("Camada DXF", { exact: true })
    .selectOption("layer:SOLO_A");
  await expect(destination(dialog, "dxf-1")).toHaveCount(0);
  await expect(destination(dialog, "dxf-2")).toHaveValue("ignore");
  await expect(
    dialog.getByRole("status").filter({ hasText: "fora do filtro" }),
  ).toContainText("1 selecionadas");
  await destination(dialog, "dxf-2").selectOption("new-region");
  await dialog
    .getByLabel("Nome da região dxf-2", { exact: true })
    .fill("Escolha explícita");
  await expect(
    dialog.getByLabel("Material da região dxf-2", { exact: true }),
  ).toHaveValue("");
  await expect(apply(dialog)).toBeDisabled();
  await dialog
    .getByLabel("Material da região dxf-2", { exact: true })
    .selectOption("none");
  await expect(apply(dialog)).toBeEnabled();
  await dialog.getByLabel("Camada DXF", { exact: true }).selectOption("all");
  await expect(destination(dialog, "dxf-1")).toHaveValue("terrain");
  await expect(destination(dialog, "dxf-2")).toHaveValue("new-region");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await save(page)).toEqual(p);
});

test("substitui região preservando ID/material e recusa dois destinos iguais ou sobreposição", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  let dialog = await begin(page);
  await upload(dialog);
  await configure(dialog);
  await destination(dialog, "dxf-2").selectOption("region:existing");
  await confirm(dialog);
  await destination(dialog, "dxf-3").selectOption("region:existing");
  await expect(dialog.getByRole("alert")).toContainText(/mesmo contorno/);
  await expect(apply(dialog)).toBeDisabled();
  await destination(dialog, "dxf-3").selectOption("ignore");
  await apply(dialog).click();
  const expected = structuredClone(p);
  expected.sections[0].regions[0].points = box(1, 4);
  expect(await save(page)).toEqual(expected);
  dialog = await begin(page);
  await upload(dialog);
  await configure(dialog);
  await newRegion(dialog, "dxf-2", "Sobreposta", "none");
  await confirm(dialog);
  await expect(dialog.getByRole("alert")).toContainText(/sobrepõe/);
  await expect(apply(dialog)).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await save(page)).toEqual(expected);
});

test("erros de leitura descartam a prévia e Cancelar, Escape e X conservam o projeto", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  for (const [buffer, error, close] of [
    [Buffer.from([0xff]), /UTF.?8/i, "Cancelar"],
    [Buffer.alloc(2 * 1024 * 1024 + 1, 0x20), /2 MiB/, "Escape"],
    [
      Buffer.from("0\nSECTION\n2\nENTITIES\n"),
      /DXF|seção|estrutura|EOF/i,
      "Fechar janela",
    ],
  ] as const) {
    const dialog = await begin(page);
    await upload(dialog);
    await configure(dialog);
    await destination(dialog, "dxf-1").selectOption("terrain");
    await confirm(dialog);
    await expect(apply(dialog)).toBeEnabled();
    await dialog.getByLabel("Arquivo DXF", { exact: true }).setInputFiles({
      name: "invalido.dxf",
      mimeType: "application/dxf",
      buffer,
    });
    await expect(dialog.getByRole("alert")).toContainText(error);
    await expect(coordinates(dialog)).toHaveCount(0);
    await expect(apply(dialog)).toBeDisabled();
    if (close === "Escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: close, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await save(page)).toEqual(p);
  }
});

test("bulge fica incompatível e a inversão do terreno é uma escolha explícita", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  const dialog = await begin(page);
  await upload(dialog, example("secao-curva-incompativel.dxf"));
  await configure(dialog);
  await expect(dialog.getByText(/Não importável:/)).toContainText(
    /curva|bulge/i,
  );
  await expect(
    destination(dialog, "dxf-1").getByRole("option", {
      name: "Terreno — substituir contorno",
      exact: true,
    }),
  ).toHaveAttribute("disabled", "");
  await expect(apply(dialog)).toBeDisabled();
  const reversed = Buffer.from(
    "0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nTERRENO\n90\n3\n70\n0\n10\n20\n20\n8\n10\n10\n20\n10\n10\n0\n20\n10\n0\nENDSEC\n0\nEOF\n",
  );
  await upload(dialog, reversed, "reverso.dxf");
  await configure(dialog);
  await destination(dialog, "dxf-1").selectOption("terrain");
  await confirm(dialog);
  await expect(apply(dialog)).toBeDisabled();
  await expect(
    dialog.getByLabel("Inverter ordem de dxf-1", { exact: true }),
  ).not.toBeChecked();
  await dialog.getByLabel("Inverter ordem de dxf-1", { exact: true }).check();
  await expectCoordinates(dialog, terrain);
  await apply(dialog).click();
  const expected = structuredClone(p);
  expected.sections[0].terrain = terrain;
  expect(await save(page)).toEqual(expected);
});

test("protege rascunho e a importação aberta ao tentar recarregar", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  await page.getByLabel("Z do ponto 1", { exact: true }).fill("13");
  await expect(
    page.getByRole("button", { name: "Importar DXF", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  const dialog = await begin(page);
  await upload(dialog);
  await configure(dialog);
  await destination(dialog, "dxf-1").selectOption("terrain");
  await confirm(dialog);
  const pending = page.waitForEvent("dialog");
  const reload = page.reload({ timeout: 2000 }).catch(() => undefined);
  const native = await pending;
  expect(native.type()).toBe("beforeunload");
  await native.dismiss();
  await reload;
  await expect(dialog).toBeVisible();
  await expectCoordinates(dialog, terrain);
  await expect(apply(dialog)).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await save(page)).toEqual(p);
});
