import { useEffect } from 'react';
import { commands } from '../../ipc/commands';
import { browserStore } from '../../state/browser';

export function useHistoryRecorder(): void {
  useEffect(() => {
    const recorded = new Set<string>();
    const check = () => {
      for (const t of browserStore.get().snapshot.tabs) {
        if (t.kind !== 'web' || t.loading || !t.title || t.failure) continue;
        const key = `${t.id}\u0000${t.url.split('#')[0]}`;
        if (recorded.has(key)) continue;
        recorded.add(key);
        void commands.historyRecordVisit(t.id, t.url, t.title);
      }
    };
    check();
    return browserStore.subscribe(check);
  }, []);
}
