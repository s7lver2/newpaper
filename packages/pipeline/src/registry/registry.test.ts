// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectProviders } from './detect';
import { loadRegistry } from './registry';

const file = JSON.parse(readFileSync(new URL('../../../../config/providers.json', import.meta.url), 'utf8'));
const reg = loadRegistry(file);

describe('providers registry', () => {
  it('loads every kept provider with recommended ones first', () => {
    for (const id of ['anthropic', 'openai', 'nous', 'nvidia', 'google', 'deepseek', 'xai', 'mistral', 'openrouter', 'groq', 'huggingface', 'ollama', 'lmstudio', 'custom'])
      expect(reg.get(id), id).toBeDefined();
    // Retirado por no servir a la app: sus modelos no admiten salida estructurada ni herramientas.
    expect(reg.get('perplexity')).toBeUndefined();
    expect(reg.recommended().map((p) => p.id)).toEqual(['google', 'openrouter', 'ollama']);
    expect(reg.byCategory('local').map((p) => p.id)).toEqual(['ollama', 'lmstudio']);
    expect(reg.get('nvidia')!.baseUrl).toBe('https://integrate.api.nvidia.com/v1');
    expect(reg.get('nous')!.baseUrl).toBe('https://inference-api.nousresearch.com/v1');
  });

  it('applies user price overrides on top of the registry', () => {
    const r = loadRegistry(file, { 'openai/gpt-6-luna': { input: 9, output: 99 } });
    expect(r.model('openai', 'gpt-6-luna')!.price).toEqual({ input: 9, output: 99 });
  });

  it('classifies every provider as open, closed or mixed, per model for aggregators', () => {
    const by = (o: string) => reg.providers.filter((p) => p.openness === o).map((p) => p.id).sort();
    expect(by('closed')).toEqual(['anthropic', 'google', 'openai', 'xai']);
    expect(by('mixed')).toEqual(['custom', 'openrouter']);
    expect(by('open')).toEqual(['deepseek', 'groq', 'huggingface', 'lmstudio', 'mistral', 'nous', 'nvidia', 'ollama']);
    expect(reg.opennessOf('openrouter', 'openai/gpt-6-luna')).toBe('closed');
    expect(reg.opennessOf('openrouter', 'nvidia/nemotron-3-super-120b-a12b:free')).toBe('open');
    expect(reg.opennessOf('openrouter', 'openrouter/auto')).toBe('mixed');
    expect(reg.opennessOf('groq', 'anything')).toBe('open');
    // Un modelo suelto de un proveedor de un solo tipo no contradice al proveedor.
    for (const p of reg.providers) if (p.openness !== 'mixed') for (const m of p.models) expect(m.openness ?? p.openness, `${p.id}/${m.id}`).toBe(p.openness);
  });

  it('declares logins only where they are verified: just OpenRouter can run, and its URLs stay on its host', () => {
    const withLogin = reg.providers.filter((p) => p.login);
    expect(withLogin.map((p) => [p.id, p.login!.status]).sort()).toEqual([['nous', 'unverified'], ['openrouter', 'available']]);
    const or = reg.get('openrouter')!;
    for (const u of [or.login!.authUrl, or.login!.exchangeUrl]) expect(new URL(u!).origin).toBe(new URL(or.baseUrl).origin);
    expect(reg.get('nous')!.login!.authUrl).toBeUndefined();
    // Anthropic prohíbe el acceso con la suscripción en apps de terceros; OpenAI/Gemini no tienen flujo público.
    for (const id of ['anthropic', 'openai', 'google']) expect(reg.get(id)!.login, id).toBeUndefined();
  });

  it('keeps ids unique and every model usable for structured output', () => {
    expect(new Set(reg.providers.map((p) => p.id)).size).toBe(reg.providers.length);
    for (const p of reg.providers) {
      if (p.category !== 'advanced') expect(p.models.some((m) => m.capabilities.includes('structured')), p.id).toBe(true);
      expect(new Set(p.models.map((m) => m.id)).size, p.id).toBe(p.models.length);
    }
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
    expect(detectProviders('sk-abc', reg).map((p) => p.id).sort()).toEqual(['deepseek', 'openai']);
    expect(detectProviders('nothing-known', reg)).toEqual([]);
  });
});
