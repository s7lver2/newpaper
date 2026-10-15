import { extractFromHtml } from '@newpaper/extract';
import {
  autoAssign, createModel, createPipeline, DEFAULT_WEIGHTS, loadRegistry, makeProxyFetch,
  type Assignments, type FramingWeights, type Pipeline, type PresetId, type Registry,
} from '@newpaper/pipeline';
import { aiInvoker, ipc, type CustomEndpoint } from '../ipc';

type Locale = 'es' | 'en' | 'de';
const asLocale = (l: string | null): Locale => (l === 'en' || l === 'de' ? l : 'es');

let registryP: Promise<Registry> | null = null;
let pipelineP: Promise<Pipeline> | null = null;

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await ipc.configRead(name)) as T;
  } catch {
    return fallback;
  }
}

export function getRegistry(): Promise<Registry> {
  registryP ??= (async () => loadRegistry(await readJson('providers.json', { version: 1, providers: [] }), await readJson('prices.json', {})))();
  return registryP;
}

/** Mismos puertos que el escritorio (apps/ui/src/features/ai/pipeline.ts), sobre el IPC del móvil. */
async function build(): Promise<Pipeline> {
  const registry = await getRegistry();
  const contentLocale = asLocale(await ipc.settingsGet<string>('content.locale'));
  const uiLocale = asLocale(await ipc.settingsGet<string>('general.locale'));
  const custom = (await ipc.settingsGet<CustomEndpoint[]>('ai.customEndpoints')) ?? [];
  const primary = await readJson<Record<string, { dominio: string }[]>>('primary-sources.json', {});
  const parties = await readJson<{ parties?: { id: string }[] }>(`parties-${contentLocale}.json`, {});
  const weights = await readJson<FramingWeights>('framing-weights.json', DEFAULT_WEIGHTS);
  return createPipeline({
    registry,
    models: {
      get(ref) {
        const p = registry.get(ref.provider);
        if (!p) throw new Error(`unknown provider ${ref.provider}`);
        const base = custom.find((c) => c.id === ref.provider)?.baseUrl;
        const m = registry.model(ref.provider, ref.model);
        return { model: createModel(p, ref.model, makeProxyFetch(ref.provider, aiInvoker), base), noTemperature: m?.noTemperature ?? false };
      },
    },
    async assignments() {
      const saved = (await ipc.settingsGet<Assignments>('ai.assignments')) ?? {};
      if (Object.keys(saved).length) return saved;
      const connected = (await ipc.settingsGet<string[]>('ai.connected')) ?? [];
      const preset = ((await ipc.settingsGet<PresetId>('ai.preset')) ?? 'balanced') as PresetId;
      // El Ollama del PC: sus modelos se sondean ahora (el endpoint guardado no los incluye).
      const local: Record<string, string[]> = {};
      const pc = custom.find((c) => c.id === 'ollama');
      if (pc) {
        const models = await ipc.ollamaProbe(pc.baseUrl.replace(/\/v1\/?$/, '')).then((r) => r.models).catch(() => [] as string[]);
        if (models.length) local.ollama = models;
      }
      return autoAssign(registry, [...connected, ...Object.keys(local)], preset, local);
    },
    async budget() {
      const limit = await ipc.settingsGet<number>('ai.monthlyLimitUsd');
      return { spentUsd: (await ipc.usageMonth()).cost, limitUsd: typeof limit === 'number' ? limit : null };
    },
    usage: { record: (provider, model, usage, costUsd) => ipc.usageRecord(provider, model, usage.inputTokens, usage.outputTokens, costUsd) },
    cache: {
      get: async (url, hash, stage) => (await ipc.analysisCacheGet(url, hash, stage))?.json ?? null,
      put: (url, hash, stage, json, model, costUsd) => ipc.analysisCachePut(url, hash, stage, json, model, costUsd),
    },
    coverage: {
      coverageFor: (url, title, excerpt) => ipc.coverageFor(url, title, excerpt),
      async search(query) {
        const cards = (await ipc.eventsSearch(query)).slice(0, 3);
        const details = await Promise.all(cards.map((c) => ipc.eventDetail(c.eventId)));
        return details.flatMap((d) => d?.articles ?? []);
      },
    },
    lexicon: { score: (text, locale) => ipc.lexiconScore(text, locale) },
    sources: { fetch: (url, allowExtra) => ipc.sourceFetch(url, allowExtra) },
    extract: (html, url) => extractFromHtml(html, url),
    primaryDomains: async () => (primary[contentLocale] ?? []).map((p) => p.dominio),
    partyIds: async () => (parties.parties ?? []).map((p) => p.id),
    framingWeights: async () => weights,
    // El idioma de salida es el de la interfaz, como en el escritorio.
    locale: () => uiLocale,
    onAnalyzed: async (url) => void (await ipc.historyMarkAnalyzed(url)),
  });
}

export function getPipeline(): Promise<Pipeline> {
  pipelineP ??= build();
  return pipelineP;
}

/** Llamar tras cambiar cualquier ajuste `ai.*`, `content.locale` o `general.locale`. */
export function resetPipeline(): void {
  pipelineP = null;
}
