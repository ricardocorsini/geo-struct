import type { SolverResult, SearchMethod } from "../core/circular-search";
import type { Immutable, CoreInput } from "../core/input";
import { freeze } from "../core/immutable";
import {
  getMethodComparison,
  type CaseResultRecord,
  type CaseResultsView,
  type ResultSurface,
  type ResultsSelection,
} from "./case-results";

export type CsvCell = string | number | null;
export type ExportTable = {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly CsvCell[])[];
};
export type ExportDiagnostic = {
  stage: string;
  code: string;
  message: string;
  level: "error" | "warning" | "info";
  sliceNumber?: number;
  count?: number;
};
type CompletedSearch = Extract<
  CaseResultRecord,
  { mode: "search" }
>["execution"]["search"];
export type ResultExport = Immutable<{
  contract: "geostruct-result-export/1";
  status: "current";
  generatedAt: string;
  metadata: {
    appVersion: string;
    project: CoreInput["origin"]["project"];
    section: CoreInput["origin"]["section"];
    analysisCase: CoreInput["origin"]["analysisCase"];
    inputRevision: string;
    inputRevisionSha256: string;
    identityKey: string;
    identitySha256: string;
    surfaceRevision: string;
    surfaceRevisionSha256: string;
    profile: CaseResultRecord["ready"]["profile"];
    contracts: {
      input: string;
      geometry: string;
      weights: string | null;
      pressures: string | null;
      loads: string | null;
      mechanics: string | null;
      search: string | null;
      methods: string[];
    };
    formulations: {
      method: SearchMethod;
      contract: string;
      formulation: string;
    }[];
  };
  input: CoreInput;
  selection: ResultsSelection;
  circle: { x: number; z: number; radius: number };
  geometrySummary: {
    status: "prepared" | "blocked";
    sliceCount: number;
    areaM2: number | null;
  };
  methods: readonly SolverResult[];
  comparison: ReturnType<typeof getMethodComparison>;
  searchSummary: {
    grid: CompletedSearch["grid"];
    candidateCount: number;
    geometricCount: number;
    rankings: CompletedSearch["rankings"];
    reasons: CompletedSearch["reasons"];
  } | null;
  diagnostics: ExportDiagnostic[];
  candidates: ExportTable;
  slices: ExportTable;
}>;
export type BuildResultExportOptions = {
  view: CaseResultsView;
  surface: ResultSurface | null;
  selection: ResultsSelection;
  appVersion: string;
  generatedAt: string;
};

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
const sameNumbers = (left: object | null, right: object | null) => {
  if (!left || !right) return left === right;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(
      ([key, value]) => Object.hasOwn(b, key) && b[key] === value,
    )
  );
};

function expectedProfile(record: CaseResultRecord, method: SearchMethod) {
  if (record.mode === "fixed") return record.ready.profile[method];
  return method === "fellenius"
    ? record.ready.profile.equilibrium
    : {
        ...record.ready.profile.equilibrium,
        ...record.ready.profile.bishop,
      };
}

function surfaceRevision(
  record: CaseResultRecord,
  surface: ResultSurface,
): string | null {
  const { ready, execution } = record;
  const input = ready.preparation.snapshot?.input;
  if (
    !input ||
    JSON.stringify(input) !== ready.inputRevision ||
    ready.preparation.snapshot?.revision !== ready.inputRevision ||
    JSON.stringify(input) !== ready.inputRevision ||
    !same(ready.methods, input.analysis.methods) ||
    input.origin.project.id !== ready.projectId ||
    input.origin.analysisCase.id !== ready.caseId ||
    execution.identityKey !== ready.identityKey ||
    execution.caseId !== ready.caseId ||
    ready.identityKey !==
      JSON.stringify({
        projectId: ready.projectId,
        caseId: ready.caseId,
        inputRevision: ready.inputRevision,
        profile: ready.profile,
      }) ||
    execution.mode !== record.mode ||
    !sameNumbers(surface.geometry.profile, ready.profile.geometry)
  )
    return null;
  let revision: string;
  if (record.mode === "fixed") {
    if (
      surface.location !== null ||
      input.surface.mode !== "fixed" ||
      record.execution.fixed.identityKey !== ready.identityKey ||
      record.execution.fixed.inputRevision !== ready.inputRevision ||
      !same(surface.geometry, record.execution.fixed.geometry) ||
      !same(surface.methods, record.execution.fixed.methods)
    )
      return null;
    revision = ready.inputRevision;
  } else {
    const result = record.execution.search;
    if (
      input.surface.mode !== "search" ||
      result.inputRevision !== ready.inputRevision ||
      !same(result.profile, ready.profile)
    )
      return null;
    const candidate = result.candidates.find(
      (item) => item.location.number === surface.location?.number,
    );
    if (!candidate || !same(candidate.location, surface.location)) return null;
    revision = JSON.stringify({
      ...input,
      surface: { mode: "fixed", circle: candidate.location.circle },
    });
    if (
      candidate.sliceCount !==
      (surface.geometry.geometry?.slices.length ?? null)
    )
      return null;
    for (const method of ready.methods) {
      const compact = candidate.methods.find((item) => item.method === method);
      const detailed = surface.methods.find((item) => item.method === method);
      if (
        !!compact !== !!detailed ||
        (compact &&
          detailed &&
          (compact.status !== detailed.status ||
            compact.factorOfSafety !== detailed.factorOfSafety))
      )
        return null;
    }
  }
  if (surface.geometry.inputRevision !== revision) return null;
  for (const preparation of Object.values(surface.preparations ?? {})) {
    if (
      preparation.inputRevision !== revision ||
      !sameNumbers(preparation.geometryProfile, ready.profile.geometry)
    )
      return null;
  }
  const circle =
    surface.location?.circle ??
    (input.surface.mode === "fixed" ? input.surface.circle : null);
  if (
    !circle ||
    circle.x === null ||
    circle.z === null ||
    circle.radius === null
  )
    return null;
  const seen = new Set<SearchMethod>();
  for (const method of surface.methods) {
    if (
      seen.has(method.method) ||
      !ready.methods.includes(method.method) ||
      method.inputRevision !== revision ||
      !sameNumbers(method.geometryProfile, ready.profile.geometry) ||
      !sameNumbers(method.profile, expectedProfile(record, method.method))
    )
      return null;
    seen.add(method.method);
    if (
      method.source &&
      (method.source.center.x !== circle.x ||
        method.source.center.z !== circle.z ||
        method.source.radiusM !== circle.radius ||
        method.source.direction !== input.analysis.direction ||
        !same(method.source.origin, input.origin))
    )
      return null;
    if (
      method.status === "calculated" &&
      (!Number.isFinite(method.factorOfSafety) || method.factorOfSafety <= 0)
    )
      return null;
    if (
      method.method === "fellenius" &&
      method.status === "zero-resistance" &&
      method.factorOfSafety !== 0
    )
      return null;
  }
  return revision;
}

async function sha256(text: string) {
  const bytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function diagnostics(surface: ResultSurface): ExportDiagnostic[] {
  const items: ExportDiagnostic[] = [];
  const add = (
    stage: string,
    entries: readonly {
      code: string;
      message: string;
      level?: "error" | "warning" | "info";
      sliceNumber?: number;
    }[],
  ) =>
    entries.forEach((entry) =>
      items.push({ stage, ...entry, level: entry.level ?? "error" }),
    );
  add("geometry", surface.geometry.diagnostics);
  for (const [stage, value] of Object.entries(surface.preparations ?? {}))
    add(stage, value.diagnostics);
  for (const method of surface.methods) add(method.method, method.diagnostics);
  return items;
}

type SummaryMethod = {
  method: SearchMethod;
  status: string;
  factorOfSafety: number | null;
};
function factor(result: SummaryMethod | undefined): number | null {
  if (!result) return null;
  if (
    result.status === "calculated" &&
    Number.isFinite(result.factorOfSafety) &&
    result.factorOfSafety! > 0
  )
    return result.factorOfSafety;
  return result.method === "fellenius" &&
    result.status === "zero-resistance" &&
    result.factorOfSafety === 0
    ? 0
    : null;
}
function issueText(entries: readonly ExportDiagnostic[]) {
  return entries
    .map(
      (d) =>
        `${d.stage}:${d.code}:${d.level}${d.sliceNumber === undefined ? "" : `:fatia=${d.sliceNumber}`}: ${d.message}`,
    )
    .join(" | ");
}

const commonHeaders = [
  "contrato_exportacao",
  "versao_aplicativo",
  "estado_resultado",
  "projeto_id",
  "caso_id",
  "revisao_entrada_sha256",
  "identidade_execucao_sha256",
  "perfil_numerico_json",
  "contratos_motor_json",
];
const candidateHeaders = [
  "candidato_id",
  "metodo",
  "estado_metodo",
  "FS",
  "centro_X_m",
  "centro_Z_m",
  "raio_m",
  "fatias",
  "avaliacoes_Bishop",
  "residuo_Bishop",
  "diagnosticos",
];
const sliceHeaders = [
  "revisao_superficie_sha256",
  "candidato_id",
  "metodo",
  "estado_metodo",
  "FS",
  "fatia_id",
  "ordem_movimento",
  "X_inicial_m",
  "X_final_m",
  "largura_m",
  "area_m2",
  "comprimento_base_m",
  "alfa_rad",
  "material_base_id",
  "material_base_nome",
  "modo_parametros",
  "origem_material",
  "c_kPa",
  "phi_graus",
  "W_kN_por_m",
  "Q_kN_por_m",
  "u_kPa",
  "ue_kPa",
  "U_kN_por_m",
  "Ue_kN_por_m",
  "normal_resistencia_kN_por_m",
  "tensao_normal_kPa",
  "resistencia_kN_por_m",
  "parcela_motriz_kN_por_m",
  "m_Bishop",
  "parcela_reduzida_Bishop_kN_por_m",
  "parcelas_diagnosticas",
  "diagnosticos",
];

/** Só copia dados confirmados da execução/inspeção; não chama nenhum solver. */
export async function buildResultExport(
  options: BuildResultExportOptions,
): Promise<ResultExport | null> {
  if (
    options.view.status !== "current" ||
    !options.surface ||
    !options.selection.method ||
    !options.appVersion.trim() ||
    !Number.isFinite(Date.parse(options.generatedAt))
  )
    return null;
  // Capture antes do primeiro await: hash e tabelas pertencem à mesma seleção.
  const { view, surface, selection, appVersion, generatedAt } =
    structuredClone(options);
  if (view.status !== "current" || !surface || !selection.method) return null;
  const record = view.record,
    ready = record.ready;
  if (
    !ready.methods.includes(selection.method) ||
    (record.mode === "search"
      ? selection.candidateNumber !== surface.location?.number
      : selection.candidateNumber !== null)
  )
    return null;
  const revision = surfaceRevision(record, surface);
  if (!revision || !ready.preparation.snapshot) return null;
  const input = ready.preparation.snapshot.input;
  const circle =
    surface.location?.circle ??
    (input.surface.mode === "fixed" ? input.surface.circle : null);
  if (
    !circle ||
    circle.x === null ||
    circle.z === null ||
    circle.radius === null
  )
    return null;
  const [inputRevisionSha256, identitySha256, surfaceRevisionSha256] =
    await Promise.all([
      sha256(ready.inputRevision),
      sha256(ready.identityKey),
      sha256(revision),
    ]);
  const metadata: ResultExport["metadata"] = {
    appVersion,
    project: input.origin.project,
    section: input.origin.section,
    analysisCase: input.origin.analysisCase,
    inputRevision: ready.inputRevision,
    inputRevisionSha256,
    identityKey: ready.identityKey,
    identitySha256,
    surfaceRevision: revision,
    surfaceRevisionSha256,
    profile: ready.profile,
    contracts: {
      input: input.contract,
      geometry: surface.geometry.contract,
      weights: surface.preparations?.weights.contract ?? null,
      pressures: surface.preparations?.pressures.contract ?? null,
      loads: surface.preparations?.loads.contract ?? null,
      mechanics: surface.preparations?.mechanics.contract ?? null,
      search:
        record.mode === "search" ? record.execution.search.contract : null,
      methods: surface.methods.map((method) => method.contract),
    },
    formulations: surface.methods.map(({ method, contract, formulation }) => ({
      method,
      contract,
      formulation,
    })),
  };
  const diagnosticItems = diagnostics(surface);
  const common: CsvCell[] = [
    "geostruct-result-export/1",
    appVersion,
    "current",
    ready.projectId,
    ready.caseId,
    inputRevisionSha256,
    identitySha256,
    JSON.stringify(ready.profile),
    JSON.stringify(metadata.contracts),
  ];
  const candidateRows: CsvCell[][] = [];
  if (record.mode === "search") {
    for (const candidate of record.execution.search.candidates) {
      for (const method of ready.methods) {
        const outcome = candidate.methods.find(
          (item) => item.method === method,
        );
        const issues: ExportDiagnostic[] = candidate.issues
          .filter(
            (item) =>
              !["fellenius", "bishop"].includes(item.stage) ||
              item.stage === method,
          )
          .map((item) => ({ ...item, count: item.occurrences }));
        candidateRows.push([
          ...common,
          candidate.location.number,
          method,
          outcome?.status ?? "not-evaluated",
          factor(outcome),
          candidate.location.circle.x,
          candidate.location.circle.z,
          candidate.location.circle.radius,
          candidate.sliceCount,
          outcome?.evaluations ?? null,
          outcome?.residual ?? null,
          issueText(issues),
        ]);
      }
    }
  } else {
    for (const method of ready.methods) {
      const outcome = surface.methods.find((item) => item.method === method);
      const bishop = outcome?.method === "bishop" ? outcome : null;
      candidateRows.push([
        ...common,
        "fixo",
        method,
        outcome?.status ?? "not-evaluated",
        factor(outcome),
        circle.x,
        circle.z,
        circle.radius,
        surface.geometry.geometry?.slices.length ?? null,
        bishop?.iterations.length ?? null,
        bishop?.calculation?.evaluation?.residual ?? null,
        issueText(
          diagnosticItems.filter(
            (item) =>
              !["fellenius", "bishop"].includes(item.stage) ||
              item.stage === method,
          ),
        ),
      ]);
    }
  }
  const method = surface.methods.find(
    (item) => item.method === selection.method,
  );
  const evaluated =
    method?.method === "fellenius"
      ? method.calculation?.slices
      : method?.calculation?.evaluation?.slices;
  const mechanical = surface.preparations?.mechanics;
  const sliceRows: CsvCell[][] = (surface.geometry.geometry?.slices ?? []).map(
    (slice) => {
      const m =
        mechanical?.status === "prepared"
          ? mechanical.mechanics.slices.find(
              (item) => item.number === slice.number,
            )
          : null;
      const value = evaluated?.find(
        (item) => item.input.number === slice.number,
      );
      const bishop =
        method?.method === "bishop"
          ? method.calculation?.evaluation?.slices.find(
              (item) => item.input.number === slice.number,
            )
          : null;
      const weightPreparation = surface.preparations?.weights;
      const weight =
        weightPreparation?.status === "prepared"
          ? weightPreparation.weights.slices.find(
              (item) => item.number === slice.number,
            )
          : null;
      const pressurePreparation = surface.preparations?.pressures;
      const pressure =
        pressurePreparation?.status === "prepared"
          ? pressurePreparation.pressures.slices.find(
              (item) => item.number === slice.number,
            )
          : null;
      const loadPreparation = surface.preparations?.loads;
      const load =
        loadPreparation?.status === "prepared"
          ? loadPreparation.loads.slices.find(
              (item) => item.number === slice.number,
            )
          : null;
      return [
        ...common,
        surfaceRevisionSha256,
        surface.location?.number ?? "fixo",
        selection.method,
        method?.status ?? "not-evaluated",
        factor(method),
        slice.number,
        m?.order ?? null,
        slice.left.x,
        slice.right.x,
        slice.widthM,
        slice.areaM2,
        slice.chordLengthM,
        m?.alphaRadians ?? null,
        slice.baseMaterialId,
        m?.baseMaterial.name ?? null,
        m?.baseMaterial.mode ?? null,
        m?.baseMaterial.source ?? null,
        m?.baseMaterial.cohesionKPa ?? null,
        m?.baseMaterial.frictionDegrees ?? null,
        weight?.weightKNPerM ?? null,
        load?.forceKNPerM ?? null,
        pressure?.pressureKPa ?? null,
        m?.water.usedPressureKPa ?? null,
        m?.water.physicalBaseResultantKNPerM ?? null,
        m?.water.usedBaseResultantKNPerM ?? null,
        value?.normalForResistanceKNPerM ?? null,
        value?.normalStressKPa ?? null,
        value?.resistanceKNPerM ?? null,
        value?.drivingKNPerM ?? null,
        bishop?.m ?? null,
        bishop?.reducedResistanceKNPerM ?? null,
        method?.status === "calculated" ? "não" : "sim",
        issueText(
          diagnosticItems.filter(
            (item) =>
              item.sliceNumber === undefined ||
              item.sliceNumber === slice.number,
          ),
        ),
      ];
    },
  );
  const search = record.mode === "search" ? record.execution.search : null;
  return freeze({
    contract: "geostruct-result-export/1" as const,
    status: "current" as const,
    generatedAt,
    metadata,
    input,
    selection,
    circle: { x: circle.x, z: circle.z, radius: circle.radius },
    geometrySummary: {
      status: surface.geometry.status,
      sliceCount: surface.geometry.geometry?.slices.length ?? 0,
      areaM2: surface.geometry.geometry?.areaM2 ?? null,
    },
    methods: surface.methods,
    comparison: getMethodComparison(surface.methods),
    searchSummary: search
      ? {
          grid: search.grid,
          candidateCount: search.candidates.length,
          geometricCount: search.geometricCount,
          rankings: search.rankings,
          reasons: search.reasons,
        }
      : null,
    diagnostics: diagnosticItems,
    candidates: {
      headers: [...commonHeaders, ...candidateHeaders],
      rows: candidateRows,
    },
    slices: { headers: [...commonHeaders, ...sliceHeaders], rows: sliceRows },
  });
}

/** CSV pt-BR; textos são citados e fórmulas são neutralizadas, sem tocar números. */
export function exportResultCsv(table: ExportTable): string {
  const cell = (value: CsvCell): string => {
    if (value === null) return "";
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        throw new Error("O CSV contém uma grandeza não finita.");
      return String(value === 0 ? 0 : value).replace(".", ",");
    }
    const text =
      /^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value)
        ? `'${value}`
        : value;
    return `"${text.replaceAll('"', '""')}"`;
  };
  if (table.rows.some((row) => row.length !== table.headers.length))
    throw new Error("As colunas do CSV são inconsistentes.");
  return (
    "\uFEFF" +
    [table.headers, ...table.rows]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n") +
    "\r\n"
  );
}
