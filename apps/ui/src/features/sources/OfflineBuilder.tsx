import { useT } from '@newpaper/i18n/react';
import { useEffect, useState } from 'react';
import { onOfflineBuildRequested } from '../../ipc/events';
import { createStore } from '../../state/store';
import { buildEdition, realEditionDeps } from './buildEdition';

const buildStore = createStore<{ done: number; total: number; running: boolean; lastCount: number | null }>({ done: 0, total: 0, running: false, lastCount: null });

export async function requestEditionBuild(date = new Date().toISOString().slice(0, 10)): Promise<void> {
  if (buildStore.get().running) return;
  buildStore.set({ running: true, done: 0, total: 0, lastCount: null });
  try {
    const r = await buildEdition(date, realEditionDeps(), (done, total) => buildStore.set({ done, total }));
    buildStore.set({ lastCount: r.count });
  } finally {
    buildStore.set({ running: false });
  }
}

export const useEditionBuild = () => buildStore.use((s) => s);

export function OfflineBuilder() {
  const t = useT();
  const s = useEditionBuild();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const off = onOfflineBuildRequested((e) => void requestEditionBuild(e.date));
    return () => void off.then((f) => f());
  }, []);
  useEffect(() => {
    if (s.running) setVisible(true);
    else if (s.lastCount !== null) {
      const h = setTimeout(() => setVisible(false), 6000);
      return () => clearTimeout(h);
    }
  }, [s.running, s.lastCount]);
  if (!visible) return null;
  return (
    <p role="status" className="np-toast">
      {s.running ? t('sources.offline.building', { done: s.done, total: s.total }) : t('sources.offline.built', { count: s.lastCount ?? 0 })}
    </p>
  );
}
