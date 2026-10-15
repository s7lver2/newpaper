import { useT } from '@newpaper/i18n/react';
import { addPluginListener } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { ipc } from './ipc';
import { go, useRoute } from './router';
import { Agent } from './screens/Agent';
import { Edition } from './screens/Edition';
import { History } from './screens/History';
import { Offline } from './screens/Offline';
import { Pair } from './screens/Pair';
import { Provider } from './screens/Provider';
import { Reading } from './screens/Reading';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';
import { Welcome } from './screens/Welcome';

/** Recoge lo compartido desde Android/iOS (si lo hay) y lo abre en "Leyendo". */
async function takeShare() {
  const url = await ipc.pendingShare().catch(() => null);
  if (url) go('leer', { u: url });
}

const TABS = [
  { name: 'hoy', key: 'mobile.nav.today' },
  { name: 'leer', key: 'mobile.nav.reading' },
  { name: 'agente', key: 'mobile.nav.agent' },
  { name: 'ajustes', key: 'mobile.nav.settings' },
] as const;

export function App() {
  const t = useT();
  const route = useRoute();
  useEffect(() => {
    void ipc.settingsGet<boolean>('device.mobileWelcomeDone').then((done) => {
      if (!done) go('bienvenida');
      else void takeShare();
    });
    const onVisible = () => document.visibilityState === 'visible' && void takeShare();
    document.addEventListener('visibilitychange', onVisible);
    const share = addPluginListener('np-mobile', 'share', () => void takeShare()).catch(() => null);
    const offline = () => go('sin-conexion');
    window.addEventListener('offline', offline);
    // La sincronización del móvil es de cliente: al abrir y cada 5 minutos con la app en primer plano.
    const sync = setInterval(() => void ipc.syncNow().catch(() => {}), 5 * 60_000);
    void ipc.syncNow().catch(() => {});
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('offline', offline);
      clearInterval(sync);
      void share.then((l) => l?.unregister());
    };
  }, []);

  const screen = (() => {
    switch (route.name) {
      case 'bienvenida':
        return <Welcome />;
      case 'leer':
        return <Reading url={route.params.get('u')} />;
      case 'agente':
        return <Agent />;
      case 'ajustes':
        return <Settings />;
      case 'proveedor':
        return <Provider />;
      case 'emparejar':
        return <Pair />;
      case 'historial':
        return <History />;
      case 'edicion':
        return <Edition />;
      case 'sin-conexion':
        return <Offline />;
      default:
        return <Today />;
    }
  })();

  return (
    <div className="m-app np-root">
      <main className="m-main">{screen}</main>
      {route.name !== 'bienvenida' ? (
        <nav className="m-tabs" aria-label={t('mobile.nav.label')}>
          {TABS.map((x) => (
            <button key={x.name} type="button" aria-current={route.name === x.name ? 'page' : undefined} onClick={() => go(x.name)}>
              {t(x.key)}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
