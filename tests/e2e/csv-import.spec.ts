import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  newProject,
  newSection,
  type Point,
  type Project,
} from "../../src/domain/model";

const terrain: Point[] = [
  { x: 0, y: 12 },
  { x: 10, y: 12 },
  { x: 20, y: 8 },
];
const exampleCsv = (name: string) =>
  readFileSync(new URL(`../../examples/${name}`, import.meta.url));
const modal = (page: Page) =>
  page.getByRole("dialog", { name: "Importar CSV", exact: true });
const applyCsv = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Aplicar contorno", exact: true });
const preview = (dialog: Locator) =>
  dialog.getByRole("table", {
    name: "Prévia das coordenadas em metros",
    exact: true,
  });

function model(): Project {
  const p = newProject("Coordenadas CSV — exemplo próprio");
  const s = p.sections[0];
  Object.assign(s, {
    name: "Seção A–A",
    base: 0,
    terrain: [
      { x: 0, y: 10 },
      { x: 20, y: 10 },
    ],
    backgroundMaterialId: p.materials[0].id,
    waterMode: "dry",
    loadCondition: "none",
    regions: [
      {
        id: "west",
        name: "Região oeste",
        materialId: p.materials[0].id,
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 4 },
          { x: 0, y: 4 },
        ],
      },
      {
        id: "east",
        name: "Região leste",
        materialId: p.materials[0].id,
        points: [
          { x: 10, y: 0 },
          { x: 15, y: 0 },
          { x: 15, y: 4 },
          { x: 10, y: 4 },
        ],
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
    backgroundMaterialId: p.materials[0].id,
    waterMode: "dry",
    loadCondition: "none",
  });
  p.sections.push(other);
  return p;
}

async function open(page: Page, p: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "csv.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(
    page.getByRole("heading", { name: "Perfil do terreno", exact: true }),
  ).toBeVisible();
}

async function save(page: Page): Promise<Project> {
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const stream = (await (await download).createReadStream())!;
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  return JSON.parse(text);
}

async function begin(page: Page) {
  await page.getByRole("button", { name: "Importar CSV", exact: true }).click();
  await expect(modal(page)).toBeVisible();
  return modal(page);
}

async function upload(
  dialog: Locator,
  buffer: Buffer,
  name = "coordenadas.csv",
) {
  await dialog.getByLabel("Arquivo CSV", { exact: true }).setInputFiles({
    name,
    mimeType: "text/csv",
    buffer,
  });
  await expect(
    dialog.getByRole("status").filter({ hasText: name }),
  ).toBeVisible();
}

async function configure(
  dialog: Locator,
  {
    unit = "m",
    header = true,
    separator = ";",
    decimal = ",",
    x = 0,
    z = 1,
  } = {},
) {
  await dialog.getByLabel("Separador", { exact: true }).selectOption(separator);
  await dialog
    .getByLabel("Separador decimal", { exact: true })
    .selectOption(decimal);
  await dialog
    .getByLabel("Primeira linha", { exact: true })
    .selectOption(String(header));
  await dialog
    .getByLabel("Unidade do arquivo", { exact: true })
    .selectOption(unit);
  await dialog.getByLabel("Coluna X", { exact: true }).selectOption(String(x));
  await dialog.getByLabel("Coluna Z", { exact: true }).selectOption(String(z));
}

async function expectPreview(dialog: Locator, points: Point[]) {
  await expect(preview(dialog).getByRole("row")).toHaveCount(points.length + 1);
  for (const [index, point] of points.entries()) {
    const cells = preview(dialog)
      .getByRole("row")
      .nth(index + 1)
      .getByRole("cell");
    await expect(cells.nth(3)).toHaveText(String(point.x));
    await expect(cells.nth(4)).toHaveText(String(point.y));
  }
  await expect(applyCsv(dialog)).toBeEnabled();
}

const unitFiles = [
  { unit: "m", buffer: exampleCsv("terreno-coordenadas-m.csv") },
  {
    unit: "cm",
    buffer: Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      exampleCsv("terreno-coordenadas-cm.csv"),
    ]),
  },
  {
    unit: "mm",
    buffer: Buffer.from("X;Z\n0;12000\n10000;12000\n20000;8000\n"),
  },
];

for (const { unit, buffer } of unitFiles) {
  test(`prévia ${unit} converte para metros e a confirmação é um único passo de histórico`, async ({
    page,
    context,
  }) => {
    const p = model();
    await open(page, p);
    const dialog = await begin(page);
    await expect(dialog.getByLabel("Separador", { exact: true })).toHaveValue(
      ";",
    );
    await expect(
      dialog.getByLabel("Separador decimal", { exact: true }),
    ).toHaveValue(",");
    await upload(dialog, buffer);
    await expect(
      dialog.getByLabel("Primeira linha", { exact: true }),
    ).toHaveValue("");
    await expect(
      dialog.getByLabel("Unidade do arquivo", { exact: true }),
    ).toHaveValue("");
    await expect(applyCsv(dialog)).toBeDisabled();
    await configure(dialog, { unit });
    await expectPreview(dialog, terrain);
    await expect(page.locator(".document-title")).not.toContainText("●");
    await applyCsv(dialog).click();
    await expect(dialog).toHaveCount(0);
    const expected = structuredClone(p);
    expected.sections[0].terrain = terrain;
    const imported = await save(page);
    expect(imported).toEqual(expected);
    expect(imported.version).toBe(4);
    for (const [action, state] of [
      ["Desfazer", p],
      ["Refazer", expected],
    ] as const) {
      await page.getByRole("tab", { name: "Geometria", exact: true }).click();
      await page.getByRole("button", { name: action, exact: true }).click();
      expect(await save(page)).toEqual(state);
    }
    if (unit === "m") {
      const manual = await context.newPage();
      await open(manual, p);
      await manual
        .getByText("Colar lista de coordenadas", { exact: true })
        .click();
      await manual
        .getByLabel("Lista de coordenadas", { exact: true })
        .fill("0;12\n10;12\n20;8");
      await manual
        .getByRole("button", { name: "Usar coordenadas", exact: true })
        .click();
      await manual
        .getByRole("button", { name: "Aplicar", exact: true })
        .click();
      expect(await save(manual)).toEqual(imported);
      await manual.close();
    }
  });
}

test("cabeçalho, colunas, aspas e separadores são explícitos e a primeira coordenada não é descartada", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  let dialog = await begin(page);
  await upload(
    dialog,
    Buffer.from(
      'Z,Nome,X\n12,"crista, oeste",0\n12,"crista, centro",10\n8,pé,20\n',
    ),
  );
  await configure(dialog, { separator: ",", decimal: ",", x: 2, z: 0 });
  await expect(dialog.getByRole("alert")).toContainText(/separador|vírgula/i);
  await expect(applyCsv(dialog)).toBeDisabled();
  await dialog
    .getByLabel("Separador decimal", { exact: true })
    .selectOption(".");
  await expectPreview(dialog, terrain);
  await applyCsv(dialog).click();
  const expected = structuredClone(p);
  expected.sections[0].terrain = terrain;
  expect(await save(page)).toEqual(expected);

  dialog = await begin(page);
  await upload(
    dialog,
    Buffer.from("0\t12000\tA\n10000\t12000\tB\n20000\t8000\tC\n"),
  );
  await configure(dialog, {
    unit: "mm",
    header: false,
    separator: "\t",
    decimal: ".",
  });
  await expectPreview(dialog, terrain);
  await applyCsv(dialog).click();
  expect(await save(page)).toEqual(expected);
});

test("arquivo inválido substitui a prévia anterior sem aplicar dados; Cancelar, Escape e X conservam o projeto", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  for (const [kind, close] of [
    ["utf8", "Cancelar"],
    ["large", "Escape"],
    ["number", "Fechar janela"],
  ] as const) {
    const dialog = await begin(page);
    await upload(dialog, exampleCsv("terreno-coordenadas-m.csv"), "valido.csv");
    await configure(dialog);
    await expectPreview(dialog, terrain);
    const bad =
      kind === "utf8"
        ? Buffer.from([0xff])
        : kind === "large"
          ? Buffer.alloc(1024 * 1024 + 1, 0x20)
          : Buffer.from("X;Z\n0;12\n10;inválido\n20;8\n");
    await dialog.getByLabel("Arquivo CSV", { exact: true }).setInputFiles({
      name: `${kind}.csv`,
      mimeType: "text/csv",
      buffer: bad,
    });
    if (kind === "number") {
      await expect(
        dialog.getByRole("status").filter({ hasText: "number.csv" }),
      ).toBeVisible();
      await expect(
        dialog.getByLabel("Primeira linha", { exact: true }),
      ).toHaveValue("");
      await expect(
        dialog.getByLabel("Unidade do arquivo", { exact: true }),
      ).toHaveValue("");
      await configure(dialog);
    }
    await expect(dialog.getByRole("alert")).toContainText(
      kind === "utf8"
        ? /UTF.?8/i
        : kind === "large"
          ? /1 MiB/
          : /linha|número|numéric/i,
    );
    await expect(preview(dialog)).toHaveCount(0);
    await expect(applyCsv(dialog)).toBeDisabled();
    if (close === "Escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: close, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await save(page)).toEqual(p);
  }
});

test("região mantém ID e material, isola outras regiões/seções e recusa sobreposição ou saída do domínio", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  await page.getByRole("button", { name: "Região oeste", exact: true }).click();
  let dialog = await begin(page);
  await upload(dialog, exampleCsv("regiao-colunas-mm.csv"));
  await configure(dialog, { unit: "mm", x: 2, z: 1 });
  const points = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 0, y: 4 },
  ];
  await expectPreview(dialog, points);
  await applyCsv(dialog).click();
  const expected = structuredClone(p);
  expected.sections[0].regions[0].points = points;
  expect(await save(page)).toEqual(expected);

  for (const [csv, error] of [
    ["0;0\n12;0\n12;4\n0;4\n", /sobrepõe/i],
    ["-1;0\n4;0\n4;4\n-1;4\n", /dentro da seção/i],
  ] as const) {
    dialog = await begin(page);
    await upload(dialog, Buffer.from(csv));
    await configure(dialog, { header: false });
    await expect(dialog.getByRole("alert")).toContainText(error);
    await expect(applyCsv(dialog)).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(await save(page)).toEqual(expected);
  }
});

test("protege propriedades em edição e a importação aberta antes de sair da página", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  await page.getByLabel("Z do ponto 1", { exact: true }).fill("11");
  await expect(
    page.getByRole("button", { name: "Importar CSV", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".inspector")).toContainText(
    /aplique ou descarte/i,
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  const dialog = await begin(page);
  await upload(dialog, exampleCsv("terreno-coordenadas-m.csv"));
  await configure(dialog);
  await expectPreview(dialog, terrain);

  const confirmation = page.waitForEvent("dialog");
  const reload = page.reload({ timeout: 2000 }).catch(() => undefined);
  const native = await confirmation;
  expect(native.type()).toBe("beforeunload");
  await native.dismiss();
  await reload;
  await expect(dialog).toBeVisible();
  await expectPreview(dialog, terrain);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await save(page)).toEqual(p);
});
