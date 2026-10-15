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
