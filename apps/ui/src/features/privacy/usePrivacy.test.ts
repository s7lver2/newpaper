import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyBlocked, applyCounts, privacyStore, resetPrivacyStore, startPrivacySync } from './usePrivacy';
import { cancelOpenWithoutTor, requestOpenWithoutTor, withoutTorStore } from './withoutTor';

const STATUS = {
  mode: 'tor', tor: { state: 'ready' }, socksPort: 50123, exitCountry: null, circuit: 1,
  aiViaTor: false, feedsViaTor: true, killSwitchActive: false, tabsWithoutTor: [],
};

describe('privacy store', () => {
  beforeEach(() => resetPrivacyStore());

  it('loads status and today counter on start', async () => {
    mockIPC((cmd) => (cmd === 'privacy_status' ? STATUS : cmd === 'blocked_counts' ? { tab: 0, today: 1832 } : null));
    const stop = await startPrivacySync();
    expect(privacyStore.get().status?.mode).toBe('tor');
    expect(privacyStore.get().today).toBe(1832);
    stop();
  });

  it('keeps the highest count per tab from live and periodic events', () => {
    applyBlocked({ tabId: 3, tabCount: 5 });
    applyCounts({ tabs: { '3': 4, '4': 2 }, today: 99 });
    expect(privacyStore.get().tabs).toEqual({ 3: 5, 4: 2 });
    expect(privacyStore.get().today).toBe(99);
    applyBlocked({ tabId: 3, tabCount: 6 });
    expect(privacyStore.get().tabs[3]).toBe(6);
  });
});

describe('open without Tor requests', () => {
  it('stores and clears the pending tab', () => {
    requestOpenWithoutTor(7);
    expect(withoutTorStore.get().pendingTabId).toBe(7);
    cancelOpenWithoutTor();
    expect(withoutTorStore.get().pendingTabId).toBeNull();
  });
});
