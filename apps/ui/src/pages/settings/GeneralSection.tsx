import { LOCALES, type Locale } from '@newpaper/i18n';
import { useI18n } from '@newpaper/i18n/react';
import { applyTheme, SegmentedControl, Switch, type ThemeChoice } from '@newpaper/ui-kit';
import { commands } from '../../ipc/commands';
import { useSetting } from '../../state/settings';

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
        <SegmentedControl
          label={t('settings.general.theme')}
          value={theme}
          options={[
            { value: 'paper', label: t('settings.general.themePaper') },
            { value: 'ink', label: t('settings.general.themeInk') },
            { value: 'system', label: t('settings.general.themeSystem') },
          ]}
          onChange={(v) => {
            applyTheme(v);
            void setTheme(v);
          }}
        />
      </div>
      <Switch label={t('settings.general.readerAuto')} description={t('settings.general.readerAutoHint')} checked={readerAuto} onChange={(v) => void setReaderAuto(v)} />
    </section>
  );
}
