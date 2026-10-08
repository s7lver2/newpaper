import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../test/renderWithI18n';
import { OpenWithoutTorDialog } from './OpenWithoutTorDialog';
import { requestOpenWithoutTor, withoutTorStore } from './withoutTor';

describe('OpenWithoutTorDialog', () => {
  it('is hidden until requested, then confirms explicitly for that tab only', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return { mode: 'tor', tor: { state: 'ready' }, socksPort: 1, exitCountry: null, circuit: 1, aiViaTor: false, feedsViaTor: true, killSwitchActive: false, tabsWithoutTor: [5] };
    });
    renderWithI18n(<OpenWithoutTorDialog />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => requestOpenWithoutTor(5));
    const dialog = screen.getByRole('alertdialog', { name: '¿Abrir esta pestaña sin Tor?' });
    expect(dialog).toHaveTextContent('Solo afecta a esta pestaña.');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir sin Tor' }));
    expect(calls).toContainEqual(['tab_without_tor', { tabId: 5 }]);
    expect(withoutTorStore.get().pendingTabId).toBeNull();
  });

  it('cancels with Escape without calling Rust', async () => {
    const calls: string[] = [];
    mockIPC((cmd) => {
      calls.push(cmd);
      return null;
    });
    renderWithI18n(<OpenWithoutTorDialog />);
    act(() => requestOpenWithoutTor(9));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls).not.toContain('tab_without_tor');
  });
});
