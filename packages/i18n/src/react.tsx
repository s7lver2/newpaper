import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './catalog';
import { createTranslator, resolveLocale, type Translator } from './translator';

interface I18nValue extends Translator {
  setLocale(locale: Locale): void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function detectSystemLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  return resolveLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

export function I18nProvider(props: {
  initialLocale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(props.initialLocale ?? DEFAULT_LOCALE);
  const { onLocaleChange } = props;
  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      onLocaleChange?.(next);
    },
    [onLocaleChange],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo<I18nValue>(() => ({ ...createTranslator(locale), setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

export function useT(): Translator['t'] {
  return useI18n().t;
}