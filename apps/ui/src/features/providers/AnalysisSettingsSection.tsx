import { useI18n } from '@newpaper/i18n/react';
import { Switch } from '@newpaper/ui-kit';
import { useAiSettings } from '../ai/pipeline';

type Trigger = 'auto' | 'demand' | 'tiered';

/** Cuándo se analiza una noticia: tres tarjetas (mockup Ajustes › Análisis) sobre los ajustes `ai.autoFull` y `ai.quickOnOpen`. */
export function AnalysisSettingsSection() {
  const { t } = useI18n();
  const ai = useAiSettings();
  const current: Trigger = ai.autoFull ? 'auto' : ai.quickOnOpen ? 'tiered' : 'demand';
  const pick = (v: Trigger) => {
    void ai.setAutoFull(v === 'auto');
    void ai.setQuickOnOpen(v === 'tiered' || v === 'auto');
  };
  const triggers: Trigger[] = ['auto', 'demand', 'tiered'];
  return (
    <section className="np-settings-section np-stagger" aria-labelledby="np-set-analysis">
      <div>
        <h2 id="np-set-analysis" className="np-settings-h2">{t('settings.analysis.title')}</h2>
        <p className="np-settings-hint">{t('settings.analysis.lead')}</p>
      </div>
      <div className="np-aip-triggers" role="radiogroup" aria-label={t('settings.analysis.when')}>
        {triggers.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={current === k} className="np-aip-trigger np-lift" onClick={() => pick(k)}>
            <span className="np-aip-trigger-name">{t(`settings.analysis.trigger.${k}`)}</span>
            <span className="np-aip-trigger-desc">{t(`settings.analysis.triggerDesc.${k}`)}</span>
            <span className="np-aip-trigger-cost">{t(`settings.analysis.triggerCost.${k}`)}</span>
          </button>
        ))}
      </div>
      <div className="np-settings-card np-switch-card">
        <Switch checked={ai.detector} onChange={(v) => void ai.setDetector(v)} label={t('settings.analysis.detector')} description={t('settings.analysis.detectorHint')} />
      </div>
      <p className="np-settings-hint">{t('settings.analysis.language')}</p>
    </section>
  );
}
