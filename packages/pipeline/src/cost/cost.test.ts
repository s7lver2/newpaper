// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Assignments } from '../assign/presets';
import { loadRegistry } from '../registry/registry';
import { applyBudget } from './budget';
import { costOf, estimateAnalysis, estimateTokens } from './estimate';

const reg = loadRegistry(JSON.parse(readFileSync(new URL('../../../../config/providers.json', import.meta.url), 'utf8')));

describe('costs', () => {
  it('estimates tokens and prices per million', () => {
    expect(estimateTokens('a'.repeat(4000))).toBe(1000);
    expect(costOf(reg.model('openai', 'gpt-5'), 1_000_000, 100_000)).toBeCloseTo(1.25 + 1.0);
    expect(costOf(reg.model('nous', 'Hermes-4-70B'), 1000, 1000)).toBeNull();
    expect(costOf(reg.model('ollama', 'qwen3:8b'), 1000, 1000)).toBe(0);
  });

  it('estimates a full analysis and flags unknown prices', () => {
    const a: Assignments = { claims: { provider: 'openai', model: 'gpt-5-mini' }, verify: { provider: 'nous', model: 'Hermes-4-405B' } };
    const e = estimateAnalysis(reg, a, 'x'.repeat(8000), 6);
    expect(e.perStage.find((s) => s.stage === 'verify')!.usd).toBeNull();
    expect(e.unknown).toBe(true);
    expect(e.totalUsd).toBeGreaterThan(0);
  });
});

describe('applyBudget', () => {
  const a: Assignments = {
    verify: { provider: 'openai', model: 'gpt-5', fallback: { provider: 'ollama', model: 'qwen3:8b' } },
    judgeB: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    quickScore: { provider: 'ollama', model: 'qwen3:8b' },
  };
  it('keeps assignments under the limit', () => {
    expect(applyBudget(a, 4, 5, reg)).toEqual({ assignments: a, capped: false });
    expect(applyBudget(a, 999, null, reg).capped).toBe(false);
  });
  it('moves cloud stages to local once the monthly limit is reached', () => {
    const r = applyBudget(a, 5, 5, reg);
    expect(r.capped).toBe(true);
    expect(r.assignments.verify).toEqual({ provider: 'ollama', model: 'qwen3:8b' });
    expect(r.assignments.judgeB).toBeUndefined();
    expect(r.assignments.quickScore).toEqual(a.quickScore);
  });
});
