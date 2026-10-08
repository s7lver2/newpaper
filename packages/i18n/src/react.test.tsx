import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider, detectSystemLocale, useI18n, useT } from './react';

function Probe() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="out">{t('common.close')}</span>
      <span data-testid="loc">{locale}</span>
      <button onClick={() => setLocale('de')}>de</button>
    </div>
  );
}

describe('I18nProvider', () => {
  it('translates and switches locale without remounting', () => {
    const onChange = vi.fn();
    render(
      <I18nProvider initialLocale="en" onLocaleChange={onChange}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('out').textContent).toBe('Close');
    act(() => screen.getByText('de').click());
    expect(screen.getByTestId('out').textContent).toBe('Schließen');
    expect(screen.getByTestId('loc').textContent).toBe('de');
    expect(onChange).toHaveBeenCalledWith('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('detects the system locale from navigator.languages', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US', 'es-ES']);
    expect(detectSystemLocale()).toBe('en');
  });

  it('throws a clear error outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useI18n must be used inside <I18nProvider>');
  });
});