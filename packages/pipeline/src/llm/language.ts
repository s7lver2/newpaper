export type OutputLocale = 'es' | 'en' | 'de';
const NAMES: Record<OutputLocale, string> = { es: 'Spanish', en: 'English', de: 'German' };

/** §14: salida en el idioma del usuario; citas textuales en su idioma original. */
export function languageInstruction(locale: OutputLocale): string {
  return `Write every explanation, label and summary in ${NAMES[locale]}. Keep verbatim quotes in their original language; you may add a translation in square brackets after a quote.`;
}
