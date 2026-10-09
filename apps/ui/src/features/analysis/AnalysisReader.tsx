import { useI18n } from '@newpaper/i18n/react';
import type { AgentMode } from '@newpaper/pipeline';
import { AnnotatedText, Button, markTone, ReaderView, type LensMark } from '@newpaper/ui-kit';
import { useCallback, useMemo, useRef } from 'react';
import { commands } from '../../ipc/commands';
import { navigate } from '../../shell/navigate';
import { rewriteImage } from '../../shell/ReaderSurface';
import type { ReaderSurfaceProps } from '../../shell/registry';
import { controller, latestResult, useTabAnalysis } from './controller';
import { marksOf } from './marks';
import { openPanel, panelStore, usePanel } from './panelStore';
import { SelectionToolbar, useTextSelection } from './SelectionToolbar';

export function AnalysisReader({ tab, page }: ReaderSurfaceProps) {
  const { t, formatDate } = useI18n();
  const lens = usePanel((s) => s.lens);
  const dim = usePanel((s) => s.open && s.wide && s.tab === 'agent');
  const focus = usePanel((s) => s.focusClaim);
  const a = useTabAnalysis(tab.id);
  const url = page.url.split('#')[0];
  const result = a && a.url === url ? latestResult(a) : null;
  const marks = useMemo(() => (result ? marksOf(result) : []), [result]);
  const aiParas = useMemo(() => new Set((result?.aiAuthorship?.paragraphs ?? []).filter((p) => p.probability >= 0.7).map((p) => p.index)), [result]);
  const ref = useRef<HTMLDivElement>(null);
  // Como el lector por defecto: el Referer de la imagen es la página (`?r=`), no se pierde.
  const rewrite = useCallback((abs: string) => rewriteImage(abs, page.url), [page.url]);
  const sel = useTextSelection(ref);
  const published = page.published && !Number.isNaN(Date.parse(page.published)) ? formatDate(new Date(page.published), { dateStyle: 'long' }) : null;

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
  const toggleLens = () => panelStore.set({ lens: !lens });

  return (
    <div ref={ref} className={`np-surface np-areader${dim ? ' np-areader--dim' : ''}`}>
      <div className="np-reader-actions">
        <Button variant="quiet" onClick={() => commands.tabSetView(tab.id, 'original')}>
          {t('shell.reader.original')}
        </Button>
        <Button variant="quiet" aria-pressed={lens} disabled={!result} onClick={toggleLens}>
          {t('analysis.lens.toggle')}
        </Button>
        <Button variant="primary" onClick={() => (void controller.analyzeFull(tab.id, page), openPanel('analysis'))}>
          {t('analysis.actions.analyze')}
        </Button>
      </div>
      {lens && result ? (
        <article className="np-reader" lang={page.lang ?? undefined}>
          <h1 className="np-reader-title">{page.title}</h1>
          <p className="np-reader-meta">
            {page.siteName ? <span>{page.siteName}</span> : null}
            {page.byline ? <span>{t('shell.reader.byline', { name: page.byline })}</span> : null}
            {published ? <time dateTime={page.published ?? undefined}>{published}</time> : null}
          </p>
          <AnnotatedText
            text={page.text}
            lang={page.lang}
            marks={marks}
            classOf={(m) => `np-mark--${markTone(m.kind)}`}
            describe={describe}
            activeId={focus}
            onActivate={activate}
            paragraphClass={(i) => (aiParas.has(i) ? 'np-lens-ai-paragraph' : undefined)}
          />
        </article>
      ) : (
        <ReaderView article={page} rewriteImage={rewrite} onOpenLink={(u) => navigate(u)} />
      )}
      {sel && ref.current ? <SelectionToolbar rect={sel.rect} container={ref.current} onAction={ask} /> : null}
    </div>
  );
}
