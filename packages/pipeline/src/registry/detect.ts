import type { Registry } from './registry';
import type { ProviderEntry } from './schema';

/** Proveedores cuya clave empieza por alguno de sus prefijos; el prefijo más largo gana (§6.1.1). */
export function detectProviders(key: string, registry: Registry): ProviderEntry[] {
  const k = key.trim();
  const hits: { p: ProviderEntry; len: number }[] = [];
  for (const p of registry.providers) {
    const best = Math.max(0, ...p.keyPrefixes.filter((pre) => k.startsWith(pre)).map((pre) => pre.length));
    if (best > 0) hits.push({ p, len: best });
  }
  const top = Math.max(0, ...hits.map((h) => h.len));
  // Solo el prefijo más largo cuenta: "sk-ant-" excluye a OpenAI/DeepSeek ("sk-").
  return hits.filter((h) => h.len === top).map((h) => h.p);
}
