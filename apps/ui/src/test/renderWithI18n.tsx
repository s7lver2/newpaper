import { render, type RenderOptions } from '@testing-library/react';
import { I18nProvider } from '@newpaper/i18n/react';
import type { Locale } from '@newpaper/i18n';
import type { ReactElement } from 'react';

export function renderWithI18n(ui: ReactElement, opts: RenderOptions & { locale?: Locale } = {}) {
  const { locale = 'es', ...rest } = opts;
  return render(<I18nProvider initialLocale={locale}>{ui}</I18nProvider>, rest);
}
