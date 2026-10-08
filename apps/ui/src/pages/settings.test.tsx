import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../test/renderWithI18n';
import { DataSection } from './settings/DataSection';
import { GeneralSection } from './settings/GeneralSection';

describe('GeneralSection', () => {
  it('changes the interface language live and saves it', async () => {
    const saved: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === 'settings_set') saved.push(args);
      return null;
    });
    renderWithI18n(<GeneralSection />);
    await userEvent.click(screen.getAllByRole('radio', { name: 'English' })[0]!);
    expect(await screen.findByText('Interface language')).toBeInTheDocument();
    expect(saved).toContainEqual({ key: 'general.locale', value: 'en' });
    await userEvent.click(screen.getByRole('radio', { name: 'Ink' }));
    expect(saved).toContainEqual({ key: 'appearance.theme', value: 'ink' });
    expect(document.documentElement.dataset.theme).toBe('ink');
  });
});

describe('DataSection', () => {
  it('sets retention, pauses and deletes history', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'history_delete') return 3;
      return null;
    });
    renderWithI18n(<DataSection />);
    await userEvent.click(screen.getByRole('radio', { name: '30 días' }));
    expect(calls).toContainEqual(['settings_set', { key: 'history.retentionDays', value: 30 }]);
    await userEvent.click(screen.getByRole('radio', { name: 'Siempre' }));
    expect(calls).toContainEqual(['settings_set', { key: 'history.retentionDays', value: null }]);
    await userEvent.click(screen.getByRole('switch', { name: 'Pausar el historial' }));
    expect(calls).toContainEqual(['settings_set', { key: 'history.paused', value: true }]);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar todo el historial' }));
    expect(calls).toContainEqual(['history_delete', { scope: { scope: 'all' } }]);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3 entradas borradas'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Dominio del medio' }), 'www.elpais.com');
    await userEvent.click(screen.getByRole('button', { name: 'Borrar lo de un medio' }));
    expect(calls).toContainEqual(['history_delete', { scope: { scope: 'outlet', outlet: 'elpais.com' } }]);
  });
});
