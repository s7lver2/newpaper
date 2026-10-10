import type { NavFailure } from '../../ipc/types';

export type NetErrorKind = 'offline' | 'dns' | 'timeout' | 'unreachable' | 'cert' | 'torBlocked' | 'notFound' | 'server' | 'unknown';
export type NetAction = 'retry' | 'offlinePage' | 'openWithoutTor' | 'archive' | 'back';

/** `COREWEBVIEW2_WEB_ERROR_STATUS`: 1–5 certificado, 6 servidor inalcanzable, 7 tiempo agotado, 9–12 conexión, 13 DNS. */
export function classifyFailure(f: NavFailure, ctx: { online: boolean; torBlocked: boolean }): { kind: NetErrorKind; actions: NetAction[] } {
  const s = f.webErrorStatus;
  if (s >= 1 && s <= 5) return { kind: 'cert', actions: ['back'] }; // §11: nunca "continuar de todos modos"
  if (ctx.torBlocked) return { kind: 'torBlocked', actions: ['openWithoutTor', 'retry'] };
  if (!ctx.online || s === 11) return { kind: 'offline', actions: ['retry', 'offlinePage'] };
  if (f.httpStatus === 404) return { kind: 'notFound', actions: ['archive', 'back'] };
  if (f.httpStatus !== null && f.httpStatus >= 500) return { kind: 'server', actions: ['retry', 'archive'] };
  if (s === 13) return { kind: 'dns', actions: ['retry'] };
  if (s === 7) return { kind: 'timeout', actions: ['retry'] };
  if (s === 6 || s === 9 || s === 10 || s === 12) return { kind: 'unreachable', actions: ['retry', 'archive'] };
  return { kind: 'unknown', actions: ['retry'] };
}
