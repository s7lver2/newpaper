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
