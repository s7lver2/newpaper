import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { describe, expect, it } from 'vitest';
import type { AdblockStatus } from '../../ipc/types';
import { renderWithI18n } from '../../test/renderWithI18n';
import { BlockingSection } from './BlockingSection';

const STATUS: AdblockStatus = {
  enabled: true,
  lastRefresh: Date.UTC(2026, 9, 6, 8) / 1000,
  lists: [
    { id: 'easylist', name: 'EasyList', category: 'ads', enabled: true, source: 'downloaded', fetchedAt: Date.UTC(2026, 9, 6, 8) / 1000 },
    { id: 'easylist-cookie', name: 'EasyList Cookie', category: 'cookies', enabled: false, source: 'embedded', fetchedAt: null },
  ],
};

describe('BlockingSection', () => {
  it('lists filter lists with category and source, toggles and refreshes', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'adblock_refresh') return { updated: ['easylist'], failed: [['easyprivacy', '404']], skipped: false };
      return STATUS;
    });
    renderWithI18n(<BlockingSection />);
    expect(await screen.findByText('EasyList')).toBeInTheDocument();
    expect(screen.getByText('Banners de cookies')).toBeInTheDocument();
    expect(screen.getByText('Copia incluida en la app')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'EasyList Cookie' }));
    expect(calls).toContainEqual(['adblock_set_list', { id: 'easylist-cookie', enabled: true }]);
    await userEvent.click(screen.getByRole('switch', { name: /Bloquear anuncios, rastreadores/ }));
    expect(calls).toContainEqual(['adblock_set_enabled', { enabled: false }]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 lista actualizada'));
    expect(screen.getByRole('status')).toHaveTextContent('1 lista no se pudo descargar');
  });
});
