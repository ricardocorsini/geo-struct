// Contrato de transferência de entradas. Não define admissibilidade ou equações.
// Este módulo não depende do editor, React, Tauri ou de APIs do navegador.
export type Immutable<T> = T extends object
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T;

export type PointXZ = { x: number; z: number };
type SearchAxis = {
  min: number | null;
  max: number | null;
  step: number | null;
};

export type CoreInput = Immutable<{
  contract: "geostruct-input/1";
  stage: "inputs-only";
  origin: {
    projectFormat: "geostruct/5";
    project: { id: string; name: string };
    section: { id: string; name: string };
    analysisCase: { id: string; name: string };
  };
  units: {
    length: "m";
    force: "kN";
    stress: "kPa";
    unitWeight: "kN/m³";
    angle: "deg";
  };
  coordinates: { frame: "project"; horizontal: "X"; vertical: "Z"; up: "+Z" };
  analysis: {
    assumptions: string;
    direction: "left-to-right" | "right-to-left" | null;
    methods: ("bishop" | "fellenius")[];
  };
  geometry: {
    terrain: PointXZ[];
    baseZ: number;
    backgroundMaterialId: string | null;
    regions: {
      id: string;
      name: string;
      materialId: string | null;
      points: PointXZ[];
    }[];
  };
  materials: {
    id: string;
    name: string;
    unitWeight: number | null;
    cohesion: number | null;
    frictionDegrees: number | null;
    parameterMode: "effective" | "total" | null;
    source: string;
  }[];
  water: {
    selection: "section" | "dry" | "piezometric" | null;
    mode: "unspecified" | "dry" | "piezometric";
    source: string;
    // Só pertencem à entrada efetiva quando o modo é piezométrico.
    line: PointXZ[] | null;
    unitWeight: number | null;
  };
  loads: {
    selection: "section" | "none" | "selected" | null;
    condition: "unspecified" | "none" | "loads";
    items: {
      id: string;
      name: string;
      x1: number;
      x2: number;
      q: number | null;
      source: string;
    }[];
  };
  surface:
    | { mode: null }
    | {
        mode: "fixed";
        circle: { x: number | null; z: number | null; radius: number | null };
      }
    | {
        mode: "search";
        axes: { x: SearchAxis; z: SearchAxis; radius: SearchAxis };
      };
}>;

export type InputDiagnostic = Immutable<{
  code: "invalid-project" | "case-not-found" | "model-diagnostic";
  level: "info" | "warning" | "error";
  message: string;
  target?: string;
  sectionId?: string;
  path?: string[];
}>;

export type InputSnapshot = Immutable<{
  input: CoreInput;
  // Serialização exata e determinística das entradas, não um hash abreviado.
  revision: string;
}>;

export type InputPreparation = Immutable<
  | {
      status: "unavailable";
      snapshot: null;
      diagnostics: InputDiagnostic[];
    }
  | {
      // "collected" significa apenas ausência de pendências de cadastro.
      status: "pending" | "collected";
      snapshot: InputSnapshot;
      diagnostics: InputDiagnostic[];
    }
>;
