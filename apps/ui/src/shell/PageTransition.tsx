import { useEffect, useRef, useState } from 'react';
import { onTabTransition } from '../ipc/events';
import { useActiveTabId } from '../state/browser';

interface View { tabId: number; from: string; to: string | null }

/**
 * Fundido entre páginas. La webview nativa se dibuja siempre sobre la UI, así que Rust captura la página
 * actual (`start`), la saca de la vista mientras carga la nueva y captura también esta (`ready`); aquí
 * solo se funde una imagen con otra y Rust devuelve la webview real a su sitio (`end`).
 */
export function PageTransition() {
  const active = useActiveTabId();
  const [view, setView] = useState<View | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const off = onTabTransition((e) => {
      if (e.phase === 'end') {
        setView(null);
      } else if (e.phase === 'start' && e.image) {
        setView({ tabId: e.tabId, from: e.image, to: null });
      } else if (e.phase === 'ready' && e.image) {
        setView((v) => (v && v.tabId === e.tabId ? { ...v, to: e.image } : v));
      }
    });
    return () => {
      void off.then((f) => f());
    };
  }, []);

  if (!view || view.tabId !== active) return null;
  return (
    <div className="np-xfade" aria-hidden="true" data-fading={view.to !== null}>
      <img className="np-xfade-from" src={view.from} alt="" />
      {view.to ? <img className="np-xfade-to" src={view.to} alt="" /> : null}
    </div>
  );
}
