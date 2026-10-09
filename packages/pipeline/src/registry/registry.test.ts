// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectProviders } from './detect';
import { loadRegistry } from './registry';

const file = JSON.parse(readFileSync(new URL('../../../../config/providers.json', import.meta.url), 'utf8'));
const reg = loadRegistry(file);

describe('providers registry', () => {
  it('loads every spec provider with recommended ones first', () => {
    for (const id of ['anthropic', 'openai', 'nous', 'nvidia', 'google', 'deepseek', 'xai', 'mistral', 'perplexity', 'openrouter', 'groq', 'huggingface', 'ollama', 'lmstudio', 'custom'])
      expect(reg.get(id), id).toBeDefined();
    expect(reg.recommended().map((p) => p.id)).toEqual(['openai', 'nous']);
    expect(reg.byCategory('local').map((p) => p.id)).toEqual(['ollama', 'lmstudio']);
    expect(reg.get('nvidia')!.baseUrl).toBe('https://integrate.api.nvidia.com/v1');
    expect(reg.get('nous')!.baseUrl).toBe('https://inference-api.nousresearch.com/v1');
  });

  it('applies user price overrides on top of the registry', () => {
    const r = loadRegistry(file, { 'openai/gpt-5-mini': { input: 9, output: 99 } });
    expect(r.model('openai', 'gpt-5-mini')!.price).toEqual({ input: 9, output: 99 });
  });

  it('rejects malformed registries', () => {
    expect(() => loadRegistry({ version: 1, providers: [{ id: 'X Y' }] })).toThrow();
  });
});

describe('detectProviders', () => {
  it('detects by key prefix with the longest prefix first', () => {
    expect(detectProviders('sk-ant-api03-xyz', reg).map((p) => p.id)).toEqual(['anthropic']);
    expect(detectProviders('  nvapi-abc ', reg).map((p) => p.id)).toEqual(['nvidia']);
    expect(detectProviders('gsk_123', reg)[0]!.id).toBe('groq');
    expect(detectProviders('AIzaSy123', reg)[0]!.id).toBe('google');
    expect(detectProviders('sk-or-v1-abc', reg)[0]!.id).toBe('openrouter');
    expect(detectProviders('sk-proj-abc', reg)[0]!.id).toBe('openai');
    expect(detectProviders('sk-abc', reg).map((p) => p.id)).toEqual(['openai', 'deepseek']);
    expect(detectProviders('nothing-known', reg)).toEqual([]);
  });
});
