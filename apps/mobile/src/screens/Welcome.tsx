import { useT } from '@newpaper/i18n/react';
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ipc } from '../ipc';
import { go } from '../router';
import { IconBack } from '../icons';

const PAGES = 6;
const THRESHOLD = 60;

/** Primera vez: carrusel de 6 paginas deslizables. Sin Tor en Android: la red se decide en Ajustes. */
export function Welcome() {
  const t = useT();
  const [page, setPage] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [ia, setIa] = useState<'local' | 'cloud' | 'later'>('later');
  const [done, setDone] = useState(false);
  const start = useRef<{ x: number; id: number } | null>(null);
  const width = useRef(1);

  const clamp = (n: number) => Math.min(PAGES - 1, Math.max(0, n));
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, id: e.pointerId };
    width.current = e.currentTarget.clientWidth || 1;
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    setDrag(e.clientX - start.current.x);
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

  const offset = `calc(${-page * 100}% + ${drag ?? 0}px)`;
  const lastPage = page === PAGES - 1;

  if (done) {
    return (
      <section className="m-welcome" aria-live="polite" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 28 }}>
        <div className="m-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h2 style={{ font: '500 40px/1 var(--np-font-read)', margin: '0 0 12px' }}>{t('mobile.welcome.doneTitle')}</h2>
        <p>{t('mobile.welcome.doneBody')}</p>
        <div className="m-welcome-foot" style={{ width: '100%', marginTop: 28 }}>
          <button type="button" className="m-btn" onClick={() => void finish()}>{t('mobile.welcome.start')}</button>
        </div>
      </section>
    );
  }

  return (
    <section className={`m-welcome${page === 0 ? ' intro' : ''}`} aria-roledescription="carousel" aria-label={t('mobile.welcome.label')}>
      {page < 3 ? (
        <button type="button" className="m-skip" onClick={() => setPage(3)}>{t('mobile.welcome.skip')}</button>
      ) : null}
      <div className="m-welcome-track" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className={`m-track${drag !== null ? ' dragging' : ''}`} style={{ transform: `translateX(${offset})`, width: '100%' }}>
          <div className="m-slide m-slide-intro" aria-hidden={page !== 0}>
            <div className="m-art m-art-intro">
              <svg viewBox="0 0 108 108" width="72" height="72" aria-hidden="true">
                <rect x="8" y="8" width="92" height="92" rx="22" fill="#F6F4EF" />
                <g fill="none" stroke="#17171A" strokeLinecap="butt">
                  <path d="M33 40.5V71" strokeWidth={7.5} />
                  <path d="M33 54C33 45 39 40 46.5 40 54 40 58 44.5 58 51.5V71" strokeWidth={6} />
                  <path d="M26.5 71H39.5M51.5 71H64.5" strokeWidth={3} />
                </g>
                <polygon points="67.5,66 71.83,61.67 71.83,70.33" fill="#C2412F" />
                <polygon points="71.83,61.67 76.17,66 71.83,70.33" fill="#8D8981" />
                <polygon points="76.17,66 80.5,61.67 80.5,70.33" fill="#2F5BD3" />
              </svg>
            </div>
            <h2>
              {t('mobile.welcome.p1.title')
                .split(/(?<=[.!?])\s+/)
                .map((part, i, all) => (i === all.length - 1 ? <em key={i}>{part}</em> : <span key={i}>{part}</span>))}
            </h2>
            <p>{t('mobile.welcome.p1.body')}</p>
            <span className="m-tribar" aria-hidden="true"><i /><i /><i /></span>
          </div>
          <div className="m-slide">
            <div className="m-art">
              <div className="m-spectrum" aria-hidden="true">
                <span /><span /><span /><span /><span /><span />
              </div>
            </div>
            <h2>{t('mobile.welcome.p2.title')}</h2>
            <p>{t('mobile.welcome.p2.body')}</p>
          </div>
          <div className="m-slide">
            <div className="m-art">
              <p className="m-lens-demo" style={{ font: '400 22px/1.5 var(--np-font-read)', margin: 0, color: 'var(--np-dim)' }}>
                {t('mobile.welcome.p3.sample')}
              </p>
            </div>
            <h2>{t('mobile.welcome.p3.title')}</h2>
            <p>{t('mobile.welcome.p3.body')}</p>
          </div>
          <div className="m-slide">
            <div className="m-art">
              <div className="m-card" style={{ margin: 0, width: '100%' }}>
                <p className="np-muted">{t('mobile.welcome.p4.question')}</p>
                <p style={{ font: '400 17px/1.5 var(--np-font-read)', margin: '8px 0 0' }}>{t('mobile.welcome.p4.answer')}</p>
              </div>
            </div>
            <h2>{t('mobile.welcome.p4.title')}</h2>
            <p>{t('mobile.welcome.p4.body')}</p>
          </div>
          <div className="m-slide">
            <div className="m-art">
              <p style={{ font: '400 17px/1.5 var(--np-font-ui)', margin: 0, color: 'var(--np-muted)' }}>{t('mobile.welcome.p5.sample')}</p>
            </div>
            <h2>{t('mobile.welcome.p5.title')}</h2>
            <p>{t('mobile.welcome.p5.body')}</p>
          </div>
          <div className="m-slide">
            <h2>{t('mobile.welcome.p6.title')}</h2>
            <p>{t('mobile.welcome.p6.body')}</p>
            <div role="radiogroup" aria-label={t('mobile.welcome.p6.title')} style={{ marginTop: 18 }}>
              {(['local', 'cloud', 'later'] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={ia === v} className="m-radio" onClick={() => setIa(v)}>
                  <i aria-hidden="true" />
                  <span>
                    <b style={{ display: 'block', font: '500 16px/1.3 var(--np-font-ui)' }}>{t(`mobile.welcome.p6.${v}`)}</b>
                    <span className="np-muted" style={{ font: '400 13px/1.4 var(--np-font-ui)' }}>{t(`mobile.welcome.p6.${v}Hint`)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="m-dots" aria-hidden="true">
        {Array.from({ length: PAGES }, (_, i) => <i key={i} className={i === page ? 'on' : ''} />)}
      </div>
      <div className="m-welcome-foot">
        {page > 0 ? (
          <button type="button" className="m-btn sec sq" aria-label={t('mobile.welcome.back')} onClick={() => setPage(clamp(page - 1))}>
            <IconBack />
          </button>
        ) : null}
        <button type="button" className="m-btn" onClick={() => (lastPage ? setDone(true) : setPage(clamp(page + 1)))}>
          {lastPage ? t('mobile.welcome.finish') : t('mobile.welcome.next')}
        </button>
      </div>
    </section>
  );
}
