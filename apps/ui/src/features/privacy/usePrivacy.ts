import { commands } from '../../ipc/commands';
import { onAdblockBlocked, onAdblockCounts, onNetStatus } from '../../ipc/events';
import type { PrivacyStatus } from '../../ipc/types';
import { createStore } from '../../state/store';

interface PrivacyState {
  status: PrivacyStatus | null;
  tabs: Record<number, number>;
  today: number;
}

const EMPTY: PrivacyState = { status: null, tabs: {}, today: 0 };
export const privacyStore = createStore<PrivacyState>(EMPTY);
export const resetPrivacyStore = () => privacyStore.set(() => EMPTY);

export function applyBlocked(e: { tabId: number; tabCount: number }): void {
  privacyStore.set((p) => ({ ...p, tabs: { ...p.tabs, [e.tabId]: Math.max(p.tabs[e.tabId] ?? 0, e.tabCount) } }));
}

export function applyCounts(e: { tabs: Record<string, number>; today: number }): void {
  privacyStore.set((p) => {
    const tabs: Record<number, number> = {};
    for (const [k, v] of Object.entries(e.tabs)) tabs[Number(k)] = Math.max(p.tabs[Number(k)] ?? 0, v);
    return { ...p, tabs, today: e.today };
  });
}

export const applyStatus = (status: PrivacyStatus) => privacyStore.set({ status });

export async function startPrivacySync(): Promise<() => void> {
  const offs = await Promise.all([onNetStatus(applyStatus), onAdblockBlocked(applyBlocked), onAdblockCounts(applyCounts)]);
  applyStatus(await commands.privacyStatus());
  const counts = await commands.blockedCounts();
  privacyStore.set({ today: counts.today });
  return () => offs.forEach((f) => f());
}

export const usePrivacyStatus = () => privacyStore.use((s) => s.status);
export const useBlockedCount = (tabId: number | null) => privacyStore.use((s) => (tabId === null ? 0 : s.tabs[tabId] ?? 0));
export const useTodayBlocked = () => privacyStore.use((s) => s.today);
