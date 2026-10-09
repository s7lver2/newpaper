import { useT } from '@newpaper/i18n/react';
import { IconButton, Tabs } from '@newpaper/ui-kit';
import { IconClose } from '../../shell/icons';
import type { SidePanelProps } from '../../shell/registry';
import { AgentTab } from './agent/AgentTab';
import { AnalysisTab } from './AnalysisTab';
import { latestResult, useTabAnalysis } from './controller';
import { CoverageTab } from './CoverageTab';
import { closePanel, openPanel, panelStore, usePanel, type PanelTab } from './panelStore';
import { useAssigned } from './useTier';

export function AnalysisPanel({ tab }: SidePanelProps) {
  const t = useT();
  const open = usePanel((s) => s.open);
  const which = usePanel((s) => s.tab);
  const wide = usePanel((s) => s.wide);
  const a = useTabAnalysis(tab.id);
  const model = useAssigned('agent');
  if (!open) return null;
  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'analysis', label: t('analysis.panel.analysis') },
    { id: 'coverage', label: t('analysis.panel.coverage') },
    { id: 'agent', label: t('analysis.panel.agent') },
  ];
  const result = latestResult(a);
  const isWide = wide && which === 'agent';
  const toggleWide = (
    <IconButton label={isWide ? t('agent.narrow') : t('agent.wide')} pressed={isWide} icon={<span aria-hidden="true">⇔</span>} onClick={() => panelStore.set({ wide: !isWide })} />
  );
  return (
    <aside className={`np-side${isWide ? ' np-side--wide' : ''}`} aria-label={t('analysis.panel.label')} onKeyDown={(e) => e.key === 'Escape' && closePanel()}>
      {isWide ? (
        <header className="np-side-head np-side-head--agent">
          <div className="np-side-agent-title">
            <strong>{t('agent.title')}</strong>
            <span>{t('agent.context', { coverages: result?.coverage?.coverages.length ?? 0, sources: result?.sources.length ?? 0 })}</span>
          </div>
          {model ? <span className="np-side-model">{model.model}</span> : null}
          {toggleWide}
          <IconButton label={t('analysis.panel.close')} icon={<IconClose />} onClick={closePanel} />
        </header>
      ) : (
        <header className="np-side-head">
          <Tabs tabs={tabs} active={which} onChange={(id) => openPanel(id)} label={t('analysis.panel.label')} idPrefix="np-panel" />
          {which === 'agent' ? toggleWide : null}
          <IconButton label={t('analysis.panel.close')} icon={<IconClose />} onClick={closePanel} />
        </header>
      )}
      <div className="np-side-body" role="tabpanel" id={`np-panel-panel-${which}`} aria-labelledby={`np-panel-tab-${which}`}>
        {which === 'analysis' ? <AnalysisTab tab={tab} /> : null}
        {which === 'coverage' ? <CoverageTab tab={tab} /> : null}
        {which === 'agent' ? <AgentTab tab={tab} /> : null}
      </div>
    </aside>
  );
}
