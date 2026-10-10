import type { ProviderEntry } from '@newpaper/pipeline';
import { commands } from '../../ipc/commands';
import { fetchLiveModels, rankLive, saveLiveModels, saveWorkingModel } from '../ai/liveModels';
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
    // Los proveedores retiran modelos, o no todos los de su lista sirven a esta cuenta: si el del registro falla
    // con 404/410 se prueban, de uno en uno y con poco margen, otros de la lista viva.
    const live = await fetchLiveModels(p);
    if (live) await saveLiveModels(p.id, live).catch(() => {});
    await saveWorkingModel(p.id, null).catch(() => {});
    resetPipeline();
    const pipe = await getPipeline();
    const first = await pipe.testConnection({ provider: p.id, model }, live ? 20_000 : undefined);
    if (first.ok || !live || !/HTTP (404|410)/.test(first.error)) {
      return { ok: first.ok, latencyMs: first.latencyMs, error: first.ok ? null : first.error };
    }
    let last = first;
    for (const alt of rankLive(live).filter((m) => m !== model).slice(0, 4)) {
      const r = await pipe.testConnection({ provider: p.id, model: alt }, 20_000);
      if (r.ok) {
        await saveWorkingModel(p.id, alt).catch(() => {});
        resetPipeline();
        return { ok: true, latencyMs: r.latencyMs, error: null };
      }
      last = r;
    }
    return { ok: false, latencyMs: last.latencyMs, error: last.ok ? null : last.error };
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
