import { applyTheme, watchSystemTheme, type ThemeChoice } from '@newpaper/ui-kit';
import { ipc } from './ipc';

const KEY = 'device.theme';

/** Tema guardado: sistema (por defecto), papel o tinta. Se aplica antes de pintar para no parpadear. */
export async function loadTheme(): Promise<ThemeChoice> {
  const saved = await ipc.settingsGet<string>(KEY).catch(() => null);
  return saved === 'paper' || saved === 'ink' ? saved : 'system';
}

let stopWatch: (() => void) | null = null;

/** Aplica el tema y, si es el del sistema, sigue sus cambios mientras la app esté abierta. */
export function applyThemeChoice(choice: ThemeChoice): void {
  applyTheme(choice);
  stopWatch?.();
  stopWatch = choice === 'system' ? watchSystemTheme(() => applyTheme('system')) : null;
}

export async function setThemeChoice(choice: ThemeChoice): Promise<void> {
  await ipc.settingsSet(KEY, choice).catch(() => {});
  applyThemeChoice(choice);
}
