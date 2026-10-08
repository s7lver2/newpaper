export type ThemeChoice = 'paper' | 'ink' | 'system';
export type ResolvedTheme = 'paper' | 'ink';

const DARK = '(prefers-color-scheme: dark)';

function systemTheme(): ResolvedTheme {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK).matches ? 'ink' : 'paper';
}

export function applyTheme(choice: ThemeChoice, root: HTMLElement = document.documentElement): ResolvedTheme {
  const resolved = choice === 'system' ? systemTheme() : choice;
  root.dataset.theme = resolved;
  return resolved;
}

export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(DARK);
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? 'ink' : 'paper');
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}