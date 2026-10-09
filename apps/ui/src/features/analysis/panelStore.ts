import type { AgentMode } from '@newpaper/pipeline';
import { createStore } from '../../state/store';

export type PanelTab = 'analysis' | 'coverage' | 'agent';
export interface AgentSeed { fragment: string | null; mode: AgentMode; question: string | null }
export interface PanelState { open: boolean; tab: PanelTab; wide: boolean; lens: boolean; aiOpen: boolean; focusClaim: string | null; agentSeed: AgentSeed | null }

export const panelStore = createStore<PanelState>({ open: false, tab: 'analysis', wide: false, lens: true, aiOpen: false, focusClaim: null, agentSeed: null });

export function openPanel(tab: PanelTab, extra: Partial<PanelState> = {}): void {
  panelStore.set((s) => ({ ...s, open: true, tab, ...extra }));
}
export function closePanel(): void {
  panelStore.set((s) => ({ ...s, open: false, wide: false }));
}
export function togglePanel(): void {
  const s = panelStore.get();
  if (s.open) closePanel();
  else openPanel(s.tab);
}
export const usePanel = <S,>(selector: (s: PanelState) => S): S => panelStore.use(selector);
