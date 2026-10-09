import type { NavFailure, PrivacyStatus } from '../ipc/types';

export type ErrorCategory = 'http' | 'network' | 'cert' | 'timeout';

/** `COREWEBVIEW2_WEB_ERROR_STATUS` names, to make the report readable without the SDK at hand. */
const WEB_ERRORS: Record<number, string> = {
  1: 'CERTIFICATE_COMMON_NAME_IS_INCORRECT', 2: 'CERTIFICATE_EXPIRED', 3: 'CLIENT_CERTIFICATE_CONTAINS_ERRORS', 4: 'CERTIFICATE_REVOKED',
  5: 'CERTIFICATE_IS_INVALID', 6: 'SERVER_UNREACHABLE', 7: 'TIMEOUT', 8: 'ERROR_HTTP_INVALID_SERVER_RESPONSE', 9: 'CONNECTION_ABORTED',
  10: 'CONNECTION_RESET', 11: 'DISCONNECTED', 12: 'CANNOT_CONNECT', 13: 'HOST_NAME_NOT_RESOLVED', 14: 'OPERATION_CANCELED',
  15: 'REDIRECT_FAILED', 16: 'UNEXPECTED_ERROR', 17: 'VALID_AUTHENTICATION_CREDENTIALS_REQUIRED', 18: 'VALID_PROXY_AUTHENTICATION_REQUIRED',
};

export function errorCategory(f: Pick<NavFailure, 'webErrorStatus' | 'httpStatus'>): ErrorCategory {
  if (f.httpStatus != null && f.httpStatus >= 400) return 'http';
  if (f.webErrorStatus >= 1 && f.webErrorStatus <= 5) return 'cert';
  if (f.webErrorStatus === 7) return 'timeout';
  return 'network';
}

/** What the UI knows at the moment of copying; everything else comes with the failure. */
export interface ReportContext {
  privacy: Pick<PrivacyStatus, 'mode' | 'exitCountry'> | null;
  /** The tab was opened without Tor while the app is in Tor mode. */
  tabWithoutTor: boolean;
  blockedInTab: number | null;
  windowSize: { width: number; height: number };
  theme: string;
}

const section = (title: string, rows: [string, string][], empty: string): string =>
  [`-- ${title} --`, ...(rows.length ? rows.map(([k, v]) => `${k}: ${v}`) : [empty])].join('\n');

/** Plain `key: value` text to paste into a bug report. No cookies, credentials, page content or personal data. */
export function formatErrorReport(f: NavFailure, ctx: ReportContext): string {
  const d = f.diagnostics;
  const category = errorCategory(f);
  const what = f.httpStatus != null && f.httpStatus >= 400 ? `HTTP ${f.httpStatus}` : `${WEB_ERRORS[f.webErrorStatus] ?? 'UNKNOWN'} (${f.webErrorStatus})`;
  const network = !ctx.privacy
    ? 'unknown'
    : ctx.privacy.mode === 'tor' && ctx.tabWithoutTor
      ? 'direct (tab without Tor)'
      : ctx.privacy.mode === 'tor'
        ? `tor (exit country: ${ctx.privacy.exitCountry ?? 'auto'})`
        : 'direct';
  const head: [string, string][] = [
    ['url', f.url],
    ['error', what],
    ['category', category],
    ['network', network],
    ['navigation id', d ? String(d.navigationId) : 'unknown'],
    ['time', d ? new Date(d.atMs).toISOString() : new Date().toISOString()],
    ['app version', d?.appVersion || 'unknown'],
    ['webview2 version', d?.webview2Version || 'unknown'],
    ['adblock blocked in tab', ctx.blockedInTab == null ? 'unknown' : String(ctx.blockedInTab)],
    ['window', `${ctx.windowSize.width}x${ctx.windowSize.height}`],
    ['theme', ctx.theme],
  ];
  return [
    'newpaper error report',
    ...head.map(([k, v]) => `${k}: ${v}`),
    section('request headers', d?.requestHeaders ?? [], '(not captured)'),
    section('response headers', d?.responseHeaders ?? [], '(none)'),
  ].join('\n');
}

/** Copies without asking for the browser clipboard permission when possible (there is a user gesture). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const prev = document.activeElement as HTMLElement | null;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    prev?.focus?.();
    return ok;
  }
}
