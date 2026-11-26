import { version } from "../package.json";
import { Audit } from "./components/Audit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  FileText,
  FolderOpen,
  Save,
  Sun,
  Moon,
  X,
} from "lucide-react";
import {
  newProject,
  exampleProject,
  newSection,
  uid,
  readProject,
  serializeProject,
  projectSchema,
  MAX_FILE_BYTES,
  type Project,
  type Selection,
  type Tool,
  type Point,
  type NumericalProfile,
} from "./domain/model";
import {
  contourTarget,
  contourPoints,
  moveContourVertex,
  insertContourVertex,
  deleteContourVertex,
  translateContour,
  copyRegion,
  splitRegion,
} from "./domain/editing";
import type { Precision } from "./domain/precision";
import {
  addMaterial,
  removeMaterial,
  materialUses,
  type MaterialUse,
} from "./domain/materials";
import {
  addAnalysisCase,
  removeAnalysisCase,
  loadCaseUses,
  duplicateSectionWithCases,
  removeSectionWithCases,
} from "./domain/analysis";
import { AnalysisCases, CaseInspector } from "./components/AnalysisCases";
import { createLoad } from "./domain/conditions";
import { Loads } from "./components/Loads";
import { history, commit, undo, redo, type History } from "./domain/history";
import {
  diagnose,
  introducedError,
  distance,
  lineError,
  terrainError,
  regionError,
  parseNumber,
} from "./domain/geometry";
import {
  desktop,
  getRecovery,
  putRecovery,
  removeRecovery,
  openNative,
  saveProject,
  exportText,
  safeName,
} from "./lib/files";
import { Ribbon, type Tab, type Action } from "./components/Ribbon";
import { ProjectTree } from "./components/ProjectTree";
import { Inspector } from "./components/Inspector";
import {
  ModelCanvas,
  instructions,
  type Visibility,
} from "./components/ModelCanvas";
import { PanelResizer } from "./components/PanelResizer";
import { Dialog } from "./components/Dialog";
import { StartScreen } from "./components/StartScreen";
import { Report } from "./components/Report";
import { Materials, MaterialAssignment } from "./components/Materials";
import { prepareCoreInput } from "./domain/core-input";
import { defaultProject } from "./domain/default-project";
import type { CaseRunRecord } from "./domain/case-comparison";
import { runCasesBatch, type BatchExecutionHandle } from "./lib/batch-cases";
import type { FixedCirclePreparation } from "./core/fixed-circle";
import type { GeometryFields } from "./components/FixedCirclePreview";
import type { SearchOverlay } from "./components/CircularSearchPanel";

type Question = {
  title: string;
  message: string;
  choices: { value: string; label: string; primary?: boolean }[];
  resolve: (v: string) => void;
};
function readPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export default function App() {
  const [h, setH] = useState<History<Project> | null>(null);
  const project = h?.present ?? null;
  const [sectionId, setSectionId] = useState(""),
    [selection, setSelection] = useState<Selection>({ kind: "terrain" });
  const [tool, setTool] = useState<Tool>("select"),
    [tab, setTab] = useState<Tab>("Geometria");
  const [dark, setDark] = useState(
    () => readPreference("geostruct.theme", "light") === "dark",
  );
  const [grid, setGrid] = useState(true),
    [snap, setSnap] = useState(true),
    [visibility, setVisibility] = useState<Visibility>({
      materials: true,
      water: true,
      loads: true,
      circle: true,
    });
  const [precision, setPrecision] = useState<Precision>({
    gridStep: 0.5,
    ortho: false,
    linked: true,
  });
  const [gridInput, setGridInput] = useState("0,5");
  const [precisionDraft, setPrecisionDraft] = useState(precision);
  const [precisionError, setPrecisionError] = useState("");
  const [fitToken, setFitToken] = useState(0),
    [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [draftDirty, setDraftDirty] = useState(false),
    [drawing, setDrawing] = useState(false),
    [inspectorEpoch, setInspectorEpoch] = useState(0);
  const [saved, setSaved] = useState(""),
    [filePath, setFilePath] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [geometryDraft, setGeometryDraft] = useState<{
    caseId: string;
    epoch: number;
    values: GeometryFields;
  } | null>(null);
  const [slicePreview, setSlicePreview] =
    useState<FixedCirclePreparation | null>(null);
  const [searchOverlay, setSearchOverlay] = useState<SearchOverlay | null>(
    null,
  );
  const [caseRuns, setCaseRuns] = useState<Record<string, CaseRunRecord>>({});
  const [batchRunning, setBatchRunning] = useState(false);
  const batchHandle = useRef<BatchExecutionHandle | null>(null);
  const [notice, setNotice] = useState(""),
    [question, setQuestion] = useState<Question | null>(null),
    [dialog, setDialog] = useState<
      | "new"
      | "help"
      | "report"
      | "precision"
      | "materials"
      | "loads"
      | "cases"
      | "audit"
      | "assign-material"
      | null
    >(null);
  const [newName, setNewName] = useState("Novo projeto"),
    [newAuthor, setNewAuthor] = useState("");
  const [left, setLeft] = useState(235),
    [right, setRight] = useState(306),
    [showDiagnostics, setShowDiagnostics] = useState(false);
  const [recovery, setRecovery] = useState<{
    project: Project;
    savedAt: string;
  } | null>(() => {
    try {
      return getRecovery();
    } catch {
      return null;
    }
  });
  const input = useRef<HTMLInputElement>(null),
    svg = useRef<SVGSVGElement | null>(null),
    recoveryError = useRef(false),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const section =
    project?.sections.find((s) => s.id === sectionId) ?? project?.sections[0];
  const selectedCase =
    project?.analysisCases.find(
      (c) =>
        selection.kind === "case" &&
        c.id === selection.id &&
        c.sectionId === section?.id,
    ) ?? null;
  const geometryFields: GeometryFields =
    geometryDraft?.caseId === selectedCase?.id &&
    geometryDraft?.epoch === inspectorEpoch
      ? geometryDraft.values
      : {
          tolerance: String(
            selectedCase?.numericalProfile.geometry.toleranceM ?? "",
          ),
          angle: String(
            selectedCase?.numericalProfile.geometry.maxArcDegrees ?? "",
          ),
        };
  const diagnostics = useMemo(
    () => (project ? diagnose(project) : []),
    [project],
  );
  const preparation = useMemo(
    () =>
      project && selectedCase
        ? prepareCoreInput(project, selectedCase.id)
        : null,
    [project, selectedCase],
  );
  // Alterar só o perfil conserva a entrada mecânica e as inspeções já preparadas.
  const preparationRevision = JSON.stringify(preparation);
  const preparedCase = useMemo(() => preparation, [preparationRevision]);
  const currentSlices =
    preparedCase?.snapshot &&
    slicePreview?.inputRevision === preparedCase.snapshot.revision
      ? slicePreview
      : null;
  const searchedGeometry =
    preparedCase?.snapshot &&
    searchOverlay?.inputRevision === preparedCase.snapshot.revision
      ? searchOverlay.geometry
      : null;
  const dirty = !!project && JSON.stringify(project) !== saved;
  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 9000);
  }, []);
  const ask = (title: string, message: string, choices: Question["choices"]) =>
    new Promise<string>((resolve) =>
      setQuestion({ title, message, choices, resolve }),
    );
  const answer = (v: string) => {
    question?.resolve(v);
    setQuestion(null);
  };
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("geostruct.theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => {
      try {
        putRecovery(project);
        recoveryError.current = false;
      } catch {
        if (!recoveryError.current) {
          notify(
            "Não foi possível atualizar a recuperação local. Salve uma cópia do projeto.",
          );
          recoveryError.current = true;
        }
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [project, notify]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty || draftDirty || drawing) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty, draftDirty, drawing]);
  useEffect(() => {
    document.title = `${project ? `${dirty ? "● " : ""}${project.name} · ` : ""}GeoStruct · OpenStruct`;
  }, [project, dirty]);
  const guardDraft = async () => {
    if (!draftDirty && !drawing) return true;
    const v = await ask(
      "Edição em andamento",
      draftDirty
        ? "Há propriedades que ainda não foram aplicadas. Deseja descartá-las?"
        : "Há um desenho em andamento. Deseja descartá-lo?",
      [
        { value: "cancel", label: "Continuar editando" },
        { value: "discard", label: "Descartar edição" },
      ],
    );
    if (v !== "discard") return false;
    setDraftDirty(false);
    setDrawing(false);
    setInspectorEpoch((n) => n + 1);
    setTool("select");
    return true;
  };
  const save = async (asCopy = false, skipDraft = false) => {
    if (!project) return false;
    if (!skipDraft && (draftDirty || drawing)) {
      notify(
        "Conclua o desenho e aplique ou descarte as propriedades antes de salvar.",
      );
      return false;
    }
    const snapshot = project;
    setBusy(true);
    try {
      const path = await saveProject(snapshot, filePath, asCopy);
      if (!path) return false;
      setSaved(JSON.stringify(snapshot));
      if (path !== "download") setFilePath(path);
      notify(
        path === "download"
          ? "Arquivo .geo.json enviado para download."
          : "Projeto salvo.",
      );
      return true;
    } catch (e) {
      notify("Não foi possível salvar: " + (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const guardProject = async () => {
    if (!(await guardDraft())) return false;
    if (!dirty) return true;
    const v = await ask(
      "Salvar alterações?",
      `O projeto “${project!.name}” tem alterações ainda não salvas.`,
      [
        { value: "cancel", label: "Cancelar" },
        { value: "discard", label: "Descartar alterações" },
        { value: "save", label: "Salvar e continuar", primary: true },
      ],
    );
    if (v === "save") return save(false, true);
    return v === "discard";
  };
  const closeHandler = useRef<() => Promise<boolean>>(guardProject);
  closeHandler.current = guardProject;
  useEffect(() => {
    if (!desktop) return;
    let dispose: (() => void) | undefined,
      cancelled = false;
    import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const window = getCurrentWindow();
        const unlisten = await window.onCloseRequested(async (e) => {
          e.preventDefault();
          if (await closeHandler.current()) await window.destroy();
        });
        if (cancelled) unlisten();
        else dispose = unlisten;
      })
      .catch((e) =>
        notify("Proteção de fechamento indisponível: " + String(e)),
      );
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [notify]);
  useEffect(() => () => batchHandle.current?.cancel(), []);
  const stopBatch = useCallback(() => {
    batchHandle.current?.cancel();
    batchHandle.current = null;
    setBatchRunning(false);
  }, []);
  const startBatch = useCallback(
    (caseIds: string[]) => {
      if (!project || !caseIds.length) return;
      batchHandle.current?.cancel();
      setBatchRunning(true);
      batchHandle.current = runCasesBatch({
        project,
        caseIds,
        onUpdate: (caseId, record) =>
          setCaseRuns((prev) => ({ ...prev, [caseId]: record })),
        onComplete: () => {
          batchHandle.current = null;
          setBatchRunning(false);
        },
      });
    },
    [project],
  );
  const openProject = (
    p: Project,
    path: string | null,
    savedState: boolean,
    migrated = false,
  ) => {
    stopBatch();
    setCaseRuns({});
    setH(history(p));
    setGeometryDraft(null);
    setSectionId(p.sections[0].id);
    setSelection({ kind: "terrain" });
    setTool("select");
    setTab("Geometria");
    setSaved(savedState && !migrated ? JSON.stringify(p) : "");
    setSlicePreview(null);
    setSearchOverlay(null);
    setFilePath(path);
    setDraftDirty(false);
    setDrawing(false);
    setInspectorEpoch((n) => n + 1);
    setFitToken((n) => n + 1);
    setDialog(null);
    if (migrated)
      notify(
        "Projeto de versão anterior aberto com os dados preservados. O próximo salvamento usará a versão 6; use Salvar como para conservar o arquivo original. Complete o perfil de cálculo de cada caso antes de calcular.",
      );
  };
  const apply = (p: Project) => {
    setH((prev) => (prev ? commit(prev, p) : history(p)));
    setInspectorEpoch((n) => n + 1);
    setDraftDirty(false);
  };
  const applyNumericalProfile = (profile: NumericalProfile) => {
    if (!selectedCase) return;
    const caseId = selectedCase.id;
    setH((previous) => {
      if (!previous) return previous;
      const next = {
        ...previous.present,
        analysisCases: previous.present.analysisCases.map((analysisCase) =>
          analysisCase.id === caseId
            ? { ...analysisCase, numericalProfile: profile }
            : analysisCase,
        ),
      };
      return commit(previous, next);
    });
  };
  const select = async (s: Selection) => {
    if (!(await guardDraft())) return;
    setTool("select");
    setSelection(s);
    if (s.kind === "case") {
      const c = project?.analysisCases.find((c) => c.id === s.id);
      if (c) setSectionId(c.sectionId);
      setTab("Análise");
    }
    setInspectorEpoch((n) => n + 1);
  };
  const chooseSection = async (id: string) => {
    if (!(await guardDraft())) return;
    setSectionId(id);
    setSelection({ kind: "terrain" });
    setTool("select");
    setInspectorEpoch((n) => n + 1);
  };
  const selectTool = async (t: Tool) => {
    if (!project || !section) return;
    if (!(await guardDraft())) return;
    if (t === "terrain" && section.terrain.length > 0) {
      const ok = await ask(
        "Substituir o perfil?",
        "O novo traçado substituirá o terreno desta seção. Regiões e cargas precisarão continuar dentro do novo perfil.",
        [
          { value: "cancel", label: "Cancelar" },
          { value: "replace", label: "Redesenhar terreno", primary: true },
        ],
      );
      if (ok !== "replace") return;
    }
    if (t === "water" && section.water) {
      const ok = await ask(
        "Substituir a linha piezométrica?",
        "A linha atual será substituída quando o novo traçado for concluído.",
        [
          { value: "cancel", label: "Cancelar" },
          { value: "replace", label: "Redesenhar linha", primary: true },
        ],
      );
      if (ok !== "replace") return;
    }
    if (
      ["region", "water", "case-water", "load"].includes(t) &&
      terrainError(section.terrain)
    ) {
      notify("Defina primeiro um perfil de terreno válido.");
      return;
    }
    if ((t === "case-circle" || t === "case-water") && !selectedCase) {
      notify("Selecione primeiro um caso de análise.");
      return;
    }
    if (t === "case-water" && selectedCase?.water) {
      const ok = await ask(
        "Substituir a linha piezométrica do caso?",
        "A linha atual do caso será substituída quando o novo traçado for concluído.",
        [
          { value: "cancel", label: "Cancelar" },
          { value: "replace", label: "Redesenhar linha", primary: true },
        ],
      );
      if (ok !== "replace") return;
    }
    if (t === "terrain") setSelection({ kind: "terrain" });
    const target = contourTarget(selection);
    if (
      ["insert-vertex", "delete-vertex", "move-contour"].includes(t) &&
      (!target ||
        contourPoints(section, target).length < 2 ||
        (target.kind === "water" && section.waterMode !== "piezometric"))
    ) {
      notify(
        "Selecione primeiro o terreno, uma região ou a linha piezométrica.",
      );
      return;
    }
    if (
      ["copy-region", "split-region"].includes(t) &&
      selection.kind !== "region"
    ) {
      notify("Selecione primeiro uma região de solo na árvore ou no desenho.");
      return;
    }
    if (
      selection.kind === "case" &&
      !["case-circle", "case-water", "pan", "select", "measure"].includes(t)
    )
      setSelection({ kind: "terrain" });
    setTool(t);
    setInspectorEpoch((n) => n + 1);
  };
  const acceptGeometry = (p: Project) => {
    const parsed = projectSchema.safeParse(p);
    if (!parsed.success) {
      notify("Revise os valores: " + parsed.error.issues[0].message);
      return false;
    }
    const error = introducedError(project!, parsed.data);
    if (error) {
      notify(error.message);
      return false;
    }
    apply(parsed.data);
    return true;
  };
  const draw = (t: Tool, points: Point[]) => {
    if (!project || !section) return;
    if (["move-contour", "copy-region", "split-region"].includes(t)) {
      try {
        const p = structuredClone(project),
          delta = {
            x: points[1].x - points[0].x,
            y: points[1].y - points[0].y,
          };
        const target = contourTarget(selection);
        const newId = uid();
        const next =
          t === "move-contour" && target
            ? translateContour(section, target, delta, precision.linked)
            : selection.kind === "region"
              ? t === "copy-region"
                ? copyRegion(section, selection.id, delta, newId)
                : splitRegion(
                    section,
                    selection.id,
                    points[0],
                    points[1],
                    newId,
                  )
              : null;
        if (!next) return;
        p.sections[p.sections.findIndex((s) => s.id === section.id)] = next;
        if (acceptGeometry(p)) {
          setTool("select");
          setDrawing(false);
          if (t !== "move-contour") setSelection({ kind: "region", id: newId });
        }
      } catch (e) {
        notify((e as Error).message);
      }
      return;
    }
    const p = structuredClone(project),
      s = p.sections.find((x) => x.id === section.id)!;
    let selected: Selection = { kind: "terrain" };
    if (t === "case-circle") {
      if (!selectedCase) return;
      const c = p.analysisCases.find((c) => c.id === selectedCase.id)!;
      c.fixedCircle = { ...points[0], radius: distance(points[0], points[1]) };
      c.surfaceMode = "fixed";
      if (acceptGeometry(p)) {
        setTool("select");
        setDrawing(false);
        setSelection({ kind: "case", id: c.id });
        setFitToken((n) => n + 1);
      }
      return;
    }
    if (t === "case-water") {
      if (!selectedCase) return;
      const e = lineError(points);
      if (e) {
        notify(e);
        return;
      }
      const c = p.analysisCases.find((c) => c.id === selectedCase.id)!;
      c.water = points;
      c.waterCondition = "case-piezometric";
      if (acceptGeometry(p)) {
        setTool("select");
        setDrawing(false);
        setSelection({ kind: "case", id: c.id });
        setFitToken((n) => n + 1);
      }
      return;
    }
    if (t === "terrain") {
      const e = terrainError(points);
      if (e) {
        notify(e);
        return;
      }
      s.terrain = points;
    } else if (t === "region") {
      const e = regionError(s, points);
      if (e) {
        notify(e);
        return;
      }
      const id = uid();
      s.regions.push({
        id,
        name: `Região ${s.regions.length + 1}`,
        materialId: null,
        points,
      });
      selected = { kind: "region", id };
    } else if (t === "water") {
      const e = lineError(points);
      if (e) {
        notify(e);
        return;
      }
      s.water = points;
      s.waterMode = "piezometric";
      selected = { kind: "water" };
    } else if (t === "load") {
      try {
        const created = createLoad(
          s,
          Math.min(points[0].x, points[1].x),
          Math.max(points[0].x, points[1].x),
        );
        Object.assign(s, created.section);
        selected = { kind: "load", id: created.load.id };
      } catch (e) {
        notify((e as Error).message);
        return;
      }
    } else if (t === "circle") {
      const r = distance(points[0], points[1]);
      if (r < 1e-7) {
        notify("O raio deve ser maior que zero.");
        return;
      }
      s.circle = { ...points[0], radius: r };
      selected = { kind: "circle" };
    }
    if (acceptGeometry(p)) {
      setTool("select");
      setDrawing(false);
      setSelection(selected);
      if (t === "terrain") setFitToken((n) => n + 1);
      if (t === "region")
        notify(
          "Região criada sem material. Escolha o material nas propriedades ou use Materiais → Atribuir material.",
        );
      if (t === "load")
        notify(
          "Faixa criada. Informe q (kPa) nas propriedades e clique em Aplicar.",
        );
    }
  };
  const editVertex = async (
    kind: "move" | "insert" | "delete",
    index: number,
    point?: Point,
  ) => {
    if (!project || !section || !(await guardDraft())) return;
    const target = contourTarget(selection);
    if (!target) return;
    try {
      const p = structuredClone(project);
      const next =
        kind === "move"
          ? moveContourVertex(section, target, index, point!, precision.linked)
          : kind === "insert"
            ? insertContourVertex(
                section,
                target,
                index,
                point!,
                precision.linked,
              )
            : deleteContourVertex(section, target, index, precision.linked);
      p.sections[p.sections.findIndex((s) => s.id === section.id)] = next;
      acceptGeometry(p);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const moveVertex = async (index: number, point: Point) => {
    await editVertex("move", index, point);
  };
  const removeSelected = async () => {
    if (!project || !section || !(await guardDraft())) return;
    if (selection.kind === "terrain" || selection.kind === "project") {
      notify(
        "Edite o terreno pelas coordenadas. Para remover uma seção, selecione seus dados na árvore.",
      );
      return;
    }
    if (selection.kind === "section" && project.sections.length === 1) {
      notify("O projeto precisa manter ao menos uma seção.");
      return;
    }
    if (
      selection.kind === "material" &&
      materialUses(project, selection.id).length > 0
    ) {
      notify(
        "Este material está em uso. Em Materiais → Gerenciar materiais, escolha um substituto para excluir sem perder as atribuições.",
      );
      return;
    }
    if (
      selection.kind === "load" &&
      loadCaseUses(project, selection.id).length
    ) {
      notify(
        "Esta faixa é selecionada nos casos: " +
          loadCaseUses(project, selection.id)
            .map((c) => c.name)
            .join(", ") +
          ". Retire a seleção nesses casos antes de excluir.",
      );
      return;
    }
    if (
      (selection.kind === "water" && !section.water) ||
      (selection.kind === "circle" && !section.circle)
    )
      return;
    if (
      (await ask(
        "Excluir elemento?",
        selection.kind === "section"
          ? `A seção e seus ${project.analysisCases.filter((c) => c.sectionId === section.id).length} caso(s) serão excluídos. A operação pode ser desfeita.`
          : "A exclusão pode ser revertida com Desfazer.",
        [
          { value: "cancel", label: "Cancelar" },
          { value: "delete", label: "Excluir" },
        ],
      )) !== "delete"
    )
      return;
    const p = structuredClone(project),
      s = p.sections.find((x) => x.id === section.id)!;
    switch (selection.kind) {
      case "section":
        Object.assign(p, removeSectionWithCases(p, s.id));
        setSectionId(p.sections[0].id);
        break;
      case "material":
        p.materials = p.materials.filter((x) => x.id !== selection.id);
        break;
      case "region":
        s.regions = s.regions.filter((x) => x.id !== selection.id);
        break;
      case "load":
        s.loads = s.loads.filter((x) => x.id !== selection.id);
        break;
      case "water":
        s.water = null;
        break;
      case "case":
        Object.assign(p, removeAnalysisCase(p, selection.id));
        break;
      case "circle":
        s.circle = null;
        break;
    }
    apply(p);
    setSelection({ kind: "terrain" });
  };
  const openFile = async () => {
    if (busy) return;
    if (!desktop) {
      input.current?.click();
      return;
    }
    setBusy(true);
    let result;
    try {
      result = await openNative();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
    if (result && (await guardProject()))
      openProject(result.project, result.path, true, result.migrated);
  };
  const createMaterial = (sourceId?: string) => {
    if (!project) return;
    const result = addMaterial(project, sourceId);
    apply(result.project);
    setSelection({ kind: "material", id: result.material.id });
    setTool("select");
  };
  const locateMaterialUse = (use: MaterialUse) => {
    setDialog(null);
    setSectionId(use.sectionId);
    setSelection(use.selection);
    setTool("select");
    setInspectorEpoch((n) => n + 1);
  };
  const locateDiagnostic = async (
    d: import("./domain/geometry").Diagnostic,
  ) => {
    if (!project || !(await guardDraft())) return;
    setTool("select");
    setDialog(null);
    if (d.sectionId) setSectionId(d.sectionId);
    if (project.materials.some((m) => m.id === d.target))
      setSelection({ kind: "material", id: d.target });
    else if (project.analysisCases.some((c) => c.id === d.target)) {
      setSelection({ kind: "case", id: d.target });
      setTab("Análise");
    } else if (d.target === "cases") setDialog("cases");
    else if (d.target === "loads") setDialog("loads");
    else if (d.target === "water") setSelection({ kind: "water" });
    else {
      const s = project.sections.find((s) => s.id === d.sectionId);
      setSelection(
        s?.regions.some((r) => r.id === d.target)
          ? { kind: "region", id: d.target }
          : s?.loads.some((l) => l.id === d.target)
            ? { kind: "load", id: d.target }
            : { kind: "terrain" },
      );
    }
    setInspectorEpoch((n) => n + 1);
  };
  const action = async (a: Action) => {
    if (busy || question) return;
    if (
      [
        "select",
        "pan",
        "terrain",
        "region",
        "water",
        "case-water",
        "load",
        "circle",
        "case-circle",
        "insert-vertex",
        "delete-vertex",
        "move-contour",
        "copy-region",
        "split-region",
        "measure",
      ].includes(a)
    ) {
      await selectTool(a as Tool);
      return;
    }
    if (a === "open") {
      await openFile();
      return;
    }
    if (a === "open-default") {
      if (await guardProject()) {
        const sample = defaultProject();
        openProject(sample, null, false);
        setSelection({ kind: "case", id: sample.analysisCases[0].id });
        setTab("Análise");
        notify(
          "Projeto padrão aberto. Inicie a busca circular para explorar o talude.",
        );
      }
      return;
    }
    if (a === "new") {
      if (await guardProject()) {
        setNewName("Novo projeto");
        setNewAuthor("");
        setDialog("new");
      }
      return;
    }
    if (a === "theme") {
      setDark((v) => !v);
      return;
    }
    if (a === "precision") {
      setGridInput(String(precision.gridStep));
      setPrecisionDraft(precision);
      setPrecisionError("");
      setDialog("precision");
      return;
    }
    if (a === "help") {
      setDialog("help");
      return;
    }
    if (!project || !section) return;
    if (a === "save" || a === "save-as") {
      await save(a === "save-as");
      return;
    }
    if (a === "close") {
      if (await guardProject()) {
        stopBatch();
        setCaseRuns({});
        try {
          removeRecovery();
        } catch {}
        setRecovery(null);
        setH(null);
        setDraftDirty(false);
        setDrawing(false);
      }
      return;
    }
    if (a === "fit") {
      setFitToken((n) => n + 1);
      return;
    }
    if (a === "grid") {
      setGrid((v) => !v);
      return;
    }
    if (a === "snap") {
      setSnap((v) => !v);
      return;
    }
    if (a === "diagnostics") {
      setShowDiagnostics(true);
      return;
    }
    if (a === "properties") {
      document
        .querySelector<HTMLElement>(
          ".inspector input, .inspector select, .inspector textarea",
        )
        ?.focus();
      return;
    }
    if (a === "delete") {
      await removeSelected();
      return;
    }
    if (!(await guardDraft())) return;
    if (a === "new-case") {
      try {
        const result = addAnalysisCase(project, section.id);
        apply(result.project);
        setSelection({ kind: "case", id: result.analysisCase.id });
        setTool("select");
        setTab("Análise");
      } catch (e) {
        notify((e as Error).message);
      }
      return;
    }
    if (a === "water-settings") {
      setTool("select");
      setSelection({ kind: "water" });
      setInspectorEpoch((n) => n + 1);
      return;
    }
    if (
      a === "materials" ||
      a === "assign-material" ||
      a === "loads" ||
      a === "cases" ||
      a === "compare-cases" ||
      a === "audit"
    ) {
      setTool("select");
      setDialog(a === "compare-cases" ? "cases" : a);
      return;
    }
    if (a === "report") {
      setDialog("report");
      return;
    }
    if (a === "svg") {
      try {
        const clone = svg.current!.cloneNode(true) as SVGSVGElement;
        clone
          .querySelectorAll("[data-transient], [data-vertex]")
          .forEach((e) => e.remove());
        clone.setAttribute("width", String(svg.current!.viewBox.baseVal.width));
        clone.setAttribute(
          "height",
          String(svg.current!.viewBox.baseVal.height),
        );
        await exportText(
          `${safeName(section.name)}.svg`,
          new XMLSerializer().serializeToString(clone),
          "image/svg+xml",
        );
      } catch (e) {
        notify("Falha na exportação: " + String(e));
      }
      return;
    }
    if (a === "undo" || a === "redo") {
      setH((prev) => (prev ? (a === "undo" ? undo(prev) : redo(prev)) : prev));
      setInspectorEpoch((n) => n + 1);
      setSelection({ kind: "terrain" });
      setSlicePreview(null);
      setSearchOverlay(null);
      return;
    }
    const p = structuredClone(project);
    if (a === "section" || a === "duplicate") {
      if (p.sections.length >= 100) {
        notify("Limite de 100 seções por projeto.");
        return;
      }
      let s;
      try {
        if (a === "duplicate") {
          const result = duplicateSectionWithCases(p, section.id);
          Object.assign(p, result.project);
          s = result.section;
        } else {
          s = newSection(
            `Seção ${String(p.sections.length + 1).padStart(2, "0")}`,
          );
          p.sections.push(s);
        }
      } catch (e) {
        notify((e as Error).message);
        return;
      }
      setSectionId(s.id);
      setSelection({ kind: "terrain" });
      setTool("select");
      apply(p);
    }
    if (a === "material") {
      try {
        createMaterial();
      } catch (e) {
        notify((e as Error).message);
      }
    }
  };
  const actionRef = useRef(action);
  actionRef.current = action;
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (question || dialog) return;
      const editing =
        e.target instanceof HTMLElement &&
        !!e.target.closest('input,textarea,select,[contenteditable="true"]');
      const ctrl = e.ctrlKey || e.metaKey;
      let a: Action | undefined;
      if (ctrl && e.key.toLowerCase() === "s") a = "save";
      else if (ctrl && e.key.toLowerCase() === "o") a = "open";
      else if (!editing && ctrl && e.key.toLowerCase() === "z")
        a = e.shiftKey ? "redo" : "undo";
      else if (!editing && ctrl && e.key.toLowerCase() === "y") a = "redo";
      else if (!editing && !ctrl) {
        if (e.key.toLowerCase() === "v") a = "select";
        if (e.key.toLowerCase() === "h") a = "pan";
        if (e.key.toLowerCase() === "f") a = "fit";
        if (e.key === "F3") a = "snap";
        if (e.key === "Delete") a = "delete";
      }
      if (a) {
        e.preventDefault();
        void actionRef.current(a);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [question, dialog]);
  const errors = diagnostics.filter((d) => d.level === "error").length,
    warnings = diagnostics.filter((d) => d.level === "warning").length;
  return (
    <>
      <div className="app-shell">
        <header className="titlebar">
          <div className="app-brand">
            <strong>
              Geo<span>Struct</span>
            </strong>
            <span className="brand-divider" />
            <span className="ecosystem">OPENSTRUCT</span>
          </div>
          {project && (
            <div className="document-title">
              {dirty && (
                <span className="unsaved-dot" title="Alterações não salvas" />
              )}
              {project.name}
              <span className="version-label">0.1</span>
            </div>
          )}
          <div className="quick-actions">
            {project && (
              <>
                <button
                  className="icon-button"
                  aria-label="Abrir projeto"
                  title="Abrir · Ctrl+O"
                  onClick={() => action("open")}
                  disabled={busy}
                >
                  <FolderOpen size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Salvar projeto"
                  title="Salvar · Ctrl+S"
                  onClick={() => action("save")}
                  disabled={busy}
                >
                  <Save size={17} />
                </button>
              </>
            )}
            <button
              className="icon-button"
              aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
              onClick={() => setDark((d) => !d)}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="icon-button"
              aria-label="Ajuda"
              onClick={() => setDialog("help")}
            >
              <CircleHelp size={17} />
            </button>
          </div>
        </header>
        <input
          ref={input}
          hidden
          type="file"
          accept=".json,.geo.json,application/json"
          aria-label="Arquivo de projeto"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            let loaded: ReturnType<typeof readProject> | undefined;
            try {
              if (file.size > MAX_FILE_BYTES)
                throw new Error("O arquivo excede o limite de 8 MB.");
              loaded = readProject(await file.text());
            } catch (err) {
              notify((err as Error).message);
            } finally {
              setBusy(false);
            }
            if (loaded && (await guardProject()))
              openProject(loaded.project, null, true, loaded.migrated);
          }}
        />
        {!project || !section ? (
          <StartScreen
            onNew={() => action("new")}
            onOpen={openFile}
            onOpenDefault={() => action("open-default")}
            onExample={() => {
              openProject(exampleProject(), null, false);
              notify(
                "Exemplo ilustrativo próprio. Os parâmetros não representam um projeto validado.",
              );
            }}
            recovery={recovery}
            onRecover={() => {
              if (recovery) openProject(recovery.project, null, false);
            }}
          />
        ) : (
          <>
            <Ribbon
              tab={tab}
              onTab={setTab}
              onAction={action}
              tool={tool}
              dark={dark}
              grid={grid}
              snap={snap}
              canUndo={!!h?.past.length}
              canRedo={!!h?.future.length}
              busy={busy}
            />
            <div
              className="workspace"
              inert={busy ? true : undefined}
              style={
                {
                  "--left-panel": `${left}px`,
                  "--right-panel": `${right}px`,
                } as React.CSSProperties
              }
            >
              <ProjectTree
                project={project}
                section={section}
                selection={selection}
                onSelect={select}
                onSection={chooseSection}
                onAddSection={() => action("section")}
                onManageLoads={() => action("loads")}
                onManageCases={() => action("cases")}
              />
              <PanelResizer
                label="Largura do navegador"
                value={left}
                onChange={setLeft}
                min={190}
                max={360}
              />
              <div className="central-workspace">
                <div className="document-tabs">
                  <span>
                    <MountainSmall />
                    {section.name}
                    <i>Modelo</i>
                  </span>
                  <button
                    className="text-button"
                    onClick={() => action("report")}
                  >
                    <FileText size={14} />
                    Entradas
                  </button>
                </div>
                <div className="display-strip">
                  <span>Mostrar</span>
                  {(["materials", "water", "loads", "circle"] as const).map(
                    (key, i) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={visibility[key]}
                          onChange={(e) =>
                            setVisibility((v) => ({
                              ...v,
                              [key]: e.target.checked,
                            }))
                          }
                        />
                        {["Solos", "Água", "Cargas", "Círculo"][i]}
                      </label>
                    ),
                  )}
                </div>
                <ModelCanvas
                  key={section.id}
                  project={project}
                  section={section}
                  selection={selection}
                  analysisCase={selectedCase}
                  sliceGeometry={
                    !draftDirty && !drawing
                      ? (searchedGeometry ??
                        (currentSlices?.status === "prepared"
                          ? currentSlices.geometry
                          : null))
                      : null
                  }
                  tool={tool}
                  dark={dark}
                  grid={grid}
                  snap={snap}
                  precision={precision}
                  onEditVertex={editVertex}
                  visibility={visibility}
                  fitToken={fitToken}
                  onSelect={select}
                  onDraw={draw}
                  onVertex={moveVertex}
                  onTool={selectTool}
                  onCursor={setCursor}
                  onDrawing={setDrawing}
                  onCancel={() => {
                    setDrawing(false);
                    setTool("select");
                  }}
                  exportRef={svg}
                />
                <div className="command-line">
                  <span className="command-dot" />
                  {instructions[tool]}
                </div>
                <button
                  className="diagnostics-toggle"
                  onClick={() => setShowDiagnostics((v) => !v)}
                >
                  <span>
                    {errors ? (
                      <AlertCircle size={14} />
                    ) : warnings ? (
                      <AlertTriangle size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Conferência do modelo{" "}
                    <b>
                      {errors
                        ? `${errors} erro(s)`
                        : warnings
                          ? `${warnings} aviso(s)`
                          : "Sem pendências de modelagem"}
                    </b>
                  </span>
                  {showDiagnostics ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronUp size={15} />
                  )}
                </button>
                {showDiagnostics && (
                  <div className="diagnostics-list" aria-label="Diagnósticos">
                    {diagnostics.length ? (
                      diagnostics.map((d, i) => (
                        <button
                          key={i}
                          onClick={async () => {
                            await locateDiagnostic(d);
                          }}
                        >
                          <span
                            className={
                              d.level === "error"
                                ? "error-dot"
                                : d.level === "info"
                                  ? "info-dot"
                                  : "warning-dot"
                            }
                          />
                          {d.message}
                        </button>
                      ))
                    ) : (
                      <p>
                        Nenhuma inconsistência detectada na modelagem. Esta
                        conferência não aprova a estabilidade.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <PanelResizer
                label="Largura das propriedades"
                value={right}
                onChange={setRight}
                min={270}
                max={440}
                reverse
              />
              {selectedCase ? (
                <CaseInspector
                  key={`${selectedCase.id}-${inspectorEpoch}`}
                  project={project}
                  section={section}
                  analysisCase={selectedCase}
                  onApply={apply}
                  onDirty={setDraftDirty}
                  onDrawCircle={() => void selectTool("case-circle")}
                  onDrawWater={() => void selectTool("case-water")}
                  onBase={() => void select({ kind: "terrain" })}
                  onSearchPreview={setSearchOverlay}
                  onProfileApply={applyNumericalProfile}
                  onDiscard={() => {
                    setDraftDirty(false);
                    setInspectorEpoch((epoch) => epoch + 1);
                  }}
                  geometryPreview={{
                    preparation: preparedCase!,
                    values: geometryFields,
                    result: currentSlices,
                    onChange: (values) => {
                      setGeometryDraft({
                        caseId: selectedCase.id,
                        epoch: inspectorEpoch,
                        values,
                      });
                      setSlicePreview(null);
                    },
                    onPrepare: setSlicePreview,
                  }}
                />
              ) : (
                <Inspector
                  key={`${section.id}-${JSON.stringify(selection)}-${inspectorEpoch}`}
                  project={project}
                  section={section}
                  selection={selection}
                  onApply={apply}
                  linked={precision.linked}
                  onDirty={setDraftDirty}
                />
              )}
            </div>
            <footer className="statusbar">
              <span>
                <span className="status-dot" />
                {busy
                  ? "Trabalhando…"
                  : dirty
                    ? "Alterações não salvas"
                    : "Projeto salvo"}
              </span>
              <span className="cursor-coordinates">
                X {cursor.x.toFixed(2)} · Z {cursor.y.toFixed(2)} m
              </span>
              <button
                className={snap ? "active" : ""}
                onClick={() => setSnap((s) => !s)}
              >
                CAPTURA{" "}
                {snap
                  ? `${precision.gridStep.toLocaleString("pt-BR")} m`
                  : "DESLIGADA"}
              </button>
              <button
                className={grid ? "active" : ""}
                onClick={() => setGrid((g) => !g)}
              >
                GRADE
              </button>
              <span>m · kN · kPa</span>
              <span className="model-only">
                Fellenius / Bishop ·{" "}
                {selectedCase?.surfaceMode === "search"
                  ? "busca circular"
                  : "círculo fixo"}
              </span>
            </footer>
          </>
        )}
      </div>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {question && (
        <Dialog
          title={question.title}
          description={question.message}
          onClose={() => answer("cancel")}
        >
          <div className="dialog-actions">
            {question.choices.map((c) => (
              <button
                key={c.value}
                className={c.primary ? "primary" : "secondary"}
                onClick={() => answer(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {dialog === "new" && (
        <Dialog
          title="Novo projeto"
          description="Crie o projeto e comece pela geometria da primeira seção."
          onClose={() => setDialog(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim())
                openProject(newProject(newName.trim(), newAuthor), null, false);
            }}
          >
            <label className="field">
              <span>Nome do projeto</span>
              <input
                autoFocus
                required
                maxLength={120}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Responsável (opcional)</span>
              <input
                maxLength={200}
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
              />
            </label>
            <p className="hint">
              Os parâmetros de solo começam em branco. Você poderá criar outras
              seções no mesmo projeto.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setDialog(null)}
              >
                Cancelar
              </button>
              <button
                className="primary"
                type="submit"
                disabled={!newName.trim()}
              >
                Criar projeto
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog === "precision" && (
        <Dialog title="Precisão do desenho" onClose={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = parseNumber(gridInput);
              if (value === null || value < 0.001 || value > 10000) {
                setPrecisionError("Use um passo entre 0,001 e 10.000 m.");
                return;
              }
              setPrecision({ ...precisionDraft, gridStep: value });
              setDialog(null);
            }}
          >
            <label className="field">
              <span>Passo da grade de captura (m)</span>
              <input
                aria-label="Passo da grade de captura (m)"
                inputMode="decimal"
                value={gridInput}
                onChange={(e) => setGridInput(e.target.value)}
              />
            </label>
            <label className="precision-option">
              <input
                type="checkbox"
                checked={precisionDraft.ortho}
                onChange={(e) =>
                  setPrecisionDraft((v) => ({ ...v, ortho: e.target.checked }))
                }
              />{" "}
              Restringir a horizontal/vertical
            </label>
            <label className="precision-option">
              <input
                type="checkbox"
                checked={precisionDraft.linked}
                onChange={(e) =>
                  setPrecisionDraft((v) => ({ ...v, linked: e.target.checked }))
                }
              />{" "}
              Editar interfaces de solo vinculadas
            </label>
            <p className="hint">
              Interfaces coincidentes entre terreno e regiões acompanham a
              edição. A linha piezométrica permanece independente. As opções de
              desenho não alteram os parâmetros físicos do projeto.
            </p>
            {precisionError && <p role="alert">{precisionError}</p>}
            <div className="dialog-actions">
              <button className="primary" type="submit">
                Aplicar precisão
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog === "report" && project && (
        <Dialog
          wide
          title="Relatório de entradas"
          onClose={() => setDialog(null)}
        >
          <Report project={project} onError={notify} />
        </Dialog>
      )}
      {dialog === "audit" && project && (
        <Dialog
          title="Conferência dos lançamentos"
          wide
          onClose={() => setDialog(null)}
        >
          <Audit project={project} onLocate={(d) => void locateDiagnostic(d)} />
        </Dialog>
      )}
      {dialog === "cases" && project && section && (
        <Dialog
          title="Casos de análise da seção"
          wide
          onClose={() => setDialog(null)}
        >
          <AnalysisCases
            project={project}
            section={section}
            runs={caseRuns}
            batchRunning={batchRunning}
            onRunBatch={startBatch}
            onCancelBatch={() => batchHandle.current?.cancel()}
            onNew={() => {
              setDialog(null);
              void action("new-case");
            }}
            onEdit={(id) => {
              setDialog(null);
              void select({ kind: "case", id });
            }}
            onDuplicate={(id) => {
              const result = addAnalysisCase(project, section.id, id);
              apply(result.project);
            }}
            onRemove={(id) => {
              apply(removeAnalysisCase(project, id));
              if (selection.kind === "case" && selection.id === id)
                setSelection({ kind: "terrain" });
            }}
          />
        </Dialog>
      )}
      {dialog === "loads" && project && section && (
        <Dialog
          title="Sobrecargas da seção"
          wide
          onClose={() => setDialog(null)}
        >
          <Loads
            project={project}
            section={section}
            onApply={(p) => {
              apply(p);
              if (
                selection.kind === "load" &&
                !p.sections
                  .find((s) => s.id === section.id)!
                  .loads.some((l) => l.id === selection.id)
              )
                setSelection({ kind: "terrain" });
            }}
            onEdit={(id) => {
              setDialog(null);
              setSelection({ kind: "load", id });
              setInspectorEpoch((n) => n + 1);
            }}
            onNew={() => {
              setDialog(null);
              void selectTool("load");
            }}
          />
        </Dialog>
      )}
      {dialog === "materials" && project && (
        <Dialog
          title="Materiais do projeto"
          wide
          onClose={() => setDialog(null)}
        >
          <Materials
            project={project}
            onEdit={(id) => {
              setDialog(null);
              setSelection({ kind: "material", id });
              setInspectorEpoch((n) => n + 1);
            }}
            onNew={() => {
              createMaterial();
              setDialog(null);
            }}
            onDuplicate={(id) => createMaterial(id)}
            onRemove={(id, replacement) => {
              const next = removeMaterial(project, id, replacement);
              apply(next);
              if (selection.kind === "material" && selection.id === id)
                setSelection({ kind: "terrain" });
            }}
            onLocate={locateMaterialUse}
          />
        </Dialog>
      )}
      {dialog === "assign-material" && project && section && (
        <Dialog title="Atribuir material" onClose={() => setDialog(null)}>
          <MaterialAssignment
            project={project}
            section={section}
            selection={selection}
            onApply={(p) => {
              if (acceptGeometry(p)) setDialog(null);
            }}
            onCancel={() => setDialog(null)}
          />
        </Dialog>
      )}
      {dialog === "help" && (
        <Dialog
          title="Começar no GeoStruct"
          description="Um fluxo simples para preparar sua seção geotécnica."
          wide
          onClose={() => setDialog(null)}
        >
          <ol className="help-steps">
            <li>
              <strong>Trace o terreno.</strong> Use Geometria → Perfil do
              terreno, da esquerda para a direita, ou edite a tabela de
              coordenadas. Enter conclui; Esc cancela.
            </li>
            <li>
              <strong>Defina os materiais.</strong> Informe as propriedades, a
              origem dos parâmetros e o solo de fundo. Desenhe regiões para os
              outros estratos.
            </li>
            <li>
              <strong>Defina água e cargas.</strong> Escolha condição seca ou
              linha piezométrica e registre sua origem. Em Gerenciar cargas,
              indique se há sobrecargas. Novas faixas começam com intensidade
              pendente; informe q e origem nas propriedades.
            </li>
            <li>
              <strong>Confira e salve.</strong> O painel de conferência mostra
              inconsistências de modelagem. Salve o arquivo .geo.json para poder
              reabrir seu trabalho.
            </li>
          </ol>
          <div className="help-shortcuts">
            <p>
              <kbd>V</kbd> selecionar · <kbd>H</kbd> pan · <kbd>F</kbd>{" "}
              enquadrar · <kbd>F3</kbd> captura
            </p>
            <p>
              <kbd>Ctrl S</kbd> salvar · <kbd>Ctrl Z</kbd> desfazer ·{" "}
              <kbd>Ctrl Shift Z</kbd> refazer
            </p>
            <p>
              Roda do mouse: zoom no cursor. Botão do meio ou Espaço + arrastar:
              pan. Botão direito durante o desenho: remover o último ponto.
            </p>
          </div>
          <div className="info-card">
            Nas propriedades do caso, calcule Fellenius ou Bishop em círculo
            fixo ou execute a busca circular para encontrar o menor FS
            admissível na malha. Confira os círculos, os diagnósticos e as
            fatias do resultado.
          </div>
          <p className="hint">
            GeoStruct {version} · Ricardo Corsini e colaboradores · OpenStruct
          </p>
        </Dialog>
      )}
    </>
  );
}
function MountainSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M1 11H4L8 3H10L13 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
