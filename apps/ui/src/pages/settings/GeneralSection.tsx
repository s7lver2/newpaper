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
  const languages = LOCALES.map((l) => ({ value: l, label: t(`settings.language.${l}`) }));
  return (
    <section className="np-settings-section" aria-labelledby="np-set-general">
      <h2 id="np-set-general" className="np-settings-h2">{t('settings.general.title')}</h2>
      <div className="np-settings-row">
        <span className="np-settings-label">{t('settings.general.language')}</span>
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
      <div className="np-settings-row">
        <span className="np-settings-label">{t('settings.general.contentLanguage')}</span>
        <SegmentedControl label={t('settings.general.contentLanguage')} value={contentLocale} options={languages} onChange={(l) => void setContentLocale(l)} />
        <p className="np-settings-hint">{t('settings.general.contentLanguageHint')}</p>
      </div>
      <div className="np-settings-row">
        <span className="np-settings-label">{t('settings.general.theme')}</span>
        <div role="radiogroup" aria-label={t('settings.general.theme')} className="np-themes">
          {THEMES.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={theme === o.value}
              className="np-theme-card"
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
      </div>
      <Switch label={t('settings.general.readerAuto')} description={t('settings.general.readerAutoHint')} checked={readerAuto} onChange={(v) => void setReaderAuto(v)} />
    </section>
  );
}
