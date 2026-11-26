import { solveBishop, type BishopProfile } from "../core/bishop";
import type {
  CircularSearchProfile,
  CircularSearchResult,
} from "../core/circular-search";
import { solveFellenius } from "../core/fellenius";
import {
  prepareFixedCircleGeometry,
  type GeometryProfile,
} from "../core/fixed-circle";
import { prepareSearchGrid } from "../core/search-grid";
import { prepareSliceLoads } from "../core/slice-loads";
import { prepareSliceMechanics } from "../core/slice-mechanics";
import { prepareSlicePressures } from "../core/slice-pressures";
import { prepareSliceWeights } from "../core/slice-weights";
import { methodLabel } from "../domain/analysis";
import {
  isNumericalProfileComplete,
  profileRevision,
  type CaseMethodSummary,
  type CaseRunRecord,
} from "../domain/case-comparison";
import { prepareCoreInput } from "../domain/core-input";
import type { AnalysisCase, Project } from "../domain/model";
import { startSearchWorker } from "./circular-search-client";
import type { SearchRequest, SearchResponse } from "./circular-search-messages";

export type SearchRunner = (
  request: Extract<SearchRequest, { type: "run" }>,
  receive: (response: SearchResponse) => void,
) => () => void;

export type BatchExecutionHandle = {
  done: Promise<void>;
  cancel: () => void;
};

const axisLabels = { x: "X", z: "Z", radius: "raio" } as const;

function buildFixedWarnings(
  diagnostics: readonly { message: string }[],
): string[] {
  return diagnostics.map((d) => d.message);
}

function runFixedCase(
  project: Project,
  analysisCase: AnalysisCase,
): CaseRunRecord {
  const prep = prepareCoreInput(project, analysisCase.id);
  const inputRev = prep.snapshot?.revision ?? null;
  const profRev = profileRevision(analysisCase.numericalProfile);
  const base: Omit<CaseRunRecord, "state" | "methods" | "warnings"> = {
    caseId: analysisCase.id,
    sectionId: analysisCase.sectionId,
    inputRevision: inputRev,
    profileRevision: profRev,
    surfaceMode: analysisCase.surfaceMode,
  };

  if (prep.status !== "collected" || !prep.snapshot) {
    const messages = prep.diagnostics
      .filter((d) => d.level !== "info")
      .map((d) => d.message);
    return {
      ...base,
      state: "blocked",
      methods: [],
      warnings: messages,
      error: messages[0] ?? "Entradas do caso pendentes.",
    };
  }

  const geometry = prepareFixedCircleGeometry(
    prep,
    analysisCase.numericalProfile.geometry as GeometryProfile,
  );
  if (geometry.status !== "prepared") {
    const messages = buildFixedWarnings(geometry.diagnostics);
    return {
      ...base,
      state: "blocked",
      methods: [],
      warnings: messages,
      error: messages[0] ?? "Geometria do círculo fixo bloqueada.",
    };
  }

  const weights = prepareSliceWeights(prep, geometry);
  const pressures = prepareSlicePressures(prep, geometry);
  const loads = prepareSliceLoads(prep, geometry);
  const mechanics = prepareSliceMechanics(prep, geometry, {
    weights,
    pressures,
    loads,
  });

  if (mechanics.status !== "prepared") {
    const messages = [
      ...buildFixedWarnings(weights.diagnostics),
      ...buildFixedWarnings(pressures.diagnostics),
      ...buildFixedWarnings(loads.diagnostics),
      ...buildFixedWarnings(mechanics.diagnostics),
    ];
    return {
      ...base,
      state: "blocked",
      methods: [],
      warnings: messages,
      error: messages[0] ?? "Preparação mecânica bloqueada.",
    };
  }

  const circle = {
    x: analysisCase.fixedCircle.x!,
    z: analysisCase.fixedCircle.y!,
    radius: analysisCase.fixedCircle.radius!,
  };
  const sliceCount = geometry.geometry.slices.length;
  const methods: CaseMethodSummary[] = [];
  const warnings: string[] = [];

  for (const method of analysisCase.methods) {
    if (method === "fellenius") {
      const res = solveFellenius(prep, mechanics, {
        drivingThresholdKNPerM:
          analysisCase.numericalProfile.fellenius.drivingThresholdKNPerM!,
        tensionToleranceKPa:
          analysisCase.numericalProfile.fellenius.tensionToleranceKPa!,
      });
      const notes = res.diagnostics.map((d) => d.message);
      warnings.push(...notes);
      methods.push({
        method: "fellenius",
        status: res.status,
        factorOfSafety: res.factorOfSafety,
        surface: circle,
        sliceCount,
        notes,
      });
    } else {
      const res = solveBishop(
        prep,
        mechanics,
        analysisCase.numericalProfile.bishop as BishopProfile,
      );
      const notes = res.diagnostics.map((d) => d.message);
      warnings.push(...notes);
      methods.push({
        method: "bishop",
        status: res.status,
        factorOfSafety: res.factorOfSafety,
        surface: circle,
        sliceCount,
        notes,
      });
    }
  }

  return {
    ...base,
    state: "completed",
    methods,
    warnings,
  };
}

function mapSearchCompleted(
  analysisCase: AnalysisCase,
  inputRevision: string | null,
  result: CircularSearchResult,
): CaseRunRecord {
  const profRev = profileRevision(analysisCase.numericalProfile);
  const base: Omit<CaseRunRecord, "state" | "methods" | "warnings"> = {
    caseId: analysisCase.id,
    sectionId: analysisCase.sectionId,
    inputRevision,
    profileRevision: profRev,
    surfaceMode: analysisCase.surfaceMode,
  };

  if (result.status === "blocked") {
    return {
      ...base,
      state: "blocked",
      methods: [],
      warnings: [result.diagnostic.message],
      error: result.diagnostic.message,
    };
  }

  const warnings: string[] = [];
  if (result.geometricCount < result.grid.total) {
    warnings.push(
      `Descartes na geometria: ${result.grid.total - result.geometricCount} de ${result.grid.total} círculo(s).`,
    );
  }

  const methods: CaseMethodSummary[] = result.rankings.map((ranking) => {
    const label = methodLabel(ranking.method);
    const notes: string[] = [];
    if (ranking.minimum) {
      if (ranking.minimum.boundaryAxes.length > 0) {
        notes.push(
          `${label}: mínimo na borda amostrada (${ranking.minimum.boundaryAxes
            .map((a) => axisLabels[a])
            .join(", ")}).`,
        );
      }
      const exactTies = ranking.ties.filter((t) => t.difference === 0).length;
      if (exactTies > 0) {
        notes.push(`${label}: ${exactTies} empate(s) exato(s) na malha.`);
      }
      if (ranking.ties.length > exactTies) {
        notes.push(
          `${label}: ${ranking.ties.length - exactTies} quase empate(s) na faixa configurada.`,
        );
      }
    }
    if (ranking.zeroResistance > 0) {
      notes.push(
        `${label}: resistência física nula em ${ranking.zeroResistance} círculo(s).`,
      );
    }
    if (ranking.failed > 0) {
      notes.push(
        `${label}: cobertura parcial (${ranking.failed} falha(s) após geometria preparada).`,
      );
    }
    warnings.push(...notes);

    const minCandidate = ranking.minimum
      ? result.candidates.find(
          (c) => c.location.number === ranking.minimum!.location.number,
        )
      : undefined;

    return {
      method: ranking.method,
      status: ranking.minimum
        ? "calculated"
        : ranking.status === "minimum"
          ? "no-factor"
          : ranking.status,
      factorOfSafety: ranking.minimum?.factorOfSafety ?? null,
      surface: ranking.minimum?.location.circle ?? null,
      sliceCount: minCandidate?.sliceCount ?? null,
      notes,
    };
  });

  return {
    ...base,
    state: "completed",
    progress: { completed: result.grid.total, total: result.grid.total },
    methods,
    warnings,
    counts: { total: result.grid.total, geometric: result.geometricCount },
  };
}

export function runCasesBatch({
  project,
  caseIds,
  onUpdate,
  onComplete,
  searchRunner = startSearchWorker,
}: {
  project: Project;
  caseIds: string[];
  onUpdate: (caseId: string, record: CaseRunRecord) => void;
  onComplete?: () => void;
  searchRunner?: SearchRunner;
}): BatchExecutionHandle {
  let cancelled = false;
  let activeCancel: (() => void) | null = null;
  let activeCaseId: string | null = null;

  const queuedIds = caseIds.filter((id) =>
    project.analysisCases.some((c) => c.id === id),
  );
  const finishedIds = new Set<string>();

  for (const id of queuedIds) {
    const c = project.analysisCases.find((item) => item.id === id)!;
    const prep = prepareCoreInput(project, id);
    onUpdate(id, {
      caseId: id,
      sectionId: c.sectionId,
      state: "queued",
      inputRevision: prep.snapshot?.revision ?? null,
      profileRevision: profileRevision(c.numericalProfile),
      surfaceMode: c.surfaceMode,
      methods: [],
      warnings: [],
    });
  }

  const markRemainingCancelled = () => {
    for (const id of queuedIds) {
      if (finishedIds.has(id)) continue;
      const c = project.analysisCases.find((item) => item.id === id);
      if (!c) continue;
      const prep = prepareCoreInput(project, id);
      finishedIds.add(id);
      onUpdate(id, {
        caseId: id,
        sectionId: c.sectionId,
        state: "cancelled",
        inputRevision: prep.snapshot?.revision ?? null,
        profileRevision: profileRevision(c.numericalProfile),
        surfaceMode: c.surfaceMode,
        methods: [],
        warnings: ["Execução cancelada antes da conclusão deste caso."],
      });
    }
  };

  const done = (async () => {
    try {
      for (const id of queuedIds) {
        if (cancelled) break;
        const c = project.analysisCases.find((item) => item.id === id);
        if (!c) {
          finishedIds.add(id);
          continue;
        }

        const prep = prepareCoreInput(project, id);
        const inputRev = prep.snapshot?.revision ?? null;
        const profRev = profileRevision(c.numericalProfile);
        activeCaseId = id;

        onUpdate(id, {
          caseId: id,
          sectionId: c.sectionId,
          state: "running",
          inputRevision: inputRev,
          profileRevision: profRev,
          surfaceMode: c.surfaceMode,
          methods: [],
          warnings: [],
        });

        try {
          if (prep.status !== "collected" || !prep.snapshot) {
            const messages = prep.diagnostics
              .filter((d) => d.level !== "info")
              .map((d) => d.message);
            finishedIds.add(id);
            onUpdate(id, {
              caseId: id,
              sectionId: c.sectionId,
              state: "blocked",
              inputRevision: inputRev,
              profileRevision: profRev,
              surfaceMode: c.surfaceMode,
              methods: [],
              warnings: messages,
              error: messages[0] ?? "Entradas do caso pendentes.",
            });
            continue;
          }

          const profileStatus = isNumericalProfileComplete(c);
          if (!profileStatus.ok) {
            finishedIds.add(id);
            onUpdate(id, {
              caseId: id,
              sectionId: c.sectionId,
              state: "blocked",
              inputRevision: inputRev,
              profileRevision: profRev,
              surfaceMode: c.surfaceMode,
              methods: [],
              warnings: [profileStatus.missingMessage!],
              error: profileStatus.missingMessage,
            });
            continue;
          }

          if (c.surfaceMode === "fixed") {
            const record = runFixedCase(project, c);
            if (!cancelled) {
              finishedIds.add(id);
              onUpdate(id, record);
            }
            continue;
          }

          if (c.surfaceMode === "search") {
            const sp = c.numericalProfile.search;
            const hasBishop = c.methods.includes("bishop");
            const searchProfile: CircularSearchProfile = {
              geometry: {
                toleranceM: sp.geometry.toleranceM!,
                maxArcDegrees: sp.geometry.maxArcDegrees!,
              },
              equilibrium: {
                drivingThresholdKNPerM: sp.equilibrium.drivingThresholdKNPerM!,
                tensionToleranceKPa: sp.equilibrium.tensionToleranceKPa!,
              },
              nearTieTolerance: sp.nearTieTolerance!,
              bishop: hasBishop
                ? {
                    initialFactor: sp.bishop.initialFactor!,
                    residualTolerance: sp.bishop.residualTolerance!,
                    maxIterations: sp.bishop.maxIterations!,
                    singularityThreshold: sp.bishop.singularityThreshold!,
                  }
                : null,
            };

            const axes =
              prep.snapshot.input.surface.mode === "search"
                ? prep.snapshot.input.surface.axes
                : null;
            if (!axes) {
              finishedIds.add(id);
              onUpdate(id, {
                caseId: id,
                sectionId: c.sectionId,
                state: "blocked",
                inputRevision: inputRev,
                profileRevision: profRev,
                surfaceMode: c.surfaceMode,
                methods: [],
                warnings: ["Limites da busca circular ausentes."],
                error: "Limites da busca circular ausentes.",
              });
              continue;
            }

            const gridCheck = prepareSearchGrid(
              axes,
              searchProfile.geometry.toleranceM,
            );
            if (gridCheck.status === "blocked") {
              finishedIds.add(id);
              onUpdate(id, {
                caseId: id,
                sectionId: c.sectionId,
                state: "blocked",
                inputRevision: inputRev,
                profileRevision: profRev,
                surfaceMode: c.surfaceMode,
                methods: [],
                warnings: [gridCheck.message],
                error: gridCheck.message,
              });
              continue;
            }

            await new Promise<void>((resolve) => {
              let settled = false;
              const finish = () => {
                if (settled) return;
                settled = true;
                activeCancel = null;
                resolve();
              };

              try {
                const stop = searchRunner(
                  { type: "run", preparation: prep, profile: searchProfile },
                  (response) => {
                    if (cancelled) {
                      finish();
                      return;
                    }
                    if (response.type === "progress") {
                      onUpdate(id, {
                        caseId: id,
                        sectionId: c.sectionId,
                        state: "running",
                        inputRevision: inputRev,
                        profileRevision: profRev,
                        progress: response.progress,
                        surfaceMode: c.surfaceMode,
                        methods: [],
                        warnings: [],
                      });
                    } else if (response.type === "result") {
                      finishedIds.add(id);
                      onUpdate(
                        id,
                        mapSearchCompleted(c, inputRev, response.result),
                      );
                      finish();
                    } else if (response.type === "error") {
                      finishedIds.add(id);
                      onUpdate(id, {
                        caseId: id,
                        sectionId: c.sectionId,
                        state: "failed",
                        inputRevision: inputRev,
                        profileRevision: profRev,
                        surfaceMode: c.surfaceMode,
                        methods: [],
                        warnings: [response.message],
                        error: response.message,
                      });
                      finish();
                    }
                  },
                );
                activeCancel = () => {
                  stop();
                  finish();
                };
                if (cancelled) activeCancel();
              } catch (err) {
                if (!cancelled) {
                  const message =
                    err instanceof Error && err.message
                      ? err.message
                      : "Não foi possível iniciar a busca circular.";
                  finishedIds.add(id);
                  onUpdate(id, {
                    caseId: id,
                    sectionId: c.sectionId,
                    state: "failed",
                    inputRevision: inputRev,
                    profileRevision: profRev,
                    surfaceMode: c.surfaceMode,
                    methods: [],
                    warnings: [message],
                    error: message,
                  });
                }
                finish();
              }
            });
          }
        } catch (err) {
          if (!cancelled) {
            const message =
              err instanceof Error && err.message
                ? err.message
                : "Erro inesperado ao calcular o caso.";
            finishedIds.add(id);
            onUpdate(id, {
              caseId: id,
              sectionId: c.sectionId,
              state: "failed",
              inputRevision: inputRev,
              profileRevision: profRev,
              surfaceMode: c.surfaceMode,
              methods: [],
              warnings: [message],
              error: message,
            });
          }
        }
      }

      if (cancelled) markRemainingCancelled();
    } finally {
      activeCaseId = null;
      activeCancel = null;
      onComplete?.();
    }
  })();

  return {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      if (activeCaseId && !finishedIds.has(activeCaseId)) {
        activeCancel?.();
      }
      markRemainingCancelled();
    },
  };
}
