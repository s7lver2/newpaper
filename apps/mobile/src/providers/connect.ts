import { autoAssign, makeProxyFetch, type Assignments, type PresetId, type ProviderEntry, type Registry } from '@newpaper/pipeline';
import { rankLive, type TestResult } from '@newpaper/ui-kit/logic';
import { getPipeline, getRegistry, resetPipeline } from '../ai/pipeline';
import { aiInvoker, ipc } from '../ipc';

/**
 * Adaptador móvil de la conexión de proveedores. Misma lógica que el escritorio (apps/ui/src/features/providers/connect.ts):
 * la clave va al llavero (nunca al estado), se da el proveedor por conectado, se asignan modelos por preset y la prueba
 * es una llamada real. Lo que cambia es el almacenamiento (IPC del móvil) y el puerto HTTP (`aiInvoker`).
 */

export const connectedIds = async (): Promise<string[]> => (await ipc.settingsGet<string[]>('ai.connected')) ?? [];

/** Modelos vivos del proveedor (GET /models por el proxy; la clave la pone Rust). Solo APIs tipo OpenAI. */
export async function fetchLive(p: ProviderEntry, baseUrl?: string): Promise<string[] | null> {
  if (p.adapter !== 'openai-compatible' && p.adapter !== 'openai') return null;
  try {
    const url = `${(baseUrl ?? p.baseUrl).replace(/\/$/, '')}/models`;
    const r = await makeProxyFetch(p.id, aiInvoker)(url, { method: 'GET', signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { id?: unknown }[] };
    const ids = (j.data ?? []).map((m) => m.id).filter((x): x is string => typeof x === 'string');
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

/** Guarda la clave en el llavero del móvil. */
export async function storeKey(p: ProviderEntry, key: string): Promise<void> {
  if (p.type === 'cloud' && key.trim()) await ipc.secretSet(`ai.${p.id}`, key.trim());
}

/**
 * Prueba real: si el modelo del registro no existe para esta cuenta, prueba de la lista viva (como el escritorio).
 * Los errores llegan tal cual (código HTTP, tipo, host): la pantalla decide la causa que se muestra.
 */
export async function runTest(p: ProviderEntry, model: string): Promise<TestResult> {
  try {
    const live = await fetchLive(p);
    resetPipeline();
    const pipe = await getPipeline();
    const first = await pipe.testConnection({ provider: p.id, model }, live ? 20_000 : undefined);
    if (first.ok || !live || !/HTTP (404|410)/.test(first.error)) {
      return { ok: first.ok, latencyMs: first.latencyMs, error: first.ok ? null : first.error };
    }
    let last = first;
    for (const alt of rankLive(live).filter((m) => m !== model).slice(0, 4)) {
      const r = await pipe.testConnection({ provider: p.id, model: alt }, 20_000);
      if (r.ok) return { ok: true, latencyMs: r.latencyMs, error: null };
      last = r;
    }
    return { ok: false, latencyMs: last.latencyMs, error: last.ok ? null : last.error };
  } catch (e) {
    return { ok: false, latencyMs: 0, error: String((e as { message?: string })?.message ?? e) };
  }
}

/** Modelo con el que se prueba: el ligero del registro, o el primero disponible. */
export function testModel(p: ProviderEntry, localModels: string[] | null = null): string {
  return localModels?.[0] ?? p.models.find((m) => m.tier === 'light')?.id ?? p.models[0]?.id ?? '';
}

/** Da el proveedor por conectado y reasigna los modelos según el preset. */
export async function markConnected(p: ProviderEntry, preset: PresetId, localModels: Record<string, string[]> = {}): Promise<Assignments> {
  const connected = [...new Set([...(await connectedIds()), p.id])];
  await ipc.settingsSet('ai.connected', connected);
  return applyAssignments(connected, preset, localModels);
}

/** Recalcula las asignaciones automáticas (`autoAssign`) con el preset elegido y las guarda. */
export async function applyAssignments(connected: string[], preset: PresetId, localModels: Record<string, string[]> = {}): Promise<Assignments> {
  const registry: Registry = await getRegistry();
  const a = autoAssign(registry, connected, preset, localModels);
  await ipc.settingsSet('ai.preset', preset);
  await ipc.settingsSet('ai.assignments', a);
  resetPipeline();
  return a;
}

/** Quita la clave y el proveedor. Las asignaciones que lo usaban vuelven a ser automáticas. */
export async function disconnect(id: string, preset: PresetId): Promise<void> {
  const rest = (await connectedIds()).filter((x) => x !== id);
  await ipc.settingsSet('ai.connected', rest);
  await ipc.settingsSet('ai.assignments', {});
  await applyAssignments(rest, preset);
}

/** Borra la clave del llavero (se llama al descartar el aviso de «Deshacer»). */
export const forgetKey = (id: string) => ipc.secretDelete(`ai.${id}`).catch(() => {});
