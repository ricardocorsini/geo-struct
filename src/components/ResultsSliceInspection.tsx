import type { SearchMethod } from "../core/circular-search";
import type { ResultSurface } from "../lib/case-results";
import { methodLabel } from "../domain/analysis";
import { formatResultNumber } from "./BishopPanel";

const number = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : formatResultNumber(value);

export function ResultsSliceInspection({
  surface,
  sliceNumber,
  method,
}: {
  surface: ResultSurface;
  sliceNumber: number;
  method: SearchMethod | null;
}) {
  const geometry = surface.geometry.geometry;
  const slice = geometry?.slices.find((item) => item.number === sliceNumber);
  if (!slice) return null;
  const preparations = surface.preparations;
  const mechanics = preparations?.mechanics;
  const input =
    mechanics?.status === "prepared"
      ? mechanics.mechanics.slices.find((item) => item.number === sliceNumber)
      : null;
  const weights = preparations?.weights;
  const weight =
    weights?.status === "prepared"
      ? weights.weights.slices.find((item) => item.number === sliceNumber)
      : null;
  const pressures = preparations?.pressures;
  const pressure =
    pressures?.status === "prepared"
      ? pressures.pressures.slices.find((item) => item.number === sliceNumber)
      : null;
  const loads = preparations?.loads;
  const load =
    loads?.status === "prepared"
      ? loads.loads.slices.find((item) => item.number === sliceNumber)
      : null;
  const result = surface.methods.find((item) => item.method === method);
  const fellenius =
    result?.method === "fellenius"
      ? result.calculation?.slices.find(
          (item) => item.input.number === sliceNumber,
        )
      : null;
  const bishop =
    result?.method === "bishop"
      ? result.calculation?.evaluation?.slices.find(
          (item) => item.input.number === sliceNumber,
        )
      : null;
  const evaluated = fellenius ?? bishop;
  const rows: [string, number | null | undefined][] = [
    ["Área (m²)", slice.areaM2],
    ["Largura b (m)", slice.widthM],
    ["Base ℓ (m)", slice.chordLengthM],
    ["Inclinação α (°)", input ? (input.alphaRadians * 180) / Math.PI : null],
    ["Peso próprio W (kN/m)", weight?.weightKNPerM],
    ["Sobrecarga Q (kN/m)", load?.forceKNPerM],
    ["Pressão física u (kPa)", pressure?.pressureKPa],
    ["Pressão usada ue (kPa)", input?.water.usedPressureKPa],
    ["Resultante física U (kN/m)", input?.water.physicalBaseResultantKNPerM],
    ["Resultante usada Ue (kN/m)", input?.water.usedBaseResultantKNPerM],
    ["Coesão c (kPa)", input?.baseMaterial.cohesionKPa],
    ["Atrito φ (°)", input?.baseMaterial.frictionDegrees],
    ["Normal usada (kN/m)", evaluated?.normalForResistanceKNPerM],
    ["Tensão normal (kPa)", evaluated?.normalStressKPa],
    ["Resistência (kN/m)", evaluated?.resistanceKNPerM],
    ["Parcela motriz do peso (kN/m)", evaluated?.weightDrivingKNPerM],
    ["Parcela motriz das faixas (kN/m)", evaluated?.loadDrivingKNPerM],
  ];
  if (fellenius)
    rows.push(
      ["Resistência por coesão (kN/m)", fellenius.cohesionResistanceKNPerM],
      ["Resistência por atrito (kN/m)", fellenius.frictionResistanceKNPerM],
    );
  if (bishop)
    rows.push(
      ["Coeficiente mα", bishop.m],
      ["Parcela reduzida A (kN/m)", bishop.reducedResistanceKNPerM],
      ["Normal total (kN/m)", bishop.totalNormalKNPerM],
    );
  return (
    <section
      aria-label={`Parcelas da fatia ${sliceNumber}`}
      className="results-slice-inspection"
    >
      <h3>Fatia {sliceNumber}</h3>
      <p className="hint">
        Numeração original · X = {number(slice.left.x)} a{" "}
        {number(slice.right.x)} m.
        {method && <> {methodLabel(method)}.</>}
      </p>
      {input && (
        <p>
          {input.baseMaterial.name} · parâmetros{" "}
          {input.baseMaterial.mode === "effective" ? "efetivos" : "totais"}.
        </p>
      )}
      {result?.method === "bishop" && result.calculation?.evaluation && (
        <p className="hint" aria-label="Avaliação de Bishop da fatia">
          Avaliação {result.calculation.evaluation.iteration} em F ={" "}
          {number(result.calculation.evaluation.trialFactor)}; resíduo ={" "}
          {number(result.calculation.evaluation.residual)}.
          {result.status !== "calculated" &&
            " Última avaliação disponível para diagnóstico; não é uma solução admissível."}
        </p>
      )}
      <dl
        className="results-values"
        aria-label="Grandezas da fatia selecionada"
      >
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{number(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        “—” indica grandeza indisponível ou não avaliada. Zero é um valor
        calculado.
        {result &&
          result.status !== "calculated" &&
          " As parcelas disponíveis não tornam o FS admissível."}
      </p>
    </section>
  );
}
