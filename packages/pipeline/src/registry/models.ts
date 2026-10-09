import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, type LanguageModel } from 'ai';
import type { ProviderEntry } from './schema';

export interface ModelRef { provider: string; model: string }

/** Rust sustituye este valor por la clave del llavero; JS nunca la conoce. */
const PLACEHOLDER_KEY = 'np-proxied';

export function createModel(p: ProviderEntry, modelId: string, fetchImpl: typeof fetch, baseUrlOverride?: string): LanguageModel {
  const baseURL = baseUrlOverride ?? p.baseUrl;
  const apiKey = p.auth === 'none' ? undefined : PLACEHOLDER_KEY;
  switch (p.adapter) {
    case 'anthropic':
      return createAnthropic({ apiKey: PLACEHOLDER_KEY, baseURL, fetch: fetchImpl })(modelId);
    case 'openai':
      return createOpenAI({ apiKey: PLACEHOLDER_KEY, baseURL, fetch: fetchImpl })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: PLACEHOLDER_KEY, baseURL, fetch: fetchImpl })(modelId);
    default: {
      const structured = p.models.find((m) => m.id === modelId)?.capabilities.includes('structured') ?? true;
      return createOpenAICompatible({ name: p.id, baseURL, apiKey, fetch: fetchImpl, supportsStructuredOutputs: structured })(modelId);
    }
  }
}

export async function testConnection(model: LanguageModel) {
  const t0 = performance.now();
  try {
    await generateText({ model, prompt: 'Reply with: ok', maxOutputTokens: 8, maxRetries: 0 });
    return { ok: true as const, latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false as const, latencyMs: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e) };
  }
}
