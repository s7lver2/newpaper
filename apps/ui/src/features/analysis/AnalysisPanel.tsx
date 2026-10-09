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
