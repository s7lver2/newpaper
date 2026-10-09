import { useT } from '@newpaper/i18n/react';
import type { TabInfo } from '../../ipc/types';
import { useTabAnalysis } from './controller';
import { togglePanel, usePanel } from './panelStore';

const IconScales = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v16M5 8h14M7 8l-3 6a3 3 0 006 0L7 8zM17 8l-3 6a3 3 0 006 0l-3-6z" />
  </svg>
);

export function AnalysisButton({ tab }: { tab: TabInfo | null }) {
  const t = useT();
  const open = usePanel((s) => s.open);
  const a = useTabAnalysis(tab?.id ?? null);
  if (!tab || tab.kind !== 'web') return null;
  const busy = a?.phase === 'quick' || a?.phase === 'full';
  return (
    <button type="button" className="np-abtn" aria-pressed={open} aria-busy={busy || undefined} onClick={togglePanel} title={t('analysis.toolbar.title')}>
      <IconScales />
      <span>{t('analysis.toolbar.label')}</span>
    </button>
  );
}
