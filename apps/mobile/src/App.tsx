import { useT } from '@newpaper/i18n/react';
import { addPluginListener } from '@tauri-apps/api/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ipc } from './ipc';
import { go, TAB_ROOTS, useNavDir, useRoute, type RouteName } from './router';
import { IconAgent, IconReading, IconSettings, IconToday } from './icons';
import { Splash } from './Splash';
import { Agent, AgentIndex } from './screens/Agent';
import { Edition } from './screens/Edition';
import { History } from './screens/History';
import { Offline } from './screens/Offline';
import { Pair } from './screens/Pair';
import { Provider } from './screens/Provider';
import { Reading, ReadingIndex } from './screens/Reading';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';
import { Welcome } from './screens/Welcome';

/** Recoge lo compartido desde Android/iOS (si lo hay) y lo abre en "Leyendo". */
async function takeShare() {
  const url = await ipc.pendingShare().catch(() => null);
  if (url) go('leer', { u: url });
}

const TABS: { name: (typeof TAB_ROOTS)[number]; key: string; icon: () => ReactNode }[] = [
  { name: 'hoy', key: 'mobile.nav.today', icon: IconToday },
  { name: 'leer', key: 'mobile.nav.reading', icon: IconReading },
  { name: 'agente', key: 'mobile.nav.agent', icon: IconAgent },
  { name: 'ajustes', key: 'mobile.nav.settings', icon: IconSettings },
];

const SPLASH_FIRST_MS = 2200;
const SPLASH_LATER_MS = 800;

/** Una raíz de pestaña sin parámetros de pantalla apilada (leer?u=..., agente?u=...). */
function rootOf(route: { name: RouteName; params: URLSearchParams }): (typeof TAB_ROOTS)[number] | null {
  if (!(TAB_ROOTS as readonly string[]).includes(route.name)) return null;
  if ((route.name === 'leer' || route.name === 'agente') && route.params.get('u')) return null;
  return route.name as (typeof TAB_ROOTS)[number];
}

export function App() {
  const t = useT();
  const route = useRoute();
  const dir = useNavDir();
  const root = rootOf(route);
  const [splash, setSplash] = useState<{ short: boolean; leaving: boolean } | null>(null);
  const pageRefs = useRef<Partial<Record<(typeof TAB_ROOTS)[number], HTMLDivElement | null>>>({});

  useEffect(() => {
    let cancelled = false;
    const seen = ipc.settingsGet<boolean>('device.splashSeen').catch(() => null);
    const welcome = ipc.settingsGet<boolean>('device.mobileWelcomeDone').catch(() => null);
    void Promise.all([seen, welcome]).then(([seenFlag, done]) => {
      if (cancelled) return;
      const short = !!seenFlag;
      if (!done) go('bienvenida');
      else void takeShare();
      setSplash({ short, leaving: false });
      void ipc.settingsSet('device.splashSeen', true).catch(() => {});
      window.setTimeout(() => !cancelled && setSplash((s) => (s ? { ...s, leaving: true } : s)), short ? SPLASH_LATER_MS : SPLASH_FIRST_MS);
      window.setTimeout(() => !cancelled && setSplash(null), (short ? SPLASH_LATER_MS : SPLASH_FIRST_MS) + 280);
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
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('offline', offline);
      clearInterval(sync);
      void share.then((l) => l?.unregister());
    };
  }, []);

  const onTab = (name: (typeof TAB_ROOTS)[number]) => {
    if (root === name) {
      pageRefs.current[name]?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    go(name);
  };

  const stacked = (() => {
    switch (route.name) {
      case 'bienvenida':
        return <Welcome />;
      case 'leer':
        return <Reading url={route.params.get('u')} />;
      case 'agente':
        return <Agent url={route.params.get('u')} />;
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
        return null;
    }
  })();

  const stageClass = dir === 'push' ? 'm-stage-push' : dir === 'pop' ? 'm-stage-pop' : 'm-stage-tab';
  const fullscreen = route.name === 'bienvenida';
  const showTabs = !fullscreen && root !== null;

  return (
    <div className="m-app np-root" data-route={route.name}>
      <main className="m-main">
        {/* Las raíces se quedan montadas: cada pestaña conserva su scroll y estado. */}
        <div className={`m-page m-with-tabs m-stage-tab`} hidden={root !== 'hoy'} ref={(el) => void (pageRefs.current.hoy = el)}>
          <Today />
        </div>
        <div className="m-page m-with-tabs m-stage-tab" hidden={root !== 'leer'} ref={(el) => void (pageRefs.current.leer = el)}>
          <ReadingIndex />
        </div>
        <div className="m-page m-with-tabs m-stage-tab" hidden={root !== 'agente'} ref={(el) => void (pageRefs.current.agente = el)}>
          <AgentIndex />
        </div>
        <div className="m-page m-with-tabs m-stage-tab" hidden={root !== 'ajustes'} ref={(el) => void (pageRefs.current.ajustes = el)}>
          <Settings />
        </div>
        {stacked ? (
          <div key={`${route.name}?${route.params.toString()}`} className={`m-page ${stageClass}`}>
            {stacked}
          </div>
        ) : null}
      </main>
      {showTabs ? (
        <nav className="m-tabbar" aria-label={t('mobile.nav.label')}>
          {TABS.map((x) => {
            const Icon = x.icon;
            const current = root === x.name;
            return (
              <button key={x.name} type="button" className="m-tab" aria-current={current ? 'page' : undefined} onClick={() => onTab(x.name)}>
                <span className="pill">
                  <Icon />
                </span>
                {t(x.key)}
              </button>
            );
          })}
        </nav>
      ) : null}
      {splash ? <Splash short={splash.short} leaving={splash.leaving} /> : null}
    </div>
  );
}
