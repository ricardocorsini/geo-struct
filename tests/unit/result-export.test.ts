import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultProject } from "../../src/domain/default-project";
import {
  evaluateSearchCircle,
  runCircularSearch,
} from "../../src/core/circular-search";
import {
  calculateFixedCase,
  getCaseCalculationReadiness,
} from "../../src/lib/case-calculation";
import type {
  CaseResultRecord,
  CaseResultsView,
  ResultSurface,
} from "../../src/lib/case-results";
import {
  buildResultExport,
  exportResultCsv,
  type ExportTable,
} from "../../src/lib/result-export";
import { stratified } from "../fixtures/reference-catalog";

function completed(
  search: boolean,
  change?: (project: ReturnType<typeof defaultProject>) => void,
): CaseResultRecord {
  const project = defaultProject();
  change?.(project);
  const ready = getCaseCalculationReadiness(
    project,
    project.analysisCases[search ? 0 : 1].id,
  );
  if (ready.status !== "ready") throw new Error(JSON.stringify(ready));
  const bound = {
    status: "completed" as const,
    caseId: ready.caseId,
    identityKey: ready.identityKey,
  };
  if (ready.mode === "fixed")
    return {
      mode: "fixed",
      ready,
      execution: { ...bound, mode: "fixed", fixed: calculateFixedCase(ready) },
    };
  const result = runCircularSearch(ready.preparation, ready.profile);
  if (result.status !== "completed") throw new Error(result.diagnostic.message);
  return {
    mode: "search",
    ready,
    execution: { ...bound, mode: "search", search: result },
  };
}
function args(
  record: CaseResultRecord,
  method: "fellenius" | "bishop" = "fellenius",
  candidateNumber = 14,
) {
  const surface: ResultSurface =
    record.mode === "fixed"
      ? {
          geometry: record.execution.fixed.geometry,
          preparations: record.execution.fixed.preparations,
          methods: record.execution.fixed.methods,
          location: null,
        }
      : evaluateSearchCircle(
          record.ready.preparation,
          record.ready.profile,
          record.execution.search.candidates.find(
            (c) => c.location.number === candidateNumber,
          )!.location,
        );
  return {
    view: { status: "current", record } as CaseResultsView,
    surface,
    selection: {
      method,
      candidateNumber: record.mode === "search" ? candidateNumber : null,
      sliceNumber: 5,
    },
    appVersion: "0.2.0",
    generatedAt: "2026-11-22T12:00:00.000Z",
  };
}
function row(table: ExportTable, index: number) {
  return Object.fromEntries(
    table.headers.map((header, column) => [header, table.rows[index][column]]),
  );
}
let fixed: CaseResultRecord, search: CaseResultRecord;
beforeAll(() => {
  fixed = completed(false);
  search = completed(true);
});

describe("Contrato rastreável de exportação de resultados", () => {
  it("preserva revisão exata, perfil, contratos e SHA-256 nativo sem confundir revisão da busca com a da superfície", async () => {
    const input = args(search);
    const result = await buildResultExport(input);
    expect(result).not.toBeNull();
    expect(result!.metadata.inputRevision).toBe(search.ready.inputRevision);
    expect(result!.metadata.identityKey).toBe(search.ready.identityKey);
    expect(result!.metadata.inputRevisionSha256).toBe(
      createHash("sha256")
        .update(search.ready.inputRevision, "utf8")
        .digest("hex"),
    );
    expect(result!.metadata.identitySha256).toBe(
      createHash("sha256")
        .update(search.ready.identityKey, "utf8")
        .digest("hex"),
    );
    expect(result!.metadata.surfaceRevision).toBe(
      input.surface.geometry.inputRevision,
    );
    expect(result!.metadata.surfaceRevision).not.toBe(
      result!.metadata.inputRevision,
    );
    expect(result!.metadata.surfaceRevisionSha256).toBe(
      createHash("sha256")
        .update(input.surface.geometry.inputRevision!, "utf8")
        .digest("hex"),
    );
    expect(result!.metadata.profile).toEqual(search.ready.profile);
    expect(result!.metadata.contracts.input).toBe("geostruct-input/1");
    expect(result!.metadata.contracts.search).toBe(
      "geostruct-circular-search/1",
    );
    expect(result!.metadata.contracts.methods).toEqual([
      "geostruct-fellenius/1",
      "geostruct-bishop/1",
    ]);
  });
  it("conserva os 27 candidatos e os dois métodos, separados das parcelas da superfície selecionada", async () => {
    const result = (await buildResultExport(args(search)))!;
    expect(result.candidates.rows).toHaveLength(54);
    expect(result.slices.rows).toHaveLength(35);
    expect(result.selection.candidateNumber).toBe(14);
    expect(result.searchSummary!.rankings[0].minimum!.location.number).toBe(25);
    const slice = result.slices.rows
      .map((_, i) => row(result.slices, i))
      .find((r) => r.fatia_id === 5)!;
    expect(slice.candidato_id).toBe(14);
    expect(slice.metodo).toBe("fellenius");
    expect(slice.W_kN_por_m).toBeCloseTo(59.47367798290671, 8);
    expect(slice.normal_resistencia_kN_por_m).toBeCloseTo(
      43.209138350588546,
      8,
    );
    const minimum = result.candidates.rows
      .map((_, i) => row(result.candidates, i))
      .find((r) => r.candidato_id === 25 && r.metodo === "fellenius")!;
    expect(minimum.FS).toBeCloseTo(
      stratified.search.minima.fellenius.factorOfSafety,
      8,
    );
  });
  it("trocar método conserva candidato e numeração original, mas exporta a normal própria de Bishop", async () => {
    const result = (await buildResultExport(args(search, "bishop")))!;
    const slice = result.slices.rows
      .map((_, i) => row(result.slices, i))
      .find((r) => r.fatia_id === 5)!;
    expect(slice.candidato_id).toBe(14);
    expect(slice.metodo).toBe("bishop");
    expect(slice.W_kN_por_m).toBeCloseTo(59.47367798290671, 8);
    expect(slice.normal_resistencia_kN_por_m).toBeCloseTo(81.37076849580609, 8);
  });
  it("círculo fixo conserva comparação no mesmo círculo sem inventar mínimo da malha", async () => {
    const result = (await buildResultExport(args(fixed)))!;
    expect(result.searchSummary).toBeNull();
    expect(result.geometrySummary.sliceCount).toBe(35);
    expect(result.candidates.rows).toHaveLength(2);
    expect(row(result.candidates, 0).candidato_id).toBe("fixo");
    expect(result.comparison.status).toBe("comparable");
    expect(result.metadata.inputRevision).toBe(result.metadata.surfaceRevision);
  });
  it.each(["draft", "changed", "pending"] as const)(
    "bloqueia exportação do estado desatualizado %s",
    async (reason) => {
      const input = args(fixed);
      input.view = { status: "stale", record: fixed, reason };
      expect(await buildResultExport(input)).toBeNull();
    },
  );
  it("bloqueia ausência de execução e detalhe em carregamento", async () => {
    expect(
      await buildResultExport({
        ...args(fixed),
        view: { status: "empty", record: null },
      }),
    ).toBeNull();
    expect(
      await buildResultExport({ ...args(search), surface: null }),
    ).toBeNull();
  });
  it("recusa candidato, método, revisão e perfil de outra identidade", async () => {
    const input = args(search);
    expect(
      await buildResultExport({
        ...input,
        selection: { ...input.selection, candidateNumber: 25 },
      }),
    ).toBeNull();
    expect(
      await buildResultExport({
        ...input,
        selection: { ...input.selection, method: null },
      }),
    ).toBeNull();
    expect(
      await buildResultExport({
        ...input,
        surface: {
          ...input.surface,
          geometry: {
            ...input.surface.geometry,
            inputRevision: "outra entrada",
          },
        },
      }),
    ).toBeNull();
    expect(
      await buildResultExport({
        ...input,
        surface: {
          ...input.surface,
          geometry: {
            ...input.surface.geometry,
            profile: { toleranceM: 1e-7, maxArcDegrees: 3 },
          },
        },
      }),
    ).toBeNull();
    const record = structuredClone(search);
    if (record.mode !== "search") throw new Error("search");
    const view: CaseResultsView = {
      status: "current",
      record: {
        ...record,
        execution: { ...record.execution, identityKey: "outra execução" },
      },
    };
    expect(await buildResultExport({ ...input, view })).toBeNull();
  });
  it("geometria rejeitada continua exportável como diagnóstico, sem fatias ou FS", async () => {
    const record = completed(false, (p) => {
      p.analysisCases[1].fixedCircle = { x: 200, y: 200, radius: 1 };
    });
    const result = (await buildResultExport(args(record)))!;
    expect(result).not.toBeNull();
    expect(result.geometrySummary.status).toBe("blocked");
    expect(result.slices.rows).toHaveLength(0);
    expect(result.candidates.rows).toHaveLength(2);
    expect(row(result.candidates, 0).estado_metodo).toBe("not-evaluated");
    expect(row(result.candidates, 0).FS).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
  it("não atribui o hash de uma revisão a uma entrada alterada sem atualizar a revisão", async () => {
    const options = args(fixed);
    const record = options.view.record;
    if (!record) throw new Error("resultado ausente");
    const snapshot = record.ready.preparation.snapshot;
    if (!snapshot) throw new Error("entrada ausente");
    const inconsistent = {
      ...record,
      ready: {
        ...record.ready,
        preparation: {
          ...record.ready.preparation,
          snapshot: {
            ...snapshot,
            input: {
              ...snapshot.input,
              analysis: {
                ...snapshot.input.analysis,
                assumptions: "outra hipótese",
              },
            },
          },
        },
      },
    } as CaseResultRecord;
    expect(
      await buildResultExport({
        ...options,
        view: { status: "current", record: inconsistent },
      }),
    ).toBeNull();
  });
  it("recusa um método não executado pelo caso ou uma identidade que não descreve as entradas/perfil", async () => {
    const oneMethod = completed(false, (p) => {
      p.analysisCases[1].methods = ["fellenius"];
    });
    expect(await buildResultExport(args(oneMethod, "bishop"))).toBeNull();
    const input = args(fixed);
    const ready = {
      ...fixed.ready,
      identityKey: "identidade sem vínculo com as entradas",
    };
    if (fixed.mode !== "fixed" || ready.mode !== "fixed")
      throw new Error("fixed");
    const record: CaseResultRecord = {
      ...fixed,
      ready,
      execution: {
        ...fixed.execution,
        identityKey: ready.identityKey,
        fixed: { ...fixed.execution.fixed, identityKey: ready.identityKey },
      },
    };
    expect(
      await buildResultExport({
        ...input,
        view: { status: "current", record },
      }),
    ).toBeNull();
  });
  it("distingue FS zero de resistência nula, não convergência e rejeição", async () => {
    const zero = completed(false, (p) => {
      for (const material of p.materials) {
        material.cohesion = 0;
        material.friction = 0;
      }
    });
    const zeroExport = (await buildResultExport(args(zero)))!;
    const f = zeroExport.candidates.rows
      .map((_, i) => row(zeroExport.candidates, i))
      .find((r) => r.metodo === "fellenius")!;
    expect(f.estado_metodo).toBe("zero-resistance");
    expect(f.FS).toBe(0);
    const bishop = zeroExport.candidates.rows
      .map((_, i) => row(zeroExport.candidates, i))
      .find((r) => r.metodo === "bishop")!;
    expect(bishop.estado_metodo).toBe("zero-resistance");
    expect(bishop.FS).toBeNull();
    const record = completed(false, (p) => {
      p.analysisCases[1].numericalProfile.bishop.maxIterations = 1;
    });
    const result = (await buildResultExport(args(record, "bishop")))!;
    const b = result.candidates.rows
      .map((_, i) => row(result.candidates, i))
      .find((r) => r.metodo === "bishop")!;
    expect(b.estado_metodo).toBe("nonconverged");
    expect(b.FS).toBeNull();
    expect(
      result.methods.find((m) => m.method === "bishop")!.factorOfSafety,
    ).toBeNull();
    expect(
      result.slices.rows.every((_, i) => row(result.slices, i).FS === null),
    ).toBe(true);
  });
  it("cria cópia imutável antes de aguardar o hash e não compartilha objetos do caso", async () => {
    const input = structuredClone(args(fixed));
    const pending = buildResultExport(input);
    input.appVersion = "alterada";
    const result = (await pending)!;
    expect(result.metadata.appVersion).toBe("0.2.0");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.metadata.profile)).toBe(true);
    expect(Object.isFrozen(result.slices.rows[0])).toBe(true);
  });
});

describe("CSV de resultados", () => {
  it("tem BOM UTF-8, CRLF, decimal vírgula e precisão numérica completa", () => {
    expect(
      exportResultCsv({
        headers: ["id", "valor", "ausente"],
        rows: [["fatia", -123.45678901234567, null]],
      }),
    ).toBe('\uFEFF"id";"valor";"ausente"\r\n"fatia";-123,45678901234567;\r\n');
  });
  it("conserva separadores, aspas e quebras internas com escape CSV", () => {
    const csv = exportResultCsv({
      headers: ["texto"],
      rows: [['Um; "nome"\r\ne origem']],
    });
    expect(csv).toContain('"Um; ""nome""\r\ne origem"');
  });
  it.each(["=1+1", "+SUM(A1)", "-cmd", "@formula", "  =1+1", "\t@x", "\r\n+1"])(
    "protege texto de fórmula %j sem alterar número negativo",
    (text) => {
      const csv = exportResultCsv({
        headers: ["texto", "numero"],
        rows: [[text, -300]],
      });
      expect(csv).toContain(`"'${text}";-300`);
    },
  );
  it("recusa tabela inconsistente e número não finito, sem publicar células silenciosamente vazias", () => {
    expect(() =>
      exportResultCsv({ headers: ["a", "b"], rows: [[1]] }),
    ).toThrow();
    expect(() =>
      exportResultCsv({ headers: ["a"], rows: [[Infinity]] }),
    ).toThrow();
    expect(() => exportResultCsv({ headers: ["a"], rows: [[NaN]] })).toThrow();
  });
  it("todas as linhas identificam caso, revisão SHA-256, perfil, candidato e método", async () => {
    const result = (await buildResultExport(args(search)))!;
    for (const table of [result.candidates, result.slices]) {
      expect(
        table.rows.every((values) => values.length === table.headers.length),
      ).toBe(true);
      for (let i = 0; i < table.rows.length; i++) {
        const item = row(table, i);
        expect(item.caso_id).toBe(search.ready.caseId);
        expect(item.revisao_entrada_sha256).toBe(
          result.metadata.inputRevisionSha256,
        );
        expect(item.identidade_execucao_sha256).toBe(
          result.metadata.identitySha256,
        );
        expect(JSON.parse(String(item.perfil_numerico_json))).toEqual(
          search.ready.profile,
        );
        expect(item.metodo).toBeTruthy();
        expect(item.candidato_id).not.toBeNull();
      }
    }
  });
});
