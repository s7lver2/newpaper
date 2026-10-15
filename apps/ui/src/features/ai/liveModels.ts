import { makeProxyFetch, type ProviderEntry } from '@newpaper/pipeline';
import { commands } from '../../ipc/commands';
import { tauriInvoker } from './tauriPorts';

export { pickFallback, rankLive } from '@newpaper/ui-kit/logic';

/** Los modelos que el proveedor sirve ahora (GET /models por el proxy; la clave la pone Rust). Solo para APIs tipo OpenAI. */
export async function fetchLiveModels(p: ProviderEntry, baseUrl?: string): Promise<string[] | null> {
  if (p.adapter !== 'openai-compatible' && p.adapter !== 'openai') return null;
  try {
    const url = `${(baseUrl ?? p.baseUrl).replace(/\/$/, '')}/models`;
    const r = await makeProxyFetch(p.id, tauriInvoker)(url, { method: 'GET', signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { id?: unknown }[] };
    const ids = (j.data ?? []).map((m) => m.id).filter((x): x is string => typeof x === 'string');
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

export async function saveLiveModels(provider: string, ids: string[]): Promise<void> {
  const all = (await commands.settingsGet<Record<string, string[]>>('ai.liveModels')) ?? {};
  await commands.settingsSet('ai.liveModels', { ...all, [provider]: ids.slice(0, 400) });
}

/** Modelo que sí respondió cuando el del registro no existe o no está disponible para esta cuenta. */
export async function saveWorkingModel(provider: string, model: string | null): Promise<void> {
  const all = (await commands.settingsGet<Record<string, string>>('ai.workingModels')) ?? {};
  const next = { ...all };
  if (model) next[provider] = model;
  else delete next[provider];
  await commands.settingsSet('ai.workingModels', next);
}
