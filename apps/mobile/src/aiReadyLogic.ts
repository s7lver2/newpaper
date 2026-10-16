/**
 * ¿Hay algún proveedor de IA con el que analizar? Sí cuando hay proveedores conectados (`ai.connected`) o el Ollama del PC
 * (`ai.customEndpoints` con id `ollama`).
 */
export function hasProvider(connected: unknown, custom: unknown): boolean {
  const ids = Array.isArray(connected) ? connected.filter((x) => typeof x === 'string') : [];
  const pc = Array.isArray(custom) && custom.some((c) => (c as { id?: unknown } | null)?.id === 'ollama');
  return ids.length > 0 || pc;
}
