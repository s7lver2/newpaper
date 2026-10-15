import '@newpaper/ui-kit/tokens.css';
import '@newpaper/ui-kit/motion.css';
import '@newpaper/ui-kit/fonts';
import { isLocale } from '@newpaper/i18n';
import { detectSystemLocale, I18nProvider } from '@newpaper/i18n/react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ipc } from './ipc';
import { applyThemeChoice, loadTheme } from './theme';
import './mobile.css';

// Tema antes de pintar: papel, tinta o el del sistema (por defecto).
applyThemeChoice(await loadTheme());
const saved = await ipc.settingsGet<string>('general.locale').catch(() => null);
const locale = isLocale(saved) ? saved : detectSystemLocale();
createRoot(document.getElementById('root')!).render(
  <I18nProvider initialLocale={locale} onLocaleChange={(l) => void ipc.settingsSet('general.locale', l)}>
    <App />
  </I18nProvider>,
);
