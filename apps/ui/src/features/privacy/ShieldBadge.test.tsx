import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TabInfo } from '../../ipc/types';
import { renderWithI18n } from '../../test/renderWithI18n';
import { ShieldBadge } from './ShieldBadge';
import { applyBlocked, applyCounts, resetPrivacyStore } from './usePrivacy';

const tab = { id: 3, url: 'https://a.example/', title: 'A', kind: 'web' } as TabInfo;

describe('ShieldBadge', () => {
  beforeEach(() => resetPrivacyStore());

  it('shows the per-tab count and opens a popover with today total', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return cmd === 'adblock_status' ? { enabled: true, lists: [], lastRefresh: null } : null;
    });
    act(() => {
      applyBlocked({ tabId: 3, tabCount: 47 });
      applyCounts({ tabs: { '3': 47 }, today: 1832 });
    });
    renderWithI18n(<ShieldBadge tab={tab} />);
    const button = screen.getByRole('button', { name: '47 elementos bloqueados en esta página' });
    expect(button).toHaveTextContent('47');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1832')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('switch', { name: 'Bloquear anuncios y rastreadores' }));
    expect(calls).toContainEqual(['adblock_set_enabled', { enabled: false }]);
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
