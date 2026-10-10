import { makeProxyFetch, type ProviderEntry } from '@newpaper/pipeline';
import { commands } from '../../ipc/commands';
import { tauriInvoker } from './tauriPorts';

const SKIP = /embed|rerank|guard|safety|reward|vision|vlm|clip|asr|tts|whisper|image|diffusion|parse|retriev|nemoretriever|translate|detector/i;
// Primero los pequeños y rápidos: los gigantes (ultra, 400B+) tardan mucho en frío.
const PREFER = [/llama-3\.[123]-8b/i, /nano|mini|flash|lite|small|-8b|-7b|-9b/i, /llama-3\.[13]-70b/i, /nemotron.*super/i, /instruct|chat/i];
const HUGE = /ultra|405b|550b|480b|253b|671b/i;

/** Entre los modelos vivos del proveedor, el más parecido a un modelo de chat de propósito general. */
export function pickFallback(ids: string[]): string | null {
  const ok = ids.filter((i) => !SKIP.test(i) && !HUGE.test(i));
  for (const re of PREFER) {
    const hit = ok.find((i) => re.test(i));
    if (hit) return hit;
  }
  return ok[0] ?? null;
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
