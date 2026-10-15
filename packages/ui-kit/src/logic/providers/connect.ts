import type { ProviderEntry } from '@newpaper/pipeline';

export interface CustomDraft { baseUrl: string; models: string }
export interface TestResult { ok: boolean; latencyMs: number; error: string | null }

export const DEFAULT_CUSTOM: CustomDraft = { baseUrl: 'http://127.0.0.1:8000/v1', models: '' };
export const isLocalUrl = (u: string) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(u.trim());
/** Los errores de los comandos de Tauri llegan como objetos `{ code, message }` (o texto), no como `Error`. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message;
  return String(e);
}
export const needsKey = (p: ProviderEntry) => p.type === 'cloud';

/** Modelo con el que se prueba y al que se asigna un endpoint propio: el primero que el usuario escribió. */
export function firstModel(p: ProviderEntry, custom: CustomDraft, localModels: string[] | null): string {
  if (p.id === 'custom') return custom.models.split(',')[0]?.trim() ?? '';
  return localModels?.[0] ?? p.models.find((m) => m.tier === 'light')?.id ?? p.models[0]?.id ?? '';
}
