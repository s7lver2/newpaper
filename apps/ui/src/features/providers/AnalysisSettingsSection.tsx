import { useT } from '@newpaper/i18n/react';
import { Switch } from '@newpaper/ui-kit';
import { useAiSettings } from '../ai/pipeline';

export function AnalysisSettingsSection() {
  const t = useT();
  const ai = useAiSettings();
  return (
    <div className="np-ai-section">
      <Switch checked={ai.quickOnOpen} onChange={(v) => void ai.setQuickOnOpen(v)} label={t('settings.analysis.quickOnOpen')} description={t('settings.analysis.quickOnOpenHint')} />
      <Switch checked={ai.autoFull} onChange={(v) => void ai.setAutoFull(v)} label={t('settings.analysis.autoFull')} description={t('settings.analysis.autoFullHint')} />
      <Switch checked={ai.detector} onChange={(v) => void ai.setDetector(v)} label={t('settings.analysis.detector')} description={t('settings.analysis.detectorHint')} />
      <p className="np-muted">{t('settings.analysis.language')}</p>
    </div>
  );
}
