import { useI18n } from '@newpaper/i18n/react';
import { usdFormatter } from '@newpaper/ui-kit/logic';
import { useMemo } from 'react';

// La lógica pura (pasos, costes, importes, nombres) vive en @newpaper/ui-kit/logic; aquí queda el hook de idioma.
export * from '@newpaper/ui-kit/logic';

/** Importes en dólares según el idioma de la interfaz. */
export function useUsd(whole = false): (n: number) => string {
  const { locale } = useI18n();
  return useMemo(() => usdFormatter(locale, whole), [locale, whole]);
}
