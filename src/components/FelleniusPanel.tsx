import { useState } from "react";
import { solveFellenius, type FelleniusResult } from "../core/fellenius";
import type { InputPreparation } from "../core/input";
import type { SliceMechanicsPreparation } from "../core/slice-mechanics";
import { parseNumber } from "../domain/geometry";
import type { NumericalProfile } from "../domain/model";
import { Dialog } from "./Dialog";

const number = (n: number) =>
  n.toLocaleString("pt-BR", {
    maximumSignificantDigits: 8,
    notation: n !== 0 && Math.abs(n) < 1e-6 ? "scientific" : "standard",
  });

export function FelleniusPanel({
  preparation,
  mechanics,
  onResult,
  initialProfile,
  onProfileChange,
}: {
  preparation: InputPreparation;
  mechanics: SliceMechanicsPreparation | null;
  onResult: (result: FelleniusResult | null) => void;
  initialProfile: NumericalProfile["fellenius"];
  onProfileChange: (fields: Record<string, string>) => void;
}) {
  const [driving, setDriving] = useState(() =>
    String(initialProfile.drivingThresholdKNPerM ?? ""),
  );
  const [tension, setTension] = useState(() =>
    String(initialProfile.tensionToleranceKPa ?? ""),
  );
  const [evaluation, setEvaluation] = useState<{
    mechanics: SliceMechanicsPreparation;
    result: FelleniusResult;
  } | null>(null);
  const [inspect, setInspect] = useState(false);
  const result = evaluation?.mechanics === mechanics ? evaluation.result : null;
  const data = result?.calculation;
  const selected =
    preparation.snapshot?.input.analysis.methods.includes("fellenius");
  const calculate = () => {
    if (!selected || !mechanics) return;
    const result = solveFellenius(preparation, mechanics, {
      drivingThresholdKNPerM: parseNumber(driving) ?? NaN,
      tensionToleranceKPa: parseNumber(tension) ?? NaN,
    });
    setEvaluation({ mechanics, result });
    onResult(result);
  };
  return (
    <section className="fellenius-panel" aria-label="Fellenius no círculo fixo">
      <h3>Fellenius · círculo fixo</h3>
      <p className="hint">
        Método de referência com pressão neutra projetada. O resultado
        corresponde somente ao círculo informado.
      </p>
      <label className="field">
        <span>Limiar motriz τD (kN/m)</span>
        <input
          aria-label="Limiar motriz τD (kN/m)"
          inputMode="decimal"
          value={driving}
          onChange={(e) => {
            setDriving(e.target.value);
            onProfileChange({
              drivingThresholdKNPerM: e.target.value,
              tensionToleranceKPa: tension,
            });
            setEvaluation(null);
            onResult(null);
          }}
        />
      </label>
      <label className="field">
        <span>Tolerância de tração τt (kPa)</span>
        <input
          aria-label="Tolerância de tração τt (kPa)"
          inputMode="decimal"
          value={tension}
          onChange={(e) => {
            setTension(e.target.value);
            onProfileChange({
              drivingThresholdKNPerM: driving,
              tensionToleranceKPa: e.target.value,
            });
            setEvaluation(null);
            onResult(null);
          }}
        />
      </label>
      <p className="hint">
        Informe valores não negativos. Zero aplica corte estrito. Os limiares
        são salvos neste caso de análise e não são critérios normativos.
      </p>
      {!selected && (
        <p>Selecione Fellenius nos métodos do caso e aplique a alteração.</p>
      )}
      <button
        className="secondary"
        type="button"
        disabled={!selected || mechanics?.status !== "prepared"}
        onClick={calculate}
      >
        Calcular Fellenius
      </button>
      {result && (
        <div aria-live="polite">
          {result.status === "calculated" && (
            <p aria-label="Fator de segurança Fellenius">
              <strong>FS = {number(result.factorOfSafety)}</strong> · círculo
              fixo.
            </p>
          )}
          {result.status === "zero-resistance" && (
            <p aria-label="Fator de segurança Fellenius">
              <strong>Resistência nula · FS = 0</strong> para este círculo.
            </p>
          )}
          {result.status === "rejected" && (
            <p>
              <strong>Cálculo rejeitado; FS indisponível.</strong>
            </p>
          )}
          {!!result.diagnostics.length && (
            <ul aria-label="Diagnósticos de Fellenius">
              {result.diagnostics.map((d, i) => (
                <li key={i}>
                  {d.level === "warning" ? "Aviso: " : ""}
                  {d.message}
                  {d.value !== undefined && <> Valor: {number(d.value)}.</>}
                  {d.threshold !== undefined && (
                    <> Limiar: {number(d.threshold)}.</>
                  )}
                </li>
              ))}
            </ul>
          )}
          {data && (
            <button
              className="secondary"
              type="button"
              onClick={() => setInspect(true)}
            >
              Inspecionar Fellenius
            </button>
          )}
        </div>
      )}
      <p className="hint">
        Sem busca crítica ou aprovação de estabilidade. Confira as parcelas e a
        sensibilidade ao refinamento.
      </p>
      {inspect && result && data && (
        <Dialog
          title="Inspeção de Fellenius"
          wide
          onClose={() => setInspect(false)}
          description="Normal aproximada, resistência e momentos por fatia; pressão neutra projetada conforme USACE C-12."
        >
          <FelleniusInspection result={result} />
        </Dialog>
      )}
    </section>
  );
}

export function FelleniusInspection({ result }: { result: FelleniusResult }) {
  const data = result.calculation;
  if (!data) return null;
  return (
    <div className="slice-inspection">
      <p>
        {result.source?.origin.analysisCase.name} ·{" "}
        {result.source?.direction === "left-to-right"
          ? "esquerda → direita"
          : "direita → esquerda"}{" "}
        · centro ({number(result.source!.center.x)};{" "}
        {number(result.source!.center.z)}) m · R ={" "}
        {number(result.source!.radiusM)} m.
      </p>
      <p aria-label="Perfil de Fellenius">
        τD = {number(result.profile.drivingThresholdKNPerM)} kN/m · τt ={" "}
        {number(result.profile.tensionToleranceKPa)} kPa · tolerância geométrica
        = {number(result.geometryProfile!.toleranceM)} m · abertura máxima ={" "}
        {number(result.geometryProfile!.maxArcDegrees)}
        °.
      </p>
      <p>
        Base pela corda; α positivo ao descer no sentido escolhido. N usado é
        efetivo para bases efetivas e total para bases totais. Valores negativos
        permanecem registrados.
      </p>
      <div className="info-card" aria-label="Balanço de Fellenius">
        <p>
          D = ΣW sin α + ΣMq/R = {number(data.weightDrivingKNPerM)} +{" "}
          {number(data.loadDrivingKNPerM)} ={" "}
          <strong>{number(data.drivingKNPerM)} kN/m</strong>.
        </p>
        <p>
          Resistência = Σcℓ + ΣN tan φ = {number(data.cohesionResistanceKNPerM)}{" "}
          + {number(data.frictionResistanceKNPerM)} ={" "}
          <strong>{number(data.resistanceKNPerM)} kN/m</strong>.
        </p>
        <p>
          {result.factorOfSafety === null
            ? "FS indisponível: ver diagnósticos."
            : `FS = ${number(result.factorOfSafety)}`}
        </p>
        <p>
          Limite de representação de D:{" "}
          {number(data.drivingRoundoffBoundKNPerM)} kN/m.
        </p>
      </div>
      {!!result.diagnostics.length && (
        <ul aria-label="Diagnósticos na inspeção de Fellenius">
          {result.diagnostics.map((d, i) => (
            <li key={i}>
              {d.message}
              {d.value !== undefined && <> Valor: {number(d.value)}.</>}
            </li>
          ))}
        </ul>
      )}
      <p>
        N = (W + Q − ue b) cos α · A = cℓ + N tan φ. Correção de água: ue b cos
        α = Ue cos² α.
      </p>
      <div className="materials-table-wrap slice-table-wrap">
        <table
          className="materials-table"
          aria-label="Parcelas de Fellenius por fatia"
        >
          <thead>
            <tr>
              <th>Ordem / fatia</th>
              <th>Base / modo</th>
              <th>W sin α (kN/m)</th>
              <th>ΣMq/R (kN/m)</th>
              <th>d (kN/m)</th>
              <th>ue b cos α (kN/m)</th>
              <th>N usado (kN/m)</th>
              <th>σr (kPa)</th>
              <th>cℓ (kN/m)</th>
              <th>N tan φ (kN/m)</th>
              <th>A (kN/m)</th>
            </tr>
          </thead>
          <tbody>
            {data.slices.map((s) => (
              <tr key={s.input.number}>
                <td>
                  {s.input.order} / {s.input.number}
                </td>
                <td>
                  {s.input.baseMaterial.name}
                  <small>
                    {s.input.baseMaterial.mode === "effective"
                      ? "Efetivas"
                      : "Totais"}
                  </small>
                </td>
                <td>{number(s.weightDrivingKNPerM)}</td>
                <td>{number(s.loadDrivingKNPerM)}</td>
                <td>{number(s.drivingKNPerM)}</td>
                <td>{number(s.projectedWaterKNPerM)}</td>
                <td>{number(s.normalForResistanceKNPerM)}</td>
                <td>{number(s.normalStressKPa)}</td>
                <td>{number(s.cohesionResistanceKNPerM)}</td>
                <td>{number(s.frictionResistanceKNPerM)}</td>
                <td>{number(s.resistanceKNPerM)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Momentos próprios das faixas</summary>
        <div className="materials-table-wrap slice-table-wrap">
          <table
            className="materials-table"
            aria-label="Momentos das faixas em Fellenius"
          >
            <thead>
              <tr>
                <th>Fatia</th>
                <th>Faixa (ID)</th>
                <th>Q (kN/m)</th>
                <th>Braço (m)</th>
                <th>Mq (kN·m/m)</th>
                <th>Mq/R (kN/m)</th>
              </tr>
            </thead>
            <tbody>
              {data.slices.flatMap((s) =>
                s.input.surcharge.contributions.map((l, i) => (
                  <tr key={`${s.input.number}-${i}`}>
                    <td>{s.input.number}</td>
                    <td>{l.loadId}</td>
                    <td>{number(l.forceKNPerM)}</td>
                    <td>{number(l.armDrivingM!)}</td>
                    <td>{number(l.momentDrivingKNmPerM!)}</td>
                    <td>{number(s.loadDriving[i].valueKNPerM)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
      <p className="hint">
        Consulte a entrada mecânica para conferir a origem dos parâmetros de
        cada fatia.
      </p>
    </div>
  );
}
