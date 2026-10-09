import type { OutputLocale } from '../llm/language';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SELF_REFS: Record<OutputLocale, RegExp[]> = {
  es: [
    /\b(seg[uú]n|como) (public[oó]|inform[oó]|adelant[oó]|revel[oó]) [^,.;]*[,.;]?\s*/gi,
    /,?\s*(consultad[ao]s? por|a las que ha tenido acceso|seg[uú]n ha sabido) (este|esta) (diario|peri[oó]dico|medio|cabecera|redacci[oó]n)/gi,
    /\b(este|esta|nuestro|nuestra) (diario|peri[oó]dico|medio|cabecera|redacci[oó]n)\b/gi,
  ],
  en: [/\b(as|according to what) (this|our) (newspaper|paper|outlet|site) (reported|revealed)[^,.;]*[,.;]?\s*/gi, /\b(this|our) (newspaper|paper|outlet|newsroom)\b/gi],
  de: [/\bwie (unsere|diese) (Zeitung|Redaktion) (berichtete|meldete|erfuhr)[^,.;]*[,.;]?\s*/gi, /\b(unsere|diese) (Zeitung|Redaktion)\b/gi],
};

const CAPTIONS = /^(foto|imagen|fotograf[ií]a|photo|picture|bild|image)\s*:.*$/gim;
const BYLINE_LEAD = /^\s*(por|by|von)\s+[^.\n]{2,80}\.\s*/i;

/** §5.2.1.1: quita identidad del medio (nombres, dominios, URLs, firmas y autorreferencias) antes de puntuar. */
export function anonymize(text: string, info: { outletNames: string[]; domains: string[]; bylines: string[]; locale: OutputLocale }): string {
  let t = text.replace(CAPTIONS, '');
  for (const b of info.bylines.filter(Boolean)) {
    t = t.replace(new RegExp(`^\\s*(por|by|von)\\s+${esc(b)}\\.?\\s*`, 'i'), '').replace(new RegExp(esc(b), 'gi'), '');
  }
  t = t.replace(BYLINE_LEAD, (m) => (info.bylines.length ? '' : m));
  t = t.replace(/https?:\/\/\S+/g, '');
  for (const d of info.domains.filter(Boolean)) t = t.replace(new RegExp(`(www\\.)?${esc(d)}\\S*`, 'gi'), '');
  for (const re of SELF_REFS[info.locale]) t = t.replace(re, '');
  for (const n of info.outletNames.filter((x) => x.trim().length > 2)) t = t.replace(new RegExp(esc(n), 'gi'), '');
  return t
    .split('\n')
    .map((l) => l.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').replace(/(^|[.!?]\s+)[,;]\s*/g, '$1').trim())
    .filter((l) => l && !/^[\s/.,;:–-]*$/.test(l))
    .join('\n');
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Etiqueta ciega de cada documento ("Documento A"…); el juez nunca ve nombres de medios. */
export function docLabel(i: number, locale: OutputLocale): string {
  return `${locale === 'es' ? 'Documento' : 'Document'} ${LETTERS[i % 26]}`;
}
