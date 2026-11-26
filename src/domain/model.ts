import { z } from "zod";
import { MAX_BISHOP_ITERATIONS } from "../core/bishop";

const positiveNumber = z.number().finite().positive().nullable();
const nonnegativeNumber = z.number().finite().min(0).nullable();
const numericalGeometrySchema = z
  .object({
    toleranceM: positiveNumber,
    maxArcDegrees: z.number().finite().positive().max(3).nullable(),
  })
  .strict();
const numericalEquilibriumSchema = z
  .object({
    drivingThresholdKNPerM: nonnegativeNumber,
    tensionToleranceKPa: nonnegativeNumber,
  })
  .strict();
const numericalBishopIterationSchema = z
  .object({
    initialFactor: positiveNumber,
    residualTolerance: positiveNumber,
    maxIterations: z
      .number()
      .finite()
      .int()
      .min(1)
      .max(MAX_BISHOP_ITERATIONS)
      .nullable(),
    singularityThreshold: nonnegativeNumber,
  })
  .strict();
export const numericalProfileSchema = z
  .object({
    geometry: numericalGeometrySchema,
    fellenius: numericalEquilibriumSchema,
    bishop: numericalEquilibriumSchema.extend(
      numericalBishopIterationSchema.shape,
    ),
    search: z
      .object({
        geometry: numericalGeometrySchema,
        equilibrium: numericalEquilibriumSchema,
        bishop: numericalBishopIterationSchema,
        nearTieTolerance: nonnegativeNumber,
      })
      .strict(),
  })
  .strict();
export type NumericalProfile = z.infer<typeof numericalProfileSchema>;

export function emptyNumericalProfile(): NumericalProfile {
  const geometry = () => ({ toleranceM: null, maxArcDegrees: 3 });
  const equilibrium = () => ({
    drivingThresholdKNPerM: null,
    tensionToleranceKPa: null,
  });
  const bishop = () => ({
    initialFactor: null,
    residualTolerance: null,
    maxIterations: null,
    singularityThreshold: null,
  });
  return {
    geometry: geometry(),
    fellenius: equilibrium(),
    bishop: { ...equilibrium(), ...bishop() },
    search: {
      geometry: geometry(),
      equilibrium: equilibrium(),
      bishop: bishop(),
      nearTieTolerance: null,
    },
  };
}

const coordinate = z.number().finite().min(-1e6).max(1e6);
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1, "Informe um nome.").max(120);
const pointSchema = z.object({ x: coordinate, y: coordinate }).strict();
const points = z.array(pointSchema).max(500);
const radius = z
  .number()
  .finite()
  .positive("O raio deve ser maior que zero.")
  .max(1e6);
const searchAxis = z
  .object({
    min: coordinate.nullable(),
    max: coordinate.nullable(),
    step: z
      .number()
      .finite()
      .positive("O passo deve ser maior que zero.")
      .max(2e6)
      .nullable(),
  })
  .strict();
const waterUnitWeightSchema = z
  .number()
  .finite()
  .positive("O peso específico da água deve ser maior que zero.")
  .max(100, "O limite de cadastro do peso específico da água é 100 kN/m³.")
  .nullable();
export const analysisCaseSchema = z
  .object({
    id,
    name,
    sectionId: id,
    description: z.string().max(2000),
    direction: z.enum(["left-to-right", "right-to-left"]).nullable(),
    methods: z
      .array(z.enum(["bishop", "fellenius"]))
      .max(2)
      .refine((v) => new Set(v).size === v.length, "Métodos repetidos."),
    surfaceMode: z.enum(["fixed", "search"]).nullable(),
    numericalProfile: numericalProfileSchema,
    fixedCircle: z
      .object({
        x: coordinate.nullable(),
        y: coordinate.nullable(),
        radius: radius.nullable(),
      })
      .strict(),
    search: z
      .object({
        x: searchAxis,
        y: searchAxis,
        radius: searchAxis.extend({
          min: radius.nullable(),
          max: radius.nullable(),
        }),
      })
      .strict(),
    waterCondition: z
      .enum(["section", "dry", "piezometric", "case-piezometric"])
      .nullable(),
    water: points.nullable(),
    waterUnitWeight: waterUnitWeightSchema,
    waterSource: z.string().max(2000),
    loadCondition: z.enum(["section", "none", "selected"]).nullable(),
    loadIds: z
      .array(id)
      .max(100)
      .refine((v) => new Set(v).size === v.length, "Faixas repetidas no caso."),
  })
  .strict();
export const materialSchema = z
  .object({
    id,
    name,
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    gamma: z
      .number()
      .finite()
      .positive("O peso específico deve ser maior que zero.")
      .max(100, "O limite de cadastro do peso específico é 100 kN/m³.")
      .nullable(),
    cohesion: z
      .number()
      .finite()
      .min(0, "A coesão não pode ser negativa.")
      .max(1e6, "O limite de cadastro da coesão é 1.000.000 kPa.")
      .nullable(),
    friction: z
      .number()
      .finite()
      .min(0, "O atrito não pode ser negativo.")
      .lt(90, "O atrito deve ser menor que 90°.")
      .nullable(),
    mode: z.enum(["effective", "total"]).nullable(),
    source: z.string().max(2000),
  })
  .strict();
const regionSchema = z
  .object({ id, name, materialId: id.nullable(), points })
  .strict();
const legacyLoadSchema = z
  .object({
    id,
    name,
    x1: coordinate,
    x2: coordinate,
    q: z.number().finite().min(0).max(1e6),
  })
  .strict();
export const loadSchema = legacyLoadSchema.extend({
  q: z
    .number()
    .finite()
    .min(0, "A sobrecarga não pode ser negativa.")
    .max(1e6, "O limite de cadastro da sobrecarga é 1.000.000 kPa.")
    .nullable(),
  enabled: z.boolean(),
  source: z.string().max(2000),
});
const sectionSchema = z
  .object({
    id,
    name,
    terrain: points,
    base: coordinate,
    backgroundMaterialId: id.nullable(),
    regions: z.array(regionSchema).max(64),
    water: points.nullable(),
    waterMode: z.enum(["unspecified", "dry", "piezometric"]),
    waterUnitWeight: waterUnitWeightSchema,
    waterSource: z.string().max(2000),
    loadCondition: z.enum(["unspecified", "none", "loads"]),
    loads: z.array(loadSchema).max(100),
    circle: z
      .object({
        x: coordinate,
        y: coordinate,
        radius: z.number().finite().positive().max(1e6),
      })
      .strict()
      .nullable(),
  })
  .strict();
const projectFields = z
  .object({
    format: z.literal("geostruct"),
    version: z.literal(6),
    id,
    name,
    author: z.string().max(200),
    description: z.string().max(4000),
    units: z.literal("m-kN-kPa"),
    materials: z.array(materialSchema).max(100),
    sections: z.array(sectionSchema).min(1).max(100),
    analysisCases: z.array(analysisCaseSchema).max(100),
  })
  .strict();
function checkReferences(
  p: {
    id: string;
    materials: { id: string }[];
    sections: {
      id: string;
      name: string;
      backgroundMaterialId: string | null;
      regions: { id: string; materialId: string | null }[];
      loads: { id: string }[];
    }[];
    analysisCases?: {
      id: string;
      name: string;
      sectionId: string;
      loadIds: string[];
    }[];
  },
  ctx: z.RefinementCtx,
) {
  const ids = [
    p.id,
    ...p.materials.map((x) => x.id),
    ...(p.analysisCases ?? []).map((c) => c.id),
    ...p.sections.flatMap((s) => [
      s.id,
      ...s.regions.map((x) => x.id),
      ...s.loads.map((x) => x.id),
    ]),
  ];
  if (new Set(ids).size !== ids.length)
    ctx.addIssue({
      code: "custom",
      message: "Identificadores duplicados no projeto.",
    });
  const materials = new Set(p.materials.map((x) => x.id));
  for (const s of p.sections) {
    if (
      ![s.backgroundMaterialId, ...s.regions.map((x) => x.materialId)].every(
        (x) => x === null || materials.has(x),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: `Material inexistente em ${s.name}.`,
      });
  }
  for (const c of p.analysisCases ?? []) {
    const section = p.sections.find((s) => s.id === c.sectionId);
    if (!section)
      ctx.addIssue({
        code: "custom",
        message: `Seção inexistente no caso ${c.name}.`,
      });
    else if (c.loadIds.some((id) => !section.loads.some((l) => l.id === id)))
      ctx.addIssue({
        code: "custom",
        message: `Sobrecarga inexistente ou de outra seção no caso ${c.name}.`,
      });
  }
}
export const projectSchema = projectFields.superRefine(checkReferences);
const v5AnalysisCaseSchema = analysisCaseSchema
  .omit({ water: true, waterUnitWeight: true })
  .extend({
    waterCondition: z.enum(["section", "dry", "piezometric"]).nullable(),
  });
const v5Fields = projectFields.extend({
  version: z.literal(5),
  analysisCases: z.array(v5AnalysisCaseSchema).max(100),
});
const v5ProjectSchema = v5Fields.superRefine(checkReferences);
const v4Fields = v5Fields.extend({
  version: z.literal(4),
  analysisCases: z
    .array(v5AnalysisCaseSchema.omit({ numericalProfile: true }))
    .max(100),
});
const v4ProjectSchema = v4Fields.superRefine(checkReferences);
const v3Fields = v4Fields
  .omit({ analysisCases: true })
  .extend({ version: z.literal(3) });
const v3ProjectSchema = v3Fields.superRefine(checkReferences);
const legacySectionSchema = sectionSchema
  .omit({
    waterMode: true,
    waterUnitWeight: true,
    waterSource: true,
    loadCondition: true,
  })
  .extend({ loads: z.array(legacyLoadSchema).max(100) });
const v2Fields = v3Fields.extend({
  version: z.literal(2),
  sections: z.array(legacySectionSchema).min(1).max(100),
});
const v2ProjectSchema = v2Fields.superRefine(checkReferences);
const legacyProjectSchema = v2Fields
  .extend({
    version: z.literal(1),
    materials: z
      .array(materialSchema.extend({ mode: z.enum(["effective", "total"]) }))
      .min(1)
      .max(100),
    sections: z
      .array(
        legacySectionSchema.extend({
          backgroundMaterialId: id,
          regions: z.array(regionSchema.extend({ materialId: id })).max(64),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine(checkReferences);
export type Point = z.infer<typeof pointSchema>;
export type Material = z.infer<typeof materialSchema>;
export type Surcharge = z.infer<typeof loadSchema>;
export type AnalysisCase = z.infer<typeof analysisCaseSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Selection =
  | { kind: "project" | "section" | "terrain" | "water" | "circle" }
  | { kind: "material" | "region" | "load" | "case"; id: string };
export type Tool =
  | "select"
  | "pan"
  | "terrain"
  | "region"
  | "water"
  | "case-water"
  | "load"
  | "circle"
  | "case-circle"
  | "insert-vertex"
  | "delete-vertex"
  | "move-contour"
  | "copy-region"
  | "split-region"
  | "measure";
export const uid = () => crypto.randomUUID();
export const newMaterial = (): Material => ({
  id: uid(),
  name: "Novo solo",
  color: "#caa16e",
  gamma: null,
  cohesion: null,
  friction: null,
  mode: null,
  source: "",
});
export const newSection = (sectionName = "Seção 01"): Section => ({
  id: uid(),
  name: sectionName,
  terrain: [],
  base: -10,
  backgroundMaterialId: null,
  regions: [],
  water: null,
  waterMode: "unspecified",
  waterUnitWeight: null,
  waterSource: "",
  loadCondition: "unspecified",
  loads: [],
  circle: null,
});
export function newProject(projectName: string, author = ""): Project {
  const m = newMaterial();
  m.name = "Solo 1";
  return {
    format: "geostruct",
    version: 6,
    id: uid(),
    name: projectName,
    author,
    description: "",
    units: "m-kN-kPa",
    materials: [m],
    sections: [newSection()],
    analysisCases: [],
  };
}
export function exampleProject(): Project {
  const p = newProject("Talude em duas camadas", "");
  p.description =
    "Exemplo ilustrativo próprio para explorar a modelagem. Não é um caso de validação de estabilidade.";
  p.materials[0] = {
    ...p.materials[0],
    name: "Solo residual",
    color: "#d5b68c",
    gamma: 19,
    cohesion: 12,
    friction: 28,
    mode: "effective",
    source: "Dados ilustrativos para demonstração; sem investigação de campo.",
  };
  const fill: Material = {
    ...newMaterial(),
    name: "Aterro compactado",
    color: "#bc8150",
    gamma: 18,
    cohesion: 5,
    friction: 30,
    mode: "effective",
    source: "Dados ilustrativos para demonstração; sem investigação de campo.",
  };
  p.materials.push(fill);
  const s = p.sections[0];
  s.backgroundMaterialId = p.materials[0].id;
  s.name = "Seção A–A";
  s.base = 0;
  s.terrain = [
    { x: 0, y: 22 },
    { x: 18, y: 22 },
    { x: 38, y: 10 },
    { x: 60, y: 10 },
  ];
  s.regions = [
    {
      id: uid(),
      name: "Camada de aterro",
      materialId: fill.id,
      points: [
        { x: 0, y: 15 },
        { x: 0, y: 22 },
        { x: 18, y: 22 },
        { x: 38, y: 10 },
        { x: 60, y: 10 },
        { x: 60, y: 6 },
        { x: 38, y: 6 },
        { x: 18, y: 15 },
      ],
    },
  ];
  s.water = [
    { x: 0, y: 12 },
    { x: 18, y: 12 },
    { x: 38, y: 7 },
    { x: 60, y: 7 },
  ];
  s.waterMode = "piezometric";
  s.waterUnitWeight = 9.81;
  s.waterSource =
    "Dados ilustrativos para demonstração; sem investigação de campo.";
  s.loadCondition = "loads";
  s.loads = [
    {
      id: uid(),
      name: "Sobrecarga de crista",
      x1: 5,
      x2: 14,
      q: 20,
      enabled: true,
      source: "Sobrecarga ilustrativa; sem vínculo com um projeto real.",
    },
  ];
  return p;
}
export function duplicateSection(s: Section): Section {
  return {
    ...structuredClone(s),
    id: uid(),
    name: `${s.name.slice(0, 100)} — cópia`,
    regions: s.regions.map((r) => ({ ...structuredClone(r), id: uid() })),
    loads: s.loads.map((l) => ({ ...l, id: uid() })),
  };
}
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export function readProject(text: string): {
  project: Project;
  migrated: boolean;
} {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error("O arquivo excede o limite de 8 MB.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("O arquivo não contém um JSON válido.");
  }
  const version =
    typeof value === "object" && value !== null && "version" in value
      ? value.version
      : null;
  const r = (
    version === 1
      ? legacyProjectSchema
      : version === 2
        ? v2ProjectSchema
        : version === 3
          ? v3ProjectSchema
          : version === 4
            ? v4ProjectSchema
            : version === 5
              ? v5ProjectSchema
              : projectSchema
  ).safeParse(value);
  if (!r.success)
    throw new Error(
      "Projeto incompatível ou inválido: " +
        r.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" · "),
    );
  const data = r.data;
  if (data.version === 6) return { project: data, migrated: false };
  if (data.version === 5)
    return {
      project: projectSchema.parse({
        ...data,
        version: 6,
        analysisCases: data.analysisCases.map((c) => ({
          ...c,
          water: null,
          waterUnitWeight: null,
        })),
      }),
      migrated: true,
    };
  if (data.version === 4)
    return {
      project: projectSchema.parse({
        ...data,
        version: 6,
        analysisCases: data.analysisCases.map((c) => ({
          ...c,
          numericalProfile: emptyNumericalProfile(),
          water: null,
          waterUnitWeight: null,
        })),
      }),
      migrated: true,
    };
  if (data.version === 3)
    return {
      project: projectSchema.parse({ ...data, version: 6, analysisCases: [] }),
      migrated: true,
    };
  return {
    project: projectSchema.parse({
      ...data,
      version: 6,
      analysisCases: [],
      sections: data.sections.map((s) => ({
        ...s,
        waterMode: s.water === null ? "unspecified" : "piezometric",
        waterUnitWeight: null,
        waterSource: "",
        loadCondition: s.loads.length ? "loads" : "unspecified",
        loads: s.loads.map((l) => ({ ...l, enabled: true, source: "" })),
      })),
    }),
    migrated: true,
  };
}
export const parseProject = (text: string): Project =>
  readProject(text).project;
export const serializeProject = (p: Project) => {
  const text = JSON.stringify(projectSchema.parse(p), null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES)
    throw new Error(
      "O projeto excede o limite de 8 MB. Reduza os dados antes de salvar.",
    );
  return text;
};
