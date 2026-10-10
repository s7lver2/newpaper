import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { commands } from '../../../ipc/commands';
import type { TopicState } from '../../../ipc/types';
import { openInternal } from '../../../shell/navigate';
import { createStore } from '../../../state/store';
import { MARKS, STEPS } from './steps';

export const tourStore = createStore<{ index: number | null }>({ index: null });
export const startTour = () => tourStore.set({ index: 0 });

function useTargetRect(selector: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [selector]);
  return rect;
}

export function Tour() {
  const { t } = useI18n();
  const index = tourStore.use((s) => s.index);
  const [topics, setTopics] = useState<TopicState[]>([]);
  const step = index === null ? null : STEPS[index]!;
  const selector = step?.kind === 'mark' ? MARKS.find((m) => m.id === step.mark)!.selector : null;
  const rect = useTargetRect(selector);

  useEffect(() => {
    if (step?.kind === 'topics') void commands.topicsList().then(setTopics).catch(() => {});
  }, [step?.kind]);
  if (index === null || !step) return null;

  const next = () => tourStore.set({ index: index + 1 < STEPS.length ? index + 1 : null });
  const finish = async () => {
    await commands.settingsSet('tour.done', true);
    tourStore.set({ index: null });
  };
  const skip = () => void finish();
  const card = (body: ReactNode, actions: ReactNode) => (
    <div
      className="np-tour-card np-rise"
      role="dialog"
      aria-modal="true"
      aria-labelledby="np-tour-t"
      style={rect ? { top: Math.min(window.innerHeight - 220, rect.bottom + 12), left: Math.max(12, Math.min(window.innerWidth - 372, rect.left)) } : undefined}
      onKeyDown={(e) => e.key === 'Escape' && skip()}
    >
      <p className="np-tour-count">{t('tour.count', { n: index + 1, total: STEPS.length })}</p>
      {body}
      <div className="np-consent-actions">
        {step.kind !== 'done' ? <Button variant="quiet" onClick={skip}>{t('tour.skip')}</Button> : null}
        {actions}
      </div>
    </div>
  );

  return (
    <div className="np-tour" aria-live="polite">
      {rect ? <div className="np-tour-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="np-tour-dim" />}
      {step.kind === 'welcome'
        ? card(
            <>
              <h2 id="np-tour-t">{t('tour.welcome.title')}</h2>
              <p>{t('tour.welcome.body')}</p>
            </>,
            <Button variant="primary" onClick={next}>{t('tour.start')}</Button>,
          )
        : null}
      {step.kind === 'topics'
        ? card(
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
            <Button variant="primary" onClick={next}>{t('tour.next')}</Button>,
          )
        : null}
      {step.kind === 'ai'
        ? card(
            <>
              <h2 id="np-tour-t">{t('tour.ai.title')}</h2>
              <p>{t('tour.ai.body')}</p>
            </>,
            <>
              <Button onClick={() => void commands.settingsSet('ai.preset', 'privacy').then(next)}>{t('tour.ai.local')}</Button>
              <Button variant="primary" onClick={() => { void openInternal('ajustes', ['ia', 'conectar']); next(); }}>{t('tour.ai.connect')}</Button>
            </>,
          )
        : null}
      {step.kind === 'network'
        ? card(
            <>
              <h2 id="np-tour-t">{t('tour.network.title')}</h2>
              <p>{t('tour.network.body')}</p>
            </>,
            <>
              <Button onClick={() => void commands.settingsSet('privacy.mode', 'direct').then(next)}>{t('tour.network.direct')}</Button>
              <Button variant="primary" onClick={() => void commands.settingsSet('privacy.mode', 'tor').then(next)}>{t('tour.network.tor')}</Button>
            </>,
          )
        : null}
      {step.kind === 'mark'
        ? card(
            <>
              <h2 id="np-tour-t">{t(`tour.marks.${step.mark}.title`)}</h2>
              <p>{t(`tour.marks.${step.mark}.body`)}</p>
              {!rect ? <p className="np-muted">{t('tour.notVisible')}</p> : null}
            </>,
            <Button variant="primary" onClick={next}>{t('tour.next')}</Button>,
          )
        : null}
      {step.kind === 'done'
        ? card(
            <>
              <h2 id="np-tour-t">{t('tour.done.title')}</h2>
              <p>{t('tour.done.body')}</p>
            </>,
            <Button variant="primary" onClick={() => void finish()}>{t('tour.done.cta')}</Button>,
          )
        : null}
    </div>
  );
}
