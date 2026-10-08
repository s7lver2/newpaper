import { FIXTURE_URL, switchToUi, uiInvoke } from '../helpers';

describe('reader', () => {
  it('opens a local news fixture in the reader and toggles the original', async () => {
    await switchToUi();
    const tab = await uiInvoke<{ id: number }>('tab_open', { url: FIXTURE_URL('noticia.html') });
    await switchToUi();
    const heading = await $('h1.np-reader-title');
    await heading.waitForDisplayed({ timeout: 30_000 });
    expect(await heading.getText()).toBe('El SMI sube a 1.184 euros');
    const original = await $('button=Ver original');
    await original.click();
    await browser.waitUntil(async () => !(await $('h1.np-reader-title').isExisting()), { timeout: 10_000 });
    const history = await uiInvoke<{ url: string }[]>('history_search', { filter: {} });
    expect(history.some((h) => h.url === FIXTURE_URL('noticia.html'))).toBe(true);
    await uiInvoke('tab_close', { tabId: tab.id });
  });
});
