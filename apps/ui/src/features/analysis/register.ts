import { commands } from '../../ipc/commands';
import { registerInternalPage, registerReaderView, registerShortcut, registerSidePanel, registerTabBadge, registerToolbarItem } from '../../shell/registry';
import { browserStore } from '../../state/browser';
import './analysis.css';
import './position.css';
import { AnalysisButton } from './AnalysisButton';
import { AnalysisPanel } from './AnalysisPanel';
import { AnalysisReader } from './AnalysisReader';
import { analysisStore, controller, startAutoAnalysis } from './controller';
import { openPanel } from './panelStore';
import { PositionPage } from './PositionPage';
import { AnalysisTabBadge } from './TabBadge';

registerReaderView(AnalysisReader);
registerSidePanel(AnalysisPanel);
registerTabBadge(AnalysisTabBadge);
registerInternalPage('analisis', PositionPage);
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

// Sin puente de eventos (p. ej. pruebas sin Tauri) no hay análisis automático; no debe romper el arranque.
void startAutoAnalysis().catch(() => undefined);
browserStore.subscribe(() => controller.prune(browserStore.get().snapshot.tabs.map((t) => t.id)));
