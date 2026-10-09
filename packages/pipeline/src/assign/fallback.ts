/** §6.2/§10: si el modelo asignado falla, se usa su fallback (por defecto, el local). */
export async function runWithFallback<T>(primary: () => Promise<T>, fallback?: () => Promise<T>): Promise<{ value: T; usedFallback: boolean }> {
  try {
    return { value: await primary(), usedFallback: false };
  } catch (e) {
    if (!fallback) throw e;
    return { value: await fallback(), usedFallback: true };
  }
}
