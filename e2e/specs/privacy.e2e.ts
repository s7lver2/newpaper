import { FIXTURE_URL, switchToContent, switchToUi, uiInvoke } from '../helpers';

describe('privacy', () => {
  it('blocks a third-party ad with 403 and hides cosmetic selectors', async () => {
    const tab = await uiInvoke<{ id: number }>('tab_open', { url: FIXTURE_URL('ads.html') });
    // El motor se construye en segundo plano al arrancar: recarga hasta que bloquee.
    await browser.waitUntil(
      async () => {
        const c = await uiInvoke<{ tab: number }>('blocked_counts', { tabId: tab.id });
        if (c.tab >= 1) return true;
        await uiInvoke('tab_reload', { tabId: tab.id });
        return false;
      },
      { timeout: 60_000, interval: 3_000 },
    );
    await switchToContent('ads.html');
    expect(await browser.execute(() => (window as unknown as { npAdLoaded?: boolean }).npAdLoaded ?? false)).toBe(false);
    await browser.waitUntil(
      async () => (await browser.execute(() => getComputedStyle(document.querySelector('.np-test-ad')!).display)) === 'none',
      { timeout: 10_000 },
    );
    await switchToUi();
    const shield = await $('.np-shield-btn');
    expect(Number(await shield.getText())).toBeGreaterThanOrEqual(1);
    await uiInvoke('tab_close', { tabId: tab.id });
  });

  it('switches to (simulated) Tor and changes the exit country', async () => {
    let s = await uiInvoke<{ mode: string; tor: { state: string }; exitCountry: string | null }>('net_set_mode', { mode: 'tor' });
    expect(s.mode).toBe('tor');
    expect(s.tor.state).toBe('ready');
    s = await uiInvoke('tor_set_exit_country', { country: 'DE' });
    expect(s.exitCountry).toBe('DE');
    await switchToUi();
    await browser.waitUntil(async () => (await $('.np-torchip').getText()).includes('DE'), { timeout: 10_000 });
    s = await uiInvoke('net_set_mode', { mode: 'direct' });
    expect(s.mode).toBe('direct');
  });
});
