import { useI18n } from '@newpaper/i18n/react';
import type { AgentMode } from '@newpaper/pipeline';
import { AnnotatedText, markTone, type LensMark } from '@newpaper/ui-kit';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { commands } from '../../ipc/commands';
import type { OutletLean } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import { DefaultReader, type ReaderEnhance } from '../../shell/ReaderSurface';
import type { ReaderSurfaceProps } from '../../shell/registry';
import { useSetting } from '../../state/settings';
import { leanLabelKey } from '../sources/leanModel';
import { notableAi } from './aiParagraphs';
import { latestResult, useTabAnalysis } from './controller';
import { marksOf } from './marks';
import { openPanel, panelStore, usePanel } from './panelStore';
import { SelectionToolbar, useTextSelection } from './SelectionToolbar';

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

let outletsP: Promise<OutletLean[]> | null = null;
/** Posición editorial medida del medio de la página (si el medio está en la lista de fuentes). */
function useOutlet(host: string): OutletLean | null {
  const [outlets, setOutlets] = useState<OutletLean[]>([]);
  useEffect(() => {
    outletsP ??= commands.outletsList().catch(() => []);
    let alive = true;
    void outletsP.then((o) => alive && setOutlets(o));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => outlets.find((o) => o.effective !== null && (host === o.domain || host.endsWith(`.${o.domain}`))) ?? null, [outlets, host]);
}

function ago(published: string | null, locale: string): string | null {
  const ms = published ? Date.parse(published) : NaN;
  if (Number.isNaN(ms)) return null;
  const mins = Math.round((ms - Date.now()) / 60_000);
  const f = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  const a = Math.abs(mins);
  if (a < 60) return f.format(mins, 'minute');
  if (a < 60 * 24) return f.format(Math.round(mins / 60), 'hour');
  if (a < 60 * 24 * 30) return f.format(Math.round(mins / 1440), 'day');
  return null;
}

export function AnalysisReader({ tab, page }: ReaderSurfaceProps) {
  const { t, formatNumber, formatDate, locale } = useI18n();
  const lens = usePanel((s) => s.lens);
  const dim = usePanel((s) => s.open && s.wide && s.tab === 'agent');
  const aiOpen = usePanel((s) => s.aiOpen);
  const focus = usePanel((s) => s.focusClaim);
  const [detector] = useSetting<boolean>('ai.detector', true);
  const a = useTabAnalysis(tab.id);
  const url = page.url.split('#')[0];
  const result = a && a.url === url ? latestResult(a) : null;
  const marks = useMemo(() => (result ? marksOf(result) : []), [result]);
  const notable = useMemo(() => (detector ? notableAi(page.text, result?.aiAuthorship) : null), [detector, page.text, result?.aiAuthorship]);
  const ai = notable?.ai ?? null;
  const paras = notable?.paras ?? null;
  const root = useRef<HTMLDivElement>(null);
  const sel = useTextSelection(root);
  const host = hostOf(page.url);
  const outlet = useOutlet(host);
  const site = (page.siteName || host).toUpperCase();
  const when = ago(page.published, locale) ?? (page.published && !Number.isNaN(Date.parse(page.published)) ? formatDate(new Date(page.published), { dateStyle: 'medium' }) : null);
  const lensOn = lens && !!result;

  const describe = (m: LensMark) => (m.kind === 'cargada' ? t('analysis.lens.loaded') : t(`analysis.verdict.${m.kind}`));
  const activate = (m: LensMark) => {
    if (m.kind === 'cargada') return openPanel('analysis');
    openPanel('analysis', { focusClaim: m.id });
  };
  const ask = (mode: AgentMode) => {
    if (!sel) return;
    openPanel('agent', { agentSeed: { fragment: sel.text, mode, question: null } });
    document.getSelection()?.removeAllRanges();
  };

  const top: ReactNode = (
    <div className={`np-areader-top${dim ? ' np-areader-top--dim' : ''}`}>
      <div className="np-areader-meta">
        <div className="np-areader-meta-left">
          <span className="np-areader-site">{[site, when?.toUpperCase()].filter(Boolean).join(' · ')}</span>
          {outlet && outlet.effective !== null ? (
            <button type="button" className="np-areader-chip" onClick={() => void openInternal('ajustes', ['fuentes'])}>
              {t('analysis.outlet', {
                side: t(leanLabelKey(outlet.effective)),
                value: formatNumber(Math.round(outlet.effective)),
                uncertainty: formatNumber(Math.round(outlet.effectiveUncertainty ?? 0)),
              })}
            </button>
          ) : null}
        </div>
        <button type="button" role="switch" data-tour="lens" aria-checked={lensOn} disabled={!result} className="np-lens-switch" onClick={() => panelStore.set({ lens: !lens })}>
          <span className="np-lens-switch-dot" aria-hidden="true" />
          {t('analysis.lens.toggle')}
        </button>
      </div>
      {ai && paras ? (
        <div className="np-ai-banner">
          <button type="button" aria-expanded={aiOpen} aria-label={t('analysis.ai.toggle')} onClick={() => panelStore.set((s) => ({ ...s, aiOpen: !s.aiOpen }))}>
            <span className="np-ai-banner-chip">{t('analysis.ai.badge')}</span>
            <span className="np-ai-banner-text">
              <strong>{t('analysis.ai.title')}</strong>
              <span>{t('analysis.ai.summary', { n: paras.flagged, total: paras.total, value: formatNumber(ai.probability, { style: 'percent' }) })}</span>
            </span>
            <span className="np-chev" aria-hidden="true">›</span>
          </button>
          {aiOpen ? (
            <div className="np-ai-banner-detail np-rise">
              <div className="np-ai-signals">
                {ai.signals.map((s) => (
                  <div key={s.key} className="np-ai-signal">
                    <span>{t(`analysis.ai.signal.${s.key}`)}</span>
                    <strong>{t(`analysis.ai.level.${s.strength >= 0.66 ? 'high' : s.strength >= 0.33 ? 'medium' : 'low'}`)}</strong>
                    <span className="np-ai-bar"><span style={{ width: `${Math.round(Math.max(0, Math.min(1, s.strength)) * 100)}%` }} /></span>
                  </div>
                ))}
              </div>
              <p>{t('analysis.ai.disclaimer')}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const body: ReactNode = lensOn ? (
    <article className={`np-areader-article np-rise${dim ? ' np-areader-article--dim' : ''}`} lang={page.lang ?? undefined} style={{ '--np-ai-label': JSON.stringify(t('analysis.ai.badge')) } as CSSProperties}>
      <h1 className="np-areader-title">{page.title}</h1>
      {page.excerpt ? <p className="np-areader-lead">{page.excerpt}</p> : null}
      <AnnotatedText
        text={page.text}
        lang={page.lang}
        marks={marks}
        classOf={(m) => `np-mark--${markTone(m.kind)}`}
        describe={describe}
        activeId={focus}
        onActivate={activate}
        paragraphClass={(i) => (paras?.indexes.has(i) ? 'np-lens-ai-paragraph' : undefined)}
        suffix={(m) => (m.kind === 'cargada' || m.kind === 'pendiente' ? null : <sup className={`np-mark-tag np-mark-tag--${m.kind}`}>{t(`analysis.verdict.${m.kind}`)}</sup>)}
      />
      <p className="np-areader-hint">{t('analysis.lens.hint')}</p>
    </article>
  ) : undefined;

  const enhance: ReaderEnhance = {
    top,
    body,
    wrap: (content) => (
      <div ref={root} className="np-asel">
        {content}
        {sel && root.current ? <SelectionToolbar rect={sel.rect} container={root.current} onAction={ask} /> : null}
      </div>
    ),
  };
  return <DefaultReader tab={tab} page={page} enhance={enhance} />;
}

