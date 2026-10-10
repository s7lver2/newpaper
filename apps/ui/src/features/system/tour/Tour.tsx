import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { commands } from '../../../ipc/commands';
import type { TopicState } from '../../../ipc/types';
import { openInternal } from '../../../shell/navigate';
import { useUnderlay } from '../../../shell/underlay';
import { createStore } from '../../../state/store';
import { MARKS, STEPS } from './steps';

export const tourStore = createStore<{ index: number | null }>({ index: null });
export const startTour = () => tourStore.set({ index: 0 });

const GAP = 14;
const EDGE = 12;
const PAD = 8;

interface Placement { left: number; top: number }

/** Localiza el elemento real de la marca y sigue sus cambios de tamaño, posición, scroll y de la ventana. */
function useTargetRect(selector: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    setRect(null);
    if (!selector) return;
    let el: Element | null = null;
    let ro: ResizeObserver | null = null;
    let timer = 0;
    let tries = 0;
    const update = () => {
      if (!el || !el.isConnected) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect(r.width > 0 && r.height > 0 ? r : null);
    };
    const attach = () => {
      el = document.querySelector(selector);
      if (!el) {
        // La página puede tardar en pintarse (cambio de pestaña, carga del lector): se reintenta un momento.
        if (tries++ < 8) timer = window.setTimeout(attach, 150);
        return;
      }
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      ro = new ResizeObserver(update);
      ro.observe(el);
      update();
    };
    attach();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    // Las animaciones de entrada de la página desplazan el elemento unos instantes.
    const settle = window.setInterval(update, 250);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(settle);
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [selector]);
  return rect;
}

/** Coloca la tarjeta junto al elemento (debajo, encima o al lado) sin salirse de la ventana. */
function place(rect: DOMRect, w: number, h: number, vw: number, vh: number): Placement {
  const clampX = (x: number) => Math.max(EDGE, Math.min(vw - w - EDGE, x));
  const clampY = (y: number) => Math.max(EDGE, Math.min(vh - h - EDGE, y));
  const below = rect.bottom + PAD + GAP;
  if (below + h <= vh - EDGE) return { left: clampX(rect.left + rect.width / 2 - w / 2), top: below };
  const above = rect.top - PAD - GAP - h;
  if (above >= EDGE) return { left: clampX(rect.left + rect.width / 2 - w / 2), top: above };
  if (rect.right + PAD + GAP + w <= vw - EDGE) return { left: rect.right + PAD + GAP, top: clampY(rect.top + rect.height / 2 - h / 2) };
  if (rect.left - PAD - GAP - w >= EDGE) return { left: rect.left - PAD - GAP - w, top: clampY(rect.top + rect.height / 2 - h / 2) };
  return { left: clampX(rect.left + rect.width / 2 - w / 2), top: clampY(vh - h - EDGE) };
}

export function Tour() {
  const { t } = useI18n();
  const index = tourStore.use((s) => s.index);
  const [topics, setTopics] = useState<TopicState[]>([]);
  const step = index === null ? null : STEPS[index]!;
  const selector = step?.kind === 'mark' ? MARKS.find((m) => m.id === step.mark)!.selector : null;
  const rect = useTargetRect(selector);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  // La webview nativa se dibuja siempre encima de la interfaz: mientras dura el recorrido se sustituye por su captura.
  useUnderlay(index !== null);

  useEffect(() => {
    if (step?.kind === 'topics') void commands.topicsList().then(setTopics).catch(() => {});
  }, [step?.kind]);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const anchored = step?.kind === 'mark' && rect !== null;

  useLayoutEffect(() => {
    if (!anchored || !rect || !cardRef.current) {
      setPos(null);
      return;
    }
    const { offsetWidth: w, offsetHeight: h } = cardRef.current;
    setPos(place(rect, w, h, window.innerWidth, window.innerHeight));
  }, [anchored, rect, vp.w, vp.h, index]);

  // El foco entra en la tarjeta en cada paso, para que Intro y Tab trabajen sobre ella.
  useEffect(() => {
    if (index === null) return;
    const el = cardRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? cardRef.current?.querySelector<HTMLElement>('button');
    el?.focus({ preventScroll: true });
  }, [index]);

  const finish = useCallback(async () => {
    tourStore.set({ index: null });
    await commands.settingsSet('tour.done', true).catch(() => {});
  }, []);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void finish();
      } else if (e.key === 'Tab' && cardRef.current) {
        const f = [...cardRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        const active = document.activeElement;
        if (!cardRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index === null, finish]);

  if (index === null || !step) return null;

  const next = () => tourStore.set({ index: index + 1 < STEPS.length ? index + 1 : null });
  const back = () => tourStore.set({ index: Math.max(0, index - 1) });
  const setup = step.kind === 'topics' || step.kind === 'ai' || step.kind === 'network';
  const setupN = step.kind === 'topics' ? 0 : step.kind === 'ai' ? 1 : 2;
  const markN = step.kind === 'mark' ? MARKS.findIndex((m) => m.id === step.mark) : -1;
  const floating = step.kind === 'mark' && rect !== null;

  const card = (body: ReactNode, actions: ReactNode) => (
    <div
      ref={cardRef}
      className={`np-tour-card${floating ? ' np-tour-card--float' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="np-tour-t"
      style={floating ? (pos ? { left: pos.left, top: pos.top } : { left: EDGE, top: EDGE, visibility: 'hidden' }) : undefined}
    >
      <div className="np-tour-head">
        <span className="np-tour-count">{t('tour.count', { n: index + 1, total: STEPS.length })}</span>
        {step.kind !== 'done' ? <button type="button" className="np-tour-skip" onClick={() => void finish()}>{t('tour.skip')}</button> : null}
      </div>
      {setup ? (
        <div className="np-tour-bars" aria-hidden="true">
          {[0, 1, 2].map((i) => <span key={i} data-on={i <= setupN} />)}
        </div>
      ) : null}
      <div className="np-tour-body" key={index}>{body}</div>
      <div className="np-tour-foot">
        {markN >= 0 ? (
          <span className="np-tour-dots" aria-hidden="true">
            {MARKS.map((m, i) => <span key={m.id} data-on={i === markN} />)}
          </span>
        ) : null}
        <span className="np-tour-actions">
          {index > 0 ? <Button variant="quiet" onClick={back}>{t('tour.back')}</Button> : null}
          {actions}
        </span>
      </div>
    </div>
  );

  let content: ReactNode = null;
  if (step.kind === 'welcome')
    content = card(
      <>
        <h2 id="np-tour-t">{t('tour.welcome.title')}</h2>
        <p>{t('tour.welcome.body')}</p>
      </>,
      <Button variant="primary" data-autofocus onClick={next}>{t('tour.start')}</Button>,
    );
  else if (step.kind === 'topics')
    content = card(
      <>
        <h2 id="np-tour-t">{t('tour.topics.title')}</h2>
        <p>{t('tour.topics.body')}</p>
        <div className="np-topics">
          {topics.map((tp) => (
            <button key={tp.id} type="button" className="np-topic" aria-pressed={tp.following} onClick={() => void commands.topicSetFollowing(tp.id, !tp.following).then(setTopics)}>
              {tp.name}
            </button>
          ))}
        </div>
      </>,
      <Button variant="primary" data-autofocus onClick={next}>{t('tour.next')}</Button>,
    );
  else if (step.kind === 'ai')
    content = card(
      <>
        <h2 id="np-tour-t">{t('tour.ai.title')}</h2>
        <p>{t('tour.ai.body')}</p>
      </>,
      <>
        <Button onClick={() => void commands.settingsSet('ai.preset', 'privacy').then(next)}>{t('tour.ai.local')}</Button>
        <Button variant="primary" onClick={() => { void openInternal('ajustes', ['ia', 'conectar']); next(); }}>{t('tour.ai.connect')}</Button>
      </>,
    );
  else if (step.kind === 'network')
    content = card(
      <>
        <h2 id="np-tour-t">{t('tour.network.title')}</h2>
        <p>{t('tour.network.body')}</p>
      </>,
      <>
        <Button onClick={() => void commands.settingsSet('privacy.mode', 'direct').then(next)}>{t('tour.network.direct')}</Button>
        <Button variant="primary" onClick={() => void commands.settingsSet('privacy.mode', 'tor').then(next)}>{t('tour.network.tor')}</Button>
      </>,
    );
  else if (step.kind === 'mark')
    content = card(
      <>
        <h2 id="np-tour-t">{t(`tour.marks.${step.mark}.title`)}</h2>
        <p>{t(`tour.marks.${step.mark}.body`)}</p>
        {!rect ? <p className="np-muted">{t('tour.notVisible')}</p> : null}
      </>,
      <Button variant="primary" data-autofocus onClick={next}>{t('tour.next')}</Button>,
    );
  else
    content = card(
      <>
        <h2 id="np-tour-t">{t('tour.done.title')}</h2>
        <p>{t('tour.done.body')}</p>
      </>,
      <Button variant="primary" data-autofocus onClick={() => void finish()}>{t('tour.done.cta')}</Button>,
    );

  return (
    <div className={`np-tour${floating ? ' np-tour--float' : ''}`} aria-live="polite">
      {floating && rect ? (
        <>
          <div className="np-tour-spot" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
          <div className="np-tour-ring" style={{ left: rect.left - PAD - 4, top: rect.top - PAD - 4, width: rect.width + PAD * 2 + 8, height: rect.height + PAD * 2 + 8 }} />
          {content}
        </>
      ) : (
        <div className="np-sys-backdrop">{content}</div>
      )}
    </div>
  );
}
