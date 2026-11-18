import { useState } from "react";
import {
  solveBishop,
  MAX_BISHOP_ITERATIONS,
  type BishopProfile,
  type BishopResult,
} from "../core/bishop";
import type { InputPreparation } from "../core/input";
import type { SliceMechanicsPreparation } from "../core/slice-mechanics";
import { parseNumber } from "../domain/geometry";
import type { NumericalProfile } from "../domain/model";
import { Dialog } from "./Dialog";

export const formatResultNumber = (n: number) =>
  n.toLocaleString("pt-BR", {
    maximumSignificantDigits: 8,
    notation: n !== 0 && Math.abs(n) < 1e-6 ? "scientific" : "standard",
  });
const number = (n: number | null) => (n === null ? "—" : formatResultNumber(n));
const fields: { key: keyof BishopProfile; label: string; hint: string }[] = [
  {
    key: "initialFactor",
    label: "Fator inicial F₀",
    hint: "Adimensional; positivo.",
  },
  {
    key: "residualTolerance",
    label: "Tolerância do resíduo τF",
    hint: "Adimensional; positiva. Verifica |G(F) − F|.",
  },
  {
    key: "maxIterations",
    label: "Máximo de avaliações K",
    hint: `Inteiro de 1 a ${MAX_BISHOP_ITERATIONS}.`,
  },
  {
    key: "singularityThreshold",
    label: "Limiar de singularidade τm",
    hint: "Adimensional; não negativo. Exige mα > τm.",
  },
  {
    key: "drivingThresholdKNPerM",
    label: "Limiar motriz τD (kN/m)",
    hint: "Não negativo; exige D > τD.",
  },
  {
    key: "tensionToleranceKPa",
    label: "Tolerância de tração τt (kPa)",
    hint: "Não negativa; verificada após convergir.",
  },
];
const emptyFields: Record<keyof BishopProfile, string> = {
  initialFactor: "",
  residualTolerance: "",
  maxIterations: "",
  singularityThreshold: "",
  drivingThresholdKNPerM: "",
  tensionToleranceKPa: "",
};
export function BishopPanel({
  preparation,
  mechanics,
  onResult,
  initialProfile,
  onProfileChange,
}: {
  preparation: InputPreparation;
  mechanics: SliceMechanicsPreparation | null;
  onResult: (result: BishopResult | null) => void;
  initialProfile: NumericalProfile["bishop"];
  onProfileChange: (fields: Record<string, string>) => void;
}) {
  const [values, setValues] = useState(() => {
    const values = { ...emptyFields };
    for (const { key } of fields)
      values[key] = String(initialProfile[key] ?? "");
    return values;
  });
  const [evaluation, setEvaluation] = useState<{
    mechanics: SliceMechanicsPreparation;
    result: BishopResult;
  } | null>(null);
  const [inspect, setInspect] = useState(false);
  const result = evaluation?.mechanics === mechanics ? evaluation.result : null;
  const selected =
    preparation.snapshot?.input.analysis.methods.includes("bishop");
  const last = result?.calculation?.evaluation;
  const calculate = () => {
    if (!selected || !mechanics) return;
    const profile = Object.fromEntries(
      fields.map(({ key }) => [key, parseNumber(values[key]) ?? NaN]),
    ) as BishopProfile;
    const result = solveBishop(preparation, mechanics, profile);
    setEvaluation({ mechanics, result });
    onResult(result);
  };
  return (
    <section className="method-panel" aria-label="Bishop no círculo fixo">
      <h3>Bishop Simplificado · círculo fixo</h3>
      <p className="hint">
        Iteração de ponto fixo com perfil explícito. Informe todos os
        parâmetros; zero é permitido apenas nos limiares τm, τD e τt.
      </p>
      {fields.map(({ key, label, hint }) => (
        <label className="field" key={key}>
          <span>{label}</span>
          <input
            aria-label={`Bishop · ${label}`}
            inputMode={key === "maxIterations" ? "numeric" : "decimal"}
            value={values[key]}
            onChange={(e) => {
              const next = { ...values, [key]: e.target.value };
              setValues(next);
              onProfileChange(next);
              setEvaluation(null);
              onResult(null);
            }}
          />
          <small className="hint">{hint}</small>
        </label>
      ))}
      {!selected && (
        <p>
          Selecione Bishop Simplificado nos métodos do caso e aplique a
          alteração.
        </p>
      )}
      <button
        className="secondary"
        type="button"
        disabled={!selected || mechanics?.status !== "prepared"}
        onClick={calculate}
      >
        Calcular Bishop
      </button>
      {result && (
        <div aria-live="polite">
          {result.status === "calculated" ? (
            <p aria-label="Fator de segurança Bishop">
              <strong>FS = {number(result.factorOfSafety)}</strong> · círculo
              fixo.
            </p>
          ) : (
            <p>
              <strong>
                {result.status === "nonconverged"
                  ? "Sem convergência"
                  : result.status === "zero-resistance"
                    ? "Resistência nula"
                    : "Cálculo rejeitado"}
                ; FS indisponível.
              </strong>
            </p>
          )}
          {last && (
            <p aria-label="Convergência de Bishop">
              Avaliações: {result.iterations.length} · último resíduo completo:{" "}
              {number(last.residual)} · τF ={" "}
              {number(result.profile.residualTolerance)}.
            </p>
          )}
          {!!result.diagnostics.length && (
            <ul aria-label="Diagnósticos de Bishop">
              {result.diagnostics.map((d, i) => (
                <li key={i}>
                  {d.level === "warning" ? "Aviso: " : ""}
                  {d.message}
                  {d.value !== undefined && <> Valor: {number(d.value)}.</>}
                  {d.threshold !== undefined && (
                    <> Limiar: {number(d.threshold)}.</>
                  )}
                  {d.iteration !== undefined && <> Avaliação: {d.iteration}.</>}
                </li>
              ))}
            </ul>
          )}
          {result.calculation && (
            <button
              className="secondary"
              type="button"
              onClick={() => setInspect(true)}
            >
              Inspecionar Bishop
            </button>
          )}
        </div>
      )}
      <p className="hint">
        Perfil e resultado somente nesta sessão. Confira convergência, parcelas
        e sensibilidade ao refinamento; sem busca crítica ou aprovação de
        estabilidade.
      </p>
      {inspect && result && result.calculation && (
        <Dialog
          title="Inspeção de Bishop"
          wide
          onClose={() => setInspect(false)}
          description="Perfil, trajetória de convergência e parcelas por fatia no F avaliado; formulação USACE F-4/F-6 com ue b."
        >
          <BishopInspection result={result} />
        </Dialog>
      )}
    </section>
  );
}

export function BishopInspection({ result }: { result: BishopResult }) {
  if (!result.calculation) return null;
  const last = result.calculation.evaluation;
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
      <p aria-label="Perfil de Bishop">
        F₀ = {number(result.profile.initialFactor)} · τF ={" "}
        {number(result.profile.residualTolerance)} · K ={" "}
        {result.profile.maxIterations} · τm ={" "}
        {number(result.profile.singularityThreshold)} · τD ={" "}
        {number(result.profile.drivingThresholdKNPerM)} kN/m · τt ={" "}
        {number(result.profile.tensionToleranceKPa)} kPa · tolerância geométrica
        = {number(result.geometryProfile!.toleranceM)} m · abertura máxima ={" "}
        {number(result.geometryProfile!.maxArcDegrees)}
        °.
      </p>
      <div className="info-card" aria-label="Balanço de Bishop">
        <p>
          D = ΣW sin α + ΣMq/R ={" "}
          {number(result.calculation.weightDrivingKNPerM)} +{" "}
          {number(result.calculation.loadDrivingKNPerM)} ={" "}
          {number(result.calculation.drivingKNPerM)} kN/m.
        </p>
        <p>
          Limite de representação de D:{" "}
          {number(result.calculation.drivingRoundoffBoundKNPerM)} kN/m.
        </p>
        <p>
          {result.factorOfSafety === null
            ? "FS indisponível: ver diagnósticos."
            : `FS = ${number(result.factorOfSafety)}`}
        </p>
        {last && (
          <p>
            Última avaliação completa: {last.iteration} · F avaliado ={" "}
            {number(last.trialFactor)} · G(F) = {number(last.updatedFactor)} ·
            |G(F) − F| = {number(last.residual)} · numerador reduzido ={" "}
            {number(last.numeratorKNPerM)} kN/m.
          </p>
        )}
      </div>
      {!!result.diagnostics.length && (
        <ul aria-label="Diagnósticos na inspeção de Bishop">
          {result.diagnostics.map((d, i) => (
            <li key={i}>
              {d.message}
              {d.value !== undefined && <> Valor: {number(d.value)}.</>}
            </li>
          ))}
        </ul>
      )}
      <p>
        mα = cos α + sin α tan φ / F. A = [cb + (W + Q − ue b) tan φ] / mα. O FS
        mostrado é o F avaliado, cujo resíduo passou pelo limiar.
      </p>
      <div className="materials-table-wrap slice-table-wrap">
        <table className="materials-table" aria-label="Trajetória de Bishop">
          <thead>
            <tr>
              <th>Avaliação</th>
              <th>F avaliado</th>
              <th>G(F)</th>
              <th>Resíduo absoluto</th>
              <th>Menor mα verificado</th>
              <th>ΣA (kN/m)</th>
            </tr>
          </thead>
          <tbody>
            {result.iterations.map((row) => (
              <tr key={row.iteration}>
                <td>{row.iteration}</td>
                <td>{number(row.trialFactor)}</td>
                <td>{number(row.updatedFactor)}</td>
                <td>{number(row.residual)}</td>
                <td>{number(row.minM)}</td>
                <td>{number(row.numeratorKNPerM)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {last && (
        <>
          <p>
            Fatias da avaliação {last.iteration}, em F ={" "}
            {number(last.trialFactor)}. Normais são calculadas apenas quando o
            resíduo atende a τF; “—” significa não avaliada. N usado é efetivo
            nas bases efetivas e total nas totais. A inspeção também permanece
            disponível quando a tração rejeita a solução convergida.
          </p>
          <div className="materials-table-wrap slice-table-wrap">
            <table
              className="materials-table"
              aria-label="Parcelas de Bishop por fatia"
            >
              <thead>
                <tr>
                  <th>Ordem / fatia</th>
                  <th>Base / modo</th>
                  <th>mα</th>
                  <th>W sin α (kN/m)</th>
                  <th>ΣMq/R (kN/m)</th>
                  <th>A reduzida (kN/m)</th>
                  <th>N usado (kN/m)</th>
                  <th>N total (kN/m)</th>
                  <th>σr (kPa)</th>
                  <th>cℓ + N tan φ (kN/m)</th>
                </tr>
              </thead>
              <tbody>
                {last.slices.map((s) => (
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
                    <td>{number(s.m)}</td>
                    <td>{number(s.weightDrivingKNPerM)}</td>
                    <td>{number(s.loadDrivingKNPerM)}</td>
                    <td>{number(s.reducedResistanceKNPerM)}</td>
                    <td>{number(s.normalForResistanceKNPerM)}</td>
                    <td>{number(s.totalNormalKNPerM)}</td>
                    <td>{number(s.normalStressKPa)}</td>
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
                aria-label="Momentos das faixas em Bishop"
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
                  {last.slices.flatMap((s) =>
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
        </>
      )}
      <p className="hint">
        Consulte a entrada mecânica para conferir a origem dos parâmetros. O FS
        é exibido quando a convergência e a admissibilidade são confirmadas.
      </p>
    </div>
  );
}
