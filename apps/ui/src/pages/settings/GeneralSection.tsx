import { LOCALES, type Locale } from '@newpaper/i18n';
import { useI18n } from '@newpaper/i18n/react';
import { applyTheme, SegmentedControl, Switch, type ThemeChoice } from '@newpaper/ui-kit';
import { commands } from '../../ipc/commands';
import { useSetting } from '../../state/settings';

const THEMES: { value: ThemeChoice; labelKey: string }[] = [
  { value: 'paper', labelKey: 'settings.general.themePaper' },
  { value: 'ink', labelKey: 'settings.general.themeInk' },
  { value: 'system', labelKey: 'settings.general.themeSystem' },
];

export function GeneralSection() {
  const { t, locale, setLocale } = useI18n();
  const [contentLocale, setContentLocale] = useSetting<Locale>('content.locale', locale);
  const [theme, setTheme] = useSetting<ThemeChoice>('appearance.theme', 'system');
  const [readerAuto, setReaderAuto] = useSetting<boolean>('reader.autoOpen', true);
  const [transition, setTransition] = useSetting<boolean>('appearance.pageTransition', true);
  const [resWarn, setResWarn] = useSetting<boolean>('resources.warn', true);
  const [resLimit, setResLimit] = useSetting<number>('resources.limitMb', 0);
  const languages = LOCALES.map((l) => ({ value: l, label: t(`settings.language.${l}`) }));
  return (
    <section className="np-settings-section np-stagger" aria-labelledby="np-set-general">
      <div>
        <h2 id="np-set-general" className="np-settings-h2">{t('settings.general.title')}</h2>
        <p className="np-settings-hint">{t('settings.general.lead')}</p>
      </div>
      <div role="radiogroup" aria-label={t('settings.general.theme')} className="np-themes">
        {THEMES.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={theme === o.value}
            className="np-theme-card np-lift"
            onClick={() => {
              applyTheme(o.value);
              void setTheme(o.value);
            }}
          >
            <span className="np-theme-preview" data-preview={o.value} aria-hidden="true"><i /><i /><i /></span>
            <span>{t(o.labelKey)}</span>
          </button>
        ))}
      </div>
      <div className="np-settings-card np-switch-card">
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{t('settings.general.language')}</span>
          </div>
          <SegmentedControl
            label={t('settings.general.language')}
            value={locale}
            options={languages}
            onChange={(l) => {
              setLocale(l);
              void commands.settingsSet('general.locale', l);
            }}
          />
        </div>
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{t('settings.general.contentLanguage')}</span>
            <span className="np-set-desc">{t('settings.general.contentLanguageHint')}</span>
          </div>
          <SegmentedControl label={t('settings.general.contentLanguage')} value={contentLocale} options={languages} onChange={(l) => void setContentLocale(l)} />
        </div>
        <Switch label={t('settings.general.pageTransition')} description={t('settings.general.pageTransitionHint')} checked={transition} onChange={(v) => void setTransition(v)} />
        <Switch label={t('settings.general.resourceWarn')} description={t('settings.general.resourceWarnHint')} checked={resWarn} onChange={(v) => void setResWarn(v)} />
        {resWarn ? (
          <div className="np-set-row">
            <div className="np-set-text">
              <span className="np-set-name">{t('settings.general.resourceLimit')}</span>
              <span className="np-set-desc">{t('settings.general.resourceLimitHint')}</span>
            </div>
            <SegmentedControl
              label={t('settings.general.resourceLimit')}
              value={String(resLimit)}
              options={[
                { value: '0', label: t('settings.general.resourceAuto') },
                { value: '2048', label: '2 GB' },
                { value: '4096', label: '4 GB' },
                { value: '8192', label: '8 GB' },
              ]}
              onChange={(v) => void setResLimit(Number(v))}
            />
          </div>
        ) : null}
        <Switch label={t('settings.general.readerAuto')} description={t('settings.general.readerAutoHint')} checked={readerAuto} onChange={(v) => void setReaderAuto(v)} />
      </div>
    </section>
  );
}
