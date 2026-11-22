import { useState } from "react";
import type { InputPreparation } from "../core/input";
import type { SliceMechanicsPreparation } from "../core/slice-mechanics";
import type { FelleniusResult } from "../core/fellenius";
import type { BishopResult } from "../core/bishop";
import type { NumericalProfile } from "../domain/model";
import { FelleniusPanel } from "./FelleniusPanel";
import { BishopPanel, formatResultNumber } from "./BishopPanel";
import type { FixedCaseCalculation } from "../lib/case-calculation";

type Evaluation<T> = {
  mechanics: SliceMechanicsPreparation | null;
  result: T | null;
} | null;
export function FixedCircleMethods({
  preparation,
  mechanics,
  initialProfile,
  onProfileChange,
  calculatedMethods,
  executionBlocked = false,
}: {
  preparation: InputPreparation;
  mechanics: SliceMechanicsPreparation | null;
  initialProfile: NumericalProfile;
  calculatedMethods?: FixedCaseCalculation["methods"];
  executionBlocked?: boolean;
  onProfileChange: (
    group: "fellenius" | "bishop",
    fields: Record<string, string>,
  ) => void;
}) {
  const [fellenius, setFellenius] = useState<Evaluation<FelleniusResult>>(null);
  const [bishop, setBishop] = useState<Evaluation<BishopResult>>(null);
  const f = executionBlocked
    ? null
    : (calculatedMethods?.find(
        (r): r is FelleniusResult => r.method === "fellenius",
      ) ?? (fellenius?.mechanics === mechanics ? fellenius.result : null));
  const b = executionBlocked
    ? null
    : (calculatedMethods?.find(
        (r): r is BishopResult => r.method === "bishop",
      ) ?? (bishop?.mechanics === mechanics ? bishop.result : null));
  const bothSelected =
    preparation.snapshot?.input.analysis.methods.length === 2;
  const sameThresholds =
    f &&
    b &&
    f.profile.drivingThresholdKNPerM === b.profile.drivingThresholdKNPerM &&
    f.profile.tensionToleranceKPa === b.profile.tensionToleranceKPa;
  const comparable =
    sameThresholds && f.status === "calculated" && b.status === "calculated";
  const status = (r: FelleniusResult | BishopResult | null) =>
    !r
      ? "Aguardando cálculo"
      : r.status === "calculated"
        ? `FS = ${formatResultNumber(r.factorOfSafety)}`
        : r.status === "zero-resistance"
          ? "Resistência nula"
          : r.status === "nonconverged"
            ? "Sem convergência"
            : "Rejeitado";
  return (
    <>
      <FelleniusPanel
        preparation={preparation}
        mechanics={mechanics}
        suppliedResult={f}
        executionBlocked={executionBlocked}
        initialProfile={initialProfile.fellenius}
        onProfileChange={(fields) => onProfileChange("fellenius", fields)}
        onResult={(result) => setFellenius({ mechanics, result })}
      />
      <BishopPanel
        preparation={preparation}
        mechanics={mechanics}
        suppliedResult={b}
        executionBlocked={executionBlocked}
        initialProfile={initialProfile.bishop}
        onProfileChange={(fields) => onProfileChange("bishop", fields)}
        onResult={(result) => setBishop({ mechanics, result })}
      />
      {bothSelected && (
        <section
          className="method-panel"
          aria-label="Comparação no mesmo círculo"
        >
          <h3>Comparar métodos</h3>
          <p className="hint">
            Mesma entrada aplicada e mesmas fatias. Cada método conserva seus
            próprios diagnósticos.
          </p>
          <dl className="method-comparison">
            <dt>Fellenius</dt>
            <dd>{status(f)}</dd>
            <dt>Bishop Simplificado</dt>
            <dd>{status(b)}</dd>
          </dl>
          {comparable && (
            <p aria-label="Diferença entre métodos">
              ΔFS (Bishop − Fellenius) ={" "}
              {formatResultNumber(b.factorOfSafety! - f.factorOfSafety!)}.
            </p>
          )}
          {f && b && !sameThresholds && (
            <p>
              Os limiares τD ou τt são diferentes. Iguale os valores e recalcule
              para comparar a diferença.
            </p>
          )}
          {f && b && sameThresholds && !comparable && (
            <p>
              A diferença exige dois resultados positivos admissíveis. Consulte
              os diagnósticos de cada método.
            </p>
          )}
          <p className="hint">
            Comparação do círculo informado; sem classificação de estabilidade
            ou seleção de superfície crítica.
          </p>
        </section>
      )}
    </>
  );
}
