import type { ProviderOptions } from '../stages/ctx';

/**
 * Ajustes por familia de proveedor. Gemini cuenta los tokens de razonamiento dentro de `maxOutputTokens`: con el tope
 * de 4096 de las demás APIs, una etapa larga (verificación, puntuación, síntesis) se queda sin sitio para el JSON, la
 * respuesta llega cortada y la etapa falla. Se le da margen; el razonamiento sigue siendo el que decide el modelo.
 */
export function providerTuning(adapter: string | undefined): { maxOutputTokens?: number; providerOptions?: ProviderOptions } {
  if (adapter === 'google') return { maxOutputTokens: 16_384 };
  return {};
}
