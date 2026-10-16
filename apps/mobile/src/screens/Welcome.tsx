import { useI18n } from '@newpaper/i18n/react';
import { useReducedMotion } from '@newpaper/ui-kit';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { ipc } from '../ipc';
import { go } from '../router';
import { barsOverDark } from '../theme';

const PAGES = 6;
/** Umbral de arrastre para cambiar de página (px): igual que el mockup Movil-Bienvenida. */
const THRESHOLD = 60;
const TOPICS = ['t1', 't2', 't3', 't4'] as const;
const FRAGMENTS = 18;
const SPECTRUM = ['#C2412F', '#8D8981', '#2F5BD3', '#E8705A', '#7C9AF2', '#D8D3C8'];

type Translate = ReturnType<typeof useI18n>['t'];
type IaChoice = 'local' | 'cloud' | 'later';
const IA_CHOICES: IaChoice[] = ['local', 'cloud', 'later'];

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const IA_ICON: Record<IaChoice, ReactNode> = {
  local: (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9h3.5M2.5 15h3.5M18 9h3.5M18 15h3.5" />
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <circle cx="8" cy="15" r="4" /><path d="M11 12.5l8.5-8.5M16.5 7l2.5 2.5M14.5 9l2 2" />
    </svg>
  ),
  later: (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
    </svg>
  ),
};

/** La marca de la portada: la n y el rombo tripartito (igual que el icono de la app). */
function Mark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 108 108" width={size} height={size} aria-hidden="true" className="m-mark">
      <g fill="none" stroke="currentColor" strokeLinecap="butt">
        <path d="M33 40.5V71" strokeWidth={7.5} />
        <path d="M33 54C33 45 39 40 46.5 40 54 40 58 44.5 58 51.5V71" strokeWidth={6} />
        <path d="M26.5 71H39.5M51.5 71H64.5" strokeWidth={3} />
      </g>
      <polygon points="67.5,66 71.83,61.67 71.83,70.33" fill="#C2412F" />
      <polygon points="71.83,61.67 76.17,66 71.83,70.33" fill="#8D8981" />
      <polygon points="76.17,66 80.5,61.67 80.5,70.33" fill="#2F5BD3" />
    </svg>
  );
}

/** Texto de la respuesta con las citas [n] como marcas numeradas. */
function Cited({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[\d+\])/).map((part, i) =>
        /^\[\d+\]$/.test(part) ? <sup key={i} className="m-wcite">{part.slice(1, -1)}</sup> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

/**
 * Bienvenida: carrusel de seis páginas a pantalla completa. Arrastre con paralaje (ilustración 0,65×, texto 1,25×),
 * indicador de segmentos y micro-animaciones por paso; la última página celebra la configuración. Con movimiento
 * reducido (sistema o ajuste de la app) no hay desplazamientos ni fragmentos: solo fundidos cortos.
 */
export function Welcome() {
  const { t } = useI18n();
  const reduced = useReducedMotion() || document.documentElement.dataset.motion === 'reduce';
  const [page, setPage] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [ia, setIa] = useState<IaChoice>('later');
  const [topics, setTopics] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  // `moving`: hay una transición de página en curso (o un arrastre); en reposo solo la página activa es visible y enfocable.
  const [moving, setMoving] = useState(false);
  const track = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; id: number } | null>(null);
  const width = useRef(1);

  const intro = page === 0 && !done;
  const lastPage = page === PAGES - 1;
  useEffect(() => {
    if (!intro) return;
    barsOverDark(true);
    return () => barsOverDark(false);
  }, [intro]);

  const firstPage = useRef(true);
  const isDragging = drag !== null;
  // Layout effect: `moving` se activa antes de pintar, así la página que sale no parpadea oculta un fotograma.
  useLayoutEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    if (reduced) {
      setMoving(false);
      return;
    }
    setMoving(true);
    if (isDragging) return;
    const el = track.current;
    const end = (e?: Event) => {
      if (e && (e.target as HTMLElement).dataset?.slide !== String(page)) return;
      setMoving(false);
    };
    el?.addEventListener('transitionend', end);
    // Respaldo si la transición no llega a ejecutarse (pestaña en segundo plano, ajuste del sistema).
    const fallback = window.setTimeout(() => end(), 760);
    return () => {
      el?.removeEventListener('transitionend', end);
      window.clearTimeout(fallback);
    };
  }, [page, reduced, isDragging]);

  const clamp = (n: number) => Math.min(PAGES - 1, Math.max(0, n));
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, id: e.pointerId };
    width.current = e.currentTarget.clientWidth || 1;
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    let dx = e.clientX - start.current.x;
    // Al llegar a los extremos la página se resiste (rebote en vez de salir del carrusel).
    if ((page === 0 && dx > 0) || (lastPage && dx < 0)) dx *= 0.35;
    setDrag(dx);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    start.current = null;
    setDrag(null);
    if (Math.abs(dx) > THRESHOLD) setPage((p) => clamp(p + (dx < 0 ? 1 : -1)));
  };

  const finish = async () => {
    await ipc.settingsSet('device.mobileWelcomeDone', true).catch(() => {});
    go(ia === 'local' ? 'emparejar' : ia === 'cloud' ? 'proveedor' : 'hoy');
  };

  if (done) {
    return <Celebration topics={topics} onStart={() => void finish()} t={t} reduced={reduced} />;
  }

  const dragging = drag !== null;
  const slide = (i: number): CSSProperties => {
    const p = reduced ? i - page : i - page + (drag ?? 0) / width.current;
    return { ['--p' as string]: p } as CSSProperties;
  };
  const counterKey = `count-${page}`;

  return (
    <section className={`m-welcome${intro ? ' intro' : ''}${reduced ? ' reduced' : ''}`} aria-roledescription="carousel" aria-label={t('mobile.welcome.label')}>
      {page < 3 ? (
        <button type="button" className="m-skip" onClick={() => setPage(3)}>{t('mobile.welcome.skip')}</button>
      ) : null}
      <div ref={track} className="m-welcome-track" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {/* Cada página lleva --p (posición respecto al centro): las capas se desplazan a ritmos distintos. */}
        <div className={`m-slide m-slide-intro${page === 0 ? ' active' : ''}${dragging ? ' dragging' : ''}${page !== 0 && !moving && !dragging ? ' hide' : ''}`} style={slide(0)} aria-hidden={page !== 0} inert={page !== 0 || undefined} data-slide={0}>
          <div className="m-art m-art-intro">
            <span className="m-intro-mark"><Mark size={72} /></span>
          </div>
          <div className="m-text">
            <h2>
              {t('mobile.welcome.p1.title')
                .split(/(?<=[.!?])\s+/)
                .map((part, i, all) => (i === all.length - 1 ? <em key={i} style={{ animationDelay: `${i * 120}ms` }}>{part}</em> : <span key={i} style={{ animationDelay: `${i * 120}ms` }}>{part}</span>))}
            </h2>
            <p>{t('mobile.welcome.p1.body')}</p>
            <span className="m-tribar" aria-hidden="true"><i /><i /><i /></span>
          </div>
        </div>

        <div className={`m-slide${page === 1 ? ' active' : ''}${dragging ? ' dragging' : ''}${page !== 1 && !moving && !dragging ? ' hide' : ''}`} style={slide(1)} aria-hidden={page !== 1} inert={page !== 1 || undefined} data-slide={1}>
          <div className="m-art">
            <div className="m-wcard" aria-hidden="true">
              <p className="m-kicker">{t('mobile.welcome.p2.kicker')}</p>
              <p className="m-wcard-title">{t('mobile.welcome.p2.sample')}</p>
              <div className="m-wbars">
                {[44, 62, 30, 38, 66, 28].map((h, i) => (
                  <i key={i} className={i < 2 ? 'l' : i < 4 ? 'c' : 'r'} style={{ ['--h' as string]: `${h}%`, ['--d' as string]: `${i * 60}ms` } as CSSProperties} />
                ))}
              </div>
              <div className="m-wrail">
                <span className="m-wline" />
                {['DR', 'EP', 'EF', 'AB', 'LV', 'CO'].map((o, i) => (
                  <b key={o} className={`m-wdot ${i < 2 ? 'l' : i < 4 ? 'c' : 'r'}`} style={{ ['--x' as string]: `${[8, 25, 42, 58, 75, 92][i]}%`, ['--d' as string]: `${800 + i * 90}ms` } as CSSProperties}>{o}</b>
                ))}
              </div>
              <div className="m-wlabels"><span>{t('mobile.welcome.p2.left')}</span><span>{t('mobile.welcome.p2.center')}</span><span>{t('mobile.welcome.p2.right')}</span></div>
              <div className="m-wverdict">
                <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="var(--np-line2)" strokeWidth="4" />
                  <circle className="m-wring" cx="22" cy="22" r="18" fill="none" stroke="var(--np-ok)" strokeWidth="4" strokeLinecap="round" transform="rotate(-90 22 22)" pathLength={100} />
                </svg>
                <span>
                  <b>{t('mobile.welcome.p2.verdict')}</b>
                  <small>{t('mobile.welcome.p2.discrepancies', { n: 2 })}</small>
                </span>
              </div>
            </div>
          </div>
          <div className="m-text">
            <h2>{t('mobile.welcome.p2.title')}</h2>
            <p>{t('mobile.welcome.p2.body')}</p>
          </div>
        </div>

        <div className={`m-slide${page === 2 ? ' active' : ''}${dragging ? ' dragging' : ''}${page !== 2 && !moving && !dragging ? ' hide' : ''}`} style={slide(2)} aria-hidden={page !== 2} inert={page !== 2 || undefined} data-slide={2}>
          <div className="m-art">
            <p className="m-lens-demo">
              {t('mobile.welcome.p3.sample')
                .split(' ')
                .map((w, i) => (
                  <span key={i} className="m-lw" style={{ ['--i' as string]: i } as CSSProperties}>{w} </span>
                ))}
            </p>
          </div>
          <div className="m-text">
            <h2>{t('mobile.welcome.p3.title')}</h2>
            <p>{t('mobile.welcome.p3.body')}</p>
          </div>
        </div>

        <div className={`m-slide${page === 3 ? ' active' : ''}${dragging ? ' dragging' : ''}${page !== 3 && !moving && !dragging ? ' hide' : ''}`} style={slide(3)} aria-hidden={page !== 3} inert={page !== 3 || undefined} data-slide={3}>
          <div className="m-art">
            <div className="m-chat" aria-hidden="true">
              <p className="m-chat-q">{t('mobile.welcome.p4.question')}</p>
              <p className="m-chat-typing"><i /><i /><i /></p>
              <p className="m-chat-a"><Cited text={t('mobile.welcome.p4.answer')} /></p>
            </div>
          </div>
          <div className="m-text">
            <h2>{t('mobile.welcome.p4.title')}</h2>
            <p>{t('mobile.welcome.p4.body')}</p>
          </div>
        </div>

        <div className={`m-slide${page === 4 ? ' active' : ''}${dragging ? ' dragging' : ''}${page !== 4 && !moving && !dragging ? ' hide' : ''}`} style={slide(4)} aria-hidden={page !== 4} inert={page !== 4 || undefined} data-slide={4}>
          <div className="m-art m-topics" role="group" aria-label={t('mobile.welcome.p5.title')}>
            {TOPICS.map((k, i) => {
              const on = topics.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  className="m-chip m-tchip"
                  aria-pressed={on}
                  style={{ ['--i' as string]: i } as CSSProperties}
                  onClick={() => setTopics((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))}
                >
                  <span className="m-tcheck" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" {...stroke} strokeWidth={2.5}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </span>
                  {t(`mobile.welcome.p5.${k}`)}
                </button>
              );
            })}
            <p key={counterKey} className="m-tcount" aria-live="polite">{t('mobile.welcome.p5.count', { n: topics.length })}</p>
          </div>
          <div className="m-text">
            <h2>{t('mobile.welcome.p5.title')}</h2>
            <p>{t('mobile.welcome.p5.body')}</p>
          </div>
        </div>

        <div className={`m-slide${page === 5 ? ' active' : ''}${dragging ? ' dragging' : ''}${page !== 5 && !moving && !dragging ? ' hide' : ''}`} style={slide(5)} aria-hidden={page !== 5} inert={page !== 5 || undefined} data-slide={5}>
          <div className="m-art m-ia" role="radiogroup" aria-label={t('mobile.welcome.p6.title')}>
            {IA_CHOICES.map((v, i) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={ia === v}
                className={`m-ia-card${ia === v ? ' on' : ''}`}
                style={{ ['--i' as string]: i } as CSSProperties}
                onClick={() => setIa(v)}
              >
                <span className="m-ia-ico">{IA_ICON[v]}</span>
                <span className="m-ia-body">
                  <b>{t(`mobile.welcome.p6.${v}`)}</b>
                  <span>{t(`mobile.welcome.p6.${v}Hint`)}</span>
                </span>
                <span className="m-radio-dot" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="m-text">
            <h2>{t('mobile.welcome.p6.title')}</h2>
            <p>{t('mobile.welcome.p6.body')}</p>
          </div>
        </div>
      </div>

      <div className="m-welcome-foot">
        <div className="m-progress" aria-hidden="true">
          <span className="m-segs">
            {Array.from({ length: PAGES }, (_, i) => (
              <i key={i}><b className={i <= page ? 'on' : ''} /></i>
            ))}
          </span>
          <span key={counterKey} className="m-count">{page + 1} / {PAGES}</span>
        </div>
        <div className="m-btns">
          {page > 0 ? (
            <button type="button" className="m-btn sec sq" aria-label={t('mobile.welcome.back')} onClick={() => setPage(clamp(page - 1))}>
              <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true"><path d="M14.5 6.5L9 12l5.5 5.5" /></svg>
            </button>
          ) : null}
          <button type="button" className="m-btn" onClick={() => (lastPage ? setDone(true) : setPage(clamp(page + 1)))}>
            {lastPage ? t('mobile.welcome.finish') : page === 0 ? t('mobile.welcome.begin') : t('mobile.welcome.next')}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Pantalla final «Listo.»: el check se dibuja, un anillo verde se expande y los fragmentos del espectro estallan. */
function Celebration({ topics, onStart, t, reduced }: { topics: string[]; onStart: () => void; t: Translate; reduced: boolean }) {
  return (
    <section className="m-welcome m-welcome-done" aria-live="polite">
      <div className="m-celebrate">
        {!reduced
          ? Array.from({ length: FRAGMENTS }, (_, i) => {
              const a = (i / FRAGMENTS) * Math.PI * 2 + (i % 3) * 0.2;
              const r = 120 + ((i * 37) % 60);
              return (
                <i
                  key={i}
                  className="m-frag"
                  style={{
                    ['--fx' as string]: `${Math.cos(a) * r}px`,
                    ['--fy' as string]: `${Math.sin(a) * r - 40}px`,
                    ['--fr' as string]: `${(i * 53) % 360}deg`,
                    background: SPECTRUM[i % SPECTRUM.length],
                    animationDelay: `${(i % 6) * 22}ms`,
                  } as CSSProperties}
                />
              );
            })
          : null}
        <span className="m-check m-celebrate-check" aria-hidden="true">
          <span className="m-ring-burst" />
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      </div>
      <div className="m-celebrate-text">
        <h2 className="m-done-title">{t('mobile.welcome.doneTitle')}</h2>
        <p>{t('mobile.welcome.doneBody')}</p>
        {topics.length ? (
          <div className="m-chips m-done-topics" style={{ padding: 0, marginTop: 14 }}>
            {topics.map((k, i) => (
              <span key={k} className="m-chip" style={{ ['--i' as string]: i, animationDelay: `${360 + i * 90}ms` } as CSSProperties}>{t(`mobile.welcome.p5.${k}`)}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="m-welcome-foot">
        <button type="button" className="m-btn" onClick={onStart}>{t('mobile.welcome.start')}</button>
      </div>
    </section>
  );
}
