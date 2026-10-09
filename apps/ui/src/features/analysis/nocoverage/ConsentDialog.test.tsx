import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@newpaper/i18n/react';
import { renderWithI18n } from '../../../test/renderWithI18n';
import { ConsentDialog } from './ConsentDialog';

describe('ConsentDialog (§6.4)', () => {
  it('requires ticking the box every single time', async () => {
    const onConfirm = vi.fn();
    const { rerender } = renderWithI18n(<ConsentDialog open onConfirm={onConfirm} onCancel={() => {}} />);
    const confirm = screen.getByRole('button', { name: 'Investigar sin verificar' });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('checkbox', { name: /no volver a preguntar/i })).toBeNull();

    const wrap = (open: boolean) => <I18nProvider initialLocale="es"><ConsentDialog open={open} onConfirm={onConfirm} onCancel={() => {}} /></I18nProvider>;
    rerender(wrap(false));
    rerender(wrap(true));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Investigar sin verificar' })).toBeDisabled();
  });
});
