import {
  autoAssign, createModel, createPipeline, DEFAULT_WEIGHTS, loadRegistry, makeProxyFetch,
  type Assignments, type FramingWeights, type Pipeline, type PresetId, type Registry,
} from '@newpaper/pipeline';
import { commands } from '../../ipc/commands';
import type { CustomEndpoint } from '../../ipc/types';
import { useSetting } from '../../state/settings';
import { pickFallback } from './liveModels';
import { extract, tauriCache, tauriCoverage, tauriInvoker, tauriLexicon, tauriSources, tauriUsage } from './tauriPorts';

type Locale = 'es' | 'en' | 'de';
const asLocale = (l: string | null): Locale => (l === 'en' || l === 'de' ? l : 'es');

let registryP: Promise<Registry> | null = null;
let pipelineP: Promise<Pipeline> | null = null;

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await commands.configRead(name)) as T;
  } catch {
    return fallback;
  }
}

export function getRegistry(): Promise<Registry> {
  registryP ??= (async () => loadRegistry(await readJson('providers.json', { version: 1, providers: [] }), await readJson('prices.json', {})))();
  return registryP;
}

async function build(): Promise<Pipeline> {
  const registry = await getRegistry();
  const contentLocale = asLocale(await commands.settingsGet<string>('content.locale'));
  const uiLocale = asLocale(await commands.settingsGet<string>('general.locale'));
  const liveModels = (await commands.settingsGet<Record<string, string[]>>('ai.liveModels')) ?? {};
  const working = (await commands.settingsGet<Record<string, string>>('ai.workingModels')) ?? {};
  const custom = (await commands.settingsGet<CustomEndpoint[]>('ai.customEndpoints')) ?? [];
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
        // Un modelo retirado por el proveedor (410/404) se sustituye por uno vivo de su lista.
        const live = liveModels[ref.provider];
        const id = working[ref.provider] ?? (live?.length && !live.includes(ref.model) ? (pickFallback(live) ?? ref.model) : ref.model);
        const m = registry.model(ref.provider, id) ?? registry.model(ref.provider, ref.model);
        return { model: createModel(p, id, makeProxyFetch(ref.provider, tauriInvoker), base), noTemperature: m?.noTemperature ?? false };
      },
    },
    async assignments() {
      const saved = (await commands.settingsGet<Assignments>('ai.assignments')) ?? {};
      if (Object.keys(saved).length) return saved;
      const connected = (await commands.settingsGet<string[]>('ai.connected')) ?? [];
      const preset = ((await commands.settingsGet<PresetId>('ai.preset')) ?? 'balanced') as PresetId;
      const probe = await commands.aiLocalProbe().catch(() => ({ ollama: null, lmstudio: null }));
      const local: Record<string, string[]> = {};
      if (probe.ollama?.length) local.ollama = probe.ollama;
      if (probe.lmstudio?.length) local.lmstudio = probe.lmstudio;
      return autoAssign(registry, [...connected, ...Object.keys(local)], preset, local);
    },
    async budget() {
      const limit = await commands.settingsGet<number>('ai.monthlyLimitUsd');
      return { spentUsd: (await commands.usageMonth()).cost, limitUsd: typeof limit === 'number' ? limit : null };
    },
    usage: tauriUsage,
    cache: tauriCache,
    coverage: tauriCoverage,
    lexicon: tauriLexicon,
    sources: tauriSources,
    extract,
    primaryDomains: async () => (primary[contentLocale] ?? []).map((p) => p.dominio),
    partyIds: async () => (parties.parties ?? []).map((p) => p.id),
    framingWeights: async () => weights,
    // El idioma de salida es el de la interfaz (§14): el usuario lee los análisis en su idioma.
    locale: () => uiLocale,
    onAnalyzed: async (url) => void (await commands.historyMarkAnalyzed(url)),
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

export function useAiSettings() {
  const [assignments, setAssignments] = useSetting<Assignments>('ai.assignments', {});
  const [preset, setPreset] = useSetting<PresetId>('ai.preset', 'balanced');
  const [monthlyLimitUsd, setMonthlyLimitUsd] = useSetting<number | null>('ai.monthlyLimitUsd', null);
  const [connected, setConnected] = useSetting<string[]>('ai.connected', []);
  const [quickOnOpen, setQuickOnOpen] = useSetting<boolean>('ai.quickOnOpen', true);
  const [autoFull, setAutoFull] = useSetting<boolean>('ai.autoFull', false);
  const [detector, setDetector] = useSetting<boolean>('ai.detector', true);
  const wrap = <T,>(set: (v: T) => Promise<void>) => async (v: T) => {
    await set(v);
    resetPipeline();
  };
  return {
    assignments, setAssignments: wrap(setAssignments),
    preset, setPreset: wrap(setPreset),
    monthlyLimitUsd, setMonthlyLimitUsd: wrap(setMonthlyLimitUsd),
    connected, setConnected: wrap(setConnected),
    quickOnOpen, setQuickOnOpen,
    autoFull, setAutoFull,
    detector, setDetector,
  };
}
