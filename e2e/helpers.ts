export const FIXTURE_URL = (name: string) => `http://127.0.0.1:4567/${name}`;

/** Cada webview es un "window handle"; la UI es la que sirve index.html de Tauri. */
export async function switchToUi(): Promise<void> {
  for (const h of await browser.getWindowHandles()) {
    await browser.switchToWindow(h);
    const url = await browser.getUrl();
    if (url.includes('tauri.localhost') || url.includes('localhost:1420')) return;
  }
  throw new Error('UI webview not found');
}

export async function uiInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  await switchToUi();
  // executeAsyncScript recibe el script como texto; el callback `done` es el último argumento.
  const script = `
    const [c, a, done] = arguments;
    window.__TAURI_INTERNALS__.invoke(c, a).then(done, (e) => done({ error: String(e) }));
  `;
  return browser.executeAsyncScript(script, [cmd, args]) as Promise<T>;
}

/** Cambia a la webview de contenido cuya URL contiene `urlPart`. */
export async function switchToContent(urlPart: string): Promise<void> {
  for (const h of await browser.getWindowHandles()) {
    await browser.switchToWindow(h);
    if ((await browser.getUrl()).includes(urlPart)) return;
  }
  throw new Error(`content webview with ${urlPart} not found`);
}
