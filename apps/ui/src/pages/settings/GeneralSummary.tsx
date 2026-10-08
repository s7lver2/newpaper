import { useT } from '@newpaper/i18n/react';
import type { ThemeChoice } from '@newpaper/ui-kit';
import { useSetting } from '../../state/settings';

const KEY: Record<ThemeChoice, string> = { paper: 'settings.general.themePaper', ink: 'settings.general.themeInk', system: 'settings.general.themeSystem' };

/** Second line of the "General" entry in the settings sidebar: the chosen theme. */
export function GeneralSummary() {
  const t = useT();
  const [theme] = useSetting<ThemeChoice>('appearance.theme', 'system');
  return <>{t(KEY[theme])}</>;
}
