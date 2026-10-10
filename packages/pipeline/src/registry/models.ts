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

/** Un modelo grande en frío puede tardar; más de esto se da por no disponible. */
export const TEST_TIMEOUT_MS = 40_000;

export async function testConnection(model: LanguageModel, timeoutMs = TEST_TIMEOUT_MS) {
  const t0 = performance.now();
  try {
    await generateText({ model, prompt: 'Reply with: ok', maxOutputTokens: 8, maxRetries: 0, abortSignal: AbortSignal.timeout(timeoutMs) });
    return { ok: true as const, latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false as const, latencyMs: Math.round(performance.now() - t0), error: describeError(e) };
  }
}

/** Mensaje legible con el código HTTP y el cuerpo que devolvió el proveedor (sin cabeceras ni clave). */
export function describeError(e: unknown): string {
  const o = (e ?? {}) as { message?: unknown; statusCode?: unknown; responseBody?: unknown; name?: unknown; cause?: unknown };
  const parts: string[] = [];
  if (typeof o.statusCode === "number") parts.push(`HTTP ${o.statusCode}`);
  const msg = typeof o.message === "string" ? o.message.trim() : "";
  if (msg) parts.push(msg);
  else if (typeof o.responseBody === "string" && o.responseBody.trim()) parts.push(o.responseBody.trim().slice(0, 300));
  else if (o.cause instanceof Error && o.cause.message) parts.push(o.cause.message);
  if (o.name === "TimeoutError" || o.name === "AbortError") parts.unshift("sin respuesta a tiempo (el modelo tarda demasiado o está saturado)");
  if (!parts.length) parts.push(typeof o.name === "string" ? o.name : "error desconocido");
  return parts.join(": ").slice(0, 400);
}
