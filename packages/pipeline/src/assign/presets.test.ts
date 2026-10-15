// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../registry/registry';
import { autoAssign } from './presets';

const reg = loadRegistry(JSON.parse(readFileSync(new URL('../../../../config/providers.json', import.meta.url), 'utf8')));

describe('autoAssign with the current provider list', () => {
  it('uses a free-tier-safe strong model for Gemini and never the paid-only Argon first', () => {
    const a = autoAssign(reg, ['google'], 'balanced');
    expect(a.synthesis?.model).toBe('gemini-3.8-flash');
    expect(a.claims?.model).toBe('gemini-3.5-flash-lite');
  });

  it('prefers the recommended provider when several are connected, and keeps a different judge', () => {
    const a = autoAssign(reg, ['anthropic', 'google'], 'quality');
    expect(a.synthesis?.provider).toBe('google');
    expect(a.judgeB?.provider).toBe('anthropic');
  });

  it('a login-only OpenRouter user gets free models that support structured output', () => {
    const a = autoAssign(reg, ['openrouter'], 'cheap');
    expect(a.claims?.model).toBe('openrouter/free');
    expect(a.synthesis?.model).toBe('openrouter/free');
  });

  it('privacy sends everything to the local model and local becomes the fallback of cloud stages', () => {
    const p = autoAssign(reg, ['google', 'ollama'], 'privacy', { ollama: ['qwen3:8b'] });
    expect(Object.values(p).every((x) => x.provider === 'ollama')).toBe(true);
    const b = autoAssign(reg, ['google', 'ollama'], 'balanced', { ollama: ['qwen3:8b'] });
    expect(b.verify?.fallback).toEqual({ provider: 'ollama', model: 'qwen3:8b' });
  });
});
