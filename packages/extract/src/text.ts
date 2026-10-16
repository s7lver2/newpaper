/**
 * Texto canónico de un artículo: la ÚNICA fuente de verdad de los desplazamientos (offsets).
 * El análisis recibe este texto, devuelve marcas sobre él y el lector pinta ese mismo texto; si alguno
 * de los dos usara otra normalización (NBSP, saltos de línea sueltos, espacios dobles…), las marcas
 * caerían en otro sitio. Es idempotente: normalizeText(normalizeText(x)) === normalizeText(x).
 */
export function normalizeText(raw: string): string {
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    // Espacios raros → espacio normal; invisibles (ancho cero, guion blando, BOM, marcas bidireccionales) → nada.
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u00AD\u200B-\u200F\u2060\u2066-\u2069\uFEFF]/g, '')
    .replace(/[\u2028\u2029\u000B\u000C]/g, '\n');
  // Un párrafo es lo que queda entre líneas en blanco; los saltos sueltos dentro de él son espacios.
  return cleaned
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}
