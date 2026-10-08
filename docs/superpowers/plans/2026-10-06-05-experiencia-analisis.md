# newpaper · Subproyecto 5 — Experiencia de análisis · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda la experiencia de análisis en la UI: panel lateral (Análisis / Coberturas / Agente), lente de sesgo sobre el lector, selección → agente, "¿Por qué esta posición?" con prueba de espejo, síntesis con gráficos (incluido el **hemiciclo** con constructor de mayorías), visuales y medios del agente, hemeroteca, hecho sin cobertura, **asistente de proveedores** y configurador del pipeline, vista de **historial** y nueva pestaña.

**Architecture:** `packages/ui-kit` recibe componentes **presentacionales** sin servicios ni i18n (todo el texto por props, como en el subproyecto 1): primitivas de análisis, lente (`segmentText` + `AnnotatedText`), gráficos SVG, mapa de teselas y hemiciclo; así los reutiliza el móvil (subproyecto 8). `apps/ui/src/features/*` recibe los contenedores con estado, que hablan con el pipeline (`getPipeline()` del subproyecto 4) y con los comandos Tauri (`commands`). El panel se monta en un hueco lateral nuevo del armazón; al ocupar sitio, `ContentSlot` encoge la webview de contenido sola.

**Tech Stack:** React 19.3, TypeScript 7, Vite 8, CSS con tokens `--np-*`, SVG propio, Vitest 5 + Testing Library 16 + user-event 14 + jsdom 30, WebdriverIO 10 + `tauri-driver`; `@newpaper/pipeline` (subproyecto 4), `@newpaper/i18n`, `@newpaper/ui-kit`.

## Decisiones tomadas

1. **Hueco lateral**: el registro del subproyecto 1 no tiene panel lateral. Se añade `registerSidePanel` y el armazón pasa a `TabStrip / Toolbar / [main | aside]`. La webview de contenido se reajusta sola porque `ContentSlot` mide su rectángulo con `ResizeObserver`.
2. **Lente y selección sobre el lector propio**: las webviews de contenido no tienen IPC y no exponen la selección. La lente pinta `article.text` (texto plano, offsets del pipeline) con marcas; "Preguntar sobre la selección" funciona en modo lector. En vista original, activar la lente o Ctrl+K pasa la pestaña a modo lector (`tabSetView`) y abre el agente.
3. **Estado del análisis** en memoria por pestaña (`analysisStore`), con descarte de resultados obsoletos si la pestaña cambia de URL. Persistencia: la caché del pipeline (reabrir desde el historial recupera el análisis sin coste).
4. **Mapa** (`type: "map"`): cartograma de teselas (una casilla por región en una rejilla fija) para países de la UE (ISO 3166‑1 alfa‑2), comunidades autónomas (`ES-xx`), Länder (`DE-xx`) y naciones del Reino Unido (`GB-ENG`…). Sin geometrías ni descargas. Un código desconocido hace que el mapa se muestre como tabla.
5. **Hemiciclo**: disposición calculada en filas concéntricas (asientos por fila proporcionales al radio), asientos ordenados por ángulo y asignados por el `order` ideológico de `config/parties-<locale>.json`. Constructor de mayorías: pulsar un partido lo suma o lo quita del "sí"; se compara con `majority`. Siempre hay tabla alternativa accesible. **No se muestran datos de ejemplo**: el pipeline rechaza gráficos sin fuente.
6. **"¿Por qué esta posición?"** (mockup Posicion): señales con su evidencia, léxico, confianza frente al umbral de `config/framing-weights.json`, concordancia entre modelos (si hay `judgeB`) y **prueba de espejo bajo demanda** (puntúa el texto y su espejo con el análisis rápido; pares de `config/mirror-swaps-<locale>.json`, que hoy solo existe en español: en otros idiomas el control no aparece). El bloque "Validación ciega" del mockup **no se muestra** hasta que exista un informe real; no se inventan cifras.
7. **Moneda**: los precios del registro están en USD; el asistente y el configurador muestran USD (`formatCurrency(n, 'USD')`). El mockup dice "15 €"; se anota como discrepancia.
8. **Umbrales mostrados**: el mockup dice "umbral 0,45" de confianza y "diferencia 0,15" entre modelos; se muestran los valores reales (`minConfidence` de `framing-weights.json`, 0,35, y 20 puntos de 100 del subproyecto 4).
9. **Asistente de proveedores** en `newpaper://ajustes/ia/conectar` (3 pasos del mockup Proveedores: elegir/pegar clave → probar conexión → asignación automática). La clave pasa una vez por JS al guardarla (`secret_set` con `ai.<providerId>`) y no vuelve a leerse.
10. **Nueva pestaña** (`inicio`) sustituye la provisional del subproyecto 1: saludo, buscador con sugerencias, briefing, temas seguidos, "Continuar leyendo" y resultados de `?q=`. Desde una búsqueda sin coberturas se puede abrir el flujo de hecho sin cobertura con la consulta.
11. **Historial** en `newpaper://historial` (mockup Historial); los ajustes de retención y pausa siguen en Ajustes › Datos (subproyecto 1) y aquí se reflejan.
12. **Endpoint propio**: el registro solo tiene una entrada `custom`, así que en v1 hay **un** endpoint propio (id fijo `custom`). Como sus modelos no están en el registro, si es el único proveedor conectado el asistente lo asigna a mano a todas las etapas.
13. **Sin conexión** (§18): el panel muestra lo que haya en caché; el agente avisa si no hay modelo local asignado.

## Global Constraints

- §8: estética "papel" con tokens `--np-*` (Papel/Tinta); movimiento `cubic-bezier(.22,1,.36,1)` y rebote `(.34,1.56,.64,1)`, respetando `prefers-reduced-motion`; objetivos ≥ 44 px, botones reales, `aria-*`, contraste AA, navegación por teclado completa del panel.
- §8 pantallas: panel (Análisis / Coberturas / Agente, lente, eje de encuadre, afirmaciones); síntesis (Breve / Completa / Cambios, gráficos, partes, disputa); hemeroteca; hecho sin cobertura; nueva pestaña; ajustes de IA con proveedores y pipeline.
- §6.2: visualizaciones `bar|line|range|stacked|matrix|table|parliament|map`; **sin fuente → no se dibujan**; hemiciclo con mayoría y datos solo de fuentes citadas.
- §5.2.1: se muestran la posición relativa al grupo con su franja, las señales con evidencia citada, "No determinable", el léxico y los controles.
- §6.3: el detector muestra siempre "indicio, no prueba".
- §6.4: "< 3 coberturas y 0 fuentes primarias"; confirmación **en cada uso** (casilla obligatoria, sin "no volver a preguntar"); resultado marcado como no verificado con etiquetas por frase, confianza baja y "Cómo comprobarlo tú".
- §6.5: modos Preguntar / Verificar / Explicar; citas numeradas que mapean a fuentes recuperadas; medios nunca generados.
- §5.3: hemeroteca con línea de tiempo, A/B, Unificado / Lado a lado / Leer captura, "Editada N veces sin aviso"; nunca se navega a la web de Wayback.
- §16: historial agrupado por día, filtros por medio y tipo, búsqueda FTS5, borrar por rango/medio/todo, pausa; reabrir recupera el análisis en caché.
- §11: el lector anotado pinta solo texto plano; nunca `dangerouslySetInnerHTML` en este plan. CSP estricta.
- §14: todo texto visible en `packages/i18n/locales/{es,en,de}.json`; el escaneo de texto escrito a mano debe seguir limpio; código, identificadores y commits en inglés.
- Atajos (subproyecto 1): `analyze` (Ctrl+Shift+A) y `ask-agent` (Ctrl+K).
- **Política de tests**: solo llevan test la segmentación de la lente, el controlador del análisis (resultados obsoletos), las citas del agente, la geometría del hemiciclo y el constructor de mayorías, la confirmación obligatoria del hecho sin cobertura, la agrupación del historial por día y el e2e. El resto se comprueba con `pnpm typecheck`, el escaneo i18n y la prueba manual.

---

## Interfaces de subproyectos anteriores

- Subproyecto 1: registro (`registerInternalPage`, `registerSettingsSection`, `registerToolbarItem`, `registerReaderView`, `registerOverlay`, `registerShortcut`), `BrowserShell`, `ContentSlot`, `createStore`, `browserStore`, `useActiveTab`, `useArticle`, `useSetting`, `commands` (`tabSetView`, `settingsGet/Set`, `historySearch`, `historyDelete`, `omniboxSuggest`, `secretSet`, `secretHas`, `secretDelete`, `configRead`), `onTabPage`, `navigate`, `openInternal`, `rewriteImage`, `renderWithI18n`; ui-kit `Button`, `IconButton`, `Switch`, `SegmentedControl`, `Tabs`, `ReaderView`, `useReducedMotion`; i18n `useT`, `useI18n` (`formatDate`, `formatNumber`, `formatCurrency`, `formatRelativeDays`).
- Subproyecto 3: `commands.{coverageFor, eventsBriefing, eventsSearch, eventDetail, topicsList, topicSetFollowing, watchAdd, waybackCaptures, waybackCaptureHtml, waybackAnalyze, waybackDiff, savedList, savedAdd, savedRemove}`, tipos `Coverage`, `EventCard`, `TopicState`, `CdxRow`, `CaptureInput`, `CaptureText`, `WaybackHistory`, `TextDiff`, `DiffOp`; ficheros `config/parties-<locale>.json` (`{ version, parliament, parties: { id, name, short, color, order, bloc }[] }`).
- Subproyecto 4: `getPipeline()`, `getRegistry()`, `resetPipeline()`, `useAiSettings()` (`apps/ui/src/features/ai/pipeline.ts`); de `@newpaper/pipeline`: `Pipeline`, `AnalysisResult`, `StageEvent`, `StageId`, `ArticleInput`, `Score`, `Signal`, `Verdict`, `VerdictStatus`, `Claim`, `LoadedPhrase`, `Synthesis`, `Visualization`, `AgentEvent`, `AgentCitation`, `MediaItem`, `AgentMode`, `UnverifiedReport`, `RetrievedSource`, `mirrorCheck`, `mirrorText`, `detectProviders`, `autoAssign`, `describeAssignment`, `PRESETS`, `PresetId`, `estimateAnalysis`, `Registry`, `ProviderEntry`; comandos `usage_month`, `ai_local_probe`, `ai_set_endpoints` (`commands.usageMonth`, `aiLocalProbe`, `aiSetEndpoints`).

## Contratos que publica este plan

| Elemento | Lo usan |
|---|---|
| ui-kit: `segmentText`, `paragraphRanges`, `AnnotatedText`, `VerdictTag`, `NeutralityRing`, `FramingAxis`, `ConfidenceMeter`, `StageList` | 8 |
| ui-kit: `VisualizationView`, `BarChart`, `LineChart`, `RangeChart`, `StackedChart`, `MatrixChart`, `TableChart`, `TileMap`, `ParliamentChart`, `hemicycleLayout`, `coalitionSeats` | 8 |
| `registerSidePanel`, `sidePanel()` (registro del armazón) | 6 (páginas sin conexión no lo usan), 8 |
| `analysisStore`, `controller` (`analyzeQuick`, `analyzeFull`, `cancel`), `useTabAnalysis(tabId)` | 6 (cola sin conexión), 8 |
| `openPanel(tab, extra?)`, `panelStore` | 6 (recorrido: marcas sobre la interfaz) |
| Páginas `newpaper://sintesis`, `newpaper://hemeroteca`, `newpaper://historial`, `newpaper://ajustes/ia/conectar`; secciones de Ajustes `ia` (orden 40) y `analisis` (orden 45) | 6 (recorrido), 7 |
| `useAgent(tabId)` y `renderCitations(text, citations)` | 8 |

## Mapa de archivos

```
packages/ui-kit/src/
  analysis/{tone.ts, VerdictTag.tsx, NeutralityRing.tsx, FramingAxis.tsx, ConfidenceMeter.tsx, StageList.tsx, analysis.css}
  lens/{segmentText.ts, segmentText.test.ts, AnnotatedText.tsx, lens.css}
  charts/{scale.ts, ChartFrame.tsx, BarChart.tsx, LineChart.tsx, RangeChart.tsx, StackedChart.tsx, MatrixChart.tsx, TableChart.tsx, TileMap.tsx, tileGrids.ts, VisualizationView.tsx, charts.css}
  charts/parliament/{hemicycle.ts, hemicycle.test.ts, ParliamentChart.tsx}
  index.ts                                              (Modify)
apps/ui/src/shell/{registry.ts, BrowserShell.tsx, shell.css}     (Modify)
apps/ui/src/features/analysis/
  panelStore.ts controller.ts controller.test.ts marks.ts parties.ts vizLabels.ts axisLabels.ts
  AnalysisReader.tsx SelectionToolbar.tsx AnalysisButton.tsx
  AnalysisPanel.tsx AnalysisTab.tsx PositionDetail.tsx CoverageTab.tsx
  agent/{useAgent.ts, citations.ts, citations.test.ts, AgentTab.tsx}
  nocoverage/{NoCoverageBlock.tsx, ConsentDialog.tsx, ConsentDialog.test.tsx, UnverifiedCard.tsx}
  register.ts analysis.css
apps/ui/src/features/synthesis/{SynthesisPage.tsx, rewrites.ts, register.ts, synthesis.css}
apps/ui/src/features/hemeroteca/{HemerotecaPage.tsx, register.ts, hemeroteca.css}
apps/ui/src/features/providers/{ConnectWizard.tsx, AiSection.tsx, AnalysisSettingsSection.tsx, register.ts, providers.css}
apps/ui/src/features/history/{groupByDay.ts, groupByDay.test.ts, HistoryPage.tsx, register.ts, history.css}
apps/ui/src/features/newtab/{NewTabPage.tsx, register.ts, newtab.css}
apps/ui/src/features/index.ts                          (Modify)
packages/i18n/locales/{es,en,de}.json                  (Modify)
e2e/fixtures/{mockLlm.ts, smi.html}  e2e/specs/analysis.e2e.ts  e2e/wdio.conf.ts (Modify)
```

Todos los comandos se ejecutan desde `E:\newpaper` en PowerShell.

---

### Task 1: Armazón — hueco lateral y estado del panel

**Files:**
- Modify: `apps/ui/src/shell/registry.ts`, `apps/ui/src/shell/BrowserShell.tsx`, `apps/ui/src/shell/shell.css`
- Create: `apps/ui/src/features/analysis/panelStore.ts`

**Interfaces:**
- Produces:
  - `SidePanelProps { tab: TabInfo }`, `registerSidePanel(C: ComponentType<SidePanelProps>)`, `sidePanel(): ComponentType<SidePanelProps> | null`
  - `PanelTab = 'analysis' | 'coverage' | 'agent'`, `PanelState { open; tab; wide; detail: 'none' | 'position'; lens: boolean; focusClaim: string | null; agentSeed: { fragment: string | null; mode: AgentMode; question: string | null } | null }`
  - `panelStore`, `openPanel(tab, extra?)`, `closePanel()`, `togglePanel()`, `usePanel(selector)`

- [ ] **Step 1: Registro del hueco lateral**

Añade a `apps/ui/src/shell/registry.ts`, junto a `registerReaderView`:
```ts
export interface SidePanelProps { tab: TabInfo }
let sidePanelComponent: ComponentType<SidePanelProps> | null = null;
/** Un único panel lateral (el de análisis). El componente decide si se muestra (devuelve `null` cerrado). */
export function registerSidePanel(C: ComponentType<SidePanelProps>): void {
  sidePanelComponent = C;
}
export function sidePanel(): ComponentType<SidePanelProps> | null {
  return sidePanelComponent;
}
```
y dentro de `_resetRegistry()`: `sidePanelComponent = null;`.

- [ ] **Step 2: Armazón con `main` y `aside`**

En `apps/ui/src/shell/BrowserShell.tsx`, importa `sidePanel` y `useActiveTab` (ya importado) y sustituye el `return` de `BrowserShell` por:
```tsx
export function BrowserShell() {
  const tab = useActiveTab();
  const Panel = sidePanel();
  return (
    <div className="np-app np-root">
      <TabStrip />
      <Toolbar />
      <div className="np-workspace">
        <main className="np-main">
          <ContentSlot />
          <ActiveSurface />
        </main>
        {Panel && tab && tab.kind === 'web' ? <Panel tab={tab} /> : null}
      </div>
      {overlays().map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </div>
  );
}
```

Añade a `apps/ui/src/shell/shell.css`:
```css
.np-workspace { display: flex; flex: 1; min-height: 0; }
.np-workspace > .np-main { flex: 1; min-width: 0; position: relative; }
.np-side {
  width: 380px; flex: none; border-left: 1px solid var(--np-line); background: var(--np-panel);
  display: flex; flex-direction: column; min-height: 0; transition: width 220ms var(--np-ease);
}
.np-side--wide { width: min(640px, 55vw); }
@media (prefers-reduced-motion: reduce) { .np-side { transition: none; } }
```

> `ContentSlot` mide `main`: al abrirse el panel su ancho baja y la webview de contenido se recoloca sola.

- [ ] **Step 3: Estado del panel**

`apps/ui/src/features/analysis/panelStore.ts`:
```ts
import type { AgentMode } from '@newpaper/pipeline';
import { createStore } from '../../state/store';

export type PanelTab = 'analysis' | 'coverage' | 'agent';
export interface AgentSeed { fragment: string | null; mode: AgentMode; question: string | null }
export interface PanelState { open: boolean; tab: PanelTab; wide: boolean; detail: 'none' | 'position'; lens: boolean; focusClaim: string | null; agentSeed: AgentSeed | null }

export const panelStore = createStore<PanelState>({ open: false, tab: 'analysis', wide: false, detail: 'none', lens: true, focusClaim: null, agentSeed: null });

export function openPanel(tab: PanelTab, extra: Partial<PanelState> = {}): void {
  panelStore.set((s) => ({ ...s, open: true, tab, detail: 'none', ...extra }));
}
export function closePanel(): void {
  panelStore.set((s) => ({ ...s, open: false, wide: false, detail: 'none' }));
}
export function togglePanel(): void {
  const s = panelStore.get();
  if (s.open) closePanel();
  else openPanel(s.tab);
}
export const usePanel = <S,>(selector: (s: PanelState) => S): S => panelStore.use(selector);
```

- [ ] **Step 4: Comprobar que compila**

Run:
```powershell
pnpm --filter @newpaper/ui typecheck
pnpm --filter @newpaper/ui test
```
Expected: sin errores de tipos; los tests del subproyecto 1 siguen en verde (el hueco lateral no cambia nada si no hay panel registrado).

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/shell apps/ui/src/features/analysis/panelStore.ts
git commit -m "feat(ui): side panel slot in the browser shell and analysis panel state"
```

---
### Task 2: Textos de la experiencia de análisis (es, en, de)

**Files:**
- Modify: `packages/i18n/locales/es.json`, `packages/i18n/locales/en.json`, `packages/i18n/locales/de.json`

**Interfaces:**
- Produces: espacios `analysis`, `agent`, `charts`, `coverage`, `position`, `noCoverage`, `synthesis`, `hemeroteca`, `providers`, `history`, `newtab`, y dentro de `settings` las claves `ai` y `analysis`. Todas las tareas siguientes usan estas claves; los marcadores (`{n}`, `{name}`…) son los mismos en los tres idiomas.

- [ ] **Step 1: Español**

Añade al nivel raíz de `packages/i18n/locales/es.json`:
```json
"analysis": {
  "panel": { "label": "Panel de análisis", "analysis": "Análisis", "coverage": "Coberturas", "agent": "Agente", "close": "Cerrar el panel" },
  "toolbar": { "label": "Análisis", "title": "Abrir o cerrar el panel de análisis (Ctrl+Shift+A)" },
  "actions": { "analyze": "Analizar", "full": "Hacer el análisis completo", "synthesis": "Ver la versión neutral", "hemeroteca": "Ver cómo ha cambiado" },
  "lens": { "toggle": "Lente de sesgo", "loaded": "Frase cargada" },
  "selection": { "label": "Preguntar al agente sobre la selección", "ask": "Preguntar", "verify": "Verificar", "explain": "Explicar" },
  "needsArticle": "Abre una noticia para analizarla.",
  "empty": "Aún no hay análisis de esta noticia.",
  "running": "Analizando…",
  "error": "El análisis no ha terminado: {message}",
  "noScore": "Sin nota todavía",
  "neutrality": "Neutralidad: {value} de 100",
  "neutralityCaption": "neutralidad",
  "mode": { "quick": "Análisis rápido · provisional", "full": "Análisis completo" },
  "capped": "Has llegado al límite mensual: este análisis se ha hecho con modelos locales.",
  "disagreement": "Dos modelos distintos no coinciden en la posición. Tómala con cautela.",
  "whyPosition": "¿Por qué esta posición?",
  "axis": { "label": "Posición del texto respecto a la cobertura del mismo hecho", "left": "izquierda", "center": "centro", "right": "derecha", "article": "este artículo", "band": "banda de incertidumbre", "groupCenter": "centro del grupo" },
  "verdictText": { "neutral": "Neutral", "sesgo_leve": "Sesgo leve", "sesgado": "Sesgado", "muy_sesgado": "Muy sesgado", "no_determinable": "No determinable" },
  "verdict": { "verificado": "Verificado", "enganoso": "Engañoso", "falso": "Falso", "falta_contexto": "Falta contexto", "opinion": "Opinión", "no_verificable": "No verificable", "pendiente": "Sin verificar" },
  "claims": { "title": "Afirmaciones" },
  "loadedCount": "{n, plural, one {# frase cargada en el texto} other {# frases cargadas en el texto}}",
  "ai": {
    "title": "Posible texto generado con IA",
    "probability": "Probabilidad de texto generado: {value}",
    "disclaimer": "Es un indicio, no una prueba.",
    "signal": { "burstiness": "Ritmo uniforme de las frases", "templates": "Frases de plantilla", "repetition": "Arranques repetidos", "c2pa": "Imágenes sin credenciales de contenido", "llm": "Juicio de un modelo" }
  },
  "stagesLabel": "Pasos del análisis",
  "stage": { "claims": "Afirmaciones", "quickScore": "Nota rápida", "verify": "Verificación", "score": "Posición y neutralidad", "judgeB": "Segundo juez", "synthesis": "Versión neutral", "aiDetect": "Detector de IA", "agent": "Agente", "investigate": "Investigación sin cobertura" },
  "stageStatus": { "pending": "en espera", "running": "en curso", "done": "hecho", "cached": "en caché", "failed": "ha fallado", "skipped": "sin modelo" }
},
"agent": {
  "title": "Agente",
  "needsArticle": "Abre una noticia para preguntar sobre ella.",
  "context": "Artículo, {coverages, plural, one {# cobertura} other {# coberturas}} y {sources, plural, one {# fuente} other {# fuentes}} en contexto",
  "wide": "Ampliar el agente",
  "narrow": "Estrechar el agente",
  "empty": "Pregunta lo que quieras sobre esta noticia o selecciona un fragmento.",
  "placeholder": "Tu pregunta",
  "send": "Enviar",
  "stop": "Detener",
  "clearFragment": "Quitar el fragmento",
  "mode": { "label": "Modo", "ask": "Preguntar", "verify": "Verificar", "explain": "Explicar" },
  "auto": { "ask": "¿Qué puedes decirme de este fragmento?", "verify": "¿Es cierto este fragmento?", "explain": "Explícame el contexto de este fragmento." },
  "tools": { "searchCoverage": "busca coberturas", "fetchSource": "lee una fuente", "getVerdicts": "consulta los veredictos", "renderVisualization": "dibuja un gráfico", "showMedia": "muestra una imagen de la fuente" },
  "openVideo": "Ver el vídeo en la fuente",
  "mediaNote": "Imágenes originales de las fuentes citadas, nunca generadas.",
  "noModel": "No hay ningún modelo asignado al agente. Conecta uno en Ajustes › IA o usa un modelo local.",
  "error": "El agente no ha podido responder: {message}"
},
"charts": {
  "sources": "Fuentes:",
  "showTable": "Ver como tabla",
  "showChart": "Ver el gráfico",
  "label": "Etiqueta",
  "value": "Valor",
  "region": "Región",
  "matrix": { "si": "Sí", "par": "En parte", "mal": "Mal", "no": "No" },
  "parliament": {
    "chart": "Hemiciclo",
    "majority": "{n} · mayoría",
    "seatsFor": "{n, plural, one {# escaño a favor} other {# escaños a favor}}",
    "reached": "mayoría alcanzada",
    "short": "{n, plural, one {falta # escaño} other {faltan # escaños}}",
    "hint": "Pulsa un partido para sumarlo o quitarlo del «sí»",
    "party": "Partido",
    "seats": "Escaños",
    "vote": "Voto supuesto",
    "yes": "Sí",
    "no": "No",
    "reset": "Empezar de nuevo"
  }
},
"coverage": {
  "title": "Coberturas del mismo hecho",
  "needsArticle": "Abre una noticia para ver cómo la cuentan otros medios.",
  "loading": "Buscando coberturas…",
  "error": "No se han podido cargar las coberturas.",
  "summary": "{outlets, plural, =0 {Ningún otro medio lo ha contado todavía} one {Lo cuenta # medio} other {Lo cuentan # medios}}",
  "noSearchKey": "Añade una clave de búsqueda en Ajustes › Fuentes para encontrar más coberturas.",
  "searchFailed": "La búsqueda de respaldo no ha respondido.",
  "bucket": { "left": "Izquierda", "center": "Centro", "right": "Derecha", "unknown": "Sin medir" },
  "leanTitle": "Línea editorial medida del medio (0 izquierda – 100 derecha)",
  "leanUnknown": "sin medir",
  "howMeasured": "Cómo se mide la línea de cada medio"
},
"position": {
  "title": "¿Por qué esta posición?",
  "back": "Volver al análisis",
  "none": "Todavía no hay una posición calculada.",
  "intro": "Se mide desde el texto, nunca desde la fama del medio. El modelo lee el artículo anonimizado y lo compara con las otras coberturas del mismo hecho.",
  "blind": "Lectura ciega: medio oculto",
  "relative": "Neutral es estar cerca del centro del grupo, no a mitad de la escala.",
  "signals": "Señales",
  "signalsHint": "Cada una con su evidencia citada del texto. Sin cita, la señal no cuenta.",
  "signal": { "lexico": "Léxico", "encuadre": "Encuadre", "voces": "Voces citadas", "atribucion": "Verbos de atribución", "adjetivacion": "Adjetivación", "omision": "Omisiones", "orden": "Orden y titular" },
  "voices": "Voces",
  "voice": "{name}: {quotes, plural, one {# cita} other {# citas}}",
  "lastWord": "La última palabra es de {name}.",
  "omissions": "Lo que dan otras coberturas y aquí falta",
  "lexicon": "Léxico calibrado",
  "lexiconBody": "Un diccionario de frases partidistas sacado del parlamento: para cada expresión se mide cuánto más la usa un bloque que otro. Es una señal independiente del modelo.",
  "confidence": "Confianza total",
  "threshold": "umbral {value}",
  "confidenceNote": "Si la confianza es baja, se muestra «No determinable» en lugar de un número.",
  "controls": "Controles",
  "judgesAgree": "Dos modelos concuerdan",
  "judgesDisagree": "Dos modelos no concuerdan",
  "judgesOff": "La comparación entre modelos se activa con un segundo proveedor fuerte.",
  "mirror": "Prueba de espejo",
  "mirrorBody": "Se intercambian actores y términos de un bando por los del otro. La puntuación debe invertirse.",
  "mirrorRun": "Repetir la prueba",
  "mirrorRunning": "Comprobando…",
  "mirrorResult": "Original {a} · espejo {b}.",
  "mirrorOk": "Simétrica",
  "mirrorBad": "Asimétrica: revisa el modelo asignado"
},
"noCoverage": {
  "title": "Casi nadie ha contado esto",
  "body": "{outlets, plural, =0 {Ningún medio} one {Solo # medio} other {Solo # medios}} y ninguna fuente primaria. No se puede contrastar como el resto.",
  "investigate": "Investigar de todos modos",
  "investigating": "Investigando…",
  "watch": "Avisarme cuando haya cobertura",
  "watching": "Te avisaremos",
  "consent": {
    "title": "Investigar sin cobertura",
    "body": "El resultado no estará verificado: puede contener errores y se basa en muy pocas fuentes.",
    "checkbox": "Entiendo que el resultado no está verificado",
    "confirm": "Investigar sin verificar",
    "cancel": "Cancelar"
  },
  "report": { "title": "Informe sin verificar", "badge": "No verificado", "confidence": "Confianza {value}", "howToCheck": "Cómo comprobarlo tú" },
  "tags": { "fuente_unica": "Fuente única", "solo_redes": "Solo en redes", "varias_no_oficiales": "Varias fuentes no oficiales", "sin_fuente": "Sin fuente" }
},
"synthesis": {
  "kicker": "Versión neutral",
  "loading": "Cargando la síntesis…",
  "missing": "Esta síntesis ya no está en la caché. Vuelve a analizar la noticia.",
  "view": { "label": "Vista", "brief": "Breve", "full": "Completa", "changes": "Cambios" },
  "facts": "Hechos",
  "factKind": { "hecho": "Hecho", "atribuida": "Atribuido", "disputa": "En disputa" },
  "parties": "Lo que dice cada parte",
  "evidence": "Peso de la evidencia",
  "unknowns": "Lo que aún no se sabe",
  "removed": "(se elimina)"
},
"hemeroteca": {
  "kicker": "Hemeroteca",
  "noUrl": "Falta la dirección del artículo.",
  "loading": "Buscando capturas…",
  "progress": "Leyendo capturas: {done} de {total}",
  "error": "No se ha podido consultar el archivo: {message}",
  "none": "No hay capturas de este artículo en el archivo.",
  "silent": "{n, plural, one {Editada # vez sin aviso} other {Editada # veces sin aviso}}",
  "notice": "El medio avisa de cambios: {notice}",
  "timeline": "Capturas",
  "mode": { "label": "Modo", "unified": "Unificado", "side": "Lado a lado", "read": "Leer captura" },
  "comparing": "Comparando {a} con {b}",
  "single": "Solo hay una captura: no hay nada que comparar.",
  "edits": "Cambios detectados",
  "kind": { "titular": "Titular", "dato": "Cifra", "parrafo_anadido": "Párrafo añadido", "parrafo_eliminado": "Párrafo eliminado", "texto": "Redacción" }
},
"providers": {
  "loading": "Cargando proveedores…",
  "title": "Conectar un proveedor",
  "subtitle": "Tres pasos y listo. No hace falta saber nada de inteligencia artificial.",
  "cat": { "recommended": "Recomendados", "cloud": "Nube", "cloudHint": "Pagas por uso con tu propia clave", "local": "En tu equipo", "localHint": "Gratis y sin enviar datos", "advanced": "Avanzado" },
  "pitch": { "openai": "El más conocido. Rápido y bueno en casi todo.", "nous": "Modelos abiertos Hermes, sin filtros de estilo." },
  "connect": "Conectar {name}",
  "pasteKey": "¿Ya tienes una clave? Pégala aquí",
  "pasteHint": "Reconocemos el proveedor por cómo empieza la clave.",
  "detected": "Es de {name}.",
  "ambiguous": "Esa clave puede ser de varios proveedores. Elige cuál:",
  "unknownPrefix": "No reconocemos este prefijo. Elige el proveedor en la lista de abajo.",
  "continue": "Continuar",
  "detectedLocal": "{n, plural, one {detectado · # modelo} other {detectado · # modelos}}",
  "notRunning": "no está en marcha",
  "customTitle": "Compatible con OpenAI",
  "customHint": "Tu propio endpoint /v1",
  "customName": "Nombre",
  "baseUrl": "Dirección base",
  "customModels": "Modelos (separados por comas)",
  "key": "Clave",
  "startsWith": "Empieza por {prefix}",
  "keyStorage": "Tu clave se guarda en el llavero del sistema, cifrada. Nunca sale de tu equipo salvo hacia {name}, y ni siquiera la ve la parte web de newpaper.",
  "noKey": "¿No tienes clave?",
  "getKey": "Consigue tu clave",
  "back": "Atrás",
  "test": "Probar conexión",
  "testing": "Probando…",
  "testOk": "Conectado en {ms} ms",
  "testFail": "No ha funcionado: {message}",
  "doneTitle": "{name} está listo",
  "doneSub": "Listo para leer noticias contigo. Hemos asignado un modelo a cada paso.",
  "where": { "local": "En tu equipo" },
  "priceUnknown": "precio desconocido",
  "estimate": "Coste estimado por análisis: {total}",
  "estimateUnknown": "(sin contar los modelos de precio desconocido)",
  "another": "Conectar otro proveedor",
  "done": "Listo",
  "connected": "Proveedores conectados",
  "noneConnected": "Aún no hay ningún proveedor conectado.",
  "disconnect": "Desconectar",
  "connectOne": "Conectar un proveedor",
  "pipeline": "Modelo de cada paso",
  "preset": { "label": "Preset", "privacy": "Privacidad total", "balanced": "Equilibrado", "quality": "Máxima calidad", "cheap": "Mínimo coste" },
  "presetHint": {
    "privacy": "Todo con modelos de tu equipo. Nada sale de casa.",
    "balanced": "Lo ligero en local si puedes; lo importante, con un buen modelo en la nube.",
    "quality": "Los mejores modelos en cada paso y un segundo juez para la posición.",
    "cheap": "Los modelos más baratos que tengas conectados."
  },
  "stage": "Paso",
  "model": "Modelo",
  "modelFor": "Modelo para {stage}",
  "backToAuto": "Volver a la asignación automática",
  "auto": "Asignado automáticamente según el preset.",
  "budget": "Gasto",
  "limit": "Límite mensual (USD)",
  "limitHint": "Al llegar al límite, el análisis pasa a modelos locales. Déjalo vacío para no poner límite.",
  "spent": "Gastado este mes: {amount}"
},
"history": {
  "title": "Historial",
  "search": "Buscar en el historial",
  "paused": "El historial está en pausa: no se guarda nada nuevo hasta que lo reanudes.",
  "resume": "Reanudar",
  "pause": "Pausar el historial",
  "kind": { "label": "Tipo", "all": "Todo", "visit": "Visitas", "search": "Búsquedas", "analysis": "Análisis" },
  "outlet": "Medio",
  "allOutlets": "Todos los medios",
  "today": "Hoy",
  "yesterday": "Ayer",
  "searched": "Búsqueda: {query}",
  "analyzed": "Analizado",
  "deleteOne": "Borrar esta entrada",
  "empty": "El historial está vacío.",
  "noResults": "No hay nada que coincida.",
  "manage": "Borrar y conservar",
  "delete": { "hour": "Borrar la última hora", "today": "Borrar hoy", "week": "Borrar los últimos 7 días", "outlet": "Borrar todo lo de {outlet}", "all": "Borrar todo el historial" },
  "retention": "Conservar el historial",
  "days": "{n, plural, one {# día} other {# días}}",
  "forever": "Para siempre",
  "privateNote": "Las pestañas privadas no guardan nada: ni visitas, ni búsquedas, ni análisis."
},
"newtab": {
  "greeting": { "night": "Buenas noches", "morning": "Buenos días", "afternoon": "Buenas tardes", "evening": "Buenas noches" },
  "search": "Busca un tema, un hecho o escribe una dirección",
  "results": "Resultados para «{query}»",
  "searching": "Buscando…",
  "noCoverage": "Ningún medio ha cubierto «{query}».",
  "briefing": "Lo que está pasando",
  "outlets": "{n, plural, one {# medio} other {# medios}}",
  "leanMix": "Izquierda {left}, centro {center}, derecha {right}",
  "topics": "Tus temas",
  "continue": "Continuar leyendo",
  "saved": "Guardado"
}
```

Y **dentro** del objeto `settings` que ya existe:
```json
"ai": { "title": "IA", "description": "Proveedores, modelo de cada paso y gasto" },
"analysis": {
  "title": "Análisis",
  "description": "Cuándo se analiza y qué se muestra",
  "quickOnOpen": "Análisis rápido al abrir una noticia",
  "quickOnOpenHint": "Con un modelo local; es provisional.",
  "autoFull": "Análisis completo automático",
  "autoFullHint": "Usa tus proveedores en cada noticia que abras. Puede costar dinero.",
  "detector": "Detector de texto generado con IA",
  "detectorHint": "Muestra un indicio por párrafo. Nunca es una prueba.",
  "language": "Los análisis se escriben en el idioma de la interfaz; las citas se dejan en su idioma original."
}
```

- [ ] **Step 2: Inglés**

Añade al nivel raíz de `packages/i18n/locales/en.json`:
```json
"analysis": {
  "panel": { "label": "Analysis panel", "analysis": "Analysis", "coverage": "Coverage", "agent": "Agent", "close": "Close the panel" },
  "toolbar": { "label": "Analysis", "title": "Open or close the analysis panel (Ctrl+Shift+A)" },
  "actions": { "analyze": "Analyse", "full": "Run the full analysis", "synthesis": "See the neutral version", "hemeroteca": "See how it changed" },
  "lens": { "toggle": "Bias lens", "loaded": "Loaded phrase" },
  "selection": { "label": "Ask the agent about the selection", "ask": "Ask", "verify": "Verify", "explain": "Explain" },
  "needsArticle": "Open a news article to analyse it.",
  "empty": "This article has not been analysed yet.",
  "running": "Analysing…",
  "error": "The analysis did not finish: {message}",
  "noScore": "No score yet",
  "neutrality": "Neutrality: {value} out of 100",
  "neutralityCaption": "neutrality",
  "mode": { "quick": "Quick analysis · provisional", "full": "Full analysis" },
  "capped": "You reached your monthly limit: this analysis used local models.",
  "disagreement": "Two different models disagree on the position. Treat it with caution.",
  "whyPosition": "Why this position?",
  "axis": { "label": "Position of the text relative to the coverage of the same event", "left": "left", "center": "centre", "right": "right", "article": "this article", "band": "uncertainty band", "groupCenter": "group centre" },
  "verdictText": { "neutral": "Neutral", "sesgo_leve": "Slight bias", "sesgado": "Biased", "muy_sesgado": "Very biased", "no_determinable": "Not determinable" },
  "verdict": { "verificado": "Verified", "enganoso": "Misleading", "falso": "False", "falta_contexto": "Missing context", "opinion": "Opinion", "no_verificable": "Unverifiable", "pendiente": "Not checked" },
  "claims": { "title": "Claims" },
  "loadedCount": "{n, plural, one {# loaded phrase in the text} other {# loaded phrases in the text}}",
  "ai": {
    "title": "Possible AI-generated text",
    "probability": "Probability of generated text: {value}",
    "disclaimer": "This is a hint, not proof.",
    "signal": { "burstiness": "Uniform sentence rhythm", "templates": "Template phrases", "repetition": "Repeated openings", "c2pa": "Images without content credentials", "llm": "A model’s judgement" }
  },
  "stagesLabel": "Analysis steps",
  "stage": { "claims": "Claims", "quickScore": "Quick score", "verify": "Verification", "score": "Position and neutrality", "judgeB": "Second judge", "synthesis": "Neutral version", "aiDetect": "AI detector", "agent": "Agent", "investigate": "Uncovered investigation" },
  "stageStatus": { "pending": "waiting", "running": "running", "done": "done", "cached": "cached", "failed": "failed", "skipped": "no model" }
},
"agent": {
  "title": "Agent",
  "needsArticle": "Open a news article to ask about it.",
  "context": "Article, {coverages, plural, one {# coverage} other {# coverages}} and {sources, plural, one {# source} other {# sources}} in context",
  "wide": "Widen the agent",
  "narrow": "Narrow the agent",
  "empty": "Ask anything about this article or select a passage.",
  "placeholder": "Your question",
  "send": "Send",
  "stop": "Stop",
  "clearFragment": "Remove the passage",
  "mode": { "label": "Mode", "ask": "Ask", "verify": "Verify", "explain": "Explain" },
  "auto": { "ask": "What can you tell me about this passage?", "verify": "Is this passage accurate?", "explain": "Explain the context of this passage." },
  "tools": { "searchCoverage": "searches coverage", "fetchSource": "reads a source", "getVerdicts": "checks the verdicts", "renderVisualization": "draws a chart", "showMedia": "shows an image from the source" },
  "openVideo": "Watch the video at the source",
  "mediaNote": "Original images from the cited sources, never generated.",
  "noModel": "No model is assigned to the agent. Connect one in Settings › AI or use a local model.",
  "error": "The agent could not answer: {message}"
},
"charts": {
  "sources": "Sources:",
  "showTable": "Show as a table",
  "showChart": "Show the chart",
  "label": "Label",
  "value": "Value",
  "region": "Region",
  "matrix": { "si": "Yes", "par": "Partly", "mal": "Poorly", "no": "No" },
  "parliament": {
    "chart": "Hemicycle",
    "majority": "{n} · majority",
    "seatsFor": "{n, plural, one {# seat in favour} other {# seats in favour}}",
    "reached": "majority reached",
    "short": "{n, plural, one {# seat short} other {# seats short}}",
    "hint": "Tap a party to add it to or remove it from the “yes” side",
    "party": "Party",
    "seats": "Seats",
    "vote": "Assumed vote",
    "yes": "Yes",
    "no": "No",
    "reset": "Start again"
  }
},
"coverage": {
  "title": "Coverage of the same event",
  "needsArticle": "Open a news article to see how other outlets report it.",
  "loading": "Looking for coverage…",
  "error": "Coverage could not be loaded.",
  "summary": "{outlets, plural, =0 {No other outlet has reported it yet} one {# outlet reports it} other {# outlets report it}}",
  "noSearchKey": "Add a search key in Settings › Sources to find more coverage.",
  "searchFailed": "The fallback search did not respond.",
  "bucket": { "left": "Left", "center": "Centre", "right": "Right", "unknown": "Not measured" },
  "leanTitle": "Measured editorial line of the outlet (0 left – 100 right)",
  "leanUnknown": "not measured",
  "howMeasured": "How each outlet’s line is measured"
},
"position": {
  "title": "Why this position?",
  "back": "Back to the analysis",
  "none": "No position has been computed yet.",
  "intro": "It is measured from the text, never from the outlet’s reputation. The model reads the anonymised article and compares it with the other coverage of the same event.",
  "blind": "Blind reading: outlet hidden",
  "relative": "Neutral means close to the group centre, not the middle of the scale.",
  "signals": "Signals",
  "signalsHint": "Each one quotes its evidence from the text. Without a quote, a signal does not count.",
  "signal": { "lexico": "Vocabulary", "encuadre": "Framing", "voces": "Quoted voices", "atribucion": "Attribution verbs", "adjetivacion": "Adjectives", "omision": "Omissions", "orden": "Order and headline" },
  "voices": "Voices",
  "voice": "{name}: {quotes, plural, one {# quote} other {# quotes}}",
  "lastWord": "{name} has the last word.",
  "omissions": "What other coverage includes and this article leaves out",
  "lexicon": "Calibrated vocabulary",
  "lexiconBody": "A dictionary of partisan phrases built from parliament: for each expression it measures how much more one bloc uses it than the other. It is a signal independent of the model.",
  "confidence": "Overall confidence",
  "threshold": "threshold {value}",
  "confidenceNote": "When confidence is low, “Not determinable” is shown instead of a number.",
  "controls": "Checks",
  "judgesAgree": "Two models agree",
  "judgesDisagree": "Two models disagree",
  "judgesOff": "Model comparison turns on with a second strong provider.",
  "mirror": "Mirror test",
  "mirrorBody": "Actors and terms from one side are swapped for the other’s. The score should flip.",
  "mirrorRun": "Run the test again",
  "mirrorRunning": "Checking…",
  "mirrorResult": "Original {a} · mirror {b}.",
  "mirrorOk": "Symmetric",
  "mirrorBad": "Asymmetric: review the assigned model"
},
"noCoverage": {
  "title": "Almost nobody has reported this",
  "body": "{outlets, plural, =0 {No outlet} one {Only # outlet} other {Only # outlets}} and no primary source. It cannot be cross-checked like the rest.",
  "investigate": "Investigate anyway",
  "investigating": "Investigating…",
  "watch": "Tell me when there is coverage",
  "watching": "We will let you know",
  "consent": {
    "title": "Investigate without coverage",
    "body": "The result will not be verified: it may contain mistakes and relies on very few sources.",
    "checkbox": "I understand the result is not verified",
    "confirm": "Investigate unverified",
    "cancel": "Cancel"
  },
  "report": { "title": "Unverified report", "badge": "Not verified", "confidence": "Confidence {value}", "howToCheck": "How to check it yourself" },
  "tags": { "fuente_unica": "Single source", "solo_redes": "Social media only", "varias_no_oficiales": "Several unofficial sources", "sin_fuente": "No source" }
},
"synthesis": {
  "kicker": "Neutral version",
  "loading": "Loading the synthesis…",
  "missing": "This synthesis is no longer cached. Analyse the article again.",
  "view": { "label": "View", "brief": "Brief", "full": "Full", "changes": "Changes" },
  "facts": "Facts",
  "factKind": { "hecho": "Fact", "atribuida": "Attributed", "disputa": "Disputed" },
  "parties": "What each side says",
  "evidence": "Weight of evidence",
  "unknowns": "What is not known yet",
  "removed": "(removed)"
},
"hemeroteca": {
  "kicker": "Archive",
  "noUrl": "The article address is missing.",
  "loading": "Looking for captures…",
  "progress": "Reading captures: {done} of {total}",
  "error": "The archive could not be queried: {message}",
  "none": "The archive has no captures of this article.",
  "silent": "{n, plural, one {Edited # time without notice} other {Edited # times without notice}}",
  "notice": "The outlet flags changes: {notice}",
  "timeline": "Captures",
  "mode": { "label": "Mode", "unified": "Unified", "side": "Side by side", "read": "Read capture" },
  "comparing": "Comparing {a} with {b}",
  "single": "There is only one capture: nothing to compare.",
  "edits": "Detected changes",
  "kind": { "titular": "Headline", "dato": "Figure", "parrafo_anadido": "Paragraph added", "parrafo_eliminado": "Paragraph removed", "texto": "Wording" }
},
"providers": {
  "loading": "Loading providers…",
  "title": "Connect a provider",
  "subtitle": "Three steps and you are done. No AI knowledge needed.",
  "cat": { "recommended": "Recommended", "cloud": "Cloud", "cloudHint": "Pay per use with your own key", "local": "On your computer", "localHint": "Free and nothing leaves your machine", "advanced": "Advanced" },
  "pitch": { "openai": "The best known. Fast and good at almost everything.", "nous": "Open Hermes models without style filters." },
  "connect": "Connect {name}",
  "pasteKey": "Already have a key? Paste it here",
  "pasteHint": "We recognise the provider from how the key starts.",
  "detected": "It is from {name}.",
  "ambiguous": "That key could belong to several providers. Choose one:",
  "unknownPrefix": "We do not recognise this prefix. Choose the provider from the list below.",
  "continue": "Continue",
  "detectedLocal": "{n, plural, one {detected · # model} other {detected · # models}}",
  "notRunning": "not running",
  "customTitle": "OpenAI-compatible",
  "customHint": "Your own /v1 endpoint",
  "customName": "Name",
  "baseUrl": "Base address",
  "customModels": "Models (comma-separated)",
  "key": "Key",
  "startsWith": "Starts with {prefix}",
  "keyStorage": "Your key is stored encrypted in the system keychain. It never leaves your computer except towards {name}, and not even the web part of newpaper sees it.",
  "noKey": "No key yet?",
  "getKey": "Get your key",
  "back": "Back",
  "test": "Test connection",
  "testing": "Testing…",
  "testOk": "Connected in {ms} ms",
  "testFail": "It did not work: {message}",
  "doneTitle": "{name} is ready",
  "doneSub": "Ready to read the news with you. Each step has been assigned a model.",
  "where": { "local": "On your computer" },
  "priceUnknown": "unknown price",
  "estimate": "Estimated cost per analysis: {total}",
  "estimateUnknown": "(excluding models with unknown prices)",
  "another": "Connect another provider",
  "done": "Done",
  "connected": "Connected providers",
  "noneConnected": "No provider is connected yet.",
  "disconnect": "Disconnect",
  "connectOne": "Connect a provider",
  "pipeline": "Model for each step",
  "preset": { "label": "Preset", "privacy": "Full privacy", "balanced": "Balanced", "quality": "Best quality", "cheap": "Lowest cost" },
  "presetHint": {
    "privacy": "Everything with models on your computer. Nothing leaves home.",
    "balanced": "Light steps locally when possible; the important ones with a good cloud model.",
    "quality": "The best models for every step and a second judge for the position.",
    "cheap": "The cheapest models you have connected."
  },
  "stage": "Step",
  "model": "Model",
  "modelFor": "Model for {stage}",
  "backToAuto": "Back to automatic assignment",
  "auto": "Assigned automatically from the preset.",
  "budget": "Spending",
  "limit": "Monthly limit (USD)",
  "limitHint": "When the limit is reached, analysis switches to local models. Leave it empty for no limit.",
  "spent": "Spent this month: {amount}"
},
"history": {
  "title": "History",
  "search": "Search history",
  "paused": "History is paused: nothing new is saved until you resume it.",
  "resume": "Resume",
  "pause": "Pause history",
  "kind": { "label": "Type", "all": "All", "visit": "Visits", "search": "Searches", "analysis": "Analyses" },
  "outlet": "Outlet",
  "allOutlets": "All outlets",
  "today": "Today",
  "yesterday": "Yesterday",
  "searched": "Search: {query}",
  "analyzed": "Analysed",
  "deleteOne": "Delete this entry",
  "empty": "History is empty.",
  "noResults": "Nothing matches.",
  "manage": "Delete and keep",
  "delete": { "hour": "Delete the last hour", "today": "Delete today", "week": "Delete the last 7 days", "outlet": "Delete everything from {outlet}", "all": "Delete all history" },
  "retention": "Keep history for",
  "days": "{n, plural, one {# day} other {# days}}",
  "forever": "Forever",
  "privateNote": "Private tabs save nothing: no visits, searches or analyses."
},
"newtab": {
  "greeting": { "night": "Good night", "morning": "Good morning", "afternoon": "Good afternoon", "evening": "Good evening" },
  "search": "Search a topic or an event, or type an address",
  "results": "Results for “{query}”",
  "searching": "Searching…",
  "noCoverage": "No outlet has covered “{query}”.",
  "briefing": "What is happening",
  "outlets": "{n, plural, one {# outlet} other {# outlets}}",
  "leanMix": "Left {left}, centre {center}, right {right}",
  "topics": "Your topics",
  "continue": "Continue reading",
  "saved": "Saved"
}
```

Y dentro de `settings`:
```json
"ai": { "title": "AI", "description": "Providers, the model for each step and spending" },
"analysis": {
  "title": "Analysis",
  "description": "When to analyse and what to show",
  "quickOnOpen": "Quick analysis when opening an article",
  "quickOnOpenHint": "With a local model; it is provisional.",
  "autoFull": "Automatic full analysis",
  "autoFullHint": "Uses your providers on every article you open. It may cost money.",
  "detector": "AI-generated text detector",
  "detectorHint": "Shows a hint for each paragraph. It is never proof.",
  "language": "Analyses are written in the interface language; quotes keep their original language."
}
```

- [ ] **Step 3: Alemán**

Añade al nivel raíz de `packages/i18n/locales/de.json`:
```json
"analysis": {
  "panel": { "label": "Analysebereich", "analysis": "Analyse", "coverage": "Berichterstattung", "agent": "Agent", "close": "Bereich schließen" },
  "toolbar": { "label": "Analyse", "title": "Analysebereich öffnen oder schließen (Strg+Umschalt+A)" },
  "actions": { "analyze": "Analysieren", "full": "Vollständige Analyse starten", "synthesis": "Neutrale Fassung ansehen", "hemeroteca": "Änderungen ansehen" },
  "lens": { "toggle": "Bias-Linse", "loaded": "Wertende Formulierung" },
  "selection": { "label": "Den Agenten zur Auswahl fragen", "ask": "Fragen", "verify": "Prüfen", "explain": "Erklären" },
  "needsArticle": "Öffne einen Artikel, um ihn zu analysieren.",
  "empty": "Dieser Artikel wurde noch nicht analysiert.",
  "running": "Wird analysiert…",
  "error": "Die Analyse wurde nicht abgeschlossen: {message}",
  "noScore": "Noch keine Bewertung",
  "neutrality": "Neutralität: {value} von 100",
  "neutralityCaption": "Neutralität",
  "mode": { "quick": "Schnellanalyse · vorläufig", "full": "Vollständige Analyse" },
  "capped": "Du hast dein Monatslimit erreicht: Diese Analyse lief mit lokalen Modellen.",
  "disagreement": "Zwei verschiedene Modelle sind sich bei der Position uneinig. Mit Vorsicht betrachten.",
  "whyPosition": "Warum diese Position?",
  "axis": { "label": "Position des Textes gegenüber der Berichterstattung über dasselbe Ereignis", "left": "links", "center": "Mitte", "right": "rechts", "article": "dieser Artikel", "band": "Unsicherheitsband", "groupCenter": "Mitte der Gruppe" },
  "verdictText": { "neutral": "Neutral", "sesgo_leve": "Leicht einseitig", "sesgado": "Einseitig", "muy_sesgado": "Stark einseitig", "no_determinable": "Nicht bestimmbar" },
  "verdict": { "verificado": "Bestätigt", "enganoso": "Irreführend", "falso": "Falsch", "falta_contexto": "Kontext fehlt", "opinion": "Meinung", "no_verificable": "Nicht überprüfbar", "pendiente": "Nicht geprüft" },
  "claims": { "title": "Behauptungen" },
  "loadedCount": "{n, plural, one {# wertende Formulierung im Text} other {# wertende Formulierungen im Text}}",
  "ai": {
    "title": "Möglicherweise KI-generierter Text",
    "probability": "Wahrscheinlichkeit für generierten Text: {value}",
    "disclaimer": "Ein Hinweis, kein Beweis.",
    "signal": { "burstiness": "Gleichförmiger Satzrhythmus", "templates": "Floskeln", "repetition": "Wiederholte Satzanfänge", "c2pa": "Bilder ohne Inhaltsnachweis", "llm": "Urteil eines Modells" }
  },
  "stagesLabel": "Analyseschritte",
  "stage": { "claims": "Behauptungen", "quickScore": "Schnellbewertung", "verify": "Prüfung", "score": "Position und Neutralität", "judgeB": "Zweiter Prüfer", "synthesis": "Neutrale Fassung", "aiDetect": "KI-Erkennung", "agent": "Agent", "investigate": "Recherche ohne Berichterstattung" },
  "stageStatus": { "pending": "wartet", "running": "läuft", "done": "fertig", "cached": "zwischengespeichert", "failed": "fehlgeschlagen", "skipped": "kein Modell" }
},
"agent": {
  "title": "Agent",
  "needsArticle": "Öffne einen Artikel, um Fragen dazu zu stellen.",
  "context": "Artikel, {coverages, plural, one {# Bericht} other {# Berichte}} und {sources, plural, one {# Quelle} other {# Quellen}} im Kontext",
  "wide": "Agent verbreitern",
  "narrow": "Agent verschmälern",
  "empty": "Frag alles zu diesem Artikel oder markiere eine Passage.",
  "placeholder": "Deine Frage",
  "send": "Senden",
  "stop": "Anhalten",
  "clearFragment": "Passage entfernen",
  "mode": { "label": "Modus", "ask": "Fragen", "verify": "Prüfen", "explain": "Erklären" },
  "auto": { "ask": "Was kannst du mir zu dieser Passage sagen?", "verify": "Stimmt diese Passage?", "explain": "Erkläre mir den Kontext dieser Passage." },
  "tools": { "searchCoverage": "sucht Berichte", "fetchSource": "liest eine Quelle", "getVerdicts": "prüft die Bewertungen", "renderVisualization": "zeichnet ein Diagramm", "showMedia": "zeigt ein Bild aus der Quelle" },
  "openVideo": "Video in der Quelle ansehen",
  "mediaNote": "Originalbilder der zitierten Quellen, niemals generiert.",
  "noModel": "Dem Agenten ist kein Modell zugewiesen. Verbinde eines unter Einstellungen › KI oder nutze ein lokales Modell.",
  "error": "Der Agent konnte nicht antworten: {message}"
},
"charts": {
  "sources": "Quellen:",
  "showTable": "Als Tabelle zeigen",
  "showChart": "Diagramm zeigen",
  "label": "Bezeichnung",
  "value": "Wert",
  "region": "Region",
  "matrix": { "si": "Ja", "par": "Teilweise", "mal": "Schlecht", "no": "Nein" },
  "parliament": {
    "chart": "Sitzverteilung",
    "majority": "{n} · Mehrheit",
    "seatsFor": "{n, plural, one {# Sitz dafür} other {# Sitze dafür}}",
    "reached": "Mehrheit erreicht",
    "short": "{n, plural, one {# Sitz fehlt} other {# Sitze fehlen}}",
    "hint": "Tippe auf eine Partei, um sie zum „Ja“ hinzuzufügen oder zu entfernen",
    "party": "Partei",
    "seats": "Sitze",
    "vote": "Angenommene Stimme",
    "yes": "Ja",
    "no": "Nein",
    "reset": "Neu beginnen"
  }
},
"coverage": {
  "title": "Berichterstattung über dasselbe Ereignis",
  "needsArticle": "Öffne einen Artikel, um zu sehen, wie andere Medien berichten.",
  "loading": "Berichte werden gesucht…",
  "error": "Die Berichterstattung konnte nicht geladen werden.",
  "summary": "{outlets, plural, =0 {Noch kein anderes Medium hat berichtet} one {# Medium berichtet} other {# Medien berichten}}",
  "noSearchKey": "Füge unter Einstellungen › Quellen einen Suchschlüssel hinzu, um mehr Berichte zu finden.",
  "searchFailed": "Die Ersatzsuche hat nicht geantwortet.",
  "bucket": { "left": "Links", "center": "Mitte", "right": "Rechts", "unknown": "Nicht gemessen" },
  "leanTitle": "Gemessene redaktionelle Linie des Mediums (0 links – 100 rechts)",
  "leanUnknown": "nicht gemessen",
  "howMeasured": "Wie die Linie jedes Mediums gemessen wird"
},
"position": {
  "title": "Warum diese Position?",
  "back": "Zurück zur Analyse",
  "none": "Es wurde noch keine Position berechnet.",
  "intro": "Gemessen wird am Text, nie am Ruf des Mediums. Das Modell liest den anonymisierten Artikel und vergleicht ihn mit den anderen Berichten über dasselbe Ereignis.",
  "blind": "Blindlesung: Medium verborgen",
  "relative": "Neutral heißt nah an der Mitte der Gruppe, nicht in der Mitte der Skala.",
  "signals": "Signale",
  "signalsHint": "Jedes mit einem Zitat aus dem Text als Beleg. Ohne Zitat zählt das Signal nicht.",
  "signal": { "lexico": "Wortwahl", "encuadre": "Rahmung", "voces": "Zitierte Stimmen", "atribucion": "Zuschreibende Verben", "adjetivacion": "Adjektive", "omision": "Auslassungen", "orden": "Reihenfolge und Schlagzeile" },
  "voices": "Stimmen",
  "voice": "{name}: {quotes, plural, one {# Zitat} other {# Zitate}}",
  "lastWord": "Das letzte Wort hat {name}.",
  "omissions": "Was andere Berichte enthalten und hier fehlt",
  "lexicon": "Kalibrierte Wortwahl",
  "lexiconBody": "Ein Wörterbuch parteiischer Ausdrücke aus dem Parlament: Für jeden Ausdruck wird gemessen, wie viel häufiger ihn ein Lager nutzt als das andere. Ein vom Modell unabhängiges Signal.",
  "confidence": "Gesamtvertrauen",
  "threshold": "Schwelle {value}",
  "confidenceNote": "Ist das Vertrauen gering, steht „Nicht bestimmbar“ statt einer Zahl.",
  "controls": "Kontrollen",
  "judgesAgree": "Zwei Modelle stimmen überein",
  "judgesDisagree": "Zwei Modelle stimmen nicht überein",
  "judgesOff": "Der Modellvergleich wird mit einem zweiten starken Anbieter aktiviert.",
  "mirror": "Spiegeltest",
  "mirrorBody": "Akteure und Begriffe eines Lagers werden gegen die des anderen getauscht. Die Bewertung sollte sich umkehren.",
  "mirrorRun": "Test wiederholen",
  "mirrorRunning": "Wird geprüft…",
  "mirrorResult": "Original {a} · Spiegel {b}.",
  "mirrorOk": "Symmetrisch",
  "mirrorBad": "Asymmetrisch: Prüfe das zugewiesene Modell"
},
"noCoverage": {
  "title": "Kaum jemand hat darüber berichtet",
  "body": "{outlets, plural, =0 {Kein Medium} one {Nur # Medium} other {Nur # Medien}} und keine Primärquelle. Es lässt sich nicht wie der Rest gegenprüfen.",
  "investigate": "Trotzdem recherchieren",
  "investigating": "Wird recherchiert…",
  "watch": "Benachrichtigen, wenn berichtet wird",
  "watching": "Wir melden uns",
  "consent": {
    "title": "Ohne Berichterstattung recherchieren",
    "body": "Das Ergebnis wird nicht geprüft: Es kann Fehler enthalten und stützt sich auf sehr wenige Quellen.",
    "checkbox": "Ich verstehe, dass das Ergebnis nicht geprüft ist",
    "confirm": "Ungeprüft recherchieren",
    "cancel": "Abbrechen"
  },
  "report": { "title": "Ungeprüfter Bericht", "badge": "Nicht geprüft", "confidence": "Vertrauen {value}", "howToCheck": "So prüfst du es selbst" },
  "tags": { "fuente_unica": "Einzige Quelle", "solo_redes": "Nur in sozialen Netzwerken", "varias_no_oficiales": "Mehrere inoffizielle Quellen", "sin_fuente": "Ohne Quelle" }
},
"synthesis": {
  "kicker": "Neutrale Fassung",
  "loading": "Zusammenfassung wird geladen…",
  "missing": "Diese Zusammenfassung ist nicht mehr zwischengespeichert. Analysiere den Artikel erneut.",
  "view": { "label": "Ansicht", "brief": "Kurz", "full": "Vollständig", "changes": "Änderungen" },
  "facts": "Fakten",
  "factKind": { "hecho": "Fakt", "atribuida": "Zugeschrieben", "disputa": "Umstritten" },
  "parties": "Was jede Seite sagt",
  "evidence": "Gewicht der Belege",
  "unknowns": "Was noch unbekannt ist",
  "removed": "(entfernt)"
},
"hemeroteca": {
  "kicker": "Archiv",
  "noUrl": "Die Adresse des Artikels fehlt.",
  "loading": "Archivkopien werden gesucht…",
  "progress": "Archivkopien werden gelesen: {done} von {total}",
  "error": "Das Archiv konnte nicht abgefragt werden: {message}",
  "none": "Das Archiv hat keine Kopien dieses Artikels.",
  "silent": "{n, plural, one {# Mal ohne Hinweis geändert} other {# Mal ohne Hinweis geändert}}",
  "notice": "Das Medium kennzeichnet Änderungen: {notice}",
  "timeline": "Archivkopien",
  "mode": { "label": "Modus", "unified": "Zusammengeführt", "side": "Nebeneinander", "read": "Kopie lesen" },
  "comparing": "Vergleich von {a} mit {b}",
  "single": "Es gibt nur eine Kopie: nichts zu vergleichen.",
  "edits": "Erkannte Änderungen",
  "kind": { "titular": "Schlagzeile", "dato": "Zahl", "parrafo_anadido": "Absatz hinzugefügt", "parrafo_eliminado": "Absatz entfernt", "texto": "Formulierung" }
},
"providers": {
  "loading": "Anbieter werden geladen…",
  "title": "Anbieter verbinden",
  "subtitle": "Drei Schritte, fertig. KI-Kenntnisse sind nicht nötig.",
  "cat": { "recommended": "Empfohlen", "cloud": "Cloud", "cloudHint": "Bezahlung nach Nutzung mit deinem eigenen Schlüssel", "local": "Auf deinem Rechner", "localHint": "Kostenlos und ohne Daten zu senden", "advanced": "Erweitert" },
  "pitch": { "openai": "Der bekannteste. Schnell und in fast allem gut.", "nous": "Offene Hermes-Modelle ohne Stilfilter." },
  "connect": "{name} verbinden",
  "pasteKey": "Hast du schon einen Schlüssel? Hier einfügen",
  "pasteHint": "Wir erkennen den Anbieter am Anfang des Schlüssels.",
  "detected": "Er gehört zu {name}.",
  "ambiguous": "Dieser Schlüssel kann zu mehreren Anbietern gehören. Wähle einen:",
  "unknownPrefix": "Wir erkennen dieses Präfix nicht. Wähle den Anbieter aus der Liste unten.",
  "continue": "Weiter",
  "detectedLocal": "{n, plural, one {erkannt · # Modell} other {erkannt · # Modelle}}",
  "notRunning": "läuft nicht",
  "customTitle": "OpenAI-kompatibel",
  "customHint": "Dein eigener /v1-Endpunkt",
  "customName": "Name",
  "baseUrl": "Basisadresse",
  "customModels": "Modelle (durch Kommas getrennt)",
  "key": "Schlüssel",
  "startsWith": "Beginnt mit {prefix}",
  "keyStorage": "Dein Schlüssel wird verschlüsselt im Schlüsselbund des Systems gespeichert. Er verlässt deinen Rechner nur in Richtung {name}, und nicht einmal der Web-Teil von newpaper sieht ihn.",
  "noKey": "Noch kein Schlüssel?",
  "getKey": "Schlüssel holen",
  "back": "Zurück",
  "test": "Verbindung testen",
  "testing": "Wird getestet…",
  "testOk": "Verbunden in {ms} ms",
  "testFail": "Hat nicht funktioniert: {message}",
  "doneTitle": "{name} ist bereit",
  "doneSub": "Bereit, mit dir Nachrichten zu lesen. Jedem Schritt wurde ein Modell zugewiesen.",
  "where": { "local": "Auf deinem Rechner" },
  "priceUnknown": "Preis unbekannt",
  "estimate": "Geschätzte Kosten pro Analyse: {total}",
  "estimateUnknown": "(ohne Modelle mit unbekanntem Preis)",
  "another": "Weiteren Anbieter verbinden",
  "done": "Fertig",
  "connected": "Verbundene Anbieter",
  "noneConnected": "Noch kein Anbieter verbunden.",
  "disconnect": "Trennen",
  "connectOne": "Anbieter verbinden",
  "pipeline": "Modell für jeden Schritt",
  "preset": { "label": "Voreinstellung", "privacy": "Volle Privatsphäre", "balanced": "Ausgewogen", "quality": "Beste Qualität", "cheap": "Geringste Kosten" },
  "presetHint": {
    "privacy": "Alles mit Modellen auf deinem Rechner. Nichts verlässt das Haus.",
    "balanced": "Leichte Schritte lokal, wenn möglich; die wichtigen mit einem guten Cloud-Modell.",
    "quality": "Die besten Modelle für jeden Schritt und ein zweiter Prüfer für die Position.",
    "cheap": "Die günstigsten verbundenen Modelle."
  },
  "stage": "Schritt",
  "model": "Modell",
  "modelFor": "Modell für {stage}",
  "backToAuto": "Zurück zur automatischen Zuweisung",
  "auto": "Automatisch nach der Voreinstellung zugewiesen.",
  "budget": "Ausgaben",
  "limit": "Monatslimit (USD)",
  "limitHint": "Ist das Limit erreicht, läuft die Analyse mit lokalen Modellen. Leer lassen für kein Limit.",
  "spent": "Diesen Monat ausgegeben: {amount}"
},
"history": {
  "title": "Verlauf",
  "search": "Im Verlauf suchen",
  "paused": "Der Verlauf ist pausiert: Nichts Neues wird gespeichert, bis du ihn fortsetzt.",
  "resume": "Fortsetzen",
  "pause": "Verlauf pausieren",
  "kind": { "label": "Art", "all": "Alles", "visit": "Besuche", "search": "Suchen", "analysis": "Analysen" },
  "outlet": "Medium",
  "allOutlets": "Alle Medien",
  "today": "Heute",
  "yesterday": "Gestern",
  "searched": "Suche: {query}",
  "analyzed": "Analysiert",
  "deleteOne": "Diesen Eintrag löschen",
  "empty": "Der Verlauf ist leer.",
  "noResults": "Keine Treffer.",
  "manage": "Löschen und aufbewahren",
  "delete": { "hour": "Letzte Stunde löschen", "today": "Heute löschen", "week": "Letzte 7 Tage löschen", "outlet": "Alles von {outlet} löschen", "all": "Gesamten Verlauf löschen" },
  "retention": "Verlauf aufbewahren",
  "days": "{n, plural, one {# Tag} other {# Tage}}",
  "forever": "Für immer",
  "privateNote": "Private Tabs speichern nichts: keine Besuche, Suchen oder Analysen."
},
"newtab": {
  "greeting": { "night": "Gute Nacht", "morning": "Guten Morgen", "afternoon": "Guten Tag", "evening": "Guten Abend" },
  "search": "Thema oder Ereignis suchen oder Adresse eingeben",
  "results": "Ergebnisse für „{query}“",
  "searching": "Wird gesucht…",
  "noCoverage": "Kein Medium hat über „{query}“ berichtet.",
  "briefing": "Was gerade passiert",
  "outlets": "{n, plural, one {# Medium} other {# Medien}}",
  "leanMix": "Links {left}, Mitte {center}, rechts {right}",
  "topics": "Deine Themen",
  "continue": "Weiterlesen",
  "saved": "Gespeichert"
}
```

Y dentro de `settings`:
```json
"ai": { "title": "KI", "description": "Anbieter, Modell für jeden Schritt und Ausgaben" },
"analysis": {
  "title": "Analyse",
  "description": "Wann analysiert wird und was angezeigt wird",
  "quickOnOpen": "Schnellanalyse beim Öffnen eines Artikels",
  "quickOnOpenHint": "Mit einem lokalen Modell; vorläufig.",
  "autoFull": "Automatische vollständige Analyse",
  "autoFullHint": "Nutzt deine Anbieter bei jedem geöffneten Artikel. Kann Geld kosten.",
  "detector": "Erkennung KI-generierter Texte",
  "detectorHint": "Zeigt einen Hinweis pro Absatz. Niemals ein Beweis.",
  "language": "Analysen werden in der Sprache der Oberfläche geschrieben; Zitate bleiben in ihrer Originalsprache."
}
```

- [ ] **Step 4: Comprobar los catálogos**

Run: `pnpm --filter @newpaper/i18n test`
Expected: PASS — sin claves que falten en ningún idioma, ICU válido y los mismos marcadores en `es`, `en` y `de`.

- [ ] **Step 5: Commit**

```powershell
git add packages/i18n/locales
git commit -m "feat(i18n): analysis, agent, charts, synthesis, archive, providers, history and new tab strings"
```

---
### Task 3: ui-kit — primitivas de análisis (tono, veredicto, anillo, eje, confianza, pasos)

**Files:**
- Create: `packages/ui-kit/src/analysis/{tone.ts, VerdictTag.tsx, NeutralityRing.tsx, FramingAxis.tsx, ConfidenceMeter.tsx, StageList.tsx, analysis.css}`
- Modify: `packages/ui-kit/src/index.ts`

**Interfaces:**
- Produces (todo el texto llega por props):
  - `Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'accent' | 'ai'`, `verdictTone(status)`, `neutralityTone(n)`, `markTone(kind)`
  - `VerdictTag({ status, label })`
  - `NeutralityRing({ value: number | null; label: string; caption?: string })`
  - `FramingAxis({ framing, interval, groupCenter, others: { id; value; title }[]; labels: { axis; left; center; right; article; band; groupCenter; notDeterminable } })`
  - `ConfidenceMeter({ value; threshold; label; thresholdLabel })`
  - `StageItem { id; label; status: 'pending' | 'running' | 'done' | 'cached' | 'failed' | 'skipped'; statusLabel }`, `StageList({ items, label })`

- [ ] **Step 1: Tonos y etiquetas**

`packages/ui-kit/src/analysis/tone.ts`:
```ts
export type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'accent' | 'ai';
export type VerdictStatusLike = 'verificado' | 'enganoso' | 'falso' | 'falta_contexto' | 'opinion' | 'no_verificable';

export function verdictTone(s: VerdictStatusLike): Tone {
  switch (s) {
    case 'verificado':
      return 'ok';
    case 'enganoso':
    case 'falta_contexto':
      return 'warn';
    case 'falso':
      return 'bad';
    case 'opinion':
      return 'accent';
    default:
      return 'muted';
  }
}

export function neutralityTone(n: number): Tone {
  return n >= 75 ? 'ok' : n >= 55 ? 'accent' : n >= 35 ? 'warn' : 'bad';
}

/** Marca de la lente: veredicto de la afirmación, `pendiente` (sin verificar) o `cargada` (frase cargada). */
export function markTone(kind: string): Tone {
  if (kind === 'cargada') return 'ai';
  if (kind === 'pendiente') return 'muted';
  return verdictTone(kind as VerdictStatusLike);
}
```

`packages/ui-kit/src/analysis/VerdictTag.tsx`:
```tsx
import { verdictTone, type VerdictStatusLike } from './tone';

export function VerdictTag({ status, label }: { status: VerdictStatusLike; label: string }) {
  return <span className={`np-tag np-tag--${verdictTone(status)}`}>{label}</span>;
}
```

- [ ] **Step 2: Anillo, eje, confianza y pasos**

`packages/ui-kit/src/analysis/NeutralityRing.tsx`:
```tsx
import { neutralityTone } from './tone';

const R = 30;
const C = 2 * Math.PI * R;

export function NeutralityRing({ value, label, caption }: { value: number | null; label: string; caption?: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const tone = value === null ? 'muted' : neutralityTone(v);
  return (
    <figure className={`np-ring np-ring--${tone}`} role="img" aria-label={label}>
      <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
        <circle className="np-ring-track" cx="36" cy="36" r={R} />
        <circle className="np-ring-value" cx="36" cy="36" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} transform="rotate(-90 36 36)" />
      </svg>
      <span className="np-ring-number" aria-hidden="true">{value === null ? '–' : Math.round(v)}</span>
      {caption ? <figcaption className="np-ring-caption">{caption}</figcaption> : null}
    </figure>
  );
}
```

`packages/ui-kit/src/analysis/FramingAxis.tsx`:
```tsx
export interface FramingAxisLabels { axis: string; left: string; center: string; right: string; article: string; band: string; groupCenter: string; notDeterminable: string }

const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;

export function FramingAxis(props: {
  framing: number | null;
  interval: [number, number] | null;
  groupCenter: number | null;
  others: { id: string; value: number; title: string }[];
  labels: FramingAxisLabels;
}) {
  const { framing, interval, groupCenter, others, labels } = props;
  return (
    <div className="np-axis" role="img" aria-label={labels.axis}>
      <div className="np-axis-track">
        {interval ? <span className="np-axis-band" title={labels.band} style={{ left: pct(interval[0]), width: pct(interval[1] - interval[0]) }} /> : null}
        {groupCenter !== null ? <span className="np-axis-center" title={labels.groupCenter} style={{ left: pct(groupCenter) }} /> : null}
        {others.map((o) => (
          <span key={o.id} className="np-axis-other" title={o.title} style={{ left: pct(o.value) }} />
        ))}
        {framing !== null ? <span className="np-axis-dot" title={labels.article} style={{ left: pct(framing) }} /> : null}
        {framing === null ? <span className="np-axis-nd">{labels.notDeterminable}</span> : null}
      </div>
      <div className="np-axis-scale" aria-hidden="true">
        <span>{labels.left}</span>
        <span>{labels.center}</span>
        <span>{labels.right}</span>
      </div>
    </div>
  );
}
```

`packages/ui-kit/src/analysis/ConfidenceMeter.tsx`:
```tsx
export function ConfidenceMeter({ value, threshold, label, thresholdLabel }: { value: number; threshold: number; label: string; thresholdLabel: string }) {
  const ok = value >= threshold;
  return (
    <div className="np-conf">
      <div className="np-conf-head">
        <span>{label}</span>
        <span className="np-mono">{value.toFixed(2)}</span>
      </div>
      <div className="np-conf-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(value.toFixed(2))}>
        <span className={`np-conf-fill ${ok ? 'np-conf-fill--ok' : 'np-conf-fill--low'}`} style={{ width: `${value * 100}%` }} />
        <span className="np-conf-threshold" title={thresholdLabel} style={{ left: `${threshold * 100}%` }} />
      </div>
    </div>
  );
}
```

`packages/ui-kit/src/analysis/StageList.tsx`:
```tsx
export interface StageItem { id: string; label: string; status: 'pending' | 'running' | 'done' | 'cached' | 'failed' | 'skipped'; statusLabel: string }

export function StageList({ items, label }: { items: StageItem[]; label: string }) {
  return (
    <ol className="np-stages" aria-label={label}>
      {items.map((s) => (
        <li key={s.id} className={`np-stage np-stage--${s.status}`} aria-busy={s.status === 'running' || undefined}>
          <span className="np-stage-dot" aria-hidden="true" />
          <span className="np-stage-label">{s.label}</span>
          <span className="np-stage-status">{s.statusLabel}</span>
        </li>
      ))}
    </ol>
  );
}
```

`packages/ui-kit/src/analysis/analysis.css`:
```css
.np-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font: 600 11px/1.6 var(--np-font-ui); letter-spacing: .02em; }
.np-tag--ok { color: var(--np-ok); background: var(--np-ok-bg); }
.np-tag--warn { color: var(--np-warn); background: var(--np-warn-bg); }
.np-tag--bad { color: var(--np-bad); background: var(--np-bad-bg); }
.np-tag--accent { color: var(--np-accent); background: var(--np-accent-soft); }
.np-tag--ai { color: var(--np-ai); background: var(--np-ai-bg); }
.np-tag--muted { color: var(--np-muted); background: var(--np-soft); }

.np-ring { position: relative; width: 72px; height: 72px; margin: 0; }
.np-ring-track { fill: none; stroke: var(--np-line); stroke-width: 6; }
.np-ring-value { fill: none; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 900ms var(--np-ease); }
.np-ring--ok .np-ring-value { stroke: var(--np-ok); }
.np-ring--accent .np-ring-value { stroke: var(--np-accent); }
.np-ring--warn .np-ring-value { stroke: var(--np-warn); }
.np-ring--bad .np-ring-value { stroke: var(--np-bad); }
.np-ring--muted .np-ring-value { stroke: var(--np-faint); }
.np-ring-number { position: absolute; inset: 0; display: grid; place-items: center; font: 600 20px var(--np-font-ui); color: var(--np-ink); }
.np-ring-caption { font: 12px var(--np-font-ui); color: var(--np-muted); text-align: center; }

.np-axis-track { position: relative; height: 28px; border-radius: 14px; background: linear-gradient(90deg, color-mix(in srgb, var(--np-left) 18%, transparent), var(--np-soft), color-mix(in srgb, var(--np-right) 18%, transparent)); }
.np-axis-band { position: absolute; top: 6px; bottom: 6px; border-radius: 8px; background: color-mix(in srgb, var(--np-accent) 22%, transparent); }
.np-axis-center { position: absolute; top: 2px; bottom: 2px; width: 2px; margin-left: -1px; background: var(--np-ink2); }
.np-axis-other { position: absolute; top: 11px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--np-faint); }
.np-axis-dot { position: absolute; top: 7px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: var(--np-accent); box-shadow: 0 0 0 3px var(--np-card); transition: left 600ms var(--np-ease); }
.np-axis-nd { position: absolute; inset: 0; display: grid; place-items: center; font: 600 12px var(--np-font-ui); color: var(--np-muted); }
.np-axis-scale { display: flex; justify-content: space-between; font: 11px var(--np-font-mono); color: var(--np-muted); margin-top: 4px; }

.np-conf-head { display: flex; justify-content: space-between; font: 12px var(--np-font-ui); }
.np-conf-track { position: relative; height: 8px; border-radius: 4px; background: var(--np-soft); margin-top: 4px; }
.np-conf-fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; }
.np-conf-fill--ok { background: var(--np-ok); }
.np-conf-fill--low { background: var(--np-warn); }
.np-conf-threshold { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--np-ink); }

.np-stages { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font: 13px var(--np-font-ui); }
.np-stage { display: grid; grid-template-columns: 12px 1fr auto; align-items: center; gap: 8px; }
.np-stage-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--np-line3); }
.np-stage--running .np-stage-dot { background: var(--np-accent); animation: np-pulse 1.2s var(--np-ease) infinite; }
.np-stage--done .np-stage-dot, .np-stage--cached .np-stage-dot { background: var(--np-ok); }
.np-stage--failed .np-stage-dot { background: var(--np-bad); }
.np-stage-status { color: var(--np-muted); font: 11px var(--np-font-mono); }
@keyframes np-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) {
  .np-ring-value, .np-axis-dot { transition: none; }
  .np-stage--running .np-stage-dot { animation: none; }
}
```

> Si `tokens.css` del subproyecto 1 no define `--np-warn-bg` o `--np-bad-bg`, añádelos allí (Papel: `#FBF0DC` y `#F8E3E0`; Tinta: `#3A2C12` y `#3B1B17`).

- [ ] **Step 3: Exportar**

Añade al final de `packages/ui-kit/src/index.ts`:
```ts
import './analysis/analysis.css';
export { verdictTone, neutralityTone, markTone, type Tone, type VerdictStatusLike } from './analysis/tone';
export { VerdictTag } from './analysis/VerdictTag';
export { NeutralityRing } from './analysis/NeutralityRing';
export { FramingAxis, type FramingAxisLabels } from './analysis/FramingAxis';
export { ConfidenceMeter } from './analysis/ConfidenceMeter';
export { StageList, type StageItem } from './analysis/StageList';
```

- [ ] **Step 4: Comprobar que compila**

Run:
```powershell
pnpm --filter @newpaper/ui-kit typecheck
pnpm --filter @newpaper/i18n test
```
Expected: sin errores; el escaneo de texto escrito a mano sigue limpio (solo hay cifras y guiones como texto JSX).

- [ ] **Step 5: Commit**

```powershell
git add packages/ui-kit
git commit -m "feat(ui-kit): verdict tag, neutrality ring, framing axis, confidence meter and stage list"
```

---

### Task 4: ui-kit — lente de sesgo: segmentación por offsets y texto anotado

**Files:**
- Create: `packages/ui-kit/src/lens/segmentText.ts`, `packages/ui-kit/src/lens/AnnotatedText.tsx`, `packages/ui-kit/src/lens/lens.css`
- Modify: `packages/ui-kit/src/index.ts`
- Test: `packages/ui-kit/src/lens/segmentText.test.ts`

**Interfaces:**
- Produces:
  - `LensMark { id: string; start: number; end: number; kind: string; priority?: number }`
  - `Segment { start; end; text; marks: LensMark[] }` (marcas ordenadas por prioridad, mayor primero)
  - `segmentText(text, marks, from = 0, to = text.length): Segment[]` — corta en todos los bordes; descarta marcas vacías, invertidas o fuera de rango; los offsets son absolutos
  - `paragraphRanges(text): { start: number; end: number }[]` (separador: dos o más saltos de línea; sin párrafos vacíos)
  - `AnnotatedText({ text, lang?, marks, classOf(m), describe(m), activeId?, onActivate?(m), paragraphClass?(i) })`

- [ ] **Step 1: Escribir el test que falla**

`packages/ui-kit/src/lens/segmentText.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { paragraphRanges, segmentText } from './segmentText';

const text = 'Hola mundo cruel';

describe('segmentText', () => {
  it('splits at every mark boundary and keeps overlapping marks by priority', () => {
    const s = segmentText(text, [
      { id: 'b', start: 0, end: 10, kind: 'cargada', priority: 1 },
      { id: 'a', start: 5, end: 10, kind: 'falso', priority: 2 },
    ]);
    expect(s.map((x) => [x.text, x.marks.map((m) => m.id)])).toEqual([
      ['Hola ', ['b']],
      ['mundo', ['a', 'b']],
      [' cruel', []],
    ]);
  });

  it('ignores empty, inverted and out-of-range marks', () => {
    const s = segmentText(text, [
      { id: 'x', start: 20, end: 30, kind: 'falso' },
      { id: 'y', start: 7, end: 3, kind: 'falso' },
      { id: 'z', start: 4, end: 4, kind: 'falso' },
    ]);
    expect(s).toEqual([{ start: 0, end: 16, text, marks: [] }]);
  });

  it('works inside a paragraph with absolute offsets', () => {
    const t = 'Uno.\n\nDos tres.\n\n\nCuatro.';
    const ranges = paragraphRanges(t);
    expect(ranges.map((r) => t.slice(r.start, r.end))).toEqual(['Uno.', 'Dos tres.', 'Cuatro.']);
    const p = ranges[1]!;
    const seg = segmentText(t, [{ id: 'm', start: t.indexOf('tres'), end: t.indexOf('tres') + 4, kind: 'cargada' }, { id: 'n', start: 0, end: 3, kind: 'falso' }], p.start, p.end);
    expect(seg.map((x) => x.text).join('')).toBe('Dos tres.');
    expect(seg.find((x) => x.text === 'tres')!.start).toBe(t.indexOf('tres'));
    expect(seg.some((x) => x.marks.some((m) => m.id === 'n'))).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui-kit exec vitest run src/lens/segmentText.test.ts`
Expected: FAIL (`Cannot find module './segmentText'`).

- [ ] **Step 3: Implementación**

`packages/ui-kit/src/lens/segmentText.ts`:
```ts
export interface LensMark { id: string; start: number; end: number; kind: string; priority?: number }
export interface Segment { start: number; end: number; text: string; marks: LensMark[] }

export function segmentText(text: string, marks: LensMark[], from = 0, to = text.length): Segment[] {
  const lo = Math.max(0, from);
  const hi = Math.min(text.length, to);
  const valid = marks
    .filter((m) => m.end > m.start && m.start < hi && m.end > lo)
    .map((m) => ({ mark: m, start: Math.max(m.start, lo), end: Math.min(m.end, hi) }));
  const cuts = new Set<number>([lo, hi]);
  for (const v of valid) {
    cuts.add(v.start);
    cuts.add(v.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (b <= a) continue;
    const ms = valid
      .filter((v) => v.start <= a && v.end >= b)
      .map((v) => v.mark)
      .sort((x, y) => (y.priority ?? 0) - (x.priority ?? 0));
    out.push({ start: a, end: b, text: text.slice(a, b), marks: ms });
  }
  return out;
}

export function paragraphRanges(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const sep = /\n{2,}/g;
  let last = 0;
  const push = (s: number, e: number) => {
    while (s < e && /\s/.test(text[s]!)) s++;
    while (e > s && /\s/.test(text[e - 1]!)) e--;
    if (e > s) out.push({ start: s, end: e });
  };
  for (let m = sep.exec(text); m; m = sep.exec(text)) {
    push(last, m.index);
    last = m.index + m[0].length;
  }
  push(last, text.length);
  return out;
}
```

`packages/ui-kit/src/lens/AnnotatedText.tsx`:
```tsx
import type { KeyboardEvent } from 'react';
import { paragraphRanges, segmentText, type LensMark } from './segmentText';

export function AnnotatedText(props: {
  text: string;
  lang?: string | null;
  marks: LensMark[];
  classOf(m: LensMark): string;
  describe(m: LensMark): string;
  activeId?: string | null;
  onActivate?(m: LensMark): void;
  paragraphClass?(index: number): string | undefined;
}) {
  const { text, marks, classOf, describe, activeId, onActivate, paragraphClass } = props;
  const key = (m: LensMark) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate?.(m);
    }
  };
  return (
    <div className="np-lens" lang={props.lang ?? undefined}>
      {paragraphRanges(text).map((p, i) => (
        <p key={p.start} className={paragraphClass?.(i)}>
          {segmentText(text, marks, p.start, p.end).map((s) => {
            const top = s.marks[0];
            if (!top) return <span key={s.start}>{s.text}</span>;
            return (
              <mark
                key={s.start}
                className={`${classOf(top)}${activeId === top.id ? ' np-lens-active' : ''}`}
                data-mark={top.id}
                tabIndex={onActivate ? 0 : undefined}
                role={onActivate ? 'button' : undefined}
                aria-label={onActivate ? describe(top) : undefined}
                onClick={onActivate ? () => onActivate(top) : undefined}
                onKeyDown={onActivate ? key(top) : undefined}
              >
                {s.text}
              </mark>
            );
          })}
        </p>
      ))}
    </div>
  );
}
```

`packages/ui-kit/src/lens/lens.css`:
```css
.np-lens { font: 19px/1.65 var(--np-font-read); color: var(--np-ink); max-width: 68ch; margin: 0 auto; }
.np-lens p { margin: 0 0 1.1em; }
.np-lens mark { background: none; color: inherit; border-radius: 3px; padding: 0 1px; cursor: pointer; transition: background-color 160ms var(--np-ease); }
.np-lens mark:focus-visible { outline: 2px solid var(--np-accent); outline-offset: 2px; }
.np-mark--ok { box-shadow: inset 0 -2px var(--np-ok); }
.np-mark--warn { box-shadow: inset 0 -2px var(--np-warn); background: var(--np-warn-bg); }
.np-mark--bad { box-shadow: inset 0 -2px var(--np-bad); background: var(--np-bad-bg); }
.np-mark--accent { box-shadow: inset 0 -2px var(--np-accent); }
.np-mark--muted { box-shadow: inset 0 -1px var(--np-faint); }
.np-mark--ai { background: var(--np-ai-bg); }
.np-lens-active { outline: 2px solid var(--np-accent); }
.np-lens-ai-paragraph { border-left: 3px solid var(--np-ai); padding-left: 10px; }
@media (prefers-reduced-motion: reduce) { .np-lens mark { transition: none; } }
```

Añade al final de `packages/ui-kit/src/index.ts`:
```ts
import './lens/lens.css';
export { segmentText, paragraphRanges, type LensMark, type Segment } from './lens/segmentText';
export { AnnotatedText } from './lens/AnnotatedText';
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui-kit exec vitest run src/lens/segmentText.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```powershell
git add packages/ui-kit
git commit -m "feat(ui-kit): bias lens with offset-exact segmentation and annotated text"
```

---

### Task 5: Controlador del análisis — rápido → completo, eventos por etapa y descarte de resultados obsoletos

**Files:**
- Create: `apps/ui/src/features/analysis/controller.ts`
- Test: `apps/ui/src/features/analysis/controller.test.ts`

**Interfaces:**
- Consumes: `getPipeline` (subproyecto 4), `onTabPage`, `commands.settingsGet`, `createStore`.
- Produces:
  - `Phase = 'idle' | 'quick' | 'full' | 'done' | 'error'`
  - `TabAnalysis { url; article: ArticleInput; phase; quick: AnalysisResult | null; full: AnalysisResult | null; stages: Partial<Record<StageId, StageEvent['status']>>; error: string | null }`
  - `analysisStore` (`{ byTab: Record<TabId, TabAnalysis> }`), `useTabAnalysis(tabId)`, `latestResult(a)` (`full ?? quick`)
  - `toArticleInput(page: PageArticle): ArticleInput` (URL sin `#…`)
  - `createAnalysisController(pipeline: () => Promise<Pipeline>) → { analyzeQuick(tabId, page), analyzeFull(tabId, page), cancel(tabId), prune(openTabIds) }`, instancia `controller`
  - `startAutoAnalysis(): Promise<() => void>` — al llegar `tab://page` de una noticia: completo si `ai.autoFull`, si no rápido si `ai.quickOnOpen` (por defecto `true`)

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/analysis/controller.test.ts`:
```ts
import type { AnalysisResult, Pipeline } from '@newpaper/pipeline';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageArticle } from '../../ipc/types';
import { analysisStore, createAnalysisController } from './controller';

vi.mock('../ai/pipeline', () => ({ getPipeline: vi.fn() }));

const page = (url: string) =>
  ({ type: 'page', article: true, url, title: 'T', byline: null, siteName: 'Diario', published: null, lang: 'es', html: '<p>x</p>', text: `Texto ${url}`, excerpt: null, signals: { ogType: 'article', jsonLdTypes: [] } }) as unknown as PageArticle;
const result = (url: string, quick: boolean) =>
  ({ url, hash: 'h', quick, claims: null, coverage: null, verdicts: null, sources: [], score: null, synthesis: null, aiAuthorship: null, uncovered: false, failed: [], capped: false }) as AnalysisResult;

describe('analysis controller', () => {
  beforeEach(() => analysisStore.set({ byTab: {} }));

  it('drops the result of a page the tab has already left and aborts its run', async () => {
    let resolveA!: (r: AnalysisResult) => void;
    const signals: AbortSignal[] = [];
    const pipeline = {
      runQuickAnalysis: vi.fn(async (a: { url: string }, o: { signal: AbortSignal; onStage(e: unknown): void }) => {
        signals.push(o.signal);
        o.onStage({ stage: 'quickScore', status: 'running' });
        return a.url.endsWith('/a') ? new Promise<AnalysisResult>((r) => (resolveA = r)) : result(a.url, true);
      }),
    } as unknown as Pipeline;
    const c = createAnalysisController(async () => pipeline);
    const first = c.analyzeQuick(1, page('https://d.example/a#top'));
    await c.analyzeQuick(1, page('https://d.example/b'));
    resolveA(result('https://d.example/a', true));
    await first;
    const s = analysisStore.get().byTab[1]!;
    expect(s.url).toBe('https://d.example/b');
    expect(s.quick!.url).toBe('https://d.example/b');
    expect(s.phase).toBe('done');
    expect(signals[0]!.aborted).toBe(true);
    expect(s.stages.quickScore).toBe('running');
  });

  it('keeps the quick result when the full analysis fails', async () => {
    const pipeline = {
      runQuickAnalysis: vi.fn(async (a: { url: string }) => result(a.url, true)),
      runFullAnalysis: vi.fn(async (_a: unknown, o: { onStage(e: unknown): void }) => {
        o.onStage({ stage: 'claims', status: 'failed', error: 'x' });
        throw new Error('provider down');
      }),
    } as unknown as Pipeline;
    const c = createAnalysisController(async () => pipeline);
    await c.analyzeQuick(2, page('https://d.example/c'));
    await c.analyzeFull(2, page('https://d.example/c'));
    const s = analysisStore.get().byTab[2]!;
    expect(s.quick).not.toBeNull();
    expect(s.phase).toBe('error');
    expect(s.error).toBe('provider down');
    expect(s.stages.claims).toBe('failed');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/analysis/controller.test.ts`
Expected: FAIL (`Cannot find module './controller'`).

- [ ] **Step 3: Implementación**

`apps/ui/src/features/analysis/controller.ts`:
```ts
import type { AnalysisResult, ArticleInput, Pipeline, StageEvent, StageId } from '@newpaper/pipeline';
import { commands } from '../../ipc/commands';
import { onTabPage } from '../../ipc/events';
import type { PageArticle, TabId } from '../../ipc/types';
import { createStore } from '../../state/store';
import { getPipeline } from '../ai/pipeline';

export type Phase = 'idle' | 'quick' | 'full' | 'done' | 'error';
export interface TabAnalysis {
  url: string;
  article: ArticleInput;
  phase: Phase;
  quick: AnalysisResult | null;
  full: AnalysisResult | null;
  stages: Partial<Record<StageId, StageEvent['status']>>;
  error: string | null;
}

export const analysisStore = createStore<{ byTab: Record<number, TabAnalysis> }>({ byTab: {} });
export const useTabAnalysis = (tabId: TabId | null) => analysisStore.use((s) => (tabId === null ? undefined : s.byTab[tabId]));
export const latestResult = (a: TabAnalysis | undefined): AnalysisResult | null => (a ? (a.full ?? a.quick) : null);

const noHash = (u: string) => u.split('#')[0]!;
export function toArticleInput(p: PageArticle): ArticleInput {
  return { url: noHash(p.url), title: p.title, text: p.text, lang: p.lang, siteName: p.siteName, byline: p.byline, published: p.published };
}

export function createAnalysisController(pipeline: () => Promise<Pipeline>) {
  const runs = new Map<TabId, AbortController>();

  const patch = (tabId: TabId, url: string, f: (a: TabAnalysis) => TabAnalysis) =>
    analysisStore.set((s) => {
      const cur = s.byTab[tabId];
      if (!cur || cur.url !== url) return s;
      return { byTab: { ...s.byTab, [tabId]: f(cur) } };
    });

  async function run(tabId: TabId, page: PageArticle, kind: 'quick' | 'full'): Promise<void> {
    const article = toArticleInput(page);
    runs.get(tabId)?.abort();
    const ac = new AbortController();
    runs.set(tabId, ac);
    analysisStore.set((s) => {
      const cur = s.byTab[tabId];
      const base: TabAnalysis = cur && cur.url === article.url ? cur : { url: article.url, article, phase: 'idle', quick: null, full: null, stages: {}, error: null };
      return { byTab: { ...s.byTab, [tabId]: { ...base, phase: kind, error: null, stages: kind === 'full' ? {} : base.stages } } };
    });
    const live = () => !ac.signal.aborted && runs.get(tabId) === ac;
    try {
      const p = await pipeline();
      const onStage = (e: StageEvent) => {
        if (live()) patch(tabId, article.url, (a) => ({ ...a, stages: { ...a.stages, [e.stage]: e.status } }));
      };
      const opts = { signal: ac.signal, onStage };
      const r = kind === 'quick' ? await p.runQuickAnalysis(article, opts) : await p.runFullAnalysis(article, opts);
      if (!live()) return;
      patch(tabId, article.url, (a) => (kind === 'quick' ? { ...a, phase: 'done', quick: r } : { ...a, phase: 'done', full: r }));
    } catch (e) {
      if (!live()) return;
      patch(tabId, article.url, (a) => ({ ...a, phase: 'error', error: e instanceof Error ? e.message : String(e) }));
    } finally {
      if (runs.get(tabId) === ac) runs.delete(tabId);
    }
  }

  return {
    analyzeQuick: (tabId: TabId, page: PageArticle) => run(tabId, page, 'quick'),
    analyzeFull: (tabId: TabId, page: PageArticle) => run(tabId, page, 'full'),
    cancel(tabId: TabId) {
      runs.get(tabId)?.abort();
      runs.delete(tabId);
    },
    /** Olvida las pestañas cerradas. */
    prune(openTabIds: TabId[]) {
      const open = new Set(openTabIds);
      for (const id of [...runs.keys()]) if (!open.has(id)) this.cancel(id);
      analysisStore.set((s) => {
        const byTab = Object.fromEntries(Object.entries(s.byTab).filter(([id]) => open.has(Number(id))));
        return Object.keys(byTab).length === Object.keys(s.byTab).length ? s : { byTab };
      });
    },
  };
}

export const controller = createAnalysisController(getPipeline);

export function startAutoAnalysis(): Promise<() => void> {
  return onTabPage(async (e) => {
    if (!e.isNews || !e.article.article) return;
    const autoFull = (await commands.settingsGet<boolean>('ai.autoFull')) ?? false;
    const quick = (await commands.settingsGet<boolean>('ai.quickOnOpen')) ?? true;
    if (autoFull) void controller.analyzeFull(e.tabId, e.article);
    else if (quick) void controller.analyzeQuick(e.tabId, e.article);
  });
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/analysis/controller.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/features/analysis
git commit -m "feat(ui): analysis controller with quick-then-full runs, stage events and stale-result guard"
```

---

### Task 6: Lector de análisis — lente sobre el texto, barra de selección y atajos

**Files:**
- Create: `apps/ui/src/features/analysis/AnalysisReader.tsx`, `apps/ui/src/features/analysis/SelectionToolbar.tsx`, `apps/ui/src/features/analysis/marks.ts`

**Interfaces:**
- Consumes: `ReaderSurfaceProps`, `rewriteImage`, `navigate`, `ReaderView`, `AnnotatedText`, `markTone` (T3–T4), `useTabAnalysis`, `latestResult`, `controller` (T5), `panelStore` (T1).
- Produces:
  - `marksOf(r: AnalysisResult): LensMark[]` (afirmaciones con el estado de su veredicto o `pendiente`, prioridad 2; frases cargadas `cargada`, prioridad 1)
  - `AnalysisReader(props: ReaderSurfaceProps)` (lo registra la Tarea 14)
  - `useTextSelection(ref) → { text; rect: DOMRect } | null` (≥ 3 y ≤ 2000 caracteres, dentro de `ref`)
  - `SelectionToolbar({ rect, container, onAction(mode: AgentMode) })`

- [ ] **Step 1: Marcas de la lente**

`apps/ui/src/features/analysis/marks.ts`:
```ts
import type { AnalysisResult } from '@newpaper/pipeline';
import type { LensMark } from '@newpaper/ui-kit';

export function marksOf(r: AnalysisResult): LensMark[] {
  const status = new Map((r.verdicts ?? []).map((v) => [v.claimId, v.status]));
  const claims = (r.claims?.claims ?? []).map((c) => ({ id: c.id, start: c.span[0], end: c.span[1], kind: status.get(c.id) ?? 'pendiente', priority: 2 }));
  const loaded = (r.claims?.loadedPhrases ?? []).map((l, i) => ({ id: `l${i + 1}`, start: l.span[0], end: l.span[1], kind: 'cargada', priority: 1 }));
  return [...claims, ...loaded];
}
```

- [ ] **Step 2: Barra de selección**

`apps/ui/src/features/analysis/SelectionToolbar.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import type { AgentMode } from '@newpaper/pipeline';
import { useEffect, useState, type RefObject } from 'react';

export function useTextSelection(ref: RefObject<HTMLElement | null>): { text: string; rect: DOMRect } | null {
  const [sel, setSel] = useState<{ text: string; rect: DOMRect } | null>(null);
  useEffect(() => {
    const onChange = () => {
      const s = document.getSelection();
      const root = ref.current;
      if (!s || s.isCollapsed || !root || s.rangeCount === 0) return setSel(null);
      const range = s.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return setSel(null);
      const text = s.toString().trim();
      if (text.length < 3 || text.length > 2000) return setSel(null);
      setSel({ text, rect: range.getBoundingClientRect() });
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, [ref]);
  return sel;
}

export function SelectionToolbar({ rect, container, onAction }: { rect: DOMRect; container: HTMLElement; onAction(mode: AgentMode): void }) {
  const t = useT();
  const box = container.getBoundingClientRect();
  const top = rect.top - box.top + container.scrollTop - 48;
  const left = Math.max(8, rect.left - box.left + rect.width / 2 - 140);
  const modes: AgentMode[] = ['ask', 'verify', 'explain'];
  return (
    <div className="np-seltool np-rise" role="toolbar" aria-label={t('analysis.selection.label')} style={{ top, left }}>
      {modes.map((m) => (
        <button key={m} type="button" className="np-seltool-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onAction(m)}>
          {t(`analysis.selection.${m}`)}
        </button>
      ))}
    </div>
  );
}
```

> `onMouseDown` con `preventDefault` evita que el clic borre la selección antes de leerla.

- [ ] **Step 3: Lector**

`apps/ui/src/features/analysis/AnalysisReader.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import type { AgentMode } from '@newpaper/pipeline';
import { AnnotatedText, Button, markTone, ReaderView, type LensMark } from '@newpaper/ui-kit';
import { useMemo, useRef } from 'react';
import { commands } from '../../ipc/commands';
import { navigate } from '../../shell/navigate';
import { rewriteImage } from '../../shell/ReaderSurface';
import type { ReaderSurfaceProps } from '../../shell/registry';
import { controller, latestResult, useTabAnalysis } from './controller';
import { marksOf } from './marks';
import { openPanel, panelStore, usePanel } from './panelStore';
import { SelectionToolbar, useTextSelection } from './SelectionToolbar';

export function AnalysisReader({ tab, page }: ReaderSurfaceProps) {
  const { t, formatDate } = useI18n();
  const lens = usePanel((s) => s.lens);
  const dim = usePanel((s) => s.open && s.wide && s.tab === 'agent');
  const focus = usePanel((s) => s.focusClaim);
  const a = useTabAnalysis(tab.id);
  const url = page.url.split('#')[0];
  const result = a && a.url === url ? latestResult(a) : null;
  const marks = useMemo(() => (result ? marksOf(result) : []), [result]);
  const aiParas = useMemo(() => new Set((result?.aiAuthorship?.paragraphs ?? []).filter((p) => p.probability >= 0.7).map((p) => p.index)), [result]);
  const ref = useRef<HTMLDivElement>(null);
  const sel = useTextSelection(ref);
  const published = page.published && !Number.isNaN(Date.parse(page.published)) ? formatDate(new Date(page.published), { dateStyle: 'long' }) : null;

  const describe = (m: LensMark) => (m.kind === 'cargada' ? t('analysis.lens.loaded') : t(`analysis.verdict.${m.kind}`));
  const activate = (m: LensMark) => {
    if (m.kind === 'cargada') return openPanel('analysis');
    openPanel('analysis', { focusClaim: m.id });
  };
  const ask = (mode: AgentMode) => {
    if (!sel) return;
    openPanel('agent', { agentSeed: { fragment: sel.text, mode, question: null } });
    document.getSelection()?.removeAllRanges();
  };
  const toggleLens = () => panelStore.set({ lens: !lens });

  return (
    <div ref={ref} className={`np-surface np-areader${dim ? ' np-areader--dim' : ''}`}>
      <div className="np-reader-actions">
        <Button variant="quiet" onClick={() => commands.tabSetView(tab.id, 'original')}>
          {t('shell.reader.original')}
        </Button>
        <Button variant="quiet" aria-pressed={lens} disabled={!result} onClick={toggleLens}>
          {t('analysis.lens.toggle')}
        </Button>
        <Button variant="primary" onClick={() => (void controller.analyzeFull(tab.id, page), openPanel('analysis'))}>
          {t('analysis.actions.analyze')}
        </Button>
      </div>
      {lens && result ? (
        <article className="np-reader" lang={page.lang ?? undefined}>
          <h1 className="np-reader-title">{page.title}</h1>
          <p className="np-reader-meta">
            {page.siteName ? <span>{page.siteName}</span> : null}
            {page.byline ? <span>{t('shell.reader.byline', { name: page.byline })}</span> : null}
            {published ? <time dateTime={page.published ?? undefined}>{published}</time> : null}
          </p>
          <AnnotatedText
            text={page.text}
            lang={page.lang}
            marks={marks}
            classOf={(m) => `np-mark--${markTone(m.kind)}`}
            describe={describe}
            activeId={focus}
            onActivate={activate}
            paragraphClass={(i) => (aiParas.has(i) ? 'np-lens-ai-paragraph' : undefined)}
          />
        </article>
      ) : (
        <ReaderView article={page} rewriteImage={rewriteImage} onOpenLink={(u) => navigate(u)} />
      )}
      {sel && ref.current ? <SelectionToolbar rect={sel.rect} container={ref.current} onAction={ask} /> : null}
    </div>
  );
}
```

Añade a `apps/ui/src/features/analysis/analysis.css` (se crea aquí; las tareas siguientes añaden reglas):
```css
.np-areader { position: relative; overflow: auto; transition: opacity 220ms var(--np-ease); }
.np-areader--dim { opacity: .45; }
.np-areader--dim:hover { opacity: 1; }
.np-seltool { position: absolute; z-index: 5; display: flex; gap: 2px; padding: 4px; border-radius: 10px; background: var(--np-ink); box-shadow: 0 6px 24px rgb(0 0 0 / .18); }
.np-seltool-btn { min-height: 36px; padding: 0 12px; border: 0; border-radius: 7px; background: none; color: var(--np-paper); font: 600 13px var(--np-font-ui); cursor: pointer; }
.np-seltool-btn:hover, .np-seltool-btn:focus-visible { background: color-mix(in srgb, var(--np-paper) 16%, transparent); }
.np-reader-meta { display: flex; gap: 12px; font: 12px var(--np-font-mono); color: var(--np-muted); }
@media (prefers-reduced-motion: reduce) { .np-areader { transition: none; } }
```

> `ReaderView` recibe la `PageArticle` entera (es un `Article`). El lector por defecto del subproyecto 1 pasa `page.article`, que es un booleano: este lector lo sustituye y evita ese fallo.

- [ ] **Step 4: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores. (Los textos `analysis.*` se añaden en la Tarea 2.)

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/features/analysis
git commit -m "feat(ui): analysis reader with bias lens, ai paragraphs and selection-to-agent toolbar"
```

---
### Task 7: ui-kit — gráficos SVG (barras, línea, rangos, apilado, matriz, tabla) y mapa de teselas

**Files:**
- Create: `packages/ui-kit/src/charts/{scale.ts, ChartFrame.tsx, BarChart.tsx, LineChart.tsx, RangeChart.tsx, StackedChart.tsx, MatrixChart.tsx, TableChart.tsx, tileGrids.ts, TileMap.tsx, charts.css}`
- Modify: `packages/ui-kit/src/index.ts`

**Interfaces:**
- Produces:
  - `niceTicks(min, max, count = 4): number[]`, `linear(d0, d1, r0, r1): (v: number) => number`
  - `ChartFrame({ title, unit?, sources: { n; title; url }[], labels: { sources; showTable; showChart }, table: ReactNode, onOpenSource?(url), children })` — figura con alternativa en tabla (botón) y pie de fuentes numeradas
  - `BarChart`, `LineChart` (`{ points: { x; y; provisional? }[]; format(n): string; label: string }`), `RangeChart` (`{ min; max; ranges; format; label }`), `StackedChart` (`{ categories; rows; label }`), `MatrixChart` (`{ columns; rows; cellLabel(c): string; label }`), `TableChart` (`{ columns; rows }`)
  - `TILE_GRIDS: Record<'eu' | 'es' | 'de' | 'gb', Record<string, [number, number]>>`, `gridFor(codes): keyof typeof TILE_GRIDS | null`
  - `TileMap({ regions: { code; value }[]; format; label; regionName(code): string })` — devuelve `null` si algún código no está en una rejilla conocida

- [ ] **Step 1: Escalas y marco**

`packages/ui-kit/src/charts/scale.ts`:
```ts
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
```

`packages/ui-kit/src/charts/ChartFrame.tsx`:
```tsx
import { useState, type ReactNode } from 'react';

export interface FrameSource { n: number; title: string; url: string }

export function ChartFrame(props: {
  title: string;
  unit?: string;
  sources: FrameSource[];
  labels: { sources: string; showTable: string; showChart: string };
  table: ReactNode;
  onOpenSource?(url: string): void;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="np-chart np-rise">
      <div className="np-chart-head">
        <span className="np-chart-title">{props.title}</span>
        {props.unit ? <span className="np-chart-unit">{props.unit}</span> : null}
        <button type="button" className="np-chart-toggle" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
          {asTable ? props.labels.showChart : props.labels.showTable}
        </button>
      </div>
      <div className="np-chart-body">{asTable ? props.table : props.children}</div>
      <figcaption className="np-chart-sources">
        <span>{props.labels.sources}</span>
        {props.sources.map((s) => (
          <button key={s.n} type="button" className="np-chart-source" title={s.url} onClick={() => props.onOpenSource?.(s.url)}>
            [{s.n}] {s.title}
          </button>
        ))}
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: Gráficos**

`packages/ui-kit/src/charts/BarChart.tsx`:
```tsx
import { linear, niceTicks } from './scale';

const W = 320;
const H = 180;
const PAD = { l: 40, r: 8, t: 8, b: 28 };

export function BarChart({ points, format, label }: { points: { x: string; y: number; provisional?: boolean }[]; format(n: number): string; label: string }) {
  const ticks = niceTicks(Math.min(0, ...points.map((p) => p.y)), Math.max(0, ...points.map((p) => p.y)));
  const y = linear(ticks[0]!, ticks.at(-1)!, H - PAD.b, PAD.t);
  const bw = (W - PAD.l - PAD.r) / points.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="np-svg" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="np-grid" />
          <text x={PAD.l - 4} y={y(t) + 3} className="np-tick" textAnchor="end">{format(t)}</text>
        </g>
      ))}
      {points.map((p, i) => (
        <g key={p.x} className="np-grow">
          <rect x={PAD.l + i * bw + bw * 0.15} width={bw * 0.7} y={Math.min(y(p.y), y(0))} height={Math.abs(y(0) - y(p.y))} className={p.provisional ? 'np-bar np-bar--prov' : 'np-bar'}>
            <title>{`${p.x}: ${format(p.y)}`}</title>
          </rect>
          <text x={PAD.l + i * bw + bw / 2} y={H - 10} className="np-tick" textAnchor="middle">{p.x}</text>
        </g>
      ))}
    </svg>
  );
}
```

`packages/ui-kit/src/charts/LineChart.tsx`:
```tsx
import { linear, niceTicks } from './scale';

const W = 320;
const H = 180;
const PAD = { l: 40, r: 12, t: 8, b: 28 };

export function LineChart({ points, format, label }: { points: { x: string; y: number; provisional?: boolean }[]; format(n: number): string; label: string }) {
  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y = linear(ticks[0]!, ticks.at(-1)!, H - PAD.b, PAD.t);
  const x = linear(0, Math.max(1, points.length - 1), PAD.l, W - PAD.r);
  const firm = points.filter((p) => !p.provisional);
  const path = (ps: typeof points, offset: number) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(i + offset)},${y(p.y)}`).join(' ');
  const provStart = Math.max(0, firm.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="np-svg" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="np-grid" />
          <text x={PAD.l - 4} y={y(t) + 3} className="np-tick" textAnchor="end">{format(t)}</text>
        </g>
      ))}
      <path d={path(firm, 0)} className="np-line np-draw" />
      {firm.length < points.length ? <path d={path(points.slice(provStart), provStart)} className="np-line np-line--prov" /> : null}
      {points.map((p, i) => (
        <g key={p.x}>
          <circle cx={x(i)} cy={y(p.y)} r={3} className="np-dot">
            <title>{`${p.x}: ${format(p.y)}`}</title>
          </circle>
          <text x={x(i)} y={H - 10} className="np-tick" textAnchor="middle">{p.x}</text>
        </g>
      ))}
    </svg>
  );
}
```

`packages/ui-kit/src/charts/RangeChart.tsx`:
```tsx
import { linear } from './scale';

export function RangeChart({ min, max, ranges, format, label }: { min: number; max: number; ranges: { label: string; from: number; to: number }[]; format(n: number): string; label: string }) {
  const W = 320;
  const row = 28;
  const H = ranges.length * row + 24;
  const x = linear(min, max, 110, W - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="np-svg" role="img" aria-label={label}>
      {ranges.map((r, i) => (
        <g key={r.label}>
          <text x={4} y={i * row + 18} className="np-tick">{r.label}</text>
          <rect x={x(r.from)} y={i * row + 8} width={Math.max(2, x(r.to) - x(r.from))} height={14} rx={7} className="np-bar">
            <title>{`${r.label}: ${format(r.from)} – ${format(r.to)}`}</title>
          </rect>
        </g>
      ))}
      <text x={110} y={H - 4} className="np-tick">{format(min)}</text>
      <text x={W - 10} y={H - 4} className="np-tick" textAnchor="end">{format(max)}</text>
    </svg>
  );
}
```

`packages/ui-kit/src/charts/StackedChart.tsx`:
```tsx
export function StackedChart({ categories, rows, label }: { categories: string[]; rows: { label: string; values: number[] }[]; label: string }) {
  return (
    <div className="np-stacked" role="img" aria-label={label}>
      {rows.map((r) => {
        const total = r.values.reduce((a, b) => a + b, 0) || 1;
        return (
          <div key={r.label} className="np-stacked-row">
            <span className="np-stacked-label">{r.label}</span>
            <span className="np-stacked-bar">
              {r.values.map((v, i) => (
                <span key={categories[i] ?? i} className={`np-series-${(i % 6) + 1}`} style={{ width: `${(v / total) * 100}%` }} title={`${categories[i] ?? ''}: ${v}`} />
              ))}
            </span>
          </div>
        );
      })}
      <div className="np-legend">
        {categories.map((c, i) => (
          <span key={c}>
            <i className={`np-series-${(i % 6) + 1}`} />
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
```

`packages/ui-kit/src/charts/MatrixChart.tsx`:
```tsx
type Cell = 'si' | 'par' | 'mal' | 'no';
const GLYPH: Record<Cell, string> = { si: '●', par: '◐', mal: '○', no: '✕' };

export function MatrixChart({ columns, rows, cellLabel, label }: { columns: string[]; rows: { label: string; cells: Cell[] }[]; cellLabel(c: Cell): string; label: string }) {
  return (
    <table className="np-matrix" aria-label={label}>
      <thead>
        <tr>
          <td />
          {columns.map((c) => (
            <th key={c} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            {r.cells.map((c, i) => (
              <td key={columns[i] ?? i} className={`np-matrix-${c}`} aria-label={cellLabel(c)} title={cellLabel(c)}>
                {GLYPH[c]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`packages/ui-kit/src/charts/TableChart.tsx`:
```tsx
export function TableChart({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="np-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((v, j) => (
              <td key={j} className={typeof v === 'number' ? 'np-num' : undefined}>{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Mapa de teselas**

`packages/ui-kit/src/charts/tileGrids.ts`:
```ts
/** Cartogramas de teselas: [columna, fila]. Una casilla por región; sin geometrías. */
export const TILE_GRIDS = {
  eu: {
    SE: [5, 0], FI: [6, 0], IE: [1, 1], DK: [4, 1], EE: [6, 1], NL: [3, 2], DE: [4, 2], PL: [5, 2], LV: [6, 2],
    BE: [2, 3], LU: [3, 3], CZ: [4, 3], SK: [5, 3], LT: [6, 3], FR: [2, 4], AT: [4, 4], HU: [5, 4], RO: [6, 4],
    PT: [0, 5], ES: [1, 5], IT: [3, 5], SI: [4, 5], HR: [5, 5], BG: [6, 5], MT: [3, 6], GR: [6, 6], CY: [7, 6],
  },
  es: {
    'ES-GA': [0, 0], 'ES-AS': [1, 0], 'ES-CB': [2, 0], 'ES-PV': [3, 0], 'ES-NC': [4, 0],
    'ES-CL': [1, 1], 'ES-RI': [3, 1], 'ES-AR': [4, 1], 'ES-CT': [5, 1],
    'ES-EX': [0, 2], 'ES-MD': [2, 2], 'ES-CM': [3, 2], 'ES-VC': [4, 2], 'ES-IB': [6, 2],
    'ES-AN': [1, 3], 'ES-MC': [4, 3], 'ES-CN': [0, 4], 'ES-CE': [2, 4], 'ES-ML': [3, 4],
  },
  de: {
    'DE-SH': [2, 0], 'DE-HB': [1, 1], 'DE-HH': [2, 1], 'DE-MV': [3, 1], 'DE-NW': [0, 2], 'DE-NI': [1, 2], 'DE-ST': [2, 2], 'DE-BE': [3, 2],
    'DE-BB': [4, 2], 'DE-RP': [0, 3], 'DE-HE': [1, 3], 'DE-TH': [2, 3], 'DE-SN': [3, 3], 'DE-SL': [0, 4], 'DE-BW': [1, 4], 'DE-BY': [2, 4],
  },
  gb: { 'GB-SCT': [1, 0], 'GB-NIR': [0, 1], 'GB-WLS': [0, 2], 'GB-ENG': [1, 2] },
} satisfies Record<string, Record<string, [number, number]>>;

export type GridId = keyof typeof TILE_GRIDS;

export function gridFor(codes: string[]): GridId | null {
  for (const id of Object.keys(TILE_GRIDS) as GridId[]) {
    const g = TILE_GRIDS[id] as Record<string, [number, number]>;
    if (codes.every((c) => c.toUpperCase() in g)) return id;
  }
  return null;
}
```

`packages/ui-kit/src/charts/TileMap.tsx`:
```tsx
import { gridFor, TILE_GRIDS } from './tileGrids';

const S = 40;

export function TileMap({ regions, format, label, regionName }: { regions: { code: string; value: number }[]; format(n: number): string; label: string; regionName(code: string): string }) {
  const id = gridFor(regions.map((r) => r.code));
  if (!id) return null;
  const grid = TILE_GRIDS[id] as Record<string, [number, number]>;
  const vals = regions.map((r) => r.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const cols = Math.max(...Object.values(grid).map((p) => p[0])) + 1;
  const rows = Math.max(...Object.values(grid).map((p) => p[1])) + 1;
  const byCode = new Map(regions.map((r) => [r.code.toUpperCase(), r.value]));
  return (
    <svg viewBox={`0 0 ${cols * S} ${rows * S}`} className="np-svg np-tilemap" role="img" aria-label={label}>
      {Object.entries(grid).map(([code, [c, r]]) => {
        const v = byCode.get(code);
        const pct = v === undefined ? 0 : hi === lo ? 70 : 15 + ((v - lo) / (hi - lo)) * 75;
        return (
          <g key={code}>
            <rect x={c * S + 2} y={r * S + 2} width={S - 4} height={S - 4} rx={5} style={{ fill: v === undefined ? 'var(--np-soft)' : `color-mix(in srgb, var(--np-accent) ${pct}%, var(--np-card))` }}>
              <title>{v === undefined ? regionName(code) : `${regionName(code)}: ${format(v)}`}</title>
            </rect>
            <text x={c * S + S / 2} y={r * S + S / 2 + 4} textAnchor="middle" className="np-tile-code">{code.slice(-2)}</text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Estilos y exportación**

`packages/ui-kit/src/charts/charts.css`:
```css
.np-chart { margin: 12px 0; padding: 12px; border: 1px solid var(--np-line); border-radius: var(--np-radius); background: var(--np-card); }
.np-chart-head { display: flex; align-items: baseline; gap: 8px; }
.np-chart-title { font: 600 14px var(--np-font-ui); flex: 1; }
.np-chart-unit { font: 11px var(--np-font-mono); color: var(--np-muted); }
.np-chart-toggle { min-height: 32px; border: 0; background: none; color: var(--np-accent); font: 12px var(--np-font-ui); cursor: pointer; }
.np-chart-sources { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; font: 11px var(--np-font-mono); color: var(--np-muted); }
.np-chart-source { border: 0; background: none; color: var(--np-accent); font: inherit; cursor: pointer; padding: 0; }
.np-svg { width: 100%; height: auto; display: block; }
.np-grid { stroke: var(--np-line2); }
.np-tick { font: 10px var(--np-font-mono); fill: var(--np-muted); }
.np-bar { fill: var(--np-accent); }
.np-bar--prov { fill: color-mix(in srgb, var(--np-accent) 40%, transparent); }
.np-line { fill: none; stroke: var(--np-accent); stroke-width: 2; }
.np-line--prov { stroke-dasharray: 4 4; }
.np-dot { fill: var(--np-card); stroke: var(--np-accent); stroke-width: 2; }
.np-tile-code { font: 600 10px var(--np-font-mono); fill: var(--np-ink); pointer-events: none; }
.np-stacked-row { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: center; margin: 4px 0; font: 12px var(--np-font-ui); }
.np-stacked-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; }
.np-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; font: 11px var(--np-font-ui); }
.np-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; }
.np-series-1 { background: var(--np-accent); } .np-series-2 { background: var(--np-ok); } .np-series-3 { background: var(--np-warn); }
.np-series-4 { background: var(--np-ai); } .np-series-5 { background: var(--np-tor); } .np-series-6 { background: var(--np-faint); }
.np-matrix, .np-table { width: 100%; border-collapse: collapse; font: 12px var(--np-font-ui); }
.np-matrix th, .np-matrix td, .np-table th, .np-table td { padding: 6px; border-bottom: 1px solid var(--np-line2); text-align: left; }
.np-matrix td { text-align: center; }
.np-matrix-si { color: var(--np-ok); } .np-matrix-par { color: var(--np-warn); } .np-matrix-mal, .np-matrix-no { color: var(--np-bad); }
.np-num { text-align: right; font-family: var(--np-font-mono); }
.np-grow { transform-origin: bottom; animation: np-grow 600ms var(--np-ease) both; transform-box: fill-box; }
.np-draw { stroke-dasharray: 1000; stroke-dashoffset: 1000; animation: np-draw 900ms var(--np-ease) forwards; }
@keyframes np-grow { from { transform: scaleY(0); } }
@keyframes np-draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { .np-grow, .np-draw { animation: none; stroke-dashoffset: 0; } }
```

Añade al final de `packages/ui-kit/src/index.ts`:
```ts
import './charts/charts.css';
export { niceTicks, linear } from './charts/scale';
export { ChartFrame, type FrameSource } from './charts/ChartFrame';
export { BarChart } from './charts/BarChart';
export { LineChart } from './charts/LineChart';
export { RangeChart } from './charts/RangeChart';
export { StackedChart } from './charts/StackedChart';
export { MatrixChart } from './charts/MatrixChart';
export { TableChart } from './charts/TableChart';
export { TILE_GRIDS, gridFor, type GridId } from './charts/tileGrids';
export { TileMap } from './charts/TileMap';
```

- [ ] **Step 5: Comprobar que compila**

Run:
```powershell
pnpm --filter @newpaper/ui-kit typecheck
pnpm --filter @newpaper/i18n test
```
Expected: sin errores; el escaneo sigue limpio (los textos de los ejes y etiquetas vienen de los datos o de props).

- [ ] **Step 6: Commit**

```powershell
git add packages/ui-kit
git commit -m "feat(ui-kit): svg charts with table fallback, numbered sources and tile-grid map"
```

---

### Task 8: ui-kit — hemiciclo con constructor de mayorías y `VisualizationView`

**Files:**
- Create: `packages/ui-kit/src/charts/parliament/hemicycle.ts`, `packages/ui-kit/src/charts/parliament/ParliamentChart.tsx`, `packages/ui-kit/src/charts/VisualizationView.tsx`
- Modify: `packages/ui-kit/src/index.ts`, `packages/ui-kit/src/charts/charts.css`, `packages/ui-kit/package.json`
- Test: `packages/ui-kit/src/charts/parliament/hemicycle.test.ts`

**Interfaces:**
- Produces:
  - `Seat { x; y; row; angle }` (radio exterior 1, `y` hacia arriba), `rowsFor(total)`, `hemicycleLayout(total, rows?): Seat[]` (ordenados de izquierda a derecha por ángulo; en empate, fila interior primero)
  - `PartySeats { partyId; name; short; color; order; seats }`, `assignSeats(layout, parties): (PartySeats | null)[]` (por `order` ideológico; vacantes `null`)
  - `coalitionSeats(parties, yes: Set<string>): number`, `majorityOf(total) = floor(total / 2) + 1`
  - `ParliamentChart({ total, majority, parties, labels })` con constructor de mayorías y tabla alternativa
  - `VizLabels` y `VisualizationView({ viz, sources, parties?, labels, format, regionName, onOpenSource? })` — **no pinta nada** si ninguno de `viz.sourceIds` está entre `sources`; numera las fuentes según su posición en `sources`

- [ ] **Step 1: Escribir el test que falla**

`packages/ui-kit/src/charts/parliament/hemicycle.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { assignSeats, coalitionSeats, hemicycleLayout, majorityOf, type PartySeats } from './hemicycle';

const party = (partyId: string, order: number, seats: number): PartySeats => ({ partyId, name: partyId, short: partyId, color: '#000', order, seats });

describe('hemicycleLayout', () => {
  it.each([7, 350, 630, 650])('places exactly %i seats inside the upper half disc, left to right', (total) => {
    const seats = hemicycleLayout(total);
    expect(seats).toHaveLength(total);
    for (const s of seats) {
      expect(s.y).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(seats[0]!.x).toBeLessThan(0);
    expect(seats.at(-1)!.x).toBeGreaterThan(0);
    for (let i = 1; i < seats.length; i++) expect(seats[i]!.angle).toBeLessThanOrEqual(seats[i - 1]!.angle + 1e-12);
  });
});

describe('assignSeats', () => {
  it('fills seats by ideological order and leaves vacancies', () => {
    const layout = hemicycleLayout(350);
    const parties = [party('PP', 6, 137), party('PSOE', 3, 121), party('SUMAR', 1, 31)];
    const filled = assignSeats(layout, parties);
    expect(filled[0]!.partyId).toBe('SUMAR');
    expect(filled.filter((p) => p?.partyId === 'PSOE')).toHaveLength(121);
    expect(filled.filter((p) => p === null)).toHaveLength(350 - 289);
    expect(filled.findLastIndex((p) => p?.partyId === 'PSOE')).toBeLessThan(filled.findIndex((p) => p?.partyId === 'PP'));
  });
});

describe('majority builder', () => {
  it('adds the seats of the parties voting yes and compares with an absolute majority', () => {
    const parties = [party('PP', 6, 137), party('PSOE', 3, 121), party('SUMAR', 1, 31), party('VOX', 8, 33)];
    expect(majorityOf(350)).toBe(176);
    expect(majorityOf(630)).toBe(316);
    expect(coalitionSeats(parties, new Set(['PSOE', 'SUMAR']))).toBe(152);
    expect(coalitionSeats(parties, new Set(['PP', 'VOX']))).toBe(170);
    expect(coalitionSeats(parties, new Set(['PP', 'PSOE']))).toBeGreaterThanOrEqual(majorityOf(350));
    expect(coalitionSeats(parties, new Set(['NOEXISTE']))).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui-kit exec vitest run src/charts/parliament/hemicycle.test.ts`
Expected: FAIL (`Cannot find module './hemicycle'`).

- [ ] **Step 3: Geometría y suma**

`packages/ui-kit/src/charts/parliament/hemicycle.ts`:
```ts
export interface Seat { x: number; y: number; row: number; angle: number }
export interface PartySeats { partyId: string; name: string; short: string; color: string; order: number; seats: number }

export const rowsFor = (total: number) => (total <= 20 ? 2 : total <= 100 ? 4 : total <= 400 ? 9 : 12);
export const majorityOf = (total: number) => Math.floor(total / 2) + 1;

const INNER = 0.38;

export function hemicycleLayout(total: number, rows = rowsFor(total)): Seat[] {
  if (total <= 0) return [];
  const n = Math.max(1, Math.min(rows, total));
  const radii = Array.from({ length: n }, (_, i) => (n === 1 ? 1 : INNER + ((1 - INNER) * i) / (n - 1)));
  const sum = radii.reduce((a, b) => a + b, 0);
  const exact = radii.map((r) => (total * r) / sum);
  const counts = exact.map((x) => Math.max(1, Math.floor(x)));
  let rest = total - counts.reduce((a, b) => a + b, 0);
  const byFraction = exact.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || b.i - a.i);
  for (let k = 0; rest > 0; k = (k + 1) % n, rest--) counts[byFraction[k]!.i]!++;
  for (let i = n - 1; rest < 0 && i >= 0; i--) {
    const take = Math.min(-rest, counts[i]! - 1);
    counts[i]! -= take;
    rest += take;
  }
  const seats: Seat[] = [];
  radii.forEach((r, row) => {
    const c = counts[row]!;
    for (let j = 0; j < c; j++) {
      const angle = c === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (c - 1);
      seats.push({ x: r * Math.cos(angle), y: r * Math.sin(angle), row, angle });
    }
  });
  return seats.sort((a, b) => b.angle - a.angle || a.row - b.row);
}

export function assignSeats(layout: Seat[], parties: PartySeats[]): (PartySeats | null)[] {
  const ordered = [...parties].sort((a, b) => a.order - b.order);
  const out: (PartySeats | null)[] = [];
  for (const p of ordered) for (let k = 0; k < p.seats && out.length < layout.length; k++) out.push(p);
  while (out.length < layout.length) out.push(null);
  return out;
}

export function coalitionSeats(parties: PartySeats[], yes: Set<string>): number {
  return parties.filter((p) => yes.has(p.partyId)).reduce((n, p) => n + p.seats, 0);
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui-kit exec vitest run src/charts/parliament/hemicycle.test.ts`
Expected: PASS — 6 tests (4 del `it.each` + 2).

- [ ] **Step 5: Componente del hemiciclo**

`packages/ui-kit/src/charts/parliament/ParliamentChart.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { assignSeats, coalitionSeats, hemicycleLayout, type PartySeats } from './hemicycle';

export interface ParliamentLabels {
  chart: string;
  majority(n: number): string;
  seatsFor(n: number): string;
  reached: string;
  short(n: number): string;
  hint: string;
  party: string;
  seats: string;
  vote: string;
  yes: string;
  no: string;
  reset: string;
}

const W = 320;
const H = 176;

export function ParliamentChart({ total, majority, parties, labels }: { total: number; majority: number; parties: PartySeats[]; labels: ParliamentLabels }) {
  const [yes, setYes] = useState<Set<string>>(new Set());
  const layout = useMemo(() => hemicycleLayout(total), [total]);
  const filled = useMemo(() => assignSeats(layout, parties), [layout, parties]);
  const ordered = useMemo(() => [...parties].sort((a, b) => a.order - b.order), [parties]);
  const sum = coalitionSeats(parties, yes);
  const r = Math.max(1.6, Math.min(5, 260 / Math.sqrt(total) / 3.2));
  const toggle = (id: string) => setYes((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const building = yes.size > 0;
  return (
    <div className="np-parl">
      <svg viewBox={`0 0 ${W} ${H}`} className="np-svg" role="img" aria-label={labels.chart}>
        {layout.map((s, i) => {
          const p = filled[i];
          const active = !building || (p && yes.has(p.partyId));
          return (
            <circle
              key={i}
              cx={W / 2 + s.x * 150}
              cy={H - 8 - s.y * 150}
              r={r}
              className={active ? 'np-seat' : 'np-seat np-seat--off'}
              style={{ fill: p ? p.color : 'var(--np-line3)' }}
            />
          );
        })}
        <line x1={W / 2} x2={W / 2} y1={H - 170} y2={H - 4} className="np-parl-axis" />
        <text x={W / 2} y={H - 30} textAnchor="middle" className="np-parl-sum">{building ? sum : total}</text>
        <text x={W / 2} y={H - 14} textAnchor="middle" className="np-tick">{labels.majority(majority)}</text>
      </svg>
      <p className={`np-parl-status ${sum >= majority ? 'np-parl-status--ok' : ''}`} aria-live="polite">
        {building ? `${labels.seatsFor(sum)} · ${sum >= majority ? labels.reached : labels.short(majority - sum)}` : labels.hint}
      </p>
      <div className="np-parl-parties" role="group" aria-label={labels.hint}>
        {ordered.map((p) => (
          <button key={p.partyId} type="button" className="np-parl-party" aria-pressed={yes.has(p.partyId)} onClick={() => toggle(p.partyId)}>
            <i style={{ background: p.color }} />
            <span>{p.short}</span>
            <span className="np-mono">{p.seats}</span>
          </button>
        ))}
        {building ? (
          <button type="button" className="np-parl-reset" onClick={() => setYes(new Set())}>
            {labels.reset}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ParliamentTable({ parties, yes, labels }: { parties: PartySeats[]; yes?: Set<string>; labels: ParliamentLabels }) {
  return (
    <table className="np-table">
      <thead>
        <tr>
          <th scope="col">{labels.party}</th>
          <th scope="col">{labels.seats}</th>
          <th scope="col">{labels.vote}</th>
        </tr>
      </thead>
      <tbody>
        {[...parties].sort((a, b) => a.order - b.order).map((p) => (
          <tr key={p.partyId}>
            <td>{p.name}</td>
            <td className="np-num">{p.seats}</td>
            <td>{yes?.has(p.partyId) ? labels.yes : labels.no}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Añade a `packages/ui-kit/src/charts/charts.css`:
```css
.np-seat { transition: opacity 200ms var(--np-ease); }
.np-seat--off { opacity: .22; }
.np-parl-axis { stroke: var(--np-ink); stroke-dasharray: 2 3; }
.np-parl-sum { font: 700 22px var(--np-font-ui); fill: var(--np-ink); }
.np-parl-status { font: 13px var(--np-font-ui); color: var(--np-muted); margin: 6px 0; }
.np-parl-status--ok { color: var(--np-ok); font-weight: 600; }
.np-parl-parties { display: flex; flex-wrap: wrap; gap: 6px; }
.np-parl-party { display: inline-flex; align-items: center; gap: 6px; min-height: var(--np-hit); padding: 0 10px; border: 1px solid var(--np-line3); border-radius: 999px; background: var(--np-card); font: 12px var(--np-font-ui); cursor: pointer; }
.np-parl-party[aria-pressed='true'] { border-color: var(--np-ink); background: var(--np-soft); font-weight: 600; }
.np-parl-party i { width: 10px; height: 10px; border-radius: 50%; }
.np-parl-reset { min-height: var(--np-hit); border: 0; background: none; color: var(--np-accent); font: 12px var(--np-font-ui); cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .np-seat { transition: none; } }
```

- [ ] **Step 6: Vista de una visualización**

En `packages/ui-kit/package.json` añade a `peerDependencies`: `"@newpaper/pipeline": "workspace:*"` (solo tipos) y a `devDependencies` la misma entrada.

`packages/ui-kit/src/charts/VisualizationView.tsx`:
```tsx
import type { Visualization } from '@newpaper/pipeline';
import type { ReactElement } from 'react';
import { BarChart } from './BarChart';
import { ChartFrame, type FrameSource } from './ChartFrame';
import { LineChart } from './LineChart';
import { MatrixChart } from './MatrixChart';
import { ParliamentChart, ParliamentTable, type ParliamentLabels } from './parliament/ParliamentChart';
import type { PartySeats } from './parliament/hemicycle';
import { RangeChart } from './RangeChart';
import { StackedChart } from './StackedChart';
import { TableChart } from './TableChart';
import { TileMap } from './TileMap';

export interface VizLabels {
  sources: string;
  showTable: string;
  showChart: string;
  label: string;
  value: string;
  region: string;
  matrix(c: 'si' | 'par' | 'mal' | 'no'): string;
  parliament: ParliamentLabels;
}
export interface PartyInfo { id: string; name: string; short: string; color: string; order: number }

export function VisualizationView(props: {
  viz: Visualization;
  sources: { id: string; title: string; url: string }[];
  parties?: PartyInfo[];
  labels: VizLabels;
  format(n: number): string;
  regionName(code: string): string;
  onOpenSource?(url: string): void;
}) {
  const { viz, labels, format } = props;
  const numbered: FrameSource[] = viz.sourceIds
    .map((id) => {
      const i = props.sources.findIndex((s) => s.id === id);
      return i < 0 ? null : { n: i + 1, title: props.sources[i]!.title, url: props.sources[i]!.url };
    })
    .filter((x): x is FrameSource => x !== null);
  if (!numbered.length) return null; // §6.2: sin fuente recuperada no se dibuja
  const frame = (chart: ReactElement, table: ReactElement) => (
    <ChartFrame title={viz.title} unit={viz.unit} sources={numbered} labels={labels} table={table} onOpenSource={props.onOpenSource}>
      {chart}
    </ChartFrame>
  );
  const pointsTable = (pts: { x: string; y: number }[]) => <TableChart columns={[labels.label, labels.value]} rows={pts.map((p) => [p.x, format(p.y)])} />;
  switch (viz.type) {
    case 'bar':
      return frame(<BarChart points={viz.data.points} format={format} label={viz.title} />, pointsTable(viz.data.points));
    case 'line':
      return frame(<LineChart points={viz.data.points} format={format} label={viz.title} />, pointsTable(viz.data.points));
    case 'range':
      return frame(
        <RangeChart {...viz.data} format={format} label={viz.title} />,
        <TableChart columns={[labels.label, labels.value]} rows={viz.data.ranges.map((r) => [r.label, `${format(r.from)} – ${format(r.to)}`])} />,
      );
    case 'stacked':
      return frame(
        <StackedChart {...viz.data} label={viz.title} />,
        <TableChart columns={[labels.label, ...viz.data.categories]} rows={viz.data.rows.map((r) => [r.label, ...r.values])} />,
      );
    case 'matrix':
      return frame(
        <MatrixChart {...viz.data} cellLabel={labels.matrix} label={viz.title} />,
        <TableChart columns={[labels.label, ...viz.data.columns]} rows={viz.data.rows.map((r) => [r.label, ...r.cells.map(labels.matrix)])} />,
      );
    case 'table':
      return frame(<TableChart {...viz.data} />, <TableChart {...viz.data} />);
    case 'map': {
      const table = <TableChart columns={[labels.region, labels.value]} rows={viz.data.regions.map((r) => [props.regionName(r.code), format(r.value)])} />;
      const map = <TileMap regions={viz.data.regions} format={format} label={viz.title} regionName={props.regionName} />;
      return frame(map ?? table, table);
    }
    case 'parliament': {
      const info = new Map((props.parties ?? []).map((p) => [p.id, p]));
      const seats: PartySeats[] = viz.data.series[0]!.seats.flatMap((s) => {
        const p = info.get(s.partyId);
        return p ? [{ partyId: p.id, name: p.name, short: p.short, color: p.color, order: p.order, seats: s.seats }] : [];
      });
      if (!seats.length) return null;
      return frame(
        <ParliamentChart total={viz.data.total} majority={viz.data.majority} parties={seats} labels={labels.parliament} />,
        <ParliamentTable parties={seats} labels={labels.parliament} />,
      );
    }
  }
}
```

> `TileMap` devuelve `null` con códigos desconocidos; en ese caso se pinta la tabla también como vista principal.

Añade al final de `packages/ui-kit/src/index.ts`:
```ts
export { hemicycleLayout, assignSeats, coalitionSeats, majorityOf, rowsFor, type Seat, type PartySeats } from './charts/parliament/hemicycle';
export { ParliamentChart, ParliamentTable, type ParliamentLabels } from './charts/parliament/ParliamentChart';
export { VisualizationView, type VizLabels, type PartyInfo } from './charts/VisualizationView';
```

- [ ] **Step 7: Comprobar que compila**

Run:
```powershell
pnpm install
pnpm --filter @newpaper/ui-kit typecheck
pnpm --filter @newpaper/ui-kit test
```
Expected: sin errores; todos los tests de ui-kit en verde.

- [ ] **Step 8: Commit**

```powershell
git add packages/ui-kit pnpm-lock.yaml
git commit -m "feat(ui-kit): hemicycle layout with majority builder and source-gated visualization view"
```

---

### Task 9: Agente — citas numeradas, flujo de eventos y pestaña del agente con visuales y medios

**Files:**
- Create: `apps/ui/src/features/analysis/agent/citations.ts`, `apps/ui/src/features/analysis/agent/useAgent.ts`, `apps/ui/src/features/analysis/agent/AgentTab.tsx`, `apps/ui/src/features/analysis/vizLabels.ts`, `apps/ui/src/features/analysis/parties.ts`
- Test: `apps/ui/src/features/analysis/agent/citations.test.ts`

**Interfaces:**
- Consumes: `getPipeline` (4), `analysisStore`, `latestResult` (T5), `panelStore` (T1), `VisualizationView` (T8), `rewriteImage`, `navigate`.
- Produces:
  - `CitedPart = { kind: 'text'; text } | { kind: 'cite'; n; citation: AgentCitation }`, `renderCitations(text, citations): CitedPart[]` (un `[n]` sin cita conocida desaparece)
  - `AgentMessage { id; role: 'user' | 'assistant'; mode; text; fragment: string | null; citations; visuals: Visualization[]; media: MediaItem[]; steps: string[]; done: boolean; error: string | null }`
  - `applyAgentEvent(m: AgentMessage, e: AgentEvent): AgentMessage`
  - `agentStore`, `useAgent(tabId) → { messages, busy, send(question, mode, fragment), stop() }`
  - `useVizLabels(): { labels: VizLabels; format(n): string; regionName(code): string }`
  - `useParties(): PartyInfo[]` (lee `config/parties-<content.locale>.json` con `configRead`)

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/analysis/agent/citations.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyAgentEvent, renderCitations, type AgentMessage } from './citations';

const cite = { n: 1, sourceId: 'S1', title: 'Eurostat', url: 'https://ec.europa.eu/x' };

describe('renderCitations', () => {
  it('maps known markers to sources and drops unknown ones', () => {
    const parts = renderCitations('España es sexta [1]. Otro dato [7]. Lista [a].', [cite]);
    expect(parts).toEqual([
      { kind: 'text', text: 'España es sexta ' },
      { kind: 'cite', n: 1, citation: cite },
      { kind: 'text', text: '. Otro dato. Lista [a].' },
    ]);
  });
});

describe('applyAgentEvent', () => {
  const empty: AgentMessage = { id: 'm', role: 'assistant', mode: 'verify', text: '', fragment: null, citations: [], visuals: [], media: [], steps: [], done: false, error: null };
  it('streams text, collects tools, visuals and media, and the final text replaces the stream', () => {
    let m = applyAgentEvent(empty, { type: 'text', delta: 'Hola [1] [9]' });
    m = applyAgentEvent(m, { type: 'step', tool: 'renderVisualization' });
    m = applyAgentEvent(m, { type: 'visualization', viz: { type: 'bar', title: 'B', sourceIds: ['S1'], data: { points: [{ x: 'a', y: 1 }] } } });
    m = applyAgentEvent(m, { type: 'media', media: { kind: 'image', url: 'https://ec.europa.eu/c.png', sourceId: 'S1', caption: 'c' } });
    m = applyAgentEvent(m, { type: 'done', text: 'Hola [1]', citations: [cite] });
    expect(m).toMatchObject({ text: 'Hola [1]', done: true, steps: ['renderVisualization'], citations: [cite] });
    expect(m.visuals).toHaveLength(1);
    expect(m.media).toHaveLength(1);
    expect(applyAgentEvent(m, { type: 'error', message: 'x' }).error).toBe('x');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/analysis/agent/citations.test.ts`
Expected: FAIL (`Cannot find module './citations'`).

- [ ] **Step 3: Citas y eventos**

`apps/ui/src/features/analysis/agent/citations.ts`:
```ts
import type { AgentCitation, AgentEvent, AgentMode, MediaItem, Visualization } from '@newpaper/pipeline';

export type CitedPart = { kind: 'text'; text: string } | { kind: 'cite'; n: number; citation: AgentCitation };

export function renderCitations(text: string, citations: AgentCitation[]): CitedPart[] {
  const byN = new Map(citations.map((c) => [c.n, c]));
  const parts: CitedPart[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = parts.at(-1);
    if (last?.kind === 'text') last.text += t;
    else parts.push({ kind: 'text', text: t });
  };
  let i = 0;
  for (const m of text.matchAll(/\s*\[(\d+)\]/g)) {
    const at = m.index!;
    const c = byN.get(Number(m[1]));
    pushText(text.slice(i, at));
    if (c) {
      pushText(m[0].slice(0, m[0].indexOf('[')));
      parts.push({ kind: 'cite', n: c.n, citation: c });
    }
    i = at + m[0].length;
  }
  pushText(text.slice(i));
  return parts;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  mode: AgentMode;
  text: string;
  fragment: string | null;
  citations: AgentCitation[];
  visuals: Visualization[];
  media: MediaItem[];
  steps: string[];
  done: boolean;
  error: string | null;
}

export function applyAgentEvent(m: AgentMessage, e: AgentEvent): AgentMessage {
  switch (e.type) {
    case 'text':
      return { ...m, text: m.text + e.delta };
    case 'step':
      return { ...m, steps: [...m.steps, e.tool] };
    case 'visualization':
      return { ...m, visuals: [...m.visuals, e.viz] };
    case 'media':
      return { ...m, media: [...m.media, e.media] };
    case 'done':
      return { ...m, text: e.text, citations: e.citations, done: true };
    case 'error':
      return { ...m, error: e.message, done: true };
  }
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/analysis/agent/citations.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Estado del agente, etiquetas de gráficos y partidos**

`apps/ui/src/features/analysis/agent/useAgent.ts`:
```ts
import type { AgentMode } from '@newpaper/pipeline';
import type { TabId } from '../../../ipc/types';
import { createStore } from '../../../state/store';
import { getPipeline } from '../../ai/pipeline';
import { analysisStore, latestResult } from '../controller';
import { applyAgentEvent, type AgentMessage } from './citations';

interface Thread { url: string; messages: AgentMessage[]; busy: boolean }
export const agentStore = createStore<{ byTab: Record<number, Thread> }>({ byTab: {} });
const runs = new Map<TabId, AbortController>();
let seq = 0;

function update(tabId: TabId, f: (t: Thread) => Thread) {
  agentStore.set((s) => {
    const cur = s.byTab[tabId];
    return cur ? { byTab: { ...s.byTab, [tabId]: f(cur) } } : s;
  });
}

export async function sendToAgent(tabId: TabId, question: string, mode: AgentMode, fragment: string | null): Promise<void> {
  const a = analysisStore.get().byTab[tabId];
  if (!a) return;
  const prev = agentStore.get().byTab[tabId];
  const thread: Thread = prev && prev.url === a.url ? prev : { url: a.url, messages: [], busy: false };
  const user: AgentMessage = { id: `u${++seq}`, role: 'user', mode, text: question, fragment, citations: [], visuals: [], media: [], steps: [], done: true, error: null };
  const reply: AgentMessage = { id: `a${++seq}`, role: 'assistant', mode, text: '', fragment: null, citations: [], visuals: [], media: [], steps: [], done: false, error: null };
  agentStore.set((s) => ({ byTab: { ...s.byTab, [tabId]: { ...thread, busy: true, messages: [...thread.messages, user, reply] } } }));
  runs.get(tabId)?.abort();
  const ac = new AbortController();
  runs.set(tabId, ac);
  const patchReply = (f: (m: AgentMessage) => AgentMessage) => update(tabId, (t) => ({ ...t, messages: t.messages.map((m) => (m.id === reply.id ? f(m) : m)) }));
  try {
    const p = await getPipeline();
    await p.askAgent({
      article: a.article,
      previous: latestResult(a),
      mode,
      question,
      fragment: fragment ?? undefined,
      history: thread.messages.filter((m) => m.done && !m.error).map((m) => ({ role: m.role, content: m.text })),
      onEvent: (e) => patchReply((m) => applyAgentEvent(m, e)),
      signal: ac.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    patchReply((m) => (m.done ? m : { ...m, done: true, error: msg }));
  } finally {
    if (runs.get(tabId) === ac) runs.delete(tabId);
    update(tabId, (t) => ({ ...t, busy: false }));
  }
}

export function stopAgent(tabId: TabId): void {
  runs.get(tabId)?.abort();
}

export function useAgent(tabId: TabId) {
  const thread = agentStore.use((s) => s.byTab[tabId]);
  const url = analysisStore.use((s) => s.byTab[tabId]?.url);
  const current = thread && thread.url === url ? thread : undefined;
  return {
    messages: current?.messages ?? [],
    busy: current?.busy ?? false,
    send: (q: string, mode: AgentMode, fragment: string | null) => sendToAgent(tabId, q, mode, fragment),
    stop: () => stopAgent(tabId),
  };
}
```

`apps/ui/src/features/analysis/vizLabels.ts`:
```ts
import { useI18n } from '@newpaper/i18n/react';
import type { VizLabels } from '@newpaper/ui-kit';
import { useMemo } from 'react';

export function useVizLabels() {
  const { t, formatNumber, locale } = useI18n();
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    const labels: VizLabels = {
      sources: t('charts.sources'),
      showTable: t('charts.showTable'),
      showChart: t('charts.showChart'),
      label: t('charts.label'),
      value: t('charts.value'),
      region: t('charts.region'),
      matrix: (c) => t(`charts.matrix.${c}`),
      parliament: {
        chart: t('charts.parliament.chart'),
        majority: (n) => t('charts.parliament.majority', { n }),
        seatsFor: (n) => t('charts.parliament.seatsFor', { n }),
        reached: t('charts.parliament.reached'),
        short: (n) => t('charts.parliament.short', { n }),
        hint: t('charts.parliament.hint'),
        party: t('charts.parliament.party'),
        seats: t('charts.parliament.seats'),
        vote: t('charts.parliament.vote'),
        yes: t('charts.parliament.yes'),
        no: t('charts.parliament.no'),
        reset: t('charts.parliament.reset'),
      },
    };
    const regionName = (code: string) => (/^[A-Z]{2}$/i.test(code) ? (names.of(code.toUpperCase()) ?? code) : code);
    return { labels, format: (n: number) => formatNumber(n), regionName };
  }, [t, formatNumber, locale]);
}
```

`apps/ui/src/features/analysis/parties.ts`:
```ts
import type { PartyInfo } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';

const cache = new Map<string, Promise<PartyInfo[]>>();

export function loadParties(locale: string): Promise<PartyInfo[]> {
  let p = cache.get(locale);
  if (!p) {
    p = commands
      .configRead(`parties-${locale}.json`)
      .then((txt) => (JSON.parse(txt) as { parties: PartyInfo[] }).parties)
      .catch(() => []);
    cache.set(locale, p);
  }
  return p;
}

export function useParties(): PartyInfo[] {
  const [parties, setParties] = useState<PartyInfo[]>([]);
  useEffect(() => {
    let alive = true;
    void commands.settingsGet<string>('content.locale').then((l) => loadParties(l ?? 'es')).then((p) => alive && setParties(p));
    return () => {
      alive = false;
    };
  }, []);
  return parties;
}
```

- [ ] **Step 6: Pestaña del agente**

`apps/ui/src/features/analysis/agent/AgentTab.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import type { AgentMode, MediaItem } from '@newpaper/pipeline';
import { Button, IconButton, SegmentedControl, VisualizationView } from '@newpaper/ui-kit';
import { useEffect, useState, type FormEvent } from 'react';
import type { TabInfo } from '../../../ipc/types';
import { navigate } from '../../../shell/navigate';
import { rewriteImage } from '../../../shell/ReaderSurface';
import { latestResult, useTabAnalysis } from '../controller';
import { panelStore, usePanel } from '../panelStore';
import { useParties } from '../parties';
import { useVizLabels } from '../vizLabels';
import { renderCitations, type AgentMessage } from './citations';
import { useAgent } from './useAgent';

const openSource = (url: string) => void navigate(url, { newTab: true });

function Media({ m, label }: { m: MediaItem; label: string }) {
  return (
    <figure className="np-agent-media">
      {m.kind === 'image' ? (
        <img src={rewriteImage(m.url)} alt={m.caption} loading="lazy" />
      ) : (
        <button type="button" className="np-agent-video" onClick={() => openSource(m.url)}>
          {label}
        </button>
      )}
      <figcaption>{m.caption}</figcaption>
    </figure>
  );
}

function Reply({ m, sources }: { m: AgentMessage; sources: { id: string; title: string; url: string }[] }) {
  const { t } = useI18n();
  const viz = useVizLabels();
  const parties = useParties();
  const parts = m.done ? renderCitations(m.text, m.citations) : [{ kind: 'text' as const, text: m.text }];
  const noModel = m.error?.includes('no model assigned');
  return (
    <div className="np-agent-msg np-agent-msg--assistant" aria-busy={!m.done}>
      {m.steps.length ? <p className="np-agent-steps">{m.steps.map((s) => t(`agent.tools.${s}`)).join(' · ')}</p> : null}
      <p>
        {parts.map((p, i) =>
          p.kind === 'text' ? (
            <span key={i}>{p.text}</span>
          ) : (
            <button key={i} type="button" className="np-cite" title={p.citation.title} onClick={() => openSource(p.citation.url)}>
              {p.n}
            </button>
          ),
        )}
      </p>
      {m.visuals.map((v, i) => (
        <VisualizationView key={i} viz={v} sources={sources} parties={parties} labels={viz.labels} format={viz.format} regionName={viz.regionName} onOpenSource={openSource} />
      ))}
      {m.media.map((x) => (
        <Media key={x.url} m={x} label={t('agent.openVideo')} />
      ))}
      {m.media.length ? <p className="np-agent-note">{t('agent.mediaNote')}</p> : null}
      {m.error ? <p className="np-agent-error" role="alert">{noModel ? t('agent.noModel') : t('agent.error', { message: m.error })}</p> : null}
    </div>
  );
}

export function AgentTab({ tab }: { tab: TabInfo }) {
  const { t } = useI18n();
  const a = useTabAnalysis(tab.id);
  const result = latestResult(a);
  const { messages, busy, send, stop } = useAgent(tab.id);
  const seed = usePanel((s) => s.agentSeed);
  const wide = usePanel((s) => s.wide);
  const [mode, setMode] = useState<AgentMode>('ask');
  const [fragment, setFragment] = useState<string | null>(null);
  const [question, setQuestion] = useState('');

  useEffect(() => {
    if (!seed) return;
    setMode(seed.mode);
    setFragment(seed.fragment);
    if (seed.question) void send(seed.question, seed.mode, seed.fragment);
    else if (seed.fragment && seed.mode !== 'ask') void send(t(`agent.auto.${seed.mode}`), seed.mode, seed.fragment);
    panelStore.set({ agentSeed: null });
  }, [seed, send, t]);

  if (!a) return <p className="np-panel-empty">{t('agent.needsArticle')}</p>;
  const sources = (result?.sources ?? []).map((s) => ({ id: s.id, title: s.title, url: s.url }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    void send(q, mode, fragment);
    setQuestion('');
    setFragment(null);
  };

  return (
    <section className="np-agent" aria-label={t('agent.title')}>
      <header className="np-agent-head">
        <p className="np-agent-context">{t('agent.context', { coverages: result?.coverage?.coverages.length ?? 0, sources: sources.length })}</p>
        <IconButton label={wide ? t('agent.narrow') : t('agent.wide')} pressed={wide} icon={<span aria-hidden="true">⇔</span>} onClick={() => panelStore.set({ wide: !wide })} />
      </header>
      <div className="np-agent-log" role="log" aria-live="polite">
        {messages.length === 0 ? <p className="np-panel-empty">{t('agent.empty')}</p> : null}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="np-agent-msg np-agent-msg--user">
              {m.fragment ? <blockquote>{m.fragment}</blockquote> : null}
              <p>{m.text}</p>
            </div>
          ) : (
            <Reply key={m.id} m={m} sources={sources} />
          ),
        )}
      </div>
      <form className="np-agent-composer" onSubmit={submit}>
        <SegmentedControl
          label={t('agent.mode.label')}
          value={mode}
          onChange={setMode}
          options={(['ask', 'verify', 'explain'] as const).map((v) => ({ value: v, label: t(`agent.mode.${v}`) }))}
        />
        {fragment ? (
          <p className="np-agent-fragment">
            <span>{fragment}</span>
            <button type="button" aria-label={t('agent.clearFragment')} onClick={() => setFragment(null)}>×</button>
          </p>
        ) : null}
        <label className="np-sr-only" htmlFor="np-agent-q">{t('agent.placeholder')}</label>
        <textarea id="np-agent-q" rows={2} value={question} placeholder={t('agent.placeholder')} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit(e)} />
        {busy ? (
          <Button onClick={stop}>{t('agent.stop')}</Button>
        ) : (
          <Button type="submit" variant="primary" disabled={!question.trim()}>
            {t('agent.send')}
          </Button>
        )}
      </form>
    </section>
  );
}
```

Añade a `apps/ui/src/features/analysis/analysis.css`:
```css
.np-agent { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.np-agent-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font: 12px var(--np-font-ui); color: var(--np-muted); }
.np-agent-context { flex: 1; margin: 0; }
.np-agent-log { flex: 1; overflow: auto; padding: 8px 12px; display: grid; gap: 12px; align-content: start; }
.np-agent-msg { font: 14px/1.55 var(--np-font-ui); }
.np-agent-msg--user { justify-self: end; max-width: 85%; padding: 8px 12px; border-radius: 12px; background: var(--np-accent-soft); }
.np-agent-msg--user blockquote { margin: 0 0 4px; font: italic 13px var(--np-font-read); color: var(--np-ink2); }
.np-agent-steps { font: 11px var(--np-font-mono); color: var(--np-muted); margin: 0 0 4px; }
.np-cite { min-width: 20px; height: 20px; margin: 0 2px; padding: 0 5px; border: 0; border-radius: 10px; background: var(--np-accent-soft); color: var(--np-accent); font: 600 11px var(--np-font-mono); cursor: pointer; vertical-align: 1px; }
.np-agent-media { margin: 8px 0; }
.np-agent-media img { max-width: 100%; border-radius: var(--np-radius); }
.np-agent-media figcaption, .np-agent-note { font: 11px var(--np-font-ui); color: var(--np-muted); }
.np-agent-error { color: var(--np-bad); font: 13px var(--np-font-ui); }
.np-agent-composer { display: grid; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--np-line); }
.np-agent-composer textarea { resize: vertical; min-height: 44px; padding: 8px; border: 1px solid var(--np-line3); border-radius: 10px; font: 14px var(--np-font-ui); background: var(--np-card); color: var(--np-ink); }
.np-agent-fragment { display: flex; gap: 6px; margin: 0; padding: 6px 8px; border-left: 3px solid var(--np-accent); background: var(--np-soft); font: italic 13px var(--np-font-read); }
.np-agent-fragment span { flex: 1; }
.np-agent-fragment button { min-width: 32px; border: 0; background: none; cursor: pointer; }
.np-panel-empty { color: var(--np-muted); font: 13px var(--np-font-ui); padding: 12px; }
```

> En modo "Verificar" o "Explicar" con fragmento, la pregunta se manda sola con un texto fijo (`agent.auto.verify` / `agent.auto.explain`); en "Preguntar" se espera a que el usuario escriba.

- [ ] **Step 7: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```powershell
git add apps/ui/src/features/analysis
git commit -m "feat(ui): agent tab with mapped citations, inline charts, hemicycle and source media"
```

---
### Task 10: Hecho sin cobertura — aviso, confirmación obligatoria en cada uso e informe no verificado

**Files:**
- Create: `apps/ui/src/features/analysis/nocoverage/ConsentDialog.tsx`, `apps/ui/src/features/analysis/nocoverage/UnverifiedCard.tsx`, `apps/ui/src/features/analysis/nocoverage/NoCoverageBlock.tsx`
- Test: `apps/ui/src/features/analysis/nocoverage/ConsentDialog.test.tsx`

**Interfaces:**
- Consumes: `getPipeline` (`investigateUncovered` exige `acknowledged: true`), `commands.watchAdd`, `TabAnalysis` (T5).
- Produces:
  - `ConsentDialog({ open, onConfirm(ack: true), onCancel })` — casilla obligatoria; se desmarca cada vez que se abre; no hay "no volver a preguntar"
  - `UnverifiedCard({ report: UnverifiedReport })`
  - `NoCoverageBlock({ analysis: TabAnalysis })` — se muestra si `result.uncovered`; botones "Investigar de todos modos" y "Avisarme cuando haya cobertura"

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/analysis/nocoverage/ConsentDialog.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../../../test/renderWithI18n';
import { ConsentDialog } from './ConsentDialog';

describe('ConsentDialog (§6.4)', () => {
  it('requires ticking the box every single time', async () => {
    const onConfirm = vi.fn();
    const { rerender } = renderWithI18n(<ConsentDialog open onConfirm={onConfirm} onCancel={() => {}} />);
    const confirm = screen.getByRole('button', { name: 'Investigar sin verificar' });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('checkbox', { name: /no volver a preguntar/i })).toBeNull();

    rerender(<ConsentDialog open={false} onConfirm={onConfirm} onCancel={() => {}} />);
    rerender(<ConsentDialog open onConfirm={onConfirm} onCancel={() => {}} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Investigar sin verificar' })).toBeDisabled();
  });
});
```

> `renderWithI18n` devuelve el resultado de `render`; si en tu versión no reenvía `rerender` con el proveedor, envuelve el segundo render en `<I18nProvider initialLocale="es">`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/analysis/nocoverage/ConsentDialog.test.tsx`
Expected: FAIL (`Cannot find module './ConsentDialog'`).

- [ ] **Step 3: Diálogo**

`apps/ui/src/features/analysis/nocoverage/ConsentDialog.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useId, useRef, useState } from 'react';

export function ConsentDialog({ open, onConfirm, onCancel }: { open: boolean; onConfirm(ack: true): void; onCancel(): void }) {
  const t = useT();
  const [checked, setChecked] = useState(false);
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setChecked(false);
      box.current?.focus();
    }
  }, [open]);
  if (!open) return null;
  return (
    <div className="np-consent-backdrop">
      <div className="np-consent np-rise" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
        <h2 id={`${id}-t`}>{t('noCoverage.consent.title')}</h2>
        <p>{t('noCoverage.consent.body')}</p>
        <label className="np-consent-check">
          <input ref={box} type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{t('noCoverage.consent.checkbox')}</span>
        </label>
        <div className="np-consent-actions">
          <Button onClick={onCancel}>{t('noCoverage.consent.cancel')}</Button>
          <Button variant="primary" disabled={!checked} onClick={() => checked && onConfirm(true)}>
            {t('noCoverage.consent.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/analysis/nocoverage/ConsentDialog.test.tsx`
Expected: PASS — 1 test (requiere los textos `noCoverage.consent.*` de la Tarea 2).

- [ ] **Step 5: Informe y bloque**

`apps/ui/src/features/analysis/nocoverage/UnverifiedCard.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { navigate } from '../../../shell/navigate';

export function UnverifiedCard({ report }: { report: UnverifiedReport }) {
  const { t, formatNumber } = useI18n();
  return (
    <section className="np-unverified" aria-label={t('noCoverage.report.title')}>
      <header>
        <span className="np-tag np-tag--warn">{t('noCoverage.report.badge')}</span>
        <span className="np-mono">{t('noCoverage.report.confidence', { value: formatNumber(report.confidence, { maximumFractionDigits: 2 }) })}</span>
      </header>
      <ul className="np-unverified-claims">
        {report.claims.map((c, i) => (
          <li key={i}>
            <span className="np-tag np-tag--muted">{t(`noCoverage.tags.${c.tag}`)}</span>
            <p>{c.text}</p>
            <p className="np-muted">{c.note}</p>
          </li>
        ))}
      </ul>
      <h3>{t('noCoverage.report.howToCheck')}</h3>
      <ol>
        {report.howToCheck.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ol>
      {report.sources.length ? (
        <p className="np-unverified-sources">
          {report.sources.map((s, i) => (
            <button key={s.id} type="button" className="np-link" onClick={() => void navigate(s.url, { newTab: true })}>
              [{i + 1}] {s.title}
            </button>
          ))}
        </p>
      ) : null}
    </section>
  );
}
```

`apps/ui/src/features/analysis/nocoverage/NoCoverageBlock.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { Button } from '@newpaper/ui-kit';
import { useState } from 'react';
import { commands } from '../../../ipc/commands';
import { getPipeline } from '../../ai/pipeline';
import { latestResult, type TabAnalysis } from '../controller';
import { ConsentDialog } from './ConsentDialog';
import { UnverifiedCard } from './UnverifiedCard';

export function NoCoverageBlock({ analysis }: { analysis: TabAnalysis }) {
  const t = useT();
  const result = latestResult(analysis);
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState<{ busy: boolean; report: UnverifiedReport | null; error: string | null; watching: boolean }>({ busy: false, report: null, error: null, watching: false });
  if (!result?.uncovered) return null;

  const investigate = async (acknowledged: true) => {
    setAsking(false);
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const p = await getPipeline();
      const report = await p.investigateUncovered({ article: analysis.article, previous: result, acknowledged });
      setState((s) => ({ ...s, busy: false, report }));
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : String(e) }));
    }
  };
  const watch = async () => {
    await commands.watchAdd({ articleUrl: analysis.url });
    setState((s) => ({ ...s, watching: true }));
  };

  return (
    <section className="np-nocov" aria-label={t('noCoverage.title')}>
      <h3>{t('noCoverage.title')}</h3>
      <p>{t('noCoverage.body', { outlets: result.coverage?.outletCount ?? 0 })}</p>
      <div className="np-nocov-actions">
        <Button variant="primary" disabled={state.busy} onClick={() => setAsking(true)}>
          {state.busy ? t('noCoverage.investigating') : t('noCoverage.investigate')}
        </Button>
        <Button disabled={state.watching} onClick={() => void watch()}>
          {state.watching ? t('noCoverage.watching') : t('noCoverage.watch')}
        </Button>
      </div>
      {state.error ? <p role="alert" className="np-agent-error">{state.error}</p> : null}
      {state.report ? <UnverifiedCard report={state.report} /> : null}
      <ConsentDialog open={asking} onConfirm={(ack) => void investigate(ack)} onCancel={() => setAsking(false)} />
    </section>
  );
}
```

Añade a `apps/ui/src/features/analysis/analysis.css`:
```css
.np-consent-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgb(23 23 26 / .35); }
.np-consent { width: min(440px, 92vw); padding: 20px; border-radius: 14px; background: var(--np-card); box-shadow: 0 20px 60px rgb(0 0 0 / .25); font: 14px/1.5 var(--np-font-ui); }
.np-consent h2 { font: 600 18px var(--np-font-ui); margin: 0 0 8px; }
.np-consent-check { display: flex; gap: 10px; align-items: flex-start; min-height: var(--np-hit); margin: 12px 0; }
.np-consent-check input { width: 20px; height: 20px; margin-top: 2px; }
.np-consent-actions, .np-nocov-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.np-nocov { margin: 12px 0; padding: 12px; border: 1px dashed var(--np-warn); border-radius: var(--np-radius); background: var(--np-warn-bg); }
.np-unverified { margin-top: 12px; padding: 12px; border-radius: var(--np-radius); background: var(--np-card); }
.np-unverified header { display: flex; justify-content: space-between; align-items: center; }
.np-unverified-claims { list-style: none; padding: 0; display: grid; gap: 8px; }
.np-muted { color: var(--np-muted); }
.np-link { border: 0; background: none; padding: 0; color: var(--np-accent); font: inherit; cursor: pointer; text-align: left; }
```

- [ ] **Step 6: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```powershell
git add apps/ui/src/features/analysis/nocoverage apps/ui/src/features/analysis/analysis.css
git commit -m "feat(ui): uncovered-event flow with per-use mandatory consent and unverified report"
```

---

### Task 11: Pestaña Coberturas — el mismo hecho contado por otros medios

**Files:**
- Create: `apps/ui/src/features/analysis/CoverageTab.tsx`

**Interfaces:**
- Consumes: `commands.coverageFor`, `commands.watchAdd`, `TabAnalysis` (T5), `openInternal`, `navigate`.
- Produces: `CoverageTab({ tab })` — usa `result.coverage` si hay análisis completo; si no, pide `coverage_for` una vez por URL. Agrupa por `bucket` (izquierda, centro, derecha, sin medir), avisa de `searchSkipped` y ofrece vigilar el hecho si no hay bastantes coberturas.

- [ ] **Step 1: Implementación**

`apps/ui/src/features/analysis/CoverageTab.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { Bucket, Coverage, CoverageResult, TabInfo } from '../../ipc/types';
import { navigate, openInternal } from '../../shell/navigate';
import { latestResult, useTabAnalysis } from './controller';

const BUCKETS: Bucket[] = ['left', 'center', 'right', 'unknown'];

export function CoverageTab({ tab }: { tab: TabInfo }) {
  const { t, formatNumber } = useI18n();
  const a = useTabAnalysis(tab.id);
  const fromAnalysis = latestResult(a)?.coverage as CoverageResult | null | undefined;
  const [fetched, setFetched] = useState<{ url: string; data: CoverageResult | null; error: boolean } | null>(null);
  const [watching, setWatching] = useState(false);
  const url = a?.url ?? tab.url.split('#')[0]!;

  useEffect(() => {
    if (fromAnalysis || !a || fetched?.url === url) return;
    let alive = true;
    commands
      .coverageFor(url, a.article.title, a.article.text.slice(0, 600))
      .then((data) => alive && setFetched({ url, data, error: false }))
      .catch(() => alive && setFetched({ url, data: null, error: true }));
    return () => {
      alive = false;
    };
  }, [a, url, fromAnalysis, fetched?.url]);

  const data = fromAnalysis ?? (fetched?.url === url ? fetched.data : null);
  if (!a) return <p className="np-panel-empty">{t('coverage.needsArticle')}</p>;
  if (!data) return <p className="np-panel-empty" aria-busy={!fetched?.error}>{fetched?.error ? t('coverage.error') : t('coverage.loading')}</p>;

  const groups = BUCKETS.map((b) => ({ b, items: data.coverages.filter((c) => c.bucket === b) })).filter((g) => g.items.length);
  const lean = (c: Coverage) =>
    c.lean === null ? t('coverage.leanUnknown') : c.leanUncertainty ? `${formatNumber(Math.round(c.lean))} ± ${formatNumber(Math.round(c.leanUncertainty))}` : formatNumber(Math.round(c.lean));

  return (
    <section className="np-coverage" aria-label={t('coverage.title')}>
      <p className="np-coverage-summary">{t('coverage.summary', { outlets: data.outletCount })}</p>
      {data.searchSkipped === 'no_key' ? <p className="np-hint">{t('coverage.noSearchKey')}</p> : null}
      {data.searchSkipped === 'network' ? <p className="np-hint">{t('coverage.searchFailed')}</p> : null}
      {groups.map((g) => (
        <div key={g.b} className={`np-coverage-group np-coverage-group--${g.b}`}>
          <h3>{t(`coverage.bucket.${g.b}`)}</h3>
          <ul>
            {g.items.map((c) => (
              <li key={c.url}>
                <button type="button" className="np-link" onClick={() => void navigate(c.url, { newTab: true })}>
                  <span className="np-coverage-outlet">{c.outlet}</span>
                  <span className="np-coverage-title">{c.title}</span>
                </button>
                <span className="np-mono" title={t('coverage.leanTitle')}>{lean(c)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="np-coverage-actions">
        {!data.enough ? (
          <Button
            disabled={watching}
            onClick={() => void commands.watchAdd({ articleUrl: url, eventId: data.eventId ?? undefined }).then(() => setWatching(true))}
          >
            {watching ? t('noCoverage.watching') : t('noCoverage.watch')}
          </Button>
        ) : null}
        <Button variant="quiet" onClick={() => void openInternal('ajustes', ['fuentes'])}>
          {t('coverage.howMeasured')}
        </Button>
      </div>
    </section>
  );
}
```

Añade a `apps/ui/src/features/analysis/analysis.css`:
```css
.np-coverage { padding: 12px; display: grid; gap: 12px; font: 13px var(--np-font-ui); }
.np-coverage-group h3 { font: 600 12px var(--np-font-mono); text-transform: uppercase; letter-spacing: .06em; margin: 0 0 6px; }
.np-coverage-group--left h3 { color: var(--np-left); }
.np-coverage-group--center h3 { color: var(--np-center); }
.np-coverage-group--right h3 { color: var(--np-right); }
.np-coverage-group ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.np-coverage-group li { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: start; min-height: var(--np-hit); }
.np-coverage-outlet { display: block; font: 600 12px var(--np-font-ui); color: var(--np-ink); }
.np-coverage-title { display: block; font: 14px/1.35 var(--np-font-read); color: var(--np-ink2); }
.np-hint { font: 12px var(--np-font-ui); color: var(--np-muted); background: var(--np-soft); padding: 8px; border-radius: 8px; }
.np-coverage-actions { display: flex; gap: 8px; flex-wrap: wrap; }
```

> `Bucket` y `Coverage` del subproyecto 3 son superconjuntos de los del pipeline: el `cast` a `CoverageResult` solo añade campos opcionales (`leanUncertainty`, `publishedAt`).

- [ ] **Step 2: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```powershell
git add apps/ui/src/features/analysis
git commit -m "feat(ui): coverage tab grouped by measured outlet lean with watch and search notices"
```

---

### Task 12: "¿Por qué esta posición?" — señales con evidencia, confianza, concordancia y prueba de espejo

**Files:**
- Create: `apps/ui/src/features/analysis/PositionDetail.tsx`, `apps/ui/src/features/analysis/axisLabels.ts`

**Interfaces:**
- Consumes: `Score`, `Signal` (4), `mirrorCheck`, `mirrorText` (4), `FramingAxis`, `ConfidenceMeter` (T3), `getPipeline`, `commands.configRead`, `panelStore`.
- Produces: `useAxisLabels(): FramingAxisLabels`; `PositionDetail({ tab })` — subvista de la pestaña Análisis (`panelStore.detail === 'position'`).

- [ ] **Step 1: Implementación**

`apps/ui/src/features/analysis/axisLabels.ts`:
```ts
import { useI18n } from '@newpaper/i18n/react';
import type { FramingAxisLabels } from '@newpaper/ui-kit';
import { useMemo } from 'react';

export function useAxisLabels(): FramingAxisLabels {
  const { t } = useI18n();
  return useMemo(
    () => ({
      axis: t('analysis.axis.label'),
      left: t('analysis.axis.left'),
      center: t('analysis.axis.center'),
      right: t('analysis.axis.right'),
      article: t('analysis.axis.article'),
      band: t('analysis.axis.band'),
      groupCenter: t('analysis.axis.groupCenter'),
      notDeterminable: t('analysis.verdictText.no_determinable'),
    }),
    [t],
  );
}
```

`apps/ui/src/features/analysis/PositionDetail.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { mirrorCheck, type Signal } from '@newpaper/pipeline';
import { Button, ConfidenceMeter, FramingAxis } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { getPipeline } from '../ai/pipeline';
import { latestResult, useTabAnalysis } from './controller';
import { panelStore } from './panelStore';
import { useAxisLabels } from './axisLabels';

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await commands.configRead(name)) as T;
  } catch {
    return null;
  }
}

function SignalRow({ s }: { s: Signal }) {
  const { t, formatNumber } = useI18n();
  const pct = ((s.value + 1) / 2) * 100;
  return (
    <li className="np-signal">
      <div className="np-signal-head">
        <span>{t(`position.signal.${s.kind}`)}</span>
        <span className="np-mono">{formatNumber(s.value, { signDisplay: 'always', maximumFractionDigits: 2 })}</span>
      </div>
      <div className="np-signal-bar" aria-hidden="true">
        <span style={{ left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%` }} />
      </div>
      <ul className="np-signal-evidence">
        {s.evidence.slice(0, 4).map((e, i) => (
          <li key={i}>«{e}»</li>
        ))}
      </ul>
    </li>
  );
}

export function PositionDetail({ tab }: { tab: TabInfo }) {
  const { t, formatNumber } = useI18n();
  const axis = useAxisLabels();
  const a = useTabAnalysis(tab.id);
  const result = latestResult(a);
  const score = result?.score ?? null;
  const [threshold, setThreshold] = useState(0.35);
  const [swaps, setSwaps] = useState<[string, string][] | null>(null);
  const [mirror, setMirror] = useState<{ busy: boolean; a: number | null; b: number | null; symmetric: boolean | null }>({ busy: false, a: null, b: null, symmetric: null });

  useEffect(() => {
    void readJson<{ minConfidence?: number }>('framing-weights.json').then((w) => w?.minConfidence !== undefined && setThreshold(w.minConfidence));
    void commands
      .settingsGet<string>('content.locale')
      .then((l) => readJson<{ pairs: [string, string][] }>(`mirror-swaps-${l ?? 'es'}.json`))
      .then((m) => setSwaps(m?.pairs ?? null));
  }, []);

  if (!a || !score) return <p className="np-panel-empty">{t('position.none')}</p>;
  const known = (result?.coverage?.coverages ?? []).map((c) => c.lean).filter((l): l is number => l !== null);
  const groupCenter = known.length ? known.reduce((x, y) => x + y, 0) / known.length : 50;

  const runMirror = async () => {
    if (!swaps) return;
    setMirror({ busy: true, a: null, b: null, symmetric: null });
    const p = await getPipeline();
    const scorer = async (text: string) => (await p.runQuickAnalysis({ ...a.article, text })).score?.framing ?? null;
    const r = await mirrorCheck(scorer, a.article.text, swaps);
    setMirror({ busy: false, ...r });
  };

  return (
    <section className="np-position" aria-label={t('position.title')}>
      <Button variant="quiet" onClick={() => panelStore.set({ detail: 'none' })}>
        {t('position.back')}
      </Button>
      <h2>{t('position.title')}</h2>
      <p className="np-muted">{t('position.intro')}</p>
      <p className="np-tag np-tag--accent">{t('position.blind')}</p>
      <FramingAxis framing={score.framing} interval={score.interval} groupCenter={groupCenter} others={[]} labels={axis} />
      <p className="np-muted">{t('position.relative')}</p>

      <h3>{t('position.signals')}</h3>
      <p className="np-muted">{t('position.signalsHint')}</p>
      <ul className="np-signals">
        {score.signals.map((s, i) => (
          <SignalRow key={`${s.kind}-${i}`} s={s} />
        ))}
      </ul>
      {score.voices.actors.length ? (
        <>
          <h3>{t('position.voices')}</h3>
          <ul className="np-voices">
            {score.voices.actors.map((v) => (
              <li key={v.name}>{t('position.voice', { name: v.name, quotes: v.quotes })}</li>
            ))}
          </ul>
          {score.voices.lastWord ? <p className="np-muted">{t('position.lastWord', { name: score.voices.lastWord })}</p> : null}
        </>
      ) : null}
      {score.omissions.length ? (
        <>
          <h3>{t('position.omissions')}</h3>
          <ul>
            {score.omissions.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </>
      ) : null}

      <h3>{t('position.lexicon')}</h3>
      <p className="np-muted">{t('position.lexiconBody')}</p>

      <ConfidenceMeter value={score.confidence} threshold={threshold} label={t('position.confidence')} thresholdLabel={t('position.threshold', { value: formatNumber(threshold) })} />
      <p className="np-muted">{t('position.confidenceNote')}</p>

      <h3>{t('position.controls')}</h3>
      {score.judges?.length === 2 ? (
        <div className="np-control">
          <strong>{score.crossModelDisagreement ? t('position.judgesDisagree') : t('position.judgesAgree')}</strong>
          <ul>
            {score.judges.map((j) => (
              <li key={j.model}>
                {j.model}: <span className="np-mono">{j.framing === null ? '–' : formatNumber(j.framing)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="np-muted">{t('position.judgesOff')}</p>
      )}
      {swaps ? (
        <div className="np-control">
          <strong>{t('position.mirror')}</strong>
          <p className="np-muted">{t('position.mirrorBody')}</p>
          <Button disabled={mirror.busy} onClick={() => void runMirror()}>
            {mirror.busy ? t('position.mirrorRunning') : t('position.mirrorRun')}
          </Button>
          {mirror.symmetric !== null ? (
            <p role="status">
              {t('position.mirrorResult', { a: mirror.a === null ? '–' : formatNumber(mirror.a), b: mirror.b === null ? '–' : formatNumber(mirror.b) })}{' '}
              <strong>{mirror.symmetric ? t('position.mirrorOk') : t('position.mirrorBad')}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
```

Añade a `apps/ui/src/features/analysis/analysis.css`:
```css
.np-position { padding: 12px; display: grid; gap: 10px; font: 13px/1.5 var(--np-font-ui); }
.np-position h2 { font: 600 18px var(--np-font-ui); margin: 0; }
.np-position h3 { font: 600 13px var(--np-font-ui); margin: 8px 0 0; }
.np-signals { list-style: none; padding: 0; display: grid; gap: 10px; }
.np-signal-head { display: flex; justify-content: space-between; }
.np-signal-bar { position: relative; height: 6px; border-radius: 3px; background: var(--np-soft); margin: 4px 0; }
.np-signal-bar::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--np-ink2); }
.np-signal-bar span { position: absolute; top: 0; bottom: 0; border-radius: 3px; background: var(--np-accent); }
.np-signal-evidence { list-style: none; padding: 0; margin: 0; font: italic 13px var(--np-font-read); color: var(--np-ink2); }
.np-control { padding: 10px; border: 1px solid var(--np-line); border-radius: var(--np-radius); background: var(--np-card); }
```

> La prueba de espejo usa el análisis rápido (modelo local o el asignado a `quickScore`), que puntúa en modo absoluto: es una comprobación de simetría del juez, no la posición relativa del artículo.

- [ ] **Step 2: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```powershell
git add apps/ui/src/features/analysis
git commit -m "feat(ui): position explainer with quoted signals, confidence threshold, judge agreement and mirror test"
```

---

### Task 13: Panel lateral y pestaña Análisis

**Files:**
- Create: `apps/ui/src/features/analysis/AnalysisTab.tsx`, `apps/ui/src/features/analysis/AnalysisPanel.tsx`

**Interfaces:**
- Consumes: T1–T12.
- Produces:
  - `AnalysisTab({ tab })`: estado vacío con "Analizar"; anillo de neutralidad y veredicto; modo (rápido provisional / completo); eje relativo al grupo con enlace a "¿Por qué esta posición?"; aviso de discrepancia entre modelos; afirmaciones con veredicto, explicación y fuentes; autoría IA con "indicio, no prueba"; pasos con fallos; límite mensual alcanzado; accesos a síntesis y hemeroteca; bloque de hecho sin cobertura
  - `AnalysisPanel(props: SidePanelProps)`: `aside` con pestañas Análisis / Coberturas / Agente (flechas, Inicio, Fin), cerrar con Escape

- [ ] **Step 1: Pestaña Análisis**

`apps/ui/src/features/analysis/AnalysisTab.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import type { StageId } from '@newpaper/pipeline';
import { Button, FramingAxis, NeutralityRing, StageList, VerdictTag, type StageItem } from '@newpaper/ui-kit';
import { useEffect, useRef } from 'react';
import type { TabInfo } from '../../ipc/types';
import { navigate, openInternal } from '../../shell/navigate';
import { useArticle } from '../../state/browser';
import { useSetting } from '../../state/settings';
import { useAxisLabels } from './axisLabels';
import { controller, latestResult, useTabAnalysis } from './controller';
import { NoCoverageBlock } from './nocoverage/NoCoverageBlock';
import { panelStore, usePanel } from './panelStore';

const FULL_STAGES: StageId[] = ['claims', 'verify', 'score', 'synthesis', 'aiDetect'];

export function AnalysisTab({ tab }: { tab: TabInfo }) {
  const { t, formatNumber } = useI18n();
  const axis = useAxisLabels();
  const a = useTabAnalysis(tab.id);
  const page = useArticle(tab.id)?.article;
  const result = latestResult(a);
  const focus = usePanel((s) => s.focusClaim);
  const [detector] = useSetting<boolean>('ai.detector', true);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (focus) list.current?.querySelector(`[data-claim="${focus}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus]);

  if (!page) return <p className="np-panel-empty">{t('analysis.needsArticle')}</p>;
  const running = a?.phase === 'quick' || a?.phase === 'full';
  if (!result) {
    return (
      <div className="np-panel-empty">
        <p>{running ? t('analysis.running') : t('analysis.empty')}</p>
        {!running ? (
          <Button variant="primary" onClick={() => void controller.analyzeFull(tab.id, page)}>
            {t('analysis.actions.analyze')}
          </Button>
        ) : null}
      </div>
    );
  }

  const score = result.score;
  const verdicts = new Map((result.verdicts ?? []).map((v) => [v.claimId, v]));
  const known = (result.coverage?.coverages ?? []).map((c) => c.lean).filter((l): l is number => l !== null);
  const groupCenter = known.length ? known.reduce((x, y) => x + y, 0) / known.length : null;
  const stages: StageItem[] =
    a?.phase === 'full' || result === a?.full
      ? FULL_STAGES.map((id) => {
          const status = a?.stages[id] ?? (result.failed.includes(id) ? 'failed' : 'pending');
          return { id, label: t(`analysis.stage.${id}`), status, statusLabel: t(`analysis.stageStatus.${status}`) };
        })
      : [];
  const ai = detector ? result.aiAuthorship : null;

  return (
    <div className="np-atab">
      <header className="np-atab-head">
        <NeutralityRing value={score?.neutrality ?? null} label={t('analysis.neutrality', { value: score?.neutrality ?? 0 })} caption={t('analysis.neutralityCaption')} />
        <div>
          <p className="np-atab-verdict">{score ? t(`analysis.verdictText.${score.verdict}`) : t('analysis.noScore')}</p>
          <p className="np-tag np-tag--muted">{result.quick ? t('analysis.mode.quick') : t('analysis.mode.full')}</p>
          {result.quick ? (
            <Button variant="quiet" disabled={running} onClick={() => void controller.analyzeFull(tab.id, page)}>
              {t('analysis.actions.full')}
            </Button>
          ) : null}
        </div>
      </header>

      {result.capped ? <p className="np-hint">{t('analysis.capped')}</p> : null}
      {a?.error ? <p className="np-agent-error" role="alert">{t('analysis.error', { message: a.error })}</p> : null}

      {score ? (
        <section aria-label={t('analysis.axis.label')}>
          <FramingAxis framing={score.framing} interval={score.interval} groupCenter={groupCenter} others={[]} labels={axis} />
          {score.crossModelDisagreement ? <p className="np-hint">{t('analysis.disagreement')}</p> : null}
          <Button variant="quiet" onClick={() => panelStore.set({ detail: 'position' })}>
            {t('analysis.whyPosition')}
          </Button>
        </section>
      ) : null}

      <NoCoverageBlock analysis={a!} />

      {result.claims?.claims.length ? (
        <section aria-label={t('analysis.claims.title')}>
          <h3>{t('analysis.claims.title')}</h3>
          <ol ref={list} className="np-claims">
            {result.claims.claims.map((c) => {
              const v = verdicts.get(c.id);
              return (
                <li key={c.id} data-claim={c.id} className={focus === c.id ? 'np-claim np-claim--focus' : 'np-claim'}>
                  <p className="np-claim-quote">«{c.quote}»</p>
                  {v ? <VerdictTag status={v.status} label={t(`analysis.verdict.${v.status}`)} /> : <span className="np-tag np-tag--muted">{t('analysis.verdict.pendiente')}</span>}
                  {v ? <p className="np-claim-why">{v.explanation}</p> : null}
                  {v?.sources.length ? (
                    <p className="np-claim-sources">
                      {v.sources.map((s) => (
                        <button key={s.id} type="button" className="np-link" onClick={() => void navigate(s.url, { newTab: true })}>
                          {s.title}
                        </button>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
      {result.claims?.loadedPhrases.length ? <p className="np-muted">{t('analysis.loadedCount', { n: result.claims.loadedPhrases.length })}</p> : null}

      {ai ? (
        <section className={ai.probability >= 0.5 ? 'np-ai np-ai--high' : 'np-ai'} aria-label={t('analysis.ai.title')}>
          <strong>{t('analysis.ai.probability', { value: formatNumber(ai.probability, { style: 'percent' }) })}</strong>
          <p className="np-muted">{t('analysis.ai.disclaimer')}</p>
          <ul>
            {ai.signals.map((s) => (
              <li key={s.key}>{t(`analysis.ai.signal.${s.key}`)}: <span className="np-mono">{formatNumber(s.strength, { maximumFractionDigits: 2 })}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {stages.length ? <StageList items={stages} label={t('analysis.stagesLabel')} /> : null}

      <div className="np-atab-links">
        {result.synthesis ? (
          <Button onClick={() => void openInternal('sintesis', [], { url: result.url, hash: result.hash })}>{t('analysis.actions.synthesis')}</Button>
        ) : null}
        <Button variant="quiet" onClick={() => void openInternal('hemeroteca', [], { url: result.url })}>
          {t('analysis.actions.hemeroteca')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Panel**

`apps/ui/src/features/analysis/AnalysisPanel.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { IconButton, Tabs } from '@newpaper/ui-kit';
import { IconClose } from '../../shell/icons';
import type { SidePanelProps } from '../../shell/registry';
import { AgentTab } from './agent/AgentTab';
import { AnalysisTab } from './AnalysisTab';
import { CoverageTab } from './CoverageTab';
import { closePanel, openPanel, usePanel, type PanelTab } from './panelStore';
import { PositionDetail } from './PositionDetail';

export function AnalysisPanel({ tab }: SidePanelProps) {
  const t = useT();
  const open = usePanel((s) => s.open);
  const which = usePanel((s) => s.tab);
  const wide = usePanel((s) => s.wide);
  const detail = usePanel((s) => s.detail);
  if (!open) return null;
  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'analysis', label: t('analysis.panel.analysis') },
    { id: 'coverage', label: t('analysis.panel.coverage') },
    { id: 'agent', label: t('analysis.panel.agent') },
  ];
  return (
    <aside className={`np-side${wide && which === 'agent' ? ' np-side--wide' : ''}`} aria-label={t('analysis.panel.label')} onKeyDown={(e) => e.key === 'Escape' && closePanel()}>
      <header className="np-side-head">
        <Tabs tabs={tabs} active={which} onChange={(id) => openPanel(id)} label={t('analysis.panel.label')} idPrefix="np-panel" />
        <IconButton label={t('analysis.panel.close')} icon={<IconClose />} onClick={closePanel} />
      </header>
      <div className="np-side-body" role="tabpanel" id={`np-panel-panel-${which}`} aria-labelledby={`np-panel-tab-${which}`}>
        {which === 'analysis' ? detail === 'position' ? <PositionDetail tab={tab} /> : <AnalysisTab tab={tab} /> : null}
        {which === 'coverage' ? <CoverageTab tab={tab} /> : null}
        {which === 'agent' ? <AgentTab tab={tab} /> : null}
      </div>
    </aside>
  );
}
```

Añade a `apps/ui/src/features/analysis/analysis.css`:
```css
.np-side-head { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-bottom: 1px solid var(--np-line); }
.np-side-head .np-tabs { flex: 1; }
.np-side-body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.np-atab { padding: 12px; display: grid; gap: 12px; font: 13px/1.5 var(--np-font-ui); }
.np-atab-head { display: flex; gap: 12px; align-items: center; }
.np-atab-verdict { font: 600 16px var(--np-font-ui); margin: 0 0 4px; }
.np-claims { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.np-claim { padding: 8px; border-radius: 10px; transition: background-color 200ms var(--np-ease); }
.np-claim--focus { background: var(--np-accent-soft); }
.np-claim-quote { font: 15px/1.45 var(--np-font-read); margin: 0 0 4px; }
.np-claim-why { margin: 4px 0; }
.np-claim-sources { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; font-size: 12px; }
.np-ai { padding: 10px; border-radius: var(--np-radius); background: var(--np-soft); }
.np-ai--high { background: var(--np-ai-bg); border-left: 3px solid var(--np-ai); }
.np-atab-links { display: flex; gap: 8px; flex-wrap: wrap; }
@media (prefers-reduced-motion: reduce) { .np-claim { transition: none; } }
```

- [ ] **Step 3: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```powershell
git add apps/ui/src/features/analysis
git commit -m "feat(ui): analysis side panel with verdicts, framing axis, ai hint and stage list"
```

---

### Task 14: Registro de la experiencia de análisis (lector, panel, botón, atajos y análisis automático)

**Files:**
- Create: `apps/ui/src/features/analysis/register.ts`, `apps/ui/src/features/analysis/AnalysisButton.tsx`
- Modify: `apps/ui/src/features/index.ts`

**Interfaces:**
- Consumes: registro del subproyecto 1 y `registerSidePanel` (T1); T5–T13.
- Produces: lector `AnalysisReader` registrado; panel lateral; botón de la barra (`id: 'analysis'`, orden 60) con la neutralidad como insignia; atajos `analyze` y `ask-agent`; `startAutoAnalysis()`; limpieza de pestañas cerradas.

- [ ] **Step 1: Botón de la barra**

`apps/ui/src/features/analysis/AnalysisButton.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import type { TabInfo } from '../../ipc/types';
import { latestResult, useTabAnalysis } from './controller';
import { togglePanel, usePanel } from './panelStore';

export function AnalysisButton({ tab }: { tab: TabInfo | null }) {
  const t = useT();
  const open = usePanel((s) => s.open);
  const a = useTabAnalysis(tab?.id ?? null);
  if (!tab || tab.kind !== 'web') return null;
  const n = latestResult(a)?.score?.neutrality;
  const busy = a?.phase === 'quick' || a?.phase === 'full';
  return (
    <button type="button" className="np-abtn" aria-pressed={open} aria-busy={busy || undefined} onClick={togglePanel} title={t('analysis.toolbar.title')}>
      <span>{t('analysis.toolbar.label')}</span>
      {n !== undefined ? <span className="np-abtn-badge">{Math.round(n)}</span> : null}
    </button>
  );
}
```

- [ ] **Step 2: Registro**

`apps/ui/src/features/analysis/register.ts`:
```ts
import { commands } from '../../ipc/commands';
import { registerReaderView, registerShortcut, registerSidePanel, registerToolbarItem } from '../../shell/registry';
import { browserStore } from '../../state/browser';
import './analysis.css';
import { AnalysisButton } from './AnalysisButton';
import { AnalysisPanel } from './AnalysisPanel';
import { AnalysisReader } from './AnalysisReader';
import { analysisStore, controller, startAutoAnalysis } from './controller';
import { openPanel } from './panelStore';

registerReaderView(AnalysisReader);
registerSidePanel(AnalysisPanel);
registerToolbarItem({ id: 'analysis', order: 60, Component: AnalysisButton });

registerShortcut('analyze', ({ tab }) => {
  if (!tab || tab.kind !== 'web') return;
  const page = browserStore.get().pages[tab.id]?.article;
  if (page) void controller.analyzeFull(tab.id, page);
  openPanel('analysis');
});

registerShortcut('ask-agent', ({ tab, selection }) => {
  if (!tab || tab.kind !== 'web') return;
  const page = browserStore.get().pages[tab.id]?.article;
  if (page && !analysisStore.get().byTab[tab.id]) void controller.analyzeQuick(tab.id, page);
  if (tab.view !== 'reader') void commands.tabSetView(tab.id, 'reader');
  openPanel('agent', { agentSeed: { fragment: selection || null, mode: 'ask', question: null } });
});

void startAutoAnalysis();
browserStore.subscribe(() => controller.prune(browserStore.get().snapshot.tabs.map((t) => t.id)));
```

Añade a `apps/ui/src/features/index.ts`: `import './analysis/register';`

Añade a `apps/ui/src/features/analysis/analysis.css`:
```css
.np-abtn { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1px solid var(--np-line3); border-radius: 999px; background: var(--np-card); color: var(--np-ink); font: 600 13px var(--np-font-ui); cursor: pointer; }
.np-abtn[aria-pressed='true'] { background: var(--np-ink); color: var(--np-on-ink); border-color: var(--np-ink); }
.np-abtn[aria-busy='true'] { animation: np-pulse 1.2s var(--np-ease) infinite; }
.np-abtn-badge { min-width: 24px; padding: 0 6px; border-radius: 10px; background: var(--np-accent-soft); color: var(--np-accent); font: 600 11px/20px var(--np-font-mono); text-align: center; }
@media (prefers-reduced-motion: reduce) { .np-abtn[aria-busy='true'] { animation: none; } }
```

> `analysisStore` se importa para saber si ya hay análisis en la pestaña: el agente necesita uno (aunque sea rápido) para tener el artículo en contexto.

- [ ] **Step 3: Comprobar que compila y que el escaneo sigue limpio**

Run:
```powershell
pnpm --filter @newpaper/ui typecheck
pnpm --filter @newpaper/ui test
pnpm --filter @newpaper/i18n test
```
Expected: sin errores; los tests en verde; ningún texto escrito a mano.

- [ ] **Step 4: Commit**

```powershell
git add apps/ui/src/features
git commit -m "feat(ui): register analysis reader, side panel, toolbar button, shortcuts and auto analysis"
```

---
### Task 15: Síntesis — `newpaper://sintesis` con Breve / Completa / Cambios

**Files:**
- Create: `apps/ui/src/features/synthesis/rewrites.ts`, `apps/ui/src/features/synthesis/SynthesisPage.tsx`, `apps/ui/src/features/synthesis/register.ts`, `apps/ui/src/features/synthesis/synthesis.css`
- Modify: `apps/ui/src/features/index.ts`

**Interfaces:**
- Consumes: `analysisStore` (T5), `commands.analysisCacheGet` (4), `VisualizationView`, `useVizLabels`, `useParties` (T8–T9).
- Produces:
  - `RewritePart = { kind: 'eq'; text } | { kind: 'change'; from; to; reason }`, `applyRewrites(text, rewrites): RewritePart[]` (primera aparición de cada `from`, de izquierda a derecha, sin solapes)
  - Página interna `sintesis` con query `url` y `hash`: busca el resultado en memoria y, si no está, en la caché (`synthesis` y `verify`)

- [ ] **Step 1: Cambios alineados con el original**

`apps/ui/src/features/synthesis/rewrites.ts`:
```ts
export type RewritePart = { kind: 'eq'; text: string } | { kind: 'change'; from: string; to: string; reason: string };

export function applyRewrites(text: string, rewrites: { from: string; to: string; reason: string }[]): RewritePart[] {
  const hits = rewrites
    .map((r) => ({ r, at: text.indexOf(r.from) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  const out: RewritePart[] = [];
  let i = 0;
  for (const { r, at } of hits) {
    if (at < i) continue; // solapa con un cambio anterior
    if (at > i) out.push({ kind: 'eq', text: text.slice(i, at) });
    out.push({ kind: 'change', from: r.from, to: r.to, reason: r.reason });
    i = at + r.from.length;
  }
  if (i < text.length) out.push({ kind: 'eq', text: text.slice(i) });
  return out;
}
```

- [ ] **Step 2: Página**

`apps/ui/src/features/synthesis/SynthesisPage.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import type { Synthesis, Verdict } from '@newpaper/pipeline';
import { SegmentedControl, VisualizationView } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { InternalPageProps } from '../../shell/registry';
import { navigate } from '../../shell/navigate';
import { analysisStore } from '../analysis/controller';
import { useParties } from '../analysis/parties';
import { useVizLabels } from '../analysis/vizLabels';
import { applyRewrites } from './rewrites';

type View = 'brief' | 'full' | 'changes';
interface Loaded { synthesis: Synthesis; sources: { id: string; title: string; url: string }[]; original: string | null }

async function load(url: string, hash: string): Promise<Loaded | null> {
  for (const a of Object.values(analysisStore.get().byTab)) {
    const r = a.full;
    if (r && r.url === url && r.hash === hash && r.synthesis) return { synthesis: r.synthesis, sources: r.sources, original: a.article.text };
  }
  const s = await commands.analysisCacheGet(url, hash, 'synthesis');
  if (!s) return null;
  const v = await commands.analysisCacheGet(url, hash, 'verify');
  const seen = new Map<string, { id: string; title: string; url: string }>();
  for (const verdict of v ? (JSON.parse(v.json) as Verdict[]) : []) for (const src of verdict.sources) seen.set(src.id, src);
  return { synthesis: JSON.parse(s.json) as Synthesis, sources: [...seen.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))), original: null };
}

const open = (u: string) => void navigate(u, { newTab: true });

export function SynthesisPage({ url: page }: InternalPageProps) {
  const { t } = useI18n();
  const viz = useVizLabels();
  const parties = useParties();
  const url = page.query.get('url') ?? '';
  const hash = page.query.get('hash') ?? '';
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [view, setView] = useState<View>('brief');
  useEffect(() => {
    void load(url, hash).then(setData);
  }, [url, hash]);

  if (data === undefined) return <p className="np-panel-empty" aria-busy="true">{t('synthesis.loading')}</p>;
  if (data === null) return <p className="np-panel-empty">{t('synthesis.missing')}</p>;
  const s = data.synthesis;
  const n = (id: string) => data.sources.findIndex((x) => x.id === id) + 1;
  const cite = (ids: string[]) =>
    ids.filter((id) => n(id) > 0).map((id) => (
      <button key={id} type="button" className="np-cite" title={data.sources[n(id) - 1]!.title} onClick={() => open(data.sources[n(id) - 1]!.url)}>
        {n(id)}
      </button>
    ));

  return (
    <article className="np-synth">
      <p className="np-synth-kicker">{t('synthesis.kicker')}</p>
      <h1>{s.headline}</h1>
      <SegmentedControl
        label={t('synthesis.view.label')}
        value={view}
        onChange={setView}
        options={(['brief', 'full', 'changes'] as const).map((v) => ({ value: v, label: t(`synthesis.view.${v}`) }))}
      />

      {view === 'brief' ? (
        <ol className="np-synth-summary">
          {s.summary3.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      ) : null}

      {view === 'full' ? (
        <>
          <section>
            <h2>{t('synthesis.facts')}</h2>
            <ul className="np-synth-facts">
              {s.facts.map((f) => (
                <li key={f.id} className={`np-fact np-fact--${f.kind}`}>
                  <span className="np-tag np-tag--muted">{t(`synthesis.factKind.${f.kind}`)}</span> {f.text} {cite(f.sourceIds)}
                </li>
              ))}
            </ul>
          </section>
          {s.parties.length ? (
            <section>
              <h2>{t('synthesis.parties')}</h2>
              <div className="np-synth-parties">
                {s.parties.map((p, i) => (
                  <div key={i} className="np-synth-party">
                    <strong>{p.who}</strong>
                    <p>{p.says} {cite([p.sourceId])}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {s.disputes.map((d) => (
            <section key={d.question} className="np-dispute">
              <h2>{d.question}</h2>
              {d.positions.map((p) => (
                <div key={p.id} className="np-dispute-pos">
                  <p><strong>{p.who}</strong>: {p.claim}</p>
                  <div className="np-dispute-bar" role="meter" aria-label={t('synthesis.evidence')} aria-valuemin={0} aria-valuemax={1} aria-valuenow={p.evidenceWeight}>
                    <span style={{ width: `${p.evidenceWeight * 100}%` }} />
                  </div>
                  <p className="np-muted">{p.detail}</p>
                </div>
              ))}
              {d.conclusion ? <p className="np-dispute-conclusion">{d.conclusion}</p> : null}
            </section>
          ))}
          {s.visualizations.map((v, i) => (
            <VisualizationView key={i} viz={v} sources={data.sources} parties={parties} labels={viz.labels} format={viz.format} regionName={viz.regionName} onOpenSource={open} />
          ))}
          {s.unknowns.length ? (
            <section>
              <h2>{t('synthesis.unknowns')}</h2>
              <ul>
                {s.unknowns.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {view === 'changes' ? (
        data.original ? (
          <div className="np-changes">
            {applyRewrites(data.original, s.rewrites).map((p, i) =>
              p.kind === 'eq' ? (
                <span key={i}>{p.text}</span>
              ) : (
                <span key={i} className="np-change" title={p.reason}>
                  <del>{p.from}</del>
                  {p.to ? <ins>{p.to}</ins> : null}
                </span>
              ),
            )}
          </div>
        ) : (
          <ul className="np-changes-list">
            {s.rewrites.map((r, i) => (
              <li key={i}>
                <del>{r.from}</del> → <ins>{r.to || t('synthesis.removed')}</ins>
                <p className="np-muted">{r.reason}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <p className="np-synth-sources">
        {data.sources.map((x, i) => (
          <button key={x.id} type="button" className="np-link" onClick={() => open(x.url)}>
            [{i + 1}] {x.title}
          </button>
        ))}
      </p>
    </article>
  );
}
```

`apps/ui/src/features/synthesis/synthesis.css`:
```css
.np-synth { max-width: 72ch; margin: 0 auto; padding: 32px 20px 64px; font: 17px/1.6 var(--np-font-read); color: var(--np-ink); display: grid; gap: 16px; }
.np-synth h1 { font: 600 32px/1.2 var(--np-font-read); margin: 0; }
.np-synth h2 { font: 600 15px var(--np-font-ui); margin: 8px 0; }
.np-synth-kicker { font: 600 11px var(--np-font-mono); letter-spacing: .08em; color: var(--np-accent); text-transform: uppercase; margin: 0; }
.np-synth-summary li { margin-bottom: 8px; }
.np-synth-facts { list-style: none; padding: 0; display: grid; gap: 8px; }
.np-fact--disputa { border-left: 3px solid var(--np-warn); padding-left: 8px; }
.np-synth-parties { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.np-synth-party { padding: 10px; border: 1px solid var(--np-line); border-radius: var(--np-radius); background: var(--np-card); font: 14px/1.5 var(--np-font-ui); }
.np-dispute { padding: 12px; border-radius: var(--np-radius); background: var(--np-soft); }
.np-dispute-bar { height: 6px; border-radius: 3px; background: var(--np-line2); }
.np-dispute-bar span { display: block; height: 100%; border-radius: 3px; background: var(--np-accent); }
.np-dispute-conclusion { font-weight: 600; }
.np-changes { white-space: pre-wrap; }
.np-change del { color: var(--np-bad); background: var(--np-bad-bg); }
.np-change ins { color: var(--np-ok); background: var(--np-ok-bg); text-decoration: none; }
.np-synth-sources { display: flex; flex-direction: column; gap: 4px; font: 12px var(--np-font-ui); }
```

`apps/ui/src/features/synthesis/register.ts`:
```ts
import { registerInternalPage } from '../../shell/registry';
import { SynthesisPage } from './SynthesisPage';
import './synthesis.css';

registerInternalPage('sintesis', SynthesisPage);
```

Añade a `apps/ui/src/features/index.ts`: `import './synthesis/register';`

- [ ] **Step 3: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```powershell
git add apps/ui/src/features
git commit -m "feat(ui): neutral synthesis page with brief, full and changes views and sourced charts"
```

---

### Task 16: Hemeroteca — `newpaper://hemeroteca` con línea de tiempo, A/B y tres modos

**Files:**
- Create: `apps/ui/src/features/hemeroteca/HemerotecaPage.tsx`, `apps/ui/src/features/hemeroteca/register.ts`, `apps/ui/src/features/hemeroteca/hemeroteca.css`
- Modify: `apps/ui/src/features/index.ts`

**Interfaces:**
- Consumes: `commands.{waybackCaptures, waybackCaptureHtml, waybackAnalyze, waybackDiff}` (3), `extractFromHtml` (1), `commands.historyRecordSearch` (1).
- Produces: página interna `hemeroteca` con query `url` (y `q` para buscar otra URL); descarga las capturas una a una con progreso, las analiza en Rust y pinta "Editada N veces sin aviso", la línea de tiempo, el selector A/B y los modos Unificado / Lado a lado / Leer captura. Nunca abre la web de Wayback.

- [ ] **Step 1: Página**

`apps/ui/src/features/hemeroteca/HemerotecaPage.tsx`:
```tsx
import { extractFromHtml } from '@newpaper/extract';
import { useI18n } from '@newpaper/i18n/react';
import { SegmentedControl } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { CaptureInput, DiffOp, TextDiff, WaybackHistory } from '../../ipc/types';
import type { InternalPageProps } from '../../shell/registry';

type Mode = 'unified' | 'side' | 'read';
const tsDate = (ts: string) => new Date(Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10) || 0, +ts.slice(10, 12) || 0));

function Ops({ ops, side }: { ops: DiffOp[]; side?: 'a' | 'b' }) {
  return (
    <>
      {ops.map((o, i) =>
        o.kind === 'eq' ? (
          <span key={i}>{o.text}</span>
        ) : o.kind === 'del' ? (
          side === 'b' ? null : <del key={i}>{o.text}</del>
        ) : side === 'a' ? null : (
          <ins key={i}>{o.text}</ins>
        ),
      )}
    </>
  );
}

function DiffView({ diff, side }: { diff: TextDiff; side?: 'a' | 'b' }) {
  return (
    <div className="np-hem-text">
      <h2><Ops ops={diff.headline} side={side} /></h2>
      {diff.paragraphs.map((p, i) => (
        <p key={i} className={p.kind ? 'np-hem-edited' : undefined}>
          <Ops ops={p.ops} side={side} />
        </p>
      ))}
    </div>
  );
}

export function HemerotecaPage({ url: page }: InternalPageProps) {
  const { t, formatDate } = useI18n();
  const url = page.query.get('url') ?? '';
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [history, setHistory] = useState<WaybackHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ab, setAb] = useState<[number, number]>([0, 0]);
  const [mode, setMode] = useState<Mode>('unified');
  const [diff, setDiff] = useState<TextDiff | null>(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    void commands.historyRecordSearch(url, 'hemeroteca');
    (async () => {
      try {
        const rows = await commands.waybackCaptures(url);
        const captures: CaptureInput[] = [];
        setProgress({ done: 0, total: rows.length });
        for (const r of rows) {
          if (!alive) return;
          try {
            const html = await commands.waybackCaptureHtml(url, r.timestamp);
            const a = extractFromHtml(html, url);
            if (a) captures.push({ timestamp: r.timestamp, digest: r.digest, text: { headline: a.title, paragraphs: a.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) } });
          } catch {
            /* captura ilegible: se omite */
          }
          setProgress({ done: captures.length, total: rows.length });
        }
        const h = await commands.waybackAnalyze(url, captures);
        if (!alive) return;
        setHistory(h);
        setAb([0, Math.max(0, h.captures.length - 1)]);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (!history || history.captures.length < 2) return setDiff(null);
    const [a, b] = ab;
    void commands.waybackDiff(history.captures[a]!.text, history.captures[b]!.text).then(setDiff);
  }, [history, ab]);

  if (!url) return <p className="np-panel-empty">{t('hemeroteca.noUrl')}</p>;
  if (error) return <p className="np-panel-empty" role="alert">{t('hemeroteca.error', { message: error })}</p>;
  if (!history) {
    return (
      <p className="np-panel-empty" aria-busy="true">
        {progress ? t('hemeroteca.progress', { done: progress.done, total: progress.total }) : t('hemeroteca.loading')}
      </p>
    );
  }
  if (!history.captures.length) return <p className="np-panel-empty">{t('hemeroteca.none')}</p>;
  const edited = new Set(history.edits.map((e) => e.captureIndex));
  const when = (i: number) => formatDate(tsDate(history.captures[i]!.timestamp), { dateStyle: 'medium', timeStyle: 'short' });
  const pick = (slot: 0 | 1, i: number) => setAb((cur) => (slot === 0 ? [i, cur[1]] : [cur[0], i]));
  const b = history.captures[ab[1]]!;

  return (
    <div className="np-hem">
      <header>
        <p className="np-synth-kicker">{t('hemeroteca.kicker')}</p>
        <h1>{history.captures.at(-1)!.text.headline}</h1>
        <p className="np-mono np-muted">{url}</p>
        {history.silent ? (
          <p className="np-hem-silent" role="status">{t('hemeroteca.silent', { n: history.editedCaptures })}</p>
        ) : history.notice ? (
          <p className="np-hint">{t('hemeroteca.notice', { notice: history.notice })}</p>
        ) : null}
      </header>

      <ol className="np-hem-timeline" aria-label={t('hemeroteca.timeline')}>
        {history.captures.map((c, i) => (
          <li key={c.timestamp} className={edited.has(i) ? 'np-hem-cap np-hem-cap--edited' : 'np-hem-cap'}>
            <span className="np-mono">{when(i)}</span>
            <button type="button" aria-pressed={ab[0] === i} onClick={() => pick(0, i)}>A</button>
            <button type="button" aria-pressed={ab[1] === i} onClick={() => pick(1, i)}>B</button>
          </li>
        ))}
      </ol>

      <SegmentedControl
        label={t('hemeroteca.mode.label')}
        value={mode}
        onChange={setMode}
        options={(['unified', 'side', 'read'] as const).map((m) => ({ value: m, label: t(`hemeroteca.mode.${m}`) }))}
      />
      <p className="np-muted">{t('hemeroteca.comparing', { a: when(ab[0]), b: when(ab[1]) })}</p>

      {mode === 'unified' && diff ? <DiffView diff={diff} /> : null}
      {mode === 'side' && diff ? (
        <div className="np-hem-side">
          <DiffView diff={diff} side="a" />
          <DiffView diff={diff} side="b" />
        </div>
      ) : null}
      {mode === 'read' ? (
        <div className="np-hem-text">
          <h2>{b.text.headline}</h2>
          {b.text.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : null}
      {history.captures.length < 2 && mode !== 'read' ? <p className="np-muted">{t('hemeroteca.single')}</p> : null}

      {history.edits.length ? (
        <section>
          <h2>{t('hemeroteca.edits')}</h2>
          <ul className="np-hem-edits">
            {history.edits.map((e, i) => (
              <li key={i}>
                <span className="np-tag np-tag--warn">{t(`hemeroteca.kind.${e.kind}`)}</span> <span className="np-mono">{when(e.captureIndex)}</span>
                {e.before ? <del>{e.before}</del> : null}
                {e.after ? <ins>{e.after}</ins> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
```

`apps/ui/src/features/hemeroteca/hemeroteca.css`:
```css
.np-hem { max-width: 80ch; margin: 0 auto; padding: 32px 20px 64px; display: grid; gap: 14px; font: 14px/1.5 var(--np-font-ui); }
.np-hem h1 { font: 600 28px/1.2 var(--np-font-read); margin: 0; }
.np-hem-silent { padding: 10px; border-radius: var(--np-radius); background: var(--np-warn-bg); color: var(--np-warn); font-weight: 600; }
.np-hem-timeline { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
.np-hem-cap { display: grid; grid-template-columns: 1fr 44px 44px; align-items: center; gap: 6px; padding-left: 10px; border-left: 2px solid var(--np-line3); }
.np-hem-cap--edited { border-left-color: var(--np-warn); }
.np-hem-cap button { min-height: var(--np-hit); border: 1px solid var(--np-line3); border-radius: 8px; background: var(--np-card); font: 600 12px var(--np-font-mono); cursor: pointer; }
.np-hem-cap button[aria-pressed='true'] { background: var(--np-ink); color: var(--np-on-ink); }
.np-hem-text { font: 17px/1.6 var(--np-font-read); }
.np-hem-text del { color: var(--np-bad); background: var(--np-bad-bg); }
.np-hem-text ins { color: var(--np-ok); background: var(--np-ok-bg); text-decoration: none; }
.np-hem-edited { border-left: 3px solid var(--np-warn); padding-left: 8px; }
.np-hem-side { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.np-hem-edits { list-style: none; padding: 0; display: grid; gap: 8px; }
.np-hem-edits del, .np-hem-edits ins { display: block; font: 14px var(--np-font-read); }
```

`apps/ui/src/features/hemeroteca/register.ts`:
```ts
import { registerInternalPage } from '../../shell/registry';
import { HemerotecaPage } from './HemerotecaPage';
import './hemeroteca.css';

registerInternalPage('hemeroteca', HemerotecaPage);
```

Añade a `apps/ui/src/features/index.ts`: `import './hemeroteca/register';`

> `historyRecordSearch(query, source)` es el comando del subproyecto 1 (`SearchSource = 'hemeroteca'`); si su orden de argumentos es otro, ajústalo aquí.

- [ ] **Step 2: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```powershell
git add apps/ui/src/features
git commit -m "feat(ui): hemeroteca page with capture timeline, a/b diff, side-by-side and capture reader"
```

---

### Task 17: Asistente de proveedores y Ajustes › IA (configurador del pipeline)

**Files:**
- Create: `apps/ui/src/features/providers/ConnectWizard.tsx`, `apps/ui/src/features/providers/AiSection.tsx`, `apps/ui/src/features/providers/register.ts`, `apps/ui/src/features/providers/providers.css`
- Modify: `apps/ui/src/features/index.ts`

**Interfaces:**
- Consumes: `getRegistry`, `getPipeline`, `resetPipeline`, `useAiSettings` (4), `detectProviders`, `autoAssign`, `describeAssignment`, `estimateAnalysis`, `PRESETS` (4), `commands.{secretSet, secretHas, secretDelete, aiLocalProbe, aiSetEndpoints, usageMonth}`, `useActiveTab`, `parseInternalUrl`.
- Produces:
  - `ConnectWizard({ onDone })` — paso 1: Recomendados (ChatGPT, Nous Research), "¿Ya tienes una clave? Pégala aquí" con detección por prefijo (si hay varios candidatos, se elige), Nube, En tu equipo (detectados con `ai_local_probe`), Avanzado (endpoint propio compatible con OpenAI, id fijo `custom`); paso 2: clave (se guarda en el llavero con `secret_set ai.<id>`), "Consigue tu clave", "Probar conexión" con latencia; paso 3: asignación automática con coste estimado por análisis
  - `AiSection()` — sección de Ajustes `ia` (orden 40): proveedores conectados (quitar), preset, tabla de asignación por etapa con cambio manual y "volver a automático", límite mensual en USD y gasto del mes; abre el asistente en `newpaper://ajustes/ia/conectar`

- [ ] **Step 1: Asistente**

`apps/ui/src/features/providers/ConnectWizard.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { autoAssign, describeAssignment, detectProviders, estimateAnalysis, type ProviderEntry, type Registry } from '@newpaper/pipeline';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useMemo, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { LocalProbe } from '../../ipc/types';
import { navigate } from '../../shell/navigate';
import { getPipeline, getRegistry, resetPipeline, useAiSettings } from '../ai/pipeline';

type Step = 1 | 2 | 3;
const SAMPLE = 'x'.repeat(6000);

export function ConnectWizard({ onDone }: { onDone(): void }) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const ai = useAiSettings();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [local, setLocal] = useState<LocalProbe>({ ollama: null, lmstudio: null });
  const [step, setStep] = useState<Step>(1);
  const [provider, setProvider] = useState<ProviderEntry | null>(null);
  const [key, setKey] = useState('');
  const [custom, setCustom] = useState({ name: '', baseUrl: 'http://127.0.0.1:8000/v1', models: '' });
  const [test, setTest] = useState<{ busy: boolean; ok: boolean | null; latencyMs: number; error: string | null }>({ busy: false, ok: null, latencyMs: 0, error: null });

  useEffect(() => {
    void getRegistry().then(setRegistry);
    void commands.aiLocalProbe().then(setLocal).catch(() => {});
  }, []);
  const detected = useMemo(() => (registry && key.length >= 4 ? detectProviders(key.trim(), registry) : []), [registry, key]);

  if (!registry) return <p className="np-panel-empty" aria-busy="true">{t('providers.loading')}</p>;
  const choose = (p: ProviderEntry) => {
    setProvider(p);
    setTest({ busy: false, ok: null, latencyMs: 0, error: null });
    setStep(2);
  };
  const localModels = (p: ProviderEntry) => (p.id === 'ollama' ? local.ollama : p.id === 'lmstudio' ? local.lmstudio : null);
  const needsKey = (p: ProviderEntry) => p.type === 'cloud';
  const firstModel = (p: ProviderEntry) =>
    p.id === 'custom' ? custom.models.split(',')[0]?.trim() ?? '' : (localModels(p)?.[0] ?? p.models.find((m) => m.tier === 'light')?.id ?? p.models[0]?.id ?? '');

  const runTest = async () => {
    if (!provider) return;
    setTest({ busy: true, ok: null, latencyMs: 0, error: null });
    try {
      if (needsKey(provider) && key.trim()) await commands.secretSet(`ai.${provider.id}`, key.trim());
      if (provider.id === 'custom') {
        await commands.aiSetEndpoints([{ id: 'custom', name: custom.name || 'custom', baseUrl: custom.baseUrl, models: custom.models.split(',').map((m) => m.trim()).filter(Boolean) }]);
      }
      resetPipeline();
      const r = await (await getPipeline()).testConnection({ provider: provider.id, model: firstModel(provider) });
      setTest({ busy: false, ok: r.ok, latencyMs: r.latencyMs, error: r.ok ? null : r.error });
    } catch (e) {
      setTest({ busy: false, ok: false, latencyMs: 0, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const finish = async () => {
    if (!provider) return;
    const connected = [...new Set([...ai.connected, provider.id])];
    await ai.setConnected(connected);
    if (provider.id === 'custom' && connected.length === 1) {
      // Un endpoint propio no está en el registro: se asigna a todas las etapas a mano.
      const ref = { provider: 'custom', model: firstModel(provider) };
      await ai.setAssignments({ claims: ref, quickScore: ref, verify: ref, score: ref, synthesis: ref, aiDetect: ref, agent: ref, investigate: ref });
    }
    setStep(3);
  };

  if (step === 1) {
    const byCat = (c: ProviderEntry['category']) => registry.providers.filter((p) => p.category === c);
    return (
      <div className="np-wizard">
        <h2>{t('providers.title')}</h2>
        <p className="np-muted">{t('providers.subtitle')}</p>
        <h3>{t('providers.cat.recommended')}</h3>
        <div className="np-wizard-cards">
          {byCat('recommended').map((p) => (
            <button key={p.id} type="button" className="np-wizard-card np-wizard-card--big" onClick={() => choose(p)}>
              <strong>{p.name}</strong>
              <span>{t(`providers.pitch.${p.id}`)}</span>
              <span className="np-link">{t('providers.connect', { name: p.name })}</span>
            </button>
          ))}
        </div>
        <label className="np-wizard-key">
          <span>{t('providers.pasteKey')}</span>
          <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
          <span className="np-muted">{t('providers.pasteHint')}</span>
        </label>
        {detected.length === 1 ? (
          <p className="np-wizard-detected">
            {t('providers.detected', { name: detected[0]!.name })} <Button variant="primary" onClick={() => choose(detected[0]!)}>{t('providers.continue')}</Button>
          </p>
        ) : null}
        {detected.length > 1 ? (
          <div className="np-wizard-detected">
            <p>{t('providers.ambiguous')}</p>
            {detected.map((p) => (
              <Button key={p.id} onClick={() => choose(p)}>{p.name}</Button>
            ))}
          </div>
        ) : null}
        {key.length >= 4 && detected.length === 0 ? <p className="np-muted">{t('providers.unknownPrefix')}</p> : null}
        <h3>{t('providers.cat.cloud')}</h3>
        <p className="np-muted">{t('providers.cat.cloudHint')}</p>
        <div className="np-wizard-cards">
          {byCat('cloud').map((p) => (
            <button key={p.id} type="button" className="np-wizard-card" onClick={() => choose(p)}>
              <strong>{p.name}</strong>
            </button>
          ))}
        </div>
        <h3>{t('providers.cat.local')}</h3>
        <p className="np-muted">{t('providers.cat.localHint')}</p>
        <div className="np-wizard-cards">
          {byCat('local').map((p) => (
            <button key={p.id} type="button" className="np-wizard-card" onClick={() => choose(p)}>
              <strong>{p.name}</strong>
              <span className={localModels(p) ? 'np-tag np-tag--ok' : 'np-tag np-tag--muted'}>{localModels(p) ? t('providers.detectedLocal', { n: localModels(p)!.length }) : t('providers.notRunning')}</span>
            </button>
          ))}
        </div>
        <h3>{t('providers.cat.advanced')}</h3>
        {byCat('advanced').map((p) => (
          <button key={p.id} type="button" className="np-wizard-card" onClick={() => choose(p)}>
            <strong>{t('providers.customTitle')}</strong>
            <span>{t('providers.customHint')}</span>
          </button>
        ))}
      </div>
    );
  }

  if (step === 2 && provider) {
    return (
      <div className="np-wizard">
        <h2>{provider.id === 'custom' ? t('providers.customTitle') : provider.name}</h2>
        {provider.id === 'custom' ? (
          <>
            <label className="np-field"><span>{t('providers.customName')}</span><input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} /></label>
            <label className="np-field"><span>{t('providers.baseUrl')}</span><input value={custom.baseUrl} onChange={(e) => setCustom({ ...custom, baseUrl: e.target.value })} /></label>
            <label className="np-field"><span>{t('providers.customModels')}</span><input value={custom.models} onChange={(e) => setCustom({ ...custom, models: e.target.value })} /></label>
          </>
        ) : (
          <p className="np-mono np-muted">{provider.baseUrl}</p>
        )}
        {needsKey(provider) || provider.id === 'custom' ? (
          <label className="np-field">
            <span>{t('providers.key')}</span>
            <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
            {provider.keyPrefixes.length ? <span className="np-muted">{t('providers.startsWith', { prefix: provider.keyPrefixes.at(-1)! })}</span> : null}
          </label>
        ) : null}
        <p className="np-hint">{t('providers.keyStorage', { name: provider.name })}</p>
        {provider.keyUrl ? (
          <p>
            {t('providers.noKey')} <Button variant="quiet" onClick={() => void navigate(provider.keyUrl!, { newTab: true })}>{t('providers.getKey')}</Button>
          </p>
        ) : null}
        <div className="np-wizard-actions">
          <Button onClick={() => setStep(1)}>{t('providers.back')}</Button>
          <Button disabled={test.busy || (needsKey(provider) && !key.trim())} onClick={() => void runTest()}>
            {test.busy ? t('providers.testing') : t('providers.test')}
          </Button>
          <Button variant="primary" disabled={!test.ok} onClick={() => void finish()}>{t('providers.continue')}</Button>
        </div>
        {test.ok === true ? <p className="np-tag np-tag--ok" role="status">{t('providers.testOk', { ms: formatNumber(test.latencyMs) })}</p> : null}
        {test.ok === false ? <p className="np-agent-error" role="alert">{t('providers.testFail', { message: test.error ?? '' })}</p> : null}
      </div>
    );
  }

  const assignments = Object.keys(ai.assignments).length ? ai.assignments : autoAssign(registry, [...new Set([...ai.connected])], ai.preset, Object.fromEntries(Object.entries({ ollama: local.ollama, lmstudio: local.lmstudio }).filter(([, v]) => v?.length)) as Record<string, string[]>);
  const est = estimateAnalysis(registry, assignments, SAMPLE, 5);
  return (
    <div className="np-wizard">
      <h2>{t('providers.doneTitle', { name: provider?.name ?? '' })}</h2>
      <p className="np-muted">{t('providers.doneSub')}</p>
      <table className="np-table">
        <tbody>
          {describeAssignment(registry, assignments).map((r) => {
            const usd = est.perStage.find((x) => x.stage === r.stage)?.usd;
            return (
              <tr key={r.stage}>
                <td>{t(`analysis.stage.${r.stage}`)}</td>
                <td>{r.modelName}</td>
                <td>{r.local ? t('providers.where.local') : r.providerName}</td>
                <td className="np-num">{usd === null || usd === undefined ? t('providers.priceUnknown') : formatCurrency(usd, 'USD')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>{t('providers.estimate', { total: formatCurrency(est.totalUsd, 'USD') })}{est.unknown ? ` ${t('providers.estimateUnknown')}` : ''}</p>
      <div className="np-wizard-actions">
        <Button onClick={() => (setProvider(null), setKey(''), setStep(1))}>{t('providers.another')}</Button>
        <Button variant="primary" onClick={onDone}>{t('providers.done')}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Sección de Ajustes › IA**

`apps/ui/src/features/providers/AiSection.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { autoAssign, describeAssignment, PRESETS, type Assignments, type Registry, type StageId } from '@newpaper/pipeline';
import { Button, SegmentedControl } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { MonthUsage } from '../../ipc/types';
import { parseInternalUrl } from '../../shell/internalUrl';
import { openInternal } from '../../shell/navigate';
import { useActiveTab } from '../../state/browser';
import { getRegistry, useAiSettings } from '../ai/pipeline';
import { ConnectWizard } from './ConnectWizard';

export function AiSection() {
  const { t, formatCurrency } = useI18n();
  const ai = useAiSettings();
  const tab = useActiveTab();
  const connecting = parseInternalUrl(tab?.url ?? '')?.path[1] === 'conectar';
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [usage, setUsage] = useState<MonthUsage | null>(null);
  const [local, setLocal] = useState<Record<string, string[]>>({});

  useEffect(() => {
    void getRegistry().then(setRegistry);
    void commands.usageMonth().then(setUsage).catch(() => {});
    void commands.aiLocalProbe().then((p) => setLocal(Object.fromEntries(Object.entries(p).filter(([, v]) => v?.length)) as Record<string, string[]>)).catch(() => {});
  }, []);

  if (connecting) return <ConnectWizard onDone={() => void openInternal('ajustes', ['ia'])} />;
  if (!registry) return null;
  const auto = autoAssign(registry, [...ai.connected, ...Object.keys(local)], ai.preset, local);
  const manual = Object.keys(ai.assignments).length > 0;
  const effective: Assignments = manual ? ai.assignments : auto;
  const options = [...ai.connected, ...Object.keys(local)].flatMap((pid) => {
    const p = registry.get(pid);
    if (!p) return [];
    const models = local[pid] ?? p.models.map((m) => m.id);
    return models.map((m) => ({ value: `${pid}/${m}`, label: `${p.name} · ${registry.model(pid, m)?.name ?? m}` }));
  });
  const setStage = (stage: StageId, value: string) => {
    const [provider, ...rest] = value.split('/');
    void ai.setAssignments({ ...effective, [stage]: { provider: provider!, model: rest.join('/') } });
  };
  const disconnect = async (id: string) => {
    await commands.secretDelete(`ai.${id}`);
    await ai.setConnected(ai.connected.filter((x) => x !== id));
  };

  return (
    <div className="np-ai-section">
      <h3>{t('providers.connected')}</h3>
      {ai.connected.length === 0 && Object.keys(local).length === 0 ? <p className="np-muted">{t('providers.noneConnected')}</p> : null}
      <ul className="np-ai-connected">
        {ai.connected.map((id) => (
          <li key={id}>
            <span>{registry.get(id)?.name ?? id}</span>
            <Button variant="quiet" onClick={() => void disconnect(id)}>{t('providers.disconnect')}</Button>
          </li>
        ))}
        {Object.keys(local).map((id) => (
          <li key={id}>
            <span>{registry.get(id)?.name ?? id}</span>
            <span className="np-tag np-tag--ok">{t('providers.detectedLocal', { n: local[id]!.length })}</span>
          </li>
        ))}
      </ul>
      <Button variant="primary" onClick={() => void openInternal('ajustes', ['ia', 'conectar'])}>{t('providers.connectOne')}</Button>

      <h3>{t('providers.pipeline')}</h3>
      <SegmentedControl label={t('providers.preset.label')} value={ai.preset} onChange={(v) => void ai.setPreset(v)} options={PRESETS.map((p) => ({ value: p.id, label: t(`providers.preset.${p.id}`) }))} />
      <p className="np-muted">{t(`providers.presetHint.${ai.preset}`)}</p>
      <table className="np-table">
        <thead>
          <tr>
            <th scope="col">{t('providers.stage')}</th>
            <th scope="col">{t('providers.model')}</th>
          </tr>
        </thead>
        <tbody>
          {describeAssignment(registry, effective).map((r) => (
            <tr key={r.stage}>
              <td>{t(`analysis.stage.${r.stage}`)}</td>
              <td>
                <select aria-label={t('providers.modelFor', { stage: t(`analysis.stage.${r.stage}`) })} value={`${effective[r.stage]!.provider}/${effective[r.stage]!.model}`} onChange={(e) => setStage(r.stage, e.target.value)}>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {manual ? <Button variant="quiet" onClick={() => void ai.setAssignments({})}>{t('providers.backToAuto')}</Button> : <p className="np-muted">{t('providers.auto')}</p>}

      <h3>{t('providers.budget')}</h3>
      <label className="np-field">
        <span>{t('providers.limit')}</span>
        <input
          type="number"
          min={0}
          step={1}
          value={ai.monthlyLimitUsd ?? ''}
          onChange={(e) => void ai.setMonthlyLimitUsd(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
        />
        <span className="np-muted">{t('providers.limitHint')}</span>
      </label>
      {usage ? <p>{t('providers.spent', { amount: formatCurrency(usage.cost, 'USD') })}</p> : null}
    </div>
  );
}
```

`apps/ui/src/features/providers/providers.css`:
```css
.np-wizard, .np-ai-section { display: grid; gap: 12px; font: 14px/1.5 var(--np-font-ui); }
.np-wizard h2 { font: 600 20px var(--np-font-ui); margin: 0; }
.np-wizard h3, .np-ai-section h3 { font: 600 11px var(--np-font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--np-muted); margin: 8px 0 0; }
.np-wizard-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
.np-wizard-card { display: grid; gap: 4px; min-height: var(--np-hit); padding: 12px; border: 1px solid var(--np-line3); border-radius: var(--np-radius); background: var(--np-card); text-align: left; font: inherit; color: var(--np-ink); cursor: pointer; }
.np-wizard-card--big { padding: 16px; }
.np-wizard-card:hover, .np-wizard-card:focus-visible { border-color: var(--np-accent); }
.np-wizard-key, .np-field { display: grid; gap: 4px; }
.np-wizard-key input, .np-field input, .np-ai-section select { min-height: var(--np-hit); padding: 0 10px; border: 1px solid var(--np-line3); border-radius: 10px; background: var(--np-card); color: var(--np-ink); font: 14px var(--np-font-mono); }
.np-wizard-detected { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.np-wizard-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.np-ai-connected { list-style: none; padding: 0; display: grid; gap: 4px; }
.np-ai-connected li { display: flex; justify-content: space-between; align-items: center; min-height: var(--np-hit); }
```

`apps/ui/src/features/providers/register.ts`:
```ts
import { registerSettingsSection } from '../../shell/registry';
import { AiSection } from './AiSection';
import { AnalysisSettingsSection } from './AnalysisSettingsSection';
import './providers.css';

registerSettingsSection({ id: 'ia', order: 40, titleKey: 'settings.ai.title', descriptionKey: 'settings.ai.description', Component: AiSection });
registerSettingsSection({ id: 'analisis', order: 45, titleKey: 'settings.analysis.title', descriptionKey: 'settings.analysis.description', Component: AnalysisSettingsSection });
```

Añade a `apps/ui/src/features/index.ts`: `import './providers/register';`

> La sección `ia` lee la URL de la pestaña activa: `newpaper://ajustes/ia/conectar` muestra el asistente dentro de la propia sección, sin tocar la página de Ajustes del subproyecto 1.

- [ ] **Step 3: Sección Ajustes › Análisis**

`apps/ui/src/features/providers/AnalysisSettingsSection.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { Switch } from '@newpaper/ui-kit';
import { useAiSettings } from '../ai/pipeline';

export function AnalysisSettingsSection() {
  const t = useT();
  const ai = useAiSettings();
  return (
    <div className="np-ai-section">
      <Switch checked={ai.quickOnOpen} onChange={(v) => void ai.setQuickOnOpen(v)} label={t('settings.analysis.quickOnOpen')} description={t('settings.analysis.quickOnOpenHint')} />
      <Switch checked={ai.autoFull} onChange={(v) => void ai.setAutoFull(v)} label={t('settings.analysis.autoFull')} description={t('settings.analysis.autoFullHint')} />
      <Switch checked={ai.detector} onChange={(v) => void ai.setDetector(v)} label={t('settings.analysis.detector')} description={t('settings.analysis.detectorHint')} />
      <p className="np-muted">{t('settings.analysis.language')}</p>
    </div>
  );
}
```

> `ai.detector = false` oculta el bloque de autoría IA de la pestaña Análisis (Tarea 13).

- [ ] **Step 4: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/features
git commit -m "feat(ui): three-step provider wizard with key detection and ai pipeline and analysis settings"
```

---

### Task 18: Historial — `newpaper://historial` agrupado por día

**Files:**
- Create: `apps/ui/src/features/history/groupByDay.ts`, `apps/ui/src/features/history/HistoryPage.tsx`, `apps/ui/src/features/history/register.ts`, `apps/ui/src/features/history/history.css`
- Modify: `apps/ui/src/features/index.ts`
- Test: `apps/ui/src/features/history/groupByDay.test.ts`

**Interfaces:**
- Consumes: `commands.{historySearch, historyDelete}`, `HistoryEntry`, `HistoryFilter`, `DeleteScope` (1), `useSetting` (`history.paused`, `history.retentionDays`).
- Produces:
  - `DayGroup { key: 'YYYY-MM-DD'; kind: 'today' | 'yesterday' | 'date'; date: Date; items: HistoryEntry[] }`, `groupByDay(entries, now: Date): DayGroup[]` (hora local; grupos y elementos de más reciente a más antiguo)
  - `rangeFor(kind: 'hour' | 'today' | 'week', now): { from; to }`
  - Página interna `historial`: búsqueda (FTS5 en Rust), filtros por tipo (todo, visitas, búsquedas, análisis) y por medio, grupos por día, abrir una entrada (si estaba analizada, la caché devuelve el análisis), borrar una, por rango, por medio o todo; aviso de pausa con "Reanudar"; retención

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/history/groupByDay.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../ipc/types';
import { groupByDay, rangeFor } from './groupByDay';

const e = (id: string, at: Date): HistoryEntry => ({ id, kind: 'visit', url: `https://d.example/${id}`, title: id, outlet: null, query: null, source: null, analyzed: false, at: at.getTime() });

describe('groupByDay', () => {
  it('groups by local calendar day, newest first, with today and yesterday', () => {
    const now = new Date(2026, 9, 8, 10, 0);
    const groups = groupByDay(
      [e('a', new Date(2026, 9, 8, 0, 5)), e('b', new Date(2026, 9, 7, 23, 59)), e('c', new Date(2026, 9, 8, 9, 0)), e('d', new Date(2026, 8, 30, 12, 0))],
      now,
    );
    expect(groups.map((g) => [g.key, g.kind, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-08', 'today', ['c', 'a']],
      ['2026-10-07', 'yesterday', ['b']],
      ['2026-09-30', 'date', ['d']],
    ]);
  });

  it('computes deletion ranges in local time', () => {
    const now = new Date(2026, 9, 8, 10, 30);
    expect(rangeFor('today', now)).toEqual({ from: new Date(2026, 9, 8).getTime(), to: now.getTime() });
    expect(rangeFor('hour', now).from).toBe(now.getTime() - 3_600_000);
    expect(rangeFor('week', now).from).toBe(new Date(2026, 9, 1, 10, 30).getTime());
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/history/groupByDay.test.ts`
Expected: FAIL (`Cannot find module './groupByDay'`).

- [ ] **Step 3: Implementación**

`apps/ui/src/features/history/groupByDay.ts`:
```ts
import type { HistoryEntry } from '../../ipc/types';

export interface DayGroup { key: string; kind: 'today' | 'yesterday' | 'date'; date: Date; items: HistoryEntry[] }

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function groupByDay(entries: HistoryEntry[], now: Date): DayGroup[] {
  const today = dayKey(now);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = dayKey(y);
  const map = new Map<string, DayGroup>();
  for (const it of [...entries].sort((a, b) => b.at - a.at)) {
    const d = new Date(it.at);
    const key = dayKey(d);
    let g = map.get(key);
    if (!g) {
      g = { key, kind: key === today ? 'today' : key === yesterday ? 'yesterday' : 'date', date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] };
      map.set(key, g);
    }
    g.items.push(it);
  }
  return [...map.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function rangeFor(kind: 'hour' | 'today' | 'week', now: Date): { from: number; to: number } {
  const to = now.getTime();
  if (kind === 'hour') return { from: to - 3_600_000, to };
  if (kind === 'today') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), to };
  return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).getTime(), to };
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/history/groupByDay.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Página**

`apps/ui/src/features/history/HistoryPage.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { Button, IconButton, SegmentedControl } from '@newpaper/ui-kit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { HistoryEntry, HistoryFilter } from '../../ipc/types';
import { IconClose } from '../../shell/icons';
import { navigate } from '../../shell/navigate';
import { useSetting } from '../../state/settings';
import { groupByDay, rangeFor } from './groupByDay';

type Kind = 'all' | 'visit' | 'search' | 'analysis';

export function HistoryPage() {
  const { t, formatDate } = useI18n();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [outlet, setOutlet] = useState<string>('');
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [paused, setPaused] = useSetting<boolean>('history.paused', false);
  const [retention, setRetention] = useSetting<number | null>('history.retentionDays', 90);

  const load = useCallback(async () => {
    const f: HistoryFilter = { limit: 500 };
    if (text.trim()) f.text = text.trim();
    if (kind !== 'all') f.kind = kind;
    if (outlet) f.outlet = outlet;
    setItems(await commands.historySearch(f));
  }, [text, kind, outlet]);

  useEffect(() => {
    const h = setTimeout(() => void load(), 200);
    return () => clearTimeout(h);
  }, [load]);

  const outlets = useMemo(() => [...new Set(items.map((i) => i.outlet).filter((o): o is string => !!o))].sort(), [items]);
  const groups = useMemo(() => groupByDay(items, new Date()), [items]);
  const del = async (scope: Parameters<typeof commands.historyDelete>[0]) => {
    await commands.historyDelete(scope);
    await load();
  };
  const open = (e: HistoryEntry) => void navigate(e.kind === 'visit' ? e.url! : e.query!);

  return (
    <div className="np-history">
      <h1>{t('history.title')}</h1>
      {paused ? (
        <p className="np-hint" role="status">
          {t('history.paused')} <Button variant="quiet" onClick={() => void setPaused(false)}>{t('history.resume')}</Button>
        </p>
      ) : null}
      <label className="np-sr-only" htmlFor="np-history-q">{t('history.search')}</label>
      <input id="np-history-q" className="np-history-search" type="search" placeholder={t('history.search')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="np-history-filters">
        <SegmentedControl label={t('history.kind.label')} value={kind} onChange={setKind} options={(['all', 'visit', 'search', 'analysis'] as const).map((k) => ({ value: k, label: t(`history.kind.${k}`) }))} />
        <select aria-label={t('history.outlet')} value={outlet} onChange={(e) => setOutlet(e.target.value)}>
          <option value="">{t('history.allOutlets')}</option>
          {outlets.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {groups.length === 0 ? <p className="np-panel-empty">{text ? t('history.noResults') : t('history.empty')}</p> : null}
      {groups.map((g) => (
        <section key={g.key} className="np-history-day">
          <h2>{g.kind === 'date' ? formatDate(g.date, { dateStyle: 'full' }) : t(`history.${g.kind}`)}</h2>
          <ul>
            {g.items.map((it) => (
              <li key={it.id} className="np-history-row">
                <span className="np-mono np-muted">{formatDate(new Date(it.at), { timeStyle: 'short' })}</span>
                <button type="button" className="np-link np-history-open" onClick={() => open(it)}>
                  {it.kind === 'search' ? t('history.searched', { query: it.query ?? '' }) : it.title || it.url}
                </button>
                {it.outlet ? <span className="np-mono np-muted">{it.outlet}</span> : <span />}
                {it.analyzed ? <span className="np-tag np-tag--accent">{t('history.analyzed')}</span> : <span />}
                <IconButton label={t('history.deleteOne')} icon={<IconClose />} onClick={() => void del({ scope: 'one', id: it.id })} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="np-history-settings">
        <h2>{t('history.manage')}</h2>
        <div className="np-history-actions">
          {(['hour', 'today', 'week'] as const).map((r) => (
            <Button key={r} onClick={() => void del({ scope: 'range', ...rangeFor(r, new Date()) })}>{t(`history.delete.${r}`)}</Button>
          ))}
          {outlet ? <Button onClick={() => void del({ scope: 'outlet', outlet })}>{t('history.delete.outlet', { outlet })}</Button> : null}
          <Button variant="danger" onClick={() => void del({ scope: 'all' })}>{t('history.delete.all')}</Button>
        </div>
        <label className="np-field">
          <span>{t('history.retention')}</span>
          <select value={retention === null ? 'forever' : String(retention)} onChange={(e) => void setRetention(e.target.value === 'forever' ? null : Number(e.target.value))}>
            {[7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>{t('history.days', { n: d })}</option>
            ))}
            <option value="forever">{t('history.forever')}</option>
          </select>
        </label>
        <Button variant="quiet" onClick={() => void setPaused(!paused)}>{paused ? t('history.resume') : t('history.pause')}</Button>
        <p className="np-muted">{t('history.privateNote')}</p>
      </section>
    </div>
  );
}
```

`apps/ui/src/features/history/history.css`:
```css
.np-history { max-width: 80ch; margin: 0 auto; padding: 32px 20px 64px; display: grid; gap: 14px; font: 14px/1.5 var(--np-font-ui); }
.np-history h1 { font: 600 28px var(--np-font-read); margin: 0; }
.np-history h2 { font: 600 12px var(--np-font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--np-muted); margin: 0 0 6px; }
.np-history-search { min-height: var(--np-hit); padding: 0 14px; border: 1px solid var(--np-line3); border-radius: 999px; background: var(--np-card); font: 15px var(--np-font-ui); color: var(--np-ink); }
.np-history-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.np-history-filters select, .np-history-settings select { min-height: var(--np-hit); border: 1px solid var(--np-line3); border-radius: 10px; background: var(--np-card); color: var(--np-ink); }
.np-history-day ul { list-style: none; padding: 0; margin: 0; }
.np-history-row { display: grid; grid-template-columns: 56px 1fr auto auto 44px; gap: 8px; align-items: center; min-height: var(--np-hit); border-bottom: 1px solid var(--np-line2); }
.np-history-open { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-history-actions { display: flex; flex-wrap: wrap; gap: 8px; }
```

`apps/ui/src/features/history/register.ts`:
```ts
import { registerInternalPage } from '../../shell/registry';
import { HistoryPage } from './HistoryPage';
import './history.css';

registerInternalPage('historial', HistoryPage);
```

Añade a `apps/ui/src/features/index.ts`: `import './history/register';`

> `HistoryFilter.kind = 'analysis'` lo resuelve Rust (subproyecto 1) devolviendo visitas con `analyzed = true`.

- [ ] **Step 6: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```powershell
git add apps/ui/src/features
git commit -m "feat(ui): history page grouped by local day with filters, deletion, pause and retention"
```

---

### Task 19: Nueva pestaña — saludo, buscador, briefing, temas, continuar y resultados

**Files:**
- Create: `apps/ui/src/features/newtab/NewTabPage.tsx`, `apps/ui/src/features/newtab/register.ts`, `apps/ui/src/features/newtab/newtab.css`
- Modify: `apps/ui/src/features/index.ts`

**Interfaces:**
- Consumes: `commands.{omniboxSuggest, eventsBriefing, eventsSearch, eventDetail, topicsList, topicSetFollowing, savedList, historySearch, watchAdd}`, `navigate`, `ConsentDialog`, `UnverifiedCard` (T10), `getPipeline`.
- Produces: página interna `inicio` (sustituye la provisional; se registra después del núcleo, así que gana). Con `?q=` muestra los hechos que coinciden y, si no hay, "Ningún medio ha cubierto…" con vigilar e investigar (confirmación obligatoria).

- [ ] **Step 1: Página**

`apps/ui/src/features/newtab/NewTabPage.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState, type FormEvent } from 'react';
import { commands } from '../../ipc/commands';
import type { EventCard, HistoryEntry, SavedArticle, Suggestion, TopicState } from '../../ipc/types';
import type { InternalPageProps } from '../../shell/registry';
import { navigate } from '../../shell/navigate';
import { getPipeline } from '../ai/pipeline';
import { ConsentDialog } from '../analysis/nocoverage/ConsentDialog';
import { UnverifiedCard } from '../analysis/nocoverage/UnverifiedCard';

const greetingKey = (h: number) => (h < 6 ? 'night' : h < 13 ? 'morning' : h < 21 ? 'afternoon' : 'evening');

function LeanMix({ mix, label }: { mix: [number, number, number]; label: string }) {
  const total = mix[0] + mix[1] + mix[2] || 1;
  return (
    <span className="np-leanmix" role="img" aria-label={label}>
      <span className="np-leanmix-l" style={{ width: `${(mix[0] / total) * 100}%` }} />
      <span className="np-leanmix-c" style={{ width: `${(mix[1] / total) * 100}%` }} />
      <span className="np-leanmix-r" style={{ width: `${(mix[2] / total) * 100}%` }} />
    </span>
  );
}

async function openEvent(id: number) {
  const d = await commands.eventDetail(id);
  const first = d?.articles.find((a) => a.bucket === 'center') ?? d?.articles[0];
  if (first) void navigate(first.url);
}

function Cards({ cards }: { cards: EventCard[] }) {
  const { t, formatRelativeDays } = useI18n();
  return (
    <ul className="np-cards">
      {cards.map((c) => (
        <li key={c.eventId}>
          <button type="button" className="np-card" onClick={() => void openEvent(c.eventId)}>
            <span className="np-card-title">{c.title}</span>
            <span className="np-card-meta">
              {t('newtab.outlets', { n: c.outletCount })} · {formatRelativeDays(Math.round((c.latestAt - Date.now()) / 86_400_000))}
            </span>
            <LeanMix mix={c.leanMix} label={t('newtab.leanMix', { left: c.leanMix[0], center: c.leanMix[1], right: c.leanMix[2] })} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NewTabPage({ url }: InternalPageProps) {
  const { t, formatDate } = useI18n();
  const q = url.query.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [briefing, setBriefing] = useState<EventCard[]>([]);
  const [results, setResults] = useState<EventCard[] | null>(null);
  const [topics, setTopics] = useState<TopicState[]>([]);
  const [saved, setSaved] = useState<SavedArticle[]>([]);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [asking, setAsking] = useState(false);
  const [report, setReport] = useState<UnverifiedReport | null>(null);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    void commands.eventsBriefing(6).then(setBriefing).catch(() => {});
    void commands.topicsList().then(setTopics).catch(() => {});
    void commands.savedList().then((s) => setSaved(s.slice(0, 4))).catch(() => {});
    void commands.historySearch({ kind: 'visit', limit: 4 }).then(setRecent).catch(() => {});
  }, []);
  useEffect(() => {
    setResults(null);
    setReport(null);
    setWatching(false);
    if (q) void commands.eventsSearch(q).then(setResults).catch(() => setResults([]));
  }, [q]);
  useEffect(() => {
    if (!input.trim() || input === q) return setSuggestions([]);
    const h = setTimeout(() => void commands.omniboxSuggest(input).then((s) => setSuggestions(s.slice(0, 6))), 120);
    return () => clearTimeout(h);
  }, [input, q]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) void navigate(input.trim());
  };
  const investigate = async (acknowledged: true) => {
    setAsking(false);
    const p = await getPipeline();
    setReport(await p.investigateUncovered({ article: { url: `newpaper://inicio?q=${encodeURIComponent(q)}`, title: q, text: q }, previous: null, acknowledged }));
  };
  const now = new Date();

  return (
    <div className="np-newtab">
      <header>
        <p className="np-mono np-muted">{formatDate(now, { dateStyle: 'full' })}</p>
        <h1>{t(`newtab.greeting.${greetingKey(now.getHours())}`)}</h1>
      </header>
      <form className="np-newtab-search" role="search" onSubmit={submit}>
        <label className="np-sr-only" htmlFor="np-newtab-q">{t('newtab.search')}</label>
        <input id="np-newtab-q" type="search" autoComplete="off" placeholder={t('newtab.search')} value={input} onChange={(e) => setInput(e.target.value)} />
        {suggestions.length ? (
          <ul className="np-newtab-suggest" role="listbox" aria-label={t('shell.address.suggestions')}>
            {suggestions.map((s) => (
              <li key={`${s.kind}-${s.value}`} role="option" aria-selected={false}>
                <button type="button" onClick={() => void navigate(s.value)}>
                  <span className="np-tag np-tag--muted">{t(`shell.address.kind.${s.kind}`)}</span> {s.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {q ? (
        <section aria-label={t('newtab.results', { query: q })}>
          <h2>{t('newtab.results', { query: q })}</h2>
          {results === null ? <p className="np-muted" aria-busy="true">{t('newtab.searching')}</p> : null}
          {results?.length ? <Cards cards={results} /> : null}
          {results && results.length === 0 ? (
            <div className="np-nocov">
              <p>{t('newtab.noCoverage', { query: q })}</p>
              <div className="np-nocov-actions">
                <Button disabled={watching} onClick={() => void commands.watchAdd({ query: q }).then(() => setWatching(true))}>
                  {watching ? t('noCoverage.watching') : t('noCoverage.watch')}
                </Button>
                <Button variant="primary" onClick={() => setAsking(true)}>{t('noCoverage.investigate')}</Button>
              </div>
              {report ? <UnverifiedCard report={report} /> : null}
              <ConsentDialog open={asking} onConfirm={(ack) => void investigate(ack)} onCancel={() => setAsking(false)} />
            </div>
          ) : null}
        </section>
      ) : null}

      {briefing.length ? (
        <section>
          <h2>{t('newtab.briefing')}</h2>
          <Cards cards={briefing} />
        </section>
      ) : null}

      {topics.length ? (
        <section>
          <h2>{t('newtab.topics')}</h2>
          <div className="np-topics">
            {topics.map((tp) => (
              <button
                key={tp.id}
                type="button"
                className="np-topic"
                aria-pressed={tp.following}
                onClick={() => void commands.topicSetFollowing(tp.id, !tp.following).then(setTopics)}
              >
                {tp.name}
                {tp.newCount ? <span className="np-tab-badge">{tp.newCount}</span> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {saved.length || recent.length ? (
        <section>
          <h2>{t('newtab.continue')}</h2>
          <ul className="np-continue">
            {saved.map((s) => (
              <li key={s.url}>
                <button type="button" className="np-link" onClick={() => void navigate(s.url)}>{s.title}</button>
                <span className="np-tag np-tag--accent">{t('newtab.saved')}</span>
              </li>
            ))}
            {recent.map((r) => (
              <li key={r.id}>
                <button type="button" className="np-link" onClick={() => void navigate(r.url!)}>{r.title || r.url}</button>
                {r.outlet ? <span className="np-mono np-muted">{r.outlet}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
```

`apps/ui/src/features/newtab/newtab.css`:
```css
.np-newtab { max-width: 760px; margin: 0 auto; padding: 48px 20px 64px; display: grid; gap: 24px; font: 14px/1.5 var(--np-font-ui); }
.np-newtab h1 { font: 500 36px/1.15 var(--np-font-read); margin: 4px 0 0; }
.np-newtab h2 { font: 600 11px var(--np-font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--np-muted); margin: 0 0 8px; }
.np-newtab-search { position: relative; }
.np-newtab-search input { width: 100%; min-height: 52px; padding: 0 20px; border: 1px solid var(--np-line3); border-radius: 999px; background: var(--np-card); font: 17px var(--np-font-ui); color: var(--np-ink); box-sizing: border-box; }
.np-newtab-suggest { position: absolute; left: 0; right: 0; top: 56px; z-index: 3; list-style: none; margin: 0; padding: 6px; border-radius: 14px; background: var(--np-card); box-shadow: 0 10px 30px rgb(0 0 0 / .12); }
.np-newtab-suggest button { width: 100%; min-height: var(--np-hit); border: 0; background: none; text-align: left; font: 14px var(--np-font-ui); color: var(--np-ink); cursor: pointer; border-radius: 8px; }
.np-newtab-suggest button:hover, .np-newtab-suggest button:focus-visible { background: var(--np-soft); }
.np-cards { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.np-card { width: 100%; display: grid; gap: 6px; padding: 14px; border: 1px solid var(--np-line); border-radius: var(--np-radius); background: var(--np-card); text-align: left; cursor: pointer; color: var(--np-ink); }
.np-card-title { font: 600 16px/1.3 var(--np-font-read); }
.np-card-meta { font: 11px var(--np-font-mono); color: var(--np-muted); }
.np-leanmix { display: flex; height: 4px; border-radius: 2px; overflow: hidden; background: var(--np-soft); }
.np-leanmix-l { background: var(--np-left); } .np-leanmix-c { background: var(--np-center); } .np-leanmix-r { background: var(--np-right); }
.np-topics { display: flex; flex-wrap: wrap; gap: 8px; }
.np-topic { min-height: var(--np-hit); padding: 0 14px; border: 1px solid var(--np-line3); border-radius: 999px; background: var(--np-card); font: 13px var(--np-font-ui); cursor: pointer; }
.np-topic[aria-pressed='true'] { background: var(--np-ink); color: var(--np-on-ink); border-color: var(--np-ink); }
.np-continue { list-style: none; padding: 0; display: grid; gap: 6px; }
.np-continue li { display: flex; justify-content: space-between; gap: 8px; min-height: var(--np-hit); align-items: center; }
```

`apps/ui/src/features/newtab/register.ts`:
```ts
import { registerInternalPage } from '../../shell/registry';
import { NewTabPage } from './NewTabPage';
import './newtab.css';

// Sustituye la página `inicio` provisional del subproyecto 1 (se importa después de `core`).
registerInternalPage('inicio', NewTabPage);
```

Añade a `apps/ui/src/features/index.ts` (después de `./core/register`): `import './newtab/register';`

> Si el registro del subproyecto 1 rechaza registrar dos veces la misma página, cambia `registerInternalPage` para que la última gane (es un `Map.set`).

- [ ] **Step 2: Comprobar que compila**

Run:
```powershell
pnpm --filter @newpaper/ui typecheck
pnpm --filter @newpaper/ui test
```
Expected: sin errores; el test de `App` del subproyecto 1 que busca el título provisional de Inicio deja de aplicarse: actualízalo para que busque el campo `role="search"` de la nueva pestaña.

- [ ] **Step 3: Commit**

```powershell
git add apps/ui/src/features
git commit -m "feat(ui): new tab with greeting, suggestions, briefing, followed topics, continue reading and search results"
```

---

### Task 20: e2e — noticia de prueba, proveedor simulado, análisis, sin cobertura y agente

**Files:**
- Create: `e2e/fixtures/mockLlm.ts`, `e2e/fixtures/smi.html`, `e2e/specs/analysis.e2e.ts`
- Modify: `e2e/wdio.conf.ts`

**Interfaces:**
- Consumes: `e2e/helpers.ts` (`switchToUi`, `uiInvoke`, `FIXTURE_URL`), comandos `ai_set_endpoints`, `settings_set`, `secret_set`, `tab_open`, `tab_set_view`.
- Produces: servidor `http://127.0.0.1:4568/v1/chat/completions` compatible con OpenAI que responde según la etapa (afirmaciones, propuestas de URL, veredictos, juez, síntesis, investigación y agente en streaming) y la especificación e2e de §12 ("análisis rápido, completo con proveedor simulado, preguntar por selección").

- [ ] **Step 1: Proveedor simulado**

`e2e/fixtures/mockLlm.ts`:
```ts
import { createServer, type Server } from 'node:http';

const ok = (o: unknown) => JSON.stringify(o);

/** Respuesta estructurada según el mensaje de sistema de cada etapa (subproyecto 4). */
function answer(system: string): string {
  if (system.includes('Return only loaded phrases') || system.includes("List the article's claims")) {
    return ok({
      claims: [{ id: 'x', quote: 'ha crecido un 61 %', span: [0, 0], kind: 'cifra', checkable: true }],
      loadedPhrases: [{ quote: 'fiel a su costumbre', span: [0, 0], reason: 'Valorativo' }],
    });
  }
  if (system.includes('Propose up to')) return ok({ urls: [] });
  if (system.includes('You verify claims')) return ok({ verdicts: [{ claimId: 'c1', status: 'no_verificable', explanation: 'Sin fuentes recuperadas.', sourceIds: [] }] });
  if (system.includes('Score each observable signal')) {
    return ok({
      signals: [{ kind: 'adjetivacion', value: -0.6, evidence: ['fiel a su costumbre'] }, { kind: 'encuadre', value: -0.5, evidence: ['apocalipsis de empleo'] }],
      actors: [{ name: 'Sindicatos', quotes: 1, side: 'left' }],
      lastWordSide: 'left',
      omissions: [],
    });
  }
  if (system.includes('Write a neutral version')) {
    return ok({ headline: 'El Gobierno sube el SMI', summary3: ['Uno.', 'Dos.', 'Tres.'], facts: [], parties: [], disputes: [], unknowns: ['Efecto en el empleo'], visualizations: [], rewrites: [{ from: 'fiel a su costumbre', to: '', reason: 'Valorativo' }] });
  }
  if (system.includes('Almost nobody has covered')) {
    return ok({ unverified: true, confidence: 0.2, claims: [{ text: 'Sube el SMI', tag: 'fuente_unica', note: 'Un solo medio' }], howToCheck: ['Busca el real decreto en el BOE'], sources: [] });
  }
  if (system.includes('machine-generated')) return ok({ paragraphs: [] });
  return ok({});
}

export function startMockLlm(port = 4568): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (!req.url?.endsWith('/chat/completions')) return void res.writeHead(404).end();
      const r = JSON.parse(body) as { stream?: boolean; messages: { role: string; content: string | { text?: string }[] }[] };
      const system = r.messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join(''))).join('\n');
      const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      if (r.stream) {
        // Agente: texto con una cita que no corresponde a ninguna fuente recuperada ([1]) para comprobar que se elimina.
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const chunk = (delta: object, finish: string | null, extra: object = {}) =>
          res.write(`data: ${ok({ id: 'c', object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`);
        chunk({ role: 'assistant', content: 'La subida es reciente ' }, null);
        chunk({ content: '[1].' }, null);
        chunk({}, 'stop', { usage });
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        ok({ id: 'c', object: 'chat.completion', created: 0, model: 'mock', choices: [{ index: 0, message: { role: 'assistant', content: answer(system) }, finish_reason: 'stop' }], usage }),
      );
    });
  });
  return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)));
}
```

`e2e/fixtures/smi.html`:
```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>El salario mínimo bate récords | El Diario de Prueba</title>
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="El Diario de Prueba">
</head>
<body>
  <article>
    <h1>El salario mínimo bate récords mientras la patronal sigue en pie de guerra</h1>
    <p>El Consejo de Ministros ha aprobado este martes una subida del salario mínimo interprofesional que lo sitúa en el nivel más alto de toda Europa, una medida que según el ministerio beneficiará a 2,5 millones de trabajadores.</p>
    <p>Mientras tanto, la patronal, fiel a su costumbre, vuelve a anteponer sus beneficios a la dignidad de quienes sostienen el país, y amenaza con un apocalipsis de empleo que nunca llega.</p>
    <p>Desde 2018 el SMI ha crecido un 61 % sin que se haya destruido empleo, según fuentes sindicales consultadas por este diario.</p>
  </article>
</body>
</html>
```

En `e2e/wdio.conf.ts`, importa `startMockLlm` y arráncalo junto al servidor de fixtures:
```ts
import { startMockLlm } from './fixtures/mockLlm';
let llm: Server | undefined;
// en onPrepare, tras fixtures:
    llm = await startMockLlm();
// en onComplete:
  onComplete: () => {
    fixtures?.close();
    llm?.close();
  },
```

- [ ] **Step 2: Especificación**

`e2e/specs/analysis.e2e.ts`:
```ts
import { FIXTURE_URL, switchToUi, uiInvoke } from '../helpers';

const ref = { provider: 'custom', model: 'mock' };

describe('analysis experience', () => {
  before(async () => {
    await uiInvoke('settings_set', { key: 'general.locale', value: 'es' });
    await uiInvoke('ai_set_endpoints', { endpoints: [{ id: 'custom', name: 'Mock', baseUrl: 'http://127.0.0.1:4568/v1', models: ['mock'] }] });
    await uiInvoke('secret_set', { key: 'ai.custom', value: 'e2e-test-key' });
    await uiInvoke('settings_set', { key: 'ai.connected', value: ['custom'] });
    await uiInvoke('settings_set', {
      key: 'ai.assignments',
      value: { claims: ref, quickScore: ref, verify: ref, score: ref, synthesis: ref, agent: ref, investigate: ref },
    });
    await uiInvoke('settings_set', { key: 'ai.quickOnOpen', value: true });
  });

  it('runs quick then full analysis, shows the uncovered flow and asks the agent about a selection', async () => {
    const tab = await uiInvoke<{ id: number }>('tab_open', { url: FIXTURE_URL('smi.html') });
    await browser.pause(1500);
    await uiInvoke('tab_set_view', { tabId: tab.id, view: 'reader' });
    await switchToUi();

    // Análisis rápido automático: aparece la insignia de neutralidad en la barra.
    await $('.np-abtn-badge').waitForDisplayed({ timeout: 30_000 });

    // Análisis completo desde el lector.
    await $('button=Analizar').click();
    await $('.np-claim').waitForDisplayed({ timeout: 60_000 });
    expect(await $('.np-claim-quote').getText()).toContain('ha crecido un 61 %');
    await $('mark[data-mark="c1"]').waitForExist({ timeout: 10_000 });

    // Sin coberturas ni fuentes primarias: flujo de hecho sin cobertura con confirmación obligatoria.
    await $('button=Investigar de todos modos').click();
    const confirm = await $('button=Investigar sin verificar');
    expect(await confirm.isEnabled()).toBe(false);
    await $('.np-consent input[type="checkbox"]').click();
    await confirm.click();
    await $('.np-unverified').waitForDisplayed({ timeout: 30_000 });

    // Selección en el lector → Preguntar → el agente responde y la cita sin fuente desaparece.
    await browser.execute(() => {
      const mark = document.querySelector('mark[data-mark="l1"]')!;
      const range = document.createRange();
      range.selectNodeContents(mark);
      const sel = document.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await $('.np-seltool').waitForDisplayed({ timeout: 5_000 });
    await $('button=Preguntar').click();
    await $('#np-agent-q').setValue('¿Es una frase neutral?');
    await $('button=Enviar').click();
    await browser.waitUntil(async () => (await $$('.np-agent-msg--assistant')).length > 0 && (await $('.np-agent-msg--assistant').getText()).includes('La subida es reciente'), { timeout: 30_000 });
    const reply = await $('.np-agent-msg--assistant').getText();
    expect(reply).not.toContain('[1]');
    expect(await $$('.np-agent-msg--assistant .np-cite')).toHaveLength(0);

    await uiInvoke('tab_close', { tabId: tab.id });
  });
});
```

> El proveedor simulado escucha en `127.0.0.1`: es la aplicación del propio proyecto y una clave de prueba (`e2e-test-key`) generada para el e2e, que nunca sale del equipo.
> Si el proxy de IA del subproyecto 4 rechaza `http://` para el endpoint propio, permite `http` solo para `127.0.0.1`/`localhost` en `ProviderTable::set_custom` (los locales Ollama y LM Studio ya lo usan).

- [ ] **Step 3: Compilar y ejecutar**

Run:
```powershell
pnpm --filter @newpaper/ui build
cargo build --manifest-path src-tauri/Cargo.toml
pnpm e2e
```
Expected: `2 passing` (lector del subproyecto 1 y este escenario).

- [ ] **Step 4: Commit**

```powershell
git add e2e
git commit -m "test(e2e): analysis experience with a mock openai-compatible provider"
```

---

## Cobertura de la spec (autorrevisión)

| Requisito | Tarea |
|---|---|
| §8 panel Análisis / Coberturas / Agente con teclado completo | 1, 13, 14 |
| §8 lente de sesgo, eje de encuadre, afirmaciones | 4, 6, 13 |
| §5.2.1 posición relativa con franja, señales con evidencia, no determinable, léxico, controles (espejo, concordancia) | 3, 12, 13 |
| §6.5 selección → agente, modos, citas verificadas, visuales y medios de la fuente | 6, 9, 14 |
| §6.2 gráficos con fuente (barras, línea, rangos, apilado, matriz, tabla, mapa, hemiciclo) | 7, 8 |
| Hemiciclo del Congreso con constructor de mayorías | 8 |
| §8 síntesis Breve / Completa / Cambios, partes y disputa | 15 |
| §5.3 hemeroteca con línea de tiempo, A/B, tres modos y "Editada N veces sin aviso" | 16 |
| §6.4 hecho sin cobertura con confirmación en cada uso | 10, 19 |
| §6.3 detector con "indicio, no prueba" | 13 |
| §6.1.1 asistente de proveedores (Recomendados: ChatGPT y Nous Research), autodetección de clave, probar conexión, asignación automática | 17 |
| §6.2 configurador del pipeline (presets, por etapa, límite mensual, gasto) | 17 |
| §16 historial agrupado por día con filtros, borrado, pausa y retención | 18 |
| §8 nueva pestaña (saludo, buscador con sugerencias, briefing, temas, continuar) | 19 |
| §18 sin conexión: panel con caché, agente avisa | 9, 13 |
| §12 e2e: noticia de fixture, análisis rápido, completo con proveedor simulado, preguntar por selección | 20 |
| §14 textos en es/en/de | 2 |

**Fuera de este plan:** recorrido de bienvenida y sus marcas (subproyecto 6), páginas de error/404/cuelgue/sin conexión (6), Dispositivos y sincronización del historial (7), pantallas móviles (8).
