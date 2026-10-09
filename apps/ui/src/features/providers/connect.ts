import type { ProviderEntry } from '@newpaper/pipeline';
import { commands } from '../../ipc/commands';
import { getPipeline, resetPipeline, type useAiSettings } from '../ai/pipeline';

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

/** Guarda la clave en el llavero (nunca en estado de React ni en ajustes) y, si es un endpoint propio, su dirección. */
export async function storeCredentials(p: ProviderEntry, key: string, custom: CustomDraft, hasStoredKey: boolean): Promise<void> {
  if ((needsKey(p) || p.id === 'custom') && key.trim()) await commands.secretSet(`ai.${p.id}`, key.trim());
  if (p.id === 'custom') {
    await commands.aiSetEndpoints([{ id: 'custom', baseUrl: custom.baseUrl.trim(), auth: key.trim() || hasStoredKey ? 'bearer' : 'none', local: isLocalUrl(custom.baseUrl) }]);
  }
}

/** Una llamada mínima al modelo; solo contiene la clave que ya está en el llavero. */
export async function runConnectionTest(p: ProviderEntry, model: string): Promise<TestResult> {
  try {
    resetPipeline();
    const r = await (await getPipeline()).testConnection({ provider: p.id, model });
    return { ok: r.ok, latencyMs: r.latencyMs, error: r.ok ? null : r.error };
  } catch (e) {
    return { ok: false, latencyMs: 0, error: errorText(e) };
  }
}

type AiApi = ReturnType<typeof useAiSettings>;

/** Da el proveedor por conectado. Un endpoint propio no está en el registro: si es el primero, se asigna a todas las etapas a mano. */
export async function markConnected(ai: AiApi, p: ProviderEntry, custom: CustomDraft): Promise<void> {
  const connected = [...new Set([...ai.connected, p.id])];
  await ai.setConnected(connected);
  if (p.id === 'custom' && connected.length === 1) {
    const ref = { provider: 'custom', model: firstModel(p, custom, null) };
    await ai.setAssignments({ claims: ref, quickScore: ref, verify: ref, score: ref, synthesis: ref, aiDetect: ref, agent: ref, investigate: ref });
  }
}

/** Quita la clave del llavero y el proveedor de los conectados; las asignaciones manuales que lo usaban vuelven a ser automáticas. */
export async function disconnectProvider(ai: AiApi, id: string): Promise<void> {
  await commands.secretDelete(`ai.${id}`).catch(() => {});
  if (Object.values(ai.assignments).some((a) => a?.provider === id)) await ai.setAssignments({});
  await ai.setConnected(ai.connected.filter((x) => x !== id));
}
