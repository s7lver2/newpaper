import { buildPageMessage, shortcutFor, type NavMessage, type PageMessage, type ShortcutMessage } from './message';

type WebviewBridge = { postMessage(m: unknown): void };
const bridge: WebviewBridge | undefined = (window as unknown as { chrome?: { webview?: WebviewBridge } }).chrome?.webview;

function post(m: PageMessage | NavMessage | ShortcutMessage): void {
  try {
    bridge?.postMessage(m);
  } catch {
    /* el anfitrión puede no estar listo: se ignora */
  }
}

if (bridge && window.top === window) {
  let sent = '';
  const sendPage = () => {
    const url = location.href;
    if (sent === url) return;
    sent = url;
    post(buildPageMessage(document, url));
  };
  const sendNav = () => post({ type: 'nav', url: location.href, title: document.title.slice(0, 1000) });

  if (document.readyState === 'complete') setTimeout(sendPage, 0);
  else window.addEventListener('load', () => setTimeout(sendPage, 0), { once: true });
  document.addEventListener('DOMContentLoaded', sendNav, { once: true });

  // Cambios de título y navegación SPA (pushState).
  new MutationObserver(sendNav).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.addEventListener('popstate', () => { sendNav(); setTimeout(sendPage, 500); });

  window.addEventListener(
    'keydown',
    (e) => {
      const action = shortcutFor(e);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      post({ type: 'shortcut', action });
    },
    true,
  );
}
