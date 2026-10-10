export interface CacheStore {
  get(url: string, hash: string, stage: string): Promise<string | null>;
  put(url: string, hash: string, stage: string, json: string, model: string | null, costUsd: number): Promise<void>;
}

export async function textHash(url: string, text: string): Promise<string> {
  // v2: invalida las etapas guardadas con la extracción de afirmaciones anterior.
  const bytes = new TextEncoder().encode(`v2\n${url}\n${text}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** §6.2 "Caché: resultados por hash(url + texto) 30 días; reutilización entre pestañas". */
export async function cachedStage<T>(
  cache: CacheStore,
  url: string,
  hash: string,
  stage: string,
  compute: () => Promise<{ value: T; model: string | null; costUsd: number }>,
): Promise<{ value: T; fromCache: boolean }> {
  const hit = await cache.get(url, hash, stage);
  if (hit !== null) return { value: JSON.parse(hit) as T, fromCache: true };
  const r = await compute();
  await cache.put(url, hash, stage, JSON.stringify(r.value), r.model, r.costUsd);
  return { value: r.value, fromCache: false };
}
