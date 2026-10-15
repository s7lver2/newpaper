import { applyTheme, watchSystemTheme, type ThemeChoice } from '@newpaper/ui-kit';
import { ipc } from './ipc';

const KEY = 'device.theme';

/** Tema guardado: sistema (por defecto), papel o tinta. Se aplica antes de pintar para no parpadear. */
export async function loadTheme(): Promise<ThemeChoice> {
  const saved = await ipc.settingsGet<string>(KEY).catch(() => null);
  return saved === 'paper' || saved === 'ink' ? saved : 'system';
}

let stopWatch: (() => void) | null = null;

/** Pantallas que pintan oscuro pase lo que pase con el tema (cámara del escáner, portada de la bienvenida). */
let overDark = 0;

/** Iconos de la barra de estado y de gestos según lo que hay detrás: claros sobre oscuro, oscuros sobre papel. */
function syncBars(): void {
  const dark = overDark > 0 || document.documentElement.dataset.theme === 'ink';
  void ipc.systemBars(dark).catch(() => {});
}

export function barsOverDark(on: boolean): void {
  overDark = Math.max(0, overDark + (on ? 1 : -1));
  syncBars();
}

/** Aplica el tema y, si es el del sistema, sigue sus cambios mientras la app esté abierta. */
export function applyThemeChoice(choice: ThemeChoice): void {
  applyTheme(choice);
  syncBars();
  stopWatch?.();
  stopWatch = choice === 'system' ? watchSystemTheme(() => { applyTheme('system'); syncBars(); }) : null;
}

export async function setThemeChoice(choice: ThemeChoice): Promise<void> {
  await ipc.settingsSet(KEY, choice).catch(() => {});
  applyThemeChoice(choice);
}

const MOTION_KEY = 'device.reduceMotion';

/** Reducir animaciones: ajuste propio de la app (además de `prefers-reduced-motion` del sistema, que respeta el CSS). */
export function applyMotion(reduce: boolean): void {
  if (reduce) document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
}

export async function loadMotion(): Promise<boolean> {
  return (await ipc.settingsGet<boolean>(MOTION_KEY).catch(() => null)) === true;
}

export async function setMotion(reduce: boolean): Promise<void> {
  await ipc.settingsSet(MOTION_KEY, reduce).catch(() => {});
  applyMotion(reduce);
}
