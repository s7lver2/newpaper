import type { NewsSignals } from './article';

function typesOf(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => typesOf(n, out));
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  if (typeof t === 'string') out.push(t);
  else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && out.push(x));
  if (obj['@graph']) typesOf(obj['@graph'], out);
}

export function collectSignals(doc: Document): NewsSignals {
  const og = doc.querySelector('meta[property="og:type"]')?.getAttribute('content')?.trim().toLowerCase() || null;
  const jsonLdTypes: string[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      typesOf(JSON.parse(s.textContent ?? ''), jsonLdTypes);
    } catch {
      /* JSON-LD roto: se ignora */
    }
  });
  return { ogType: og, jsonLdTypes };
}

export function looksLikeNews(s: NewsSignals): boolean {
  return s.ogType === 'article' || s.jsonLdTypes.some((t) => /NewsArticle$/.test(t));
}
