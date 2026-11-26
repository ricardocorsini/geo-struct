import {
  FilePlus2,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  MousePointer2,
  Hand,
  Mountain,
  Shapes,
  Layers3,
  Waves,
  ArrowDownToLine,
  CircleDashed,
  Maximize,
  Grid2X2,
  Magnet,
  Sun,
  Moon,
  Copy,
  Plus,
  Trash2,
  FileText,
  ImageDown,
  CircleHelp,
  FolderClosed,
  FolderInput,
  ListChecks,
  PencilRuler,
  ScanLine,
  Move,
  Scissors,
  Ruler,
  Settings2,
  PaintBucket,
  type LucideIcon,
} from "lucide-react";
import type { Tool } from "../domain/model";
export const tabs = [
  "Arquivo",
  "Geometria",
  "Materiais",
  "Água e cargas",
  "Análise",
  "Exibir",
] as const;
export type Tab = (typeof tabs)[number];
export type Action =
  | "new"
  | "open"
  | "open-default"
  | "save"
  | "save-as"
  | "close"
  | "undo"
  | "redo"
  | "section"
  | "duplicate"
  | "delete"
  | "material"
  | "materials"
  | "audit"
  | "cases"
  | "compare-cases"
  | "new-case"
  | "water-settings"
  | "loads"
  | "assign-material"
  | "fit"
  | "grid"
  | "snap"
  | "theme"
  | "report"
  | "svg"
  | "help"
  | "diagnostics"
  | "properties"
  | "precision"
  | Tool;
type Item = { action: Action; label: string; icon: LucideIcon; tip?: string };
const groups: Record<Tab, { label: string; items: Item[] }[]> = {
  Arquivo: [
    {
      label: "Projeto",
      items: [
        { action: "new", label: "Novo projeto", icon: FilePlus2 },
        { action: "open", label: "Abrir", icon: FolderOpen },
        {
          action: "open-default",
          label: "Abrir projeto padrão",
          icon: FolderInput,
          tip: "Abrir um talude de demonstração com a busca circular pronta",
        },
        {
          action: "save",
          label: "Salvar",
          icon: Save,
          tip: "Salvar projeto · Ctrl+S",
        },
        { action: "save-as", label: "Salvar como", icon: Copy },
        { action: "close", label: "Fechar projeto", icon: FolderClosed },
      ],
    },
    {
      label: "Documentação",
      items: [
        { action: "report", label: "Relatório de entradas", icon: FileText },
        { action: "svg", label: "Exportar desenho", icon: ImageDown },
      ],
    },
  ],
  Geometria: [
    {
      label: "Editar",
      items: [
        {
          action: "select",
          label: "Selecionar",
          icon: MousePointer2,
          tip: "Selecionar e mover vértices · V",
        },
        {
          action: "pan",
          label: "Mover vista",
          icon: Hand,
          tip: "Pan · H ou botão do meio",
        },
        { action: "undo", label: "Desfazer", icon: Undo2, tip: "Ctrl+Z" },
        { action: "redo", label: "Refazer", icon: Redo2, tip: "Ctrl+Shift+Z" },
      ],
    },
    {
      label: "Modelar seção",
      items: [
        { action: "terrain", label: "Perfil do terreno", icon: Mountain },
        { action: "region", label: "Região de solo", icon: Shapes },
        { action: "properties", label: "Coordenadas", icon: PencilRuler },
        { action: "delete", label: "Excluir", icon: Trash2 },
      ],
    },
    {
      label: "Contornos e camadas",
      items: [
        { action: "insert-vertex", label: "Inserir vértice", icon: Plus },
        { action: "delete-vertex", label: "Excluir vértice", icon: ScanLine },
        { action: "move-contour", label: "Mover contorno", icon: Move },
        { action: "copy-region", label: "Copiar região", icon: Copy },
        { action: "split-region", label: "Dividir região", icon: Scissors },
      ],
    },
    {
      label: "Precisão",
      items: [
        { action: "measure", label: "Medir", icon: Ruler },
        { action: "precision", label: "Precisão", icon: Settings2 },
      ],
    },
    {
      label: "Seções",
      items: [
        { action: "section", label: "Nova seção", icon: Plus },
        { action: "duplicate", label: "Duplicar seção", icon: Copy },
      ],
    },
  ],
  Materiais: [
    {
      label: "Solos e atribuição",
      items: [
        { action: "material", label: "Novo material", icon: Layers3 },
        { action: "materials", label: "Gerenciar materiais", icon: ListChecks },
        {
          action: "assign-material",
          label: "Atribuir material",
          icon: PaintBucket,
        },
        { action: "select", label: "Selecionar região", icon: MousePointer2 },
        { action: "properties", label: "Propriedades", icon: PencilRuler },
      ],
    },
  ],
  "Água e cargas": [
    {
      label: "Condições da seção",
      items: [
        {
          action: "water-settings",
          label: "Condição de água",
          icon: Settings2,
        },
        { action: "loads", label: "Gerenciar cargas", icon: ListChecks },
        { action: "water", label: "Linha piezométrica", icon: Waves },
        { action: "load", label: "Sobrecarga", icon: ArrowDownToLine },
        { action: "properties", label: "Editar valores", icon: PencilRuler },
        { action: "delete", label: "Excluir", icon: Trash2 },
      ],
    },
  ],
  Análise: [
    {
      label: "Preparação",
      items: [
        { action: "new-case", label: "Novo caso", icon: Plus },
        { action: "cases", label: "Gerenciar casos", icon: ListChecks },
        { action: "compare-cases", label: "Comparar cenários", icon: Copy },
        { action: "circle", label: "Círculo de tentativa", icon: CircleDashed },
        { action: "audit", label: "Conferir modelo", icon: ListChecks },
        { action: "report", label: "Relatório de entradas", icon: FileText },
      ],
    },
  ],
  Exibir: [
    {
      label: "Navegação",
      items: [
        {
          action: "fit",
          label: "Enquadrar",
          icon: Maximize,
          tip: "Enquadrar seção · F",
        },
        { action: "pan", label: "Mover vista", icon: Hand },
        { action: "grid", label: "Grade", icon: Grid2X2 },
        {
          action: "snap",
          label: "Captura de pontos",
          icon: Magnet,
          tip: "Vértices, segmentos, interseções e grade configurável · F3",
        },
      ],
    },
    {
      label: "Preferências",
      items: [
        { action: "theme", label: "Tema", icon: Sun },
        { action: "help", label: "Guia rápido", icon: CircleHelp },
      ],
    },
  ],
};
export function Ribbon({
  tab,
  onTab,
  onAction,
  tool,
  dark,
  grid,
  snap,
  canUndo,
  canRedo,
  busy,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onAction: (a: Action) => void;
  tool: Tool;
  dark: boolean;
  grid: boolean;
  snap: boolean;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
}) {
  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist" aria-label="Ferramentas">
        {tabs.map((t, i) => (
          <button
            key={t}
            id={`tab-${i}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls="ribbon-panel"
            tabIndex={tab === t ? 0 : -1}
            onClick={() => onTab(t)}
            onKeyDown={(e) => {
              let n = i;
              if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
              else if (e.key === "ArrowLeft")
                n = (i + tabs.length - 1) % tabs.length;
              else return;
              e.preventDefault();
              onTab(tabs[n]);
              document.getElementById(`tab-${n}`)?.focus();
            }}
          >
            {t}
          </button>
        ))}
        <span className="ribbon-stage">MODELAGEM 2D</span>
      </div>
      <div
        className="ribbon-panel"
        id="ribbon-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tabs.indexOf(tab)}`}
      >
        {groups[tab].map((g) => (
          <section className="ribbon-group" key={g.label}>
            <div className="ribbon-tools">
              {g.items.map((item) => {
                const Icon = item.action === "theme" && dark ? Moon : item.icon;
                const active =
                  item.action === tool ||
                  (item.action === "grid" && grid) ||
                  (item.action === "snap" && snap);
                return (
                  <button
                    key={item.action}
                    className={`ribbon-tool ${active ? "active" : ""}`}
                    aria-pressed={
                      [
                        "select",
                        "pan",
                        "terrain",
                        "region",
                        "water",
                        "load",
                        "circle",
                        "insert-vertex",
                        "delete-vertex",
                        "move-contour",
                        "copy-region",
                        "split-region",
                        "measure",
                        "grid",
                        "snap",
                      ].includes(item.action)
                        ? active
                        : undefined
                    }
                    title={item.tip ?? item.label}
                    onClick={() => onAction(item.action)}
                    disabled={
                      busy ||
                      (item.action === "undo" && !canUndo) ||
                      (item.action === "redo" && !canRedo)
                    }
                  >
                    <Icon size={22} strokeWidth={1.6} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <small>{g.label}</small>
          </section>
        ))}
        {tab === "Análise" && (
          <div className="analysis-note">
            <strong>Preparação dos casos</strong>
            <span>
              Nas propriedades do caso, prepare um círculo fixo ou execute a
              busca circular.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
