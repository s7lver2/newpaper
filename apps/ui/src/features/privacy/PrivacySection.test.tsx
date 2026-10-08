import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrivacyStatus } from '../../ipc/types';
import { renderWithI18n } from '../../test/renderWithI18n';
import { PrivacySection } from './PrivacySection';
import { applyStatus, resetPrivacyStore } from './usePrivacy';

const base: PrivacyStatus = {
  mode: 'direct', tor: { state: 'off' }, socksPort: 1, exitCountry: null, circuit: 1,
  aiViaTor: false, feedsViaTor: true, killSwitchActive: false, tabsWithoutTor: [],
};

describe('PrivacySection', () => {
  beforeEach(() => resetPrivacyStore());

  it('switches mode, keeps WireGuard disabled and explains the restart', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return { ...base, mode: 'tor', tor: { state: 'ready' } };
    });
    act(() => applyStatus(base));
    renderWithI18n(<PrivacySection />);
    expect(screen.getByText(/reinicia el motor web/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /WireGuard/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /^Tor/ }));
    expect(calls).toContainEqual(['net_set_mode', { mode: 'tor' }]);
    expect(await screen.findByRole('radiogroup', { name: 'País de salida' })).toBeInTheDocument();
  });

  it('picks an exit country and toggles routing', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return { ...base, mode: 'tor', tor: { state: 'ready' }, exitCountry: 'SE' };
    });
    act(() => applyStatus({ ...base, mode: 'tor', tor: { state: 'ready' } }));
    renderWithI18n(<PrivacySection />);
    await userEvent.click(screen.getByRole('radio', { name: 'Suecia' }));
    expect(calls).toContainEqual(['tor_set_exit_country', { country: 'SE' }]);
    await userEvent.click(screen.getByRole('switch', { name: 'Enviar las peticiones de IA por Tor' }));
    expect(calls).toContainEqual(['privacy_set_routing', { aiViaTor: true }]);
    await userEvent.click(screen.getByRole('switch', { name: 'Descargar las fuentes RSS por Tor' }));
    expect(calls).toContainEqual(['privacy_set_routing', { feedsViaTor: false }]);
  });
});
