import { expect, test, type Locator, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { serializeProject, type Project } from "../../src/domain/model";
import { fixture } from "../fixtures/equilibrium-ui";
import { stratified, stratifiedProject } from "../fixtures/reference-catalog";

const workspace = (page: Page) =>
  page.getByRole("complementary", { name: "Resultados do caso", exact: true });
const resultsTab = (page: Page) =>
  page.getByRole("tab", { name: "Resultados", exact: true });
const memorial = (page: Page) =>
  page.getByRole("dialog", { name: "Memorial de resultados", exact: true });

function withReferenceProfile(p: Project) {
  const profile = stratified.profile;
  for (const c of p.analysisCases)
    c.numericalProfile = {
      geometry: { ...profile.geometry },
      fellenius: { ...profile.equilibrium },
      bishop: { ...profile.equilibrium, ...profile.bishop },
      search: {
        geometry: { ...profile.geometry },
        equilibrium: { ...profile.equilibrium },
        bishop: { ...profile.bishop },
        nearTieTolerance: profile.nearTieTolerance,
      },
    };
  return p;
}

function model(search = false) {
  const p = withReferenceProfile(stratifiedProject(search));
  p.name = "Referência para exportação";
  p.analysisCases[0].name = search
    ? "Busca para exportação"
    : "Fixo para exportação";
  return p;
}

async function open(page: Page, p: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "exportacao.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(p)),
  });
  await page
    .getByRole("button", { name: p.analysisCases[0].name, exact: true })
    .click();
}

async function calculate(page: Page) {
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByRole("tabpanel", { name: "Análise", exact: true })
    .getByRole("button", { name: "Calcular caso", exact: true })
    .click();
  await expect(
    page.getByRole("status", {
      name: "Estado do cálculo do caso",
      exact: true,
    }),
  ).toHaveAttribute("data-status", "completed");
  await resultsTab(page).click();
}

async function selectCandidate(page: Page, candidate: number) {
  const input = workspace(page).getByRole("spinbutton", {
    name: "Superfície do resultado",
    exact: true,
  });
  await input.fill(String(candidate));
  await input.press("Enter");
  await expect(
    workspace(page).getByRole("region", {
      name: "Resultado da superfície selecionada",
      exact: true,
    }),
  ).toContainText(`Superfície ${candidate}`);
}

async function selectMethod(page: Page, selected: "fellenius" | "bishop") {
  await workspace(page)
    .getByRole("combobox", { name: "Método do resultado", exact: true })
    .selectOption(selected);
}

async function showMemorial(page: Page) {
  await page
    .getByRole("button", { name: "Memorial de resultados", exact: true })
    .click();
  await expect(memorial(page)).toBeVisible();
  return memorial(page);
}

async function closeMemorial(page: Page) {
  await memorial(page)
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
}

async function download(page: Page, scope: Locator, label: string) {
  const event = page.waitForEvent("download");
  await scope.getByRole("button", { name: label, exact: true }).click();
  const file = await event;
  const stream = await file.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return {
    name: file.suggestedFilename(),
    text: Buffer.concat(chunks).toString("utf8"),
  };
}

// Leitor de teste independente do serializador do produto, incluindo campos
// entre aspas, aspas duplicadas, CRLF e quebras de linha dentro de um campo.
function csvRecords(text: string) {
  expect(text.startsWith("\uFEFF")).toBe(true);
  expect(text).toContain("\r\n");
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false;
  const source = text.slice(1);
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") {
      record.push(field);
      field = "";
    } else if (c === "\r" && source[i + 1] === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i++;
    } else field += c;
  }
  expect(quoted).toBe(false);
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  const headers = records.shift()!;
  expect(new Set(headers).size).toBe(headers.length);
  const rows = records.map((cells) => {
    expect(cells).toHaveLength(headers.length);
    return Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
  });
  return { headers, rows };
}

function csvNumber(text: string) {
  expect(text).not.toBe("");
  const value = Number(text.replace(",", "."));
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

function expectTrace(
  row: Record<string, string>,
  p: Project,
  withSurface = true,
) {
  expect(row.projeto_id).toBe(p.id);
  expect(row.caso_id).toBe(p.analysisCases[0].id);
  expect(row.versao_aplicativo).toMatch(/^\d+\.\d+\.\d+/);
  const hashes = ["revisao_entrada_sha256", "identidade_execucao_sha256"];
  if (withSurface) hashes.push("revisao_superficie_sha256");
  for (const key of hashes) expect(row[key]).toMatch(/^[a-f0-9]{64}$/);
  expect(row.perfil_numerico_json).toContain("maxArcDegrees");
  expect(row.estado_resultado).not.toBe("");
}

function expectReference(text: string, expected: number, tolerance: number) {
  expect(Math.abs(csvNumber(text) - expected)).toBeLessThanOrEqual(tolerance);
}

test("memorial e CSV do fixo preservam referência, unidades e identidade na janela mínima", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = model();
  await open(page, p);
  await calculate(page);
  await selectMethod(page, "bishop");
  const report = await showMemorial(page);
  await expect(
    report.getByRole("button", { name: "Exportar HTML", exact: true }),
  ).toBeEnabled();
  await expect(report).toContainText("Fixo para exportação");
  await expect(report).toContainText("1,474");
  const html = await download(page, report, "Exportar HTML");
  expect(html.name).toMatch(/\.html$/);
  const copy = await context.newPage();
  await copy.setContent(html.text);
  await expect(copy.locator("body")).toContainText(p.name);
  await expect(copy.locator("body")).toContainText("Bishop");
  await expect(copy.locator("body")).toContainText("1,474");
  expect(await copy.locator("script[src],link[href^='http']").count()).toBe(0);
  await copy.close();

  const csv = await download(page, report, "Exportar fatias CSV");
  expect(csv.name).toMatch(/\.csv$/);
  const { headers, rows } = csvRecords(csv.text);
  expect(headers).toEqual(
    expect.arrayContaining([
      "fatia_id",
      "W_kN_por_m",
      "normal_resistencia_kN_por_m",
      "u_kPa",
      "area_m2",
    ]),
  );
  expect(rows).toHaveLength(35);
  const row = rows.find((r) => r.fatia_id === "5")!;
  expectTrace(row, p);
  expect(row.candidato_id).toBe("fixo");
  expect(row.metodo).toBe("bishop");
  expect(row.estado_metodo).toBe("calculated");
  expectReference(row.FS, stratified.fixedCircle.bishop.factorOfSafety, 1e-9);
  expectReference(
    row.W_kN_por_m,
    stratified.fixedCircle.slices[4].weightKNPerM,
    1e-7,
  );
  expectReference(
    row.normal_resistencia_kN_por_m,
    stratified.fixedCircle.bishop.slices[4].normalKNPerM,
    1e-7,
  );
});

test("busca exporta toda a malha e parcelas do candidato e método selecionados", async ({
  page,
}) => {
  const p = model(true);
  await open(page, p);
  await calculate(page);
  await selectCandidate(page, 14);
  await selectMethod(page, "bishop");
  const report = await showMemorial(page);
  await expect(
    report.getByRole("button", { name: "Exportar HTML", exact: true }),
  ).toBeEnabled();
  const candidates = csvRecords(
    (await download(page, report, "Exportar candidatos CSV")).text,
  );
  expect(candidates.rows).toHaveLength(54);
  expect(new Set(candidates.rows.map((r) => r.candidato_id)).size).toBe(27);
  const minimum = candidates.rows.find(
    (r) => r.candidato_id === "25" && r.metodo === "bishop",
  )!;
  expectTrace(minimum, p, false);
  expectReference(
    minimum.FS,
    stratified.search.minima.bishop.factorOfSafety,
    1e-9,
  );
  const selected = candidates.rows.find(
    (r) => r.candidato_id === "14" && r.metodo === "bishop",
  )!;
  expectReference(
    selected.FS,
    stratified.fixedCircle.bishop.factorOfSafety,
    1e-9,
  );
  const slices = csvRecords(
    (await download(page, report, "Exportar fatias CSV")).text,
  );
  expect(slices.rows).toHaveLength(35);
  expect(
    slices.rows.every((r) => r.candidato_id === "14" && r.metodo === "bishop"),
  ).toBe(true);
  const row = slices.rows.find((r) => r.fatia_id === "5")!;
  expectReference(
    row.normal_resistencia_kN_por_m,
    stratified.fixedCircle.bishop.slices[4].normalKNPerM,
    1e-7,
  );
  const html = (await download(page, report, "Exportar HTML")).text;
  expect(html).toContain("borda");
  expect(html).toContain("1,272");
  expect(html).toContain("1,474");
});

test("resultado ausente, perfil alterado e rascunho bloqueiam exportação sem retirar relatório de entradas", async ({
  page,
}) => {
  const p = model();
  await open(page, p);
  await resultsTab(page).click();
  let report = await showMemorial(page);
  await expect(
    report.getByRole("button", { name: "Exportar HTML", exact: true }),
  ).toBeDisabled();
  await expect(
    report.getByRole("button", { name: "Exportar fatias CSV", exact: true }),
  ).toBeDisabled();
  await closeMemorial(page);
  await calculate(page);
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByLabel("Bishop · Tolerância do resíduo τF", { exact: true })
    .fill("1e-9");
  await resultsTab(page).click();
  report = await showMemorial(page);
  await expect(report).toContainText("desatualizado");
  await expect(
    report.getByRole("button", { name: "Exportar HTML", exact: true }),
  ).toBeDisabled();
  await expect(
    report.getByRole("button", { name: "Imprimir / PDF", exact: true }),
  ).toBeDisabled();
  await expect(report).not.toContainText("1,283");
  await closeMemorial(page);
  await calculate(page);
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page
    .getByLabel("Nome do caso", { exact: true })
    .fill("Rascunho sem aplicar");
  await resultsTab(page).click();
  report = await showMemorial(page);
  await expect(
    report.getByRole("button", { name: "Exportar HTML", exact: true }),
  ).toBeDisabled();
  await closeMemorial(page);
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await expect(page.getByLabel("Nome do caso", { exact: true })).toHaveValue(
    "Rascunho sem aplicar",
  );
  await page
    .getByRole("tabpanel", { name: "Análise", exact: true })
    .getByRole("button", { name: "Relatório de entradas", exact: true })
    .click();
  const inputs = page.getByRole("dialog", {
    name: "Relatório de entradas",
    exact: true,
  });
  const html = await download(page, inputs, "Exportar HTML");
  expect(html.text).toContain("Relatório de dados de entrada");
  expect(html.text).toContain(p.name);
  expect(html.text).not.toContain("Rascunho sem aplicar");
  await inputs
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(page.getByLabel("Nome do caso", { exact: true })).toHaveValue(
    "Rascunho sem aplicar",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
});

test("Bishop sem convergência exporta estado e diagnóstico sem transformar tentativa em FS", async ({
  page,
}) => {
  const p = model();
  p.analysisCases[0].numericalProfile.bishop.maxIterations = 1;
  await open(page, p);
  await calculate(page);
  await selectMethod(page, "bishop");
  const report = await showMemorial(page);
  await expect(
    report.getByRole("button", { name: "Exportar HTML", exact: true }),
  ).toBeEnabled();
  const html = (await download(page, report, "Exportar HTML")).text;
  expect(html).toContain("converg");
  const { rows } = csvRecords(
    (await download(page, report, "Exportar fatias CSV")).text,
  );
  expect(rows).toHaveLength(35);
  expect(
    rows.every((r) => r.estado_metodo === "nonconverged" && r.FS === ""),
  ).toBe(true);
  expect(rows.every((r) => r.parcelas_diagnosticas === "sim")).toBe(true);
  expect(rows.some((r) => r.diagnosticos.includes("converg"))).toBe(true);
});

test("resistência nula mantém FS zero de Fellenius e ausência de FS de Bishop nos CSVs", async ({
  page,
}) => {
  const p = model();
  for (const material of p.materials) material.friction = 0;
  await open(page, p);
  await calculate(page);
  let report = await showMemorial(page);
  await expect(
    report.getByRole("button", { name: "Exportar HTML", exact: true }),
  ).toBeEnabled();
  let csv = csvRecords(
    (await download(page, report, "Exportar fatias CSV")).text,
  );
  expect(csv.rows).toHaveLength(35);
  expect(
    csv.rows.every(
      (r) => r.estado_metodo === "zero-resistance" && r.FS === "0",
    ),
  ).toBe(true);
  await closeMemorial(page);
  await selectMethod(page, "bishop");
  report = await showMemorial(page);
  csv = csvRecords((await download(page, report, "Exportar fatias CSV")).text);
  expect(csv.rows).toHaveLength(35);
  expect(
    csv.rows.every((r) => r.estado_metodo === "zero-resistance" && r.FS === ""),
  ).toBe(true);
});

test("CSV da busca conserva candidato descartado, diagnósticos e campos vazios", async ({
  page,
}) => {
  const p = withReferenceProfile(fixture());
  p.materials[0].cohesion = 0;
  Object.assign(p.analysisCases[0], {
    name: "Busca com descarte para exportar",
    methods: ["fellenius", "bishop"],
    surfaceMode: "search",
    search: {
      x: { min: 0, max: 0, step: null },
      y: { min: 4, max: 4, step: null },
      radius: { min: 3, max: 6.05, step: 1 },
    },
  });
  await open(page, p);
  await calculate(page);
  const report = await showMemorial(page);
  await expect(
    report.getByRole("button", {
      name: "Exportar candidatos CSV",
      exact: true,
    }),
  ).toBeEnabled();
  const { rows } = csvRecords(
    (await download(page, report, "Exportar candidatos CSV")).text,
  );
  const rejected = rows.filter((r) => r.candidato_id === "1");
  expect(rejected).toHaveLength(2);
  expect(
    rejected.every(
      (r) =>
        r.FS === "" && r.fatias === "" && r.estado_metodo === "not-evaluated",
    ),
  ).toBe(true);
  expect(
    rejected.every((r) => r.diagnosticos.includes("não cruza o terreno")),
  ).toBe(true);
});

test("HTML escapa nomes e CSV neutraliza fórmula sem misturar identidades ao trocar caso", async ({
  page,
  context,
}) => {
  const p = model();
  p.name = '<img src=x onerror="window.exportAttack=1">; "dados"';
  p.analysisCases[0].id = "=2+2";
  const added = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  added.analysisCase.name = "Outro caso ainda não calculado";
  await open(page, added.project);
  await calculate(page);
  const report = await showMemorial(page);
  await expect(
    report.getByRole("button", { name: "Exportar HTML", exact: true }),
  ).toBeEnabled();
  const { rows } = csvRecords(
    (await download(page, report, "Exportar fatias CSV")).text,
  );
  expect(rows).toHaveLength(35);
  expect(rows.every((r) => r.caso_id === "'=2+2")).toBe(true);
  const html = (await download(page, report, "Exportar HTML")).text;
  expect(html).toContain("&lt;img");
  const copy = await context.newPage();
  await copy.setContent(html);
  expect(await copy.evaluate(() => Object.hasOwn(window, "exportAttack"))).toBe(
    false,
  );
  await expect(copy.locator("img")).toHaveCount(0);
  await expect(copy.locator("body")).toContainText(p.name);
  await copy.close();
  await closeMemorial(page);
  await page
    .getByRole("button", { name: added.analysisCase.name, exact: true })
    .click();
  await resultsTab(page).click();
  const other = await showMemorial(page);
  await expect(
    other.getByRole("button", { name: "Exportar HTML", exact: true }),
  ).toBeDisabled();
  await expect(other).not.toContainText("1,283");
});
