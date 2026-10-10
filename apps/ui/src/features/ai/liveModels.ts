import { makeProxyFetch, type ProviderEntry } from '@newpaper/pipeline';
import { commands } from '../../ipc/commands';
import { tauriInvoker } from './tauriPorts';

const SKIP = /embed|rerank|guard|safety|reward|vision|vlm|clip|asr|tts|whisper|image|diffusion|parse|retriev|nemoretriever|translate|detector/i;
// Primero los pequeños y rápidos: los gigantes (ultra, 400B+) tardan mucho en frío.
const PREFER = [/llama-3\.[123]-8b/i, /nano|mini|flash|lite|small|-8b|-7b|-9b/i, /llama-3\.[13]-70b/i, /nemotron.*super/i, /instruct|chat/i];
const HUGE = /ultra|405b|550b|480b|253b|671b/i;

/** Modelos vivos de chat ordenados de más a menos adecuados para probar (pequeños y rápidos primero). */
export function rankLive(ids: string[]): string[] {
  const ok = ids.filter((i) => !SKIP.test(i) && !HUGE.test(i));
  const score = (i: string) => {
    const k = PREFER.findIndex((re) => re.test(i));
    return k < 0 ? PREFER.length : k;
  };
  return [...ok].sort((a, b) => score(a) - score(b));
}

/** El más adecuado de la lista viva. */
export function pickFallback(ids: string[]): string | null {
  return rankLive(ids)[0] ?? null;
}

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
