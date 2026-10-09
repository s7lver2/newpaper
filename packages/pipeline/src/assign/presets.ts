import type { StageId } from '../llm/structured';
import type { Registry } from '../registry/registry';
import type { ModelEntry, ProviderEntry } from '../registry/schema';

export interface Assignment { provider: string; model: string; temperature?: number; fallback?: { provider: string; model: string } }
export type Assignments = Partial<Record<StageId, Assignment>>;
export type PresetId = 'privacy' | 'balanced' | 'quality' | 'cheap';
export const PRESETS: { id: PresetId }[] = [{ id: 'privacy' }, { id: 'balanced' }, { id: 'quality' }, { id: 'cheap' }];

const LIGHT: StageId[] = ['claims', 'quickScore', 'aiDetect'];
const HEAVY: StageId[] = ['verify', 'score', 'synthesis', 'agent', 'investigate'];
const TEMPERATURE: Partial<Record<StageId, number>> = { claims: 0, quickScore: 0, verify: 0, score: 0, judgeB: 0, aiDetect: 0, synthesis: 0.3, agent: 0.4, investigate: 0.2 };

interface Candidate { p: ProviderEntry; m: ModelEntry }

function candidates(reg: Registry, connected: string[], localModels: Record<string, string[]>): Candidate[] {
  const out: Candidate[] = [];
  for (const p of reg.providers) {
    if (!connected.includes(p.id)) continue;
    if (p.type === 'local') {
      const ids = localModels[p.id]?.length ? localModels[p.id]! : p.models.map((m) => m.id);
      for (const id of ids) out.push({ p, m: p.models.find((m) => m.id === id) ?? { id, name: id, price: { input: 0, output: 0 }, latency: 'medium', capabilities: ['structured'], tier: 'light' } });
    } else {
      for (const m of p.models) if (m.capabilities.includes('structured')) out.push({ p, m });
    }
  }
  return out;
}

const cost = (c: Candidate) => (c.m.price ? c.m.price.input + c.m.price.output * 3 : Number.POSITIVE_INFINITY);
const rank = (c: Candidate) => (c.p.category === 'recommended' ? 0 : 1);

function pick(list: Candidate[], want: { local?: boolean; tier?: 'light' | 'strong'; cheapest?: boolean; exclude?: string }): Candidate | undefined {
  let l = list.filter((c) => (want.local === undefined ? true : (c.p.type === 'local') === want.local) && c.p.id !== want.exclude);
  if (want.tier) {
    const tiered = l.filter((c) => c.m.tier === want.tier);
    if (tiered.length) l = tiered;
  }
  const sorted = [...l].sort((a, b) => (want.cheapest ? cost(a) - cost(b) : rank(a) - rank(b) || Number(b.m.tier === 'strong') - Number(a.m.tier === 'strong')));
  return sorted[0];
}

export function autoAssign(reg: Registry, connected: string[], preset: PresetId, localModels: Record<string, string[]> = {}): Assignments {
  const list = candidates(reg, connected, localModels);
  if (!list.length) return {};
  const local = pick(list, { local: true });
  const fallback = local ? { provider: local.p.id, model: local.m.id } : undefined;
  const as = (c: Candidate | undefined, stage: StageId): Assignment | undefined =>
    c ? { provider: c.p.id, model: c.m.id, temperature: TEMPERATURE[stage], ...(fallback && c.p.type !== 'local' ? { fallback } : {}) } : undefined;

  const out: Assignments = {};
  const set = (stage: StageId, c: Candidate | undefined) => {
    const a = as(c, stage);
    if (a) out[stage] = a;
  };

  if (preset === 'privacy') {
    for (const s of [...LIGHT, ...HEAVY]) set(s, local);
    return out;
  }
  const strong = pick(list, { local: false, tier: 'strong' }) ?? local;
  const cheapCloud = pick(list, { local: false, tier: 'light', cheapest: true }) ?? strong;
  for (const s of LIGHT) {
    if (preset === 'quality') set(s, strong);
    else if (preset === 'cheap') set(s, pick(list, { cheapest: true, tier: 'light' }));
    else set(s, local ?? cheapCloud);
  }
  for (const s of HEAVY) set(s, preset === 'cheap' ? cheapCloud : strong);
  if (local) set('quickScore', local);
  if (preset === 'balanced' || preset === 'quality') {
    const other = pick(list, { local: false, tier: 'strong', exclude: strong?.p.id });
    if (other && other.p.id !== strong?.p.id) set('judgeB', other);
  }
  return out;
}

export function describeAssignment(reg: Registry, a: Assignments) {
  return (Object.entries(a) as [StageId, Assignment][]).map(([stage, x]) => {
    const p = reg.get(x.provider);
    return { stage, providerName: p?.name ?? x.provider, modelName: reg.model(x.provider, x.model)?.name ?? x.model, local: p?.type === 'local' };
  });
}
