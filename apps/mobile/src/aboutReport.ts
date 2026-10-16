import type { AboutInfo } from './ipc';

/** 1536 → «1,5 KB» (base 1024), sin depender del idioma de la interfaz para el informe. */
export function formatBytes(n: number, locale?: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v)} ${units[i]}`;
}

/** Resumen para pegar en un informe de errores: solo datos de compilación, sistema y ajustes generales. Sin claves, IP ni identificadores. */
export function buildReport(a: AboutInfo, locale: string): string {
  const b = a.build;
  const d = a.device;
  const when = b.builtAt > 0 ? new Date(b.builtAt * 1000).toISOString() : 'unknown';
  return [
    `newpaper ${b.version} (${b.profile})`,
    `build: ${when}`,
    `commit: ${b.git}${b.gitDirty ? ' (modified)' : ''}`,
    `android: ${d.androidRelease} (API ${d.sdk})`,
    `device: ${[d.manufacturer, d.model].filter(Boolean).join(' ')}`,
    `abi: ${d.abi ?? 'unknown'}`,
    `webview: ${d.webview ?? 'unknown'}`,
    `locale: ${locale}`,
    `network: ${a.netMode || 'unknown'}`,
    `app data: ${formatBytes(a.dataBytes, 'en')}`,
    `components: ${b.deps.map(([n, v]) => `${n} ${v}`).join(', ') || 'n/a'}`,
  ].join('\n');
}
