import type { TabInfo } from '../../ipc/types';
import { latestResult, useTabAnalysis } from './controller';

/** Nota de neutralidad en la pestaña (mockup Main). */
export function AnalysisTabBadge({ tab }: { tab: TabInfo }) {
  const a = useTabAnalysis(tab.kind === 'web' ? tab.id : null);
  const n = latestResult(a)?.score?.neutrality;
  return n === undefined ? null : <span className="np-tab-score">{Math.round(n)}</span>;
}
