import { isLocale, type Locale } from '@newpaper/i18n';
import { I18nProvider, detectSystemLocale } from '@newpaper/i18n/react';
import { applyTheme, watchSystemTheme, type ThemeChoice } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { useHistoryRecorder } from './features/core/useHistoryRecorder';
import { commands } from './ipc/commands';
import { onSettingsChanged } from './ipc/events';
import { BrowserShell } from './shell/BrowserShell';
import { installShortcuts } from './shell/shortcuts';
import { startBrowserSync } from './state/browser';

function Running() {
  useHistoryRecorder();
  useEffect(() => {
    const stops: Promise<() => void>[] = [startBrowserSync(), installShortcuts()];
    return () => stops.forEach((s) => s.then((f) => f()));
  }, []);
  return <BrowserShell />;
}

export function App() {
  const [locale, setLocale] = useState<Locale | null>(null);

  useEffect(() => {
    void (async () => {
      const saved = await commands.settingsGet<string>('general.locale');
      if (isLocale(saved)) setLocale(saved);
      else {
        const detected = detectSystemLocale();
        await commands.settingsSet('general.locale', detected);
        setLocale(detected);
      }
      const theme = (await commands.settingsGet<ThemeChoice>('appearance.theme')) ?? 'system';
      applyTheme(theme);
    })();
    const stopSystem = watchSystemTheme(async () => {
      const theme = (await commands.settingsGet<ThemeChoice>('appearance.theme')) ?? 'system';
      if (theme === 'system') applyTheme('system');
    });
    const off = onSettingsChanged((e) => {
      if (e.key === 'appearance.theme') applyTheme((e.value as ThemeChoice) ?? 'system');
    });
    return () => {
      stopSystem();
      off.then((f) => f());
    };
  }, []);

  if (!locale) return null;
  return (
    <I18nProvider initialLocale={locale} onLocaleChange={(l) => void commands.settingsSet('general.locale', l)}>
      <Running />
    </I18nProvider>
  );
}
