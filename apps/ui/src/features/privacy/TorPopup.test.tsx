import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrivacyStatus, TabInfo } from '../../ipc/types';
import { renderWithI18n } from '../../test/renderWithI18n';
import { TorChip } from './TorChip';
import { TorPopup } from './TorPopup';
import { applyStatus, resetPrivacyStore } from './usePrivacy';
import { withoutTorStore } from './withoutTor';

const status = (p: Partial<PrivacyStatus> = {}): PrivacyStatus => ({
  mode: 'tor', tor: { state: 'ready' }, socksPort: 1, exitCountry: null, circuit: 4,
  aiViaTor: false, feedsViaTor: true, killSwitchActive: false, tabsWithoutTor: [], ...p,
});

describe('TorChip', () => {
  beforeEach(() => resetPrivacyStore());

  it('reflects mode, exit country, failure and per-tab override', () => {
    const tab = { id: 2 } as TabInfo;
    act(() => applyStatus(status({ mode: 'direct', tor: { state: 'off' } })));
    renderWithI18n(<TorChip tab={tab} />);
    expect(screen.getByRole('button', { name: /Directo/ })).toBeInTheDocument();
    act(() => applyStatus(status({ exitCountry: 'DE' })));
    expect(screen.getByRole('button', { name: /Conectado a Tor/ })).toHaveTextContent('Tor · DE');
    act(() => applyStatus(status({ tor: { state: 'failed', message: 'x' }, killSwitchActive: true })));
    expect(screen.getByRole('button')).toHaveAttribute('data-failed', 'true');
    act(() => applyStatus(status({ tabsWithoutTor: [2] })));
    expect(screen.getByRole('button')).toHaveTextContent('Sin Tor');
  });
});

describe('TorPopup', () => {
  beforeEach(() => resetPrivacyStore());

  it('cycles exit countries with arrows and flies to the chosen one', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return status({ exitCountry: 'NL' });
    });
    act(() => applyStatus(status()));
    renderWithI18n(<TorPopup tabId={2} onClose={vi.fn()} />);
    expect(screen.getByText('Automático')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'País siguiente' }));
    expect(screen.getByText('Alemania')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Países Bajos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Volar a Países Bajos' }));
    expect(calls).toContainEqual(['tor_set_exit_country', { country: 'NL' }]);
    // Durante la animación del avión el botón cambia de texto; se espera a que vuelva a estar disponible.
    await userEvent.click(screen.getByRole('button', { name: 'País anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'País anterior' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Volar a cualquier país' }, { timeout: 4000 }));
    expect(calls).toContainEqual(['tor_set_exit_country', { country: null }]);
  });

  it('offers a new circuit, the without-Tor warning and more options', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return status({ circuit: 5 });
    });
    act(() => applyStatus(status()));
    renderWithI18n(<TorPopup tabId={2} onClose={vi.fn()} />);
    expect(screen.getByText('Circuito n.º 4')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo circuito' }));
    expect(calls).toContainEqual(['tor_new_circuit', { tabId: 2 }]);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir esta pestaña sin Tor' }));
    expect(withoutTorStore.get().pendingTabId).toBe(2);
  });

  it('offers to turn Tor on in direct mode', async () => {
    const calls: string[] = [];
    mockIPC((cmd) => {
      calls.push(cmd);
      return status();
    });
    act(() => applyStatus(status({ mode: 'direct', tor: { state: 'off' } })));
    renderWithI18n(<TorPopup tabId={2} onClose={vi.fn()} />);
    expect(screen.getByText('Conexión directa: los medios ven tu IP real. El bloqueo sigue activo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activar Tor' }));
    expect(calls).toContain('net_set_mode');
  });
});
