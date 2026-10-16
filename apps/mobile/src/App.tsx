import { useT } from '@newpaper/i18n/react';
import { addPluginListener } from '@tauri-apps/api/core';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ipc } from './ipc';
import { go, TAB_ROOTS, useNavDir, useRoute, type RouteName } from './router';
import { IconAgent, IconReading, IconSettings, IconToday } from './icons';
import { Splash } from './Splash';
import type { IntroMode } from './splash/intro-engine';
import { Today } from './screens/Today';
import { Welcome } from './screens/Welcome';

// Todo lo que no se ve en el primer fotograma se carga aparte: la intro corre con el hilo principal libre y las pestañas
// y pantallas se montan al terminar (o al pedirlas). Los import() de `prefetch` los calientan en reposo.
const loaders = {
  agent: () => import('./screens/Agent'),
  ai: () => import('./screens/AiSettings'),
  edition: () => import('./screens/Edition'),
  history: () => import('./screens/History'),
  offline: () => import('./screens/Offline'),
  pair: () => import('./screens/Pair'),
  provider: () => import('./screens/Provider'),
  reading: () => import('./screens/Reading'),
  settings: () => import('./screens/Settings'),
  sub: () => import('./screens/SettingsSub'),
};
const Agent = lazy(() => loaders.agent().then((m) => ({ default: m.Agent })));
const AgentIndex = lazy(() => loaders.agent().then((m) => ({ default: m.AgentIndex })));
const AiSettings = lazy(() => loaders.ai().then((m) => ({ default: m.AiSettings })));
const Edition = lazy(() => loaders.edition().then((m) => ({ default: m.Edition })));
const History = lazy(() => loaders.history().then((m) => ({ default: m.History })));
const Offline = lazy(() => loaders.offline().then((m) => ({ default: m.Offline })));
const Pair = lazy(() => loaders.pair().then((m) => ({ default: m.Pair })));
const Provider = lazy(() => loaders.provider().then((m) => ({ default: m.Provider })));
const Reading = lazy(() => loaders.reading().then((m) => ({ default: m.Reading })));
const ReadingIndex = lazy(() => loaders.reading().then((m) => ({ default: m.ReadingIndex })));
const Settings = lazy(() => loaders.settings().then((m) => ({ default: m.Settings })));
const Blocking = lazy(() => loaders.sub().then((m) => ({ default: m.Blocking })));
const Pipeline = lazy(() => loaders.sub().then((m) => ({ default: m.Pipeline })));
const Sources = lazy(() => loaders.sub().then((m) => ({ default: m.Sources })));

/** Calienta los módulos de las pantallas de uno en uno en los huecos del hilo principal (tras la intro). */
function prefetch() {
  const idle = (f: () => void) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(f, { timeout: 1500 });
    else window.setTimeout(f, 200);
  };
  const queue = [loaders.reading, loaders.settings, loaders.agent, loaders.sub, loaders.provider, loaders.ai, loaders.pair, loaders.history, loaders.edition, loaders.offline];
  const next = () => {
    const f = queue.shift();
    if (!f) return;
    void f().catch(() => {});
    idle(next);
  };
  idle(next);
}

const reducedNow = () => document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const [splash, setSplash] = useState<IntroMode | null>(null);
  const [dataReady, setDataReady] = useState(false);
  // 'boot' (ajustes) → 'intro' (hay intro en pantalla) → 'done': las pestañas secundarias, la sincronización y los módulos
  // diferidos esperan a 'done' para no competir con la animación.
  const [phase, setPhase] = useState<'boot' | 'intro' | 'done'>('boot');
  // Cambio de pestaña: la pestaña que sale sigue visible un instante y la que entra desliza desde el lado del orden de pestañas.
  const [swap, setSwap] = useState<{ from: (typeof TAB_ROOTS)[number]; to: (typeof TAB_ROOTS)[number]; dx: 1 | -1 } | null>(null);
  const prevRoot = useRef<(typeof TAB_ROOTS)[number] | null>(root);
  const pageRefs = useRef<Partial<Record<(typeof TAB_ROOTS)[number], HTMLDivElement | null>>>({});

  useEffect(() => {
    let cancelled = false;
    const seen = ipc.settingsGet<boolean>('device.splashSeen').catch(() => null);
    const welcome = ipc.settingsGet<boolean>('device.mobileWelcomeDone').catch(() => null);
    void Promise.all([seen, welcome]).then(([seenFlag, done]) => {
      if (cancelled) return;
      if (!done) go('bienvenida');
      else void takeShare();
      // Primera vez: intro completa; después, corta; con movimiento reducido, solo fundidos.
      const reduce = document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setSplash(reduce ? 'reduce' : seenFlag ? 'short' : 'first');
      setPhase('intro');
      setDataReady(true);
      void ipc.settingsSet('device.splashSeen', true).catch(() => {});
    });
    const onVisible = () => document.visibilityState === 'visible' && void takeShare();
    document.addEventListener('visibilitychange', onVisible);
    const share = addPluginListener('np-mobile', 'share', () => void takeShare()).catch(() => null);
    const offline = () => go('sin-conexion');
    window.addEventListener('offline', offline);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('offline', offline);
      void share.then((l) => l?.unregister());
    };
  }, []);

  // La sincronización del móvil es de cliente: al terminar la intro y cada 5 minutos con la app en primer plano.
  useEffect(() => {
    if (phase !== 'done') return;
    const sync = setInterval(() => void ipc.syncNow().catch(() => {}), 5 * 60_000);
    void ipc.syncNow().catch(() => {});
    prefetch();
    return () => clearInterval(sync);
  }, [phase]);

  // Dirección del cambio entre raíces: +1 si la nueva está a la derecha en la barra (entra desde la derecha).
  useEffect(() => {
    const from = prevRoot.current;
    prevRoot.current = root;
    if (!root || !from || from === root || reducedNow()) {
      setSwap(null);
      return;
    }
    setSwap({ from, to: root, dx: TAB_ROOTS.indexOf(root) > TAB_ROOTS.indexOf(from) ? 1 : -1 });
  }, [root]);
  const endSwap = useCallback(() => setSwap(null), []);
  const mountRest = phase === 'done' || root !== 'hoy';

  const onTab = (name: (typeof TAB_ROOTS)[number]) => {
    if (root === name) {
      pageRefs.current[name]?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    go(name);
  };

  const stacked = (() => {
    // Las raíces de pestaña (incluidas «leer» y «agente» sin noticia) ya están montadas arriba.
    if (root !== null) return null;
    switch (route.name) {
      case 'bienvenida':
        return <Welcome />;
      case 'leer':
        return <Reading url={route.params.get('u')} />;
      case 'agente':
        return <Agent url={route.params.get('u')} />;
      case 'proveedor':
        return <Provider />;
      case 'ia':
        return <AiSettings />;
      case 'emparejar':
        return <Pair />;
      case 'historial':
        return <History />;
      case 'edicion':
        return <Edition />;
      case 'sin-conexion':
        return <Offline />;
      case 'pipeline':
        return <Pipeline />;
      case 'bloqueo':
        return <Blocking />;
      case 'fuentes':
        return <Sources />;
      default:
        return null;
    }
  })();

  const stageClass = dir === 'push' ? 'm-stage-push' : dir === 'pop' ? 'm-stage-pop' : 'm-stage-tab';
  const fullscreen = route.name === 'bienvenida';
  const showTabs = !fullscreen && root !== null;

  return (
    <div className="m-app np-root" data-route={route.name}>
      <div className="m-statusscrim" aria-hidden="true" />
      <main className="m-main">
        {/* Las raíces se quedan montadas: cada pestaña conserva su scroll y estado. */}
        {TABS.map((x) => {
          const on = root === x.name;
          const entering = swap?.to === x.name;
          const leaving = swap?.from === x.name;
          const cls = `m-page m-with-tabs${entering ? ' m-tab-in' : leaving ? ' m-tab-out' : ''}`;
          return (
            <div
              key={x.name}
              className={cls}
              style={swap ? ({ ['--tx' as string]: `${swap.dx * 28}px` } as React.CSSProperties) : undefined}
              hidden={!on && !leaving}
              inert={!on || undefined}
              ref={(el) => void (pageRefs.current[x.name] = el)}
              onAnimationEnd={leaving ? (e) => e.target === e.currentTarget && endSwap() : entering ? (e) => e.target === e.currentTarget && endSwap() : undefined}
            >
              {x.name === 'hoy' ? <Today /> : mountRest || on ? <Suspense fallback={null}>{x.name === 'leer' ? <ReadingIndex /> : x.name === 'agente' ? <AgentIndex /> : <Settings />}</Suspense> : null}
            </div>
          );
        })}
        {stacked ? (
          <div key={`${route.name}?${route.params.toString()}`} className={`m-page ${stageClass}`}>
            <Suspense fallback={null}>{stacked}</Suspense>
          </div>
        ) : null}
      </main>
      {showTabs ? (
        <nav className="m-tabbar" aria-label={t('mobile.nav.label')} style={{ ['--ti' as string]: Math.max(0, TAB_ROOTS.indexOf(root)) } as React.CSSProperties}>
          <span className="m-tabslide" aria-hidden="true" />
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
      {splash ? (
        <Splash
          mode={splash}
          ready={dataReady}
          onDone={() => {
            setSplash(null);
            setPhase('done');
          }}
        />
      ) : null}
    </div>
  );
}
