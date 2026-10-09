import { extractFromHtml } from '@newpaper/extract';
import { useI18n } from '@newpaper/i18n/react';
import { SegmentedControl } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { CaptureInput, DiffOp, TextDiff, WaybackHistory } from '../../ipc/types';
import type { InternalPageProps } from '../../shell/registry';

type Mode = 'unified' | 'side' | 'read';
const tsDate = (ts: string) => new Date(Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10) || 0, +ts.slice(10, 12) || 0));

function Ops({ ops, side }: { ops: DiffOp[]; side?: 'a' | 'b' }) {
  return (
    <>
      {ops.map((o, i) =>
        o.kind === 'eq' ? (
          <span key={i}>{o.text}</span>
        ) : o.kind === 'del' ? (
          side === 'b' ? null : <del key={i}>{o.text}</del>
        ) : side === 'a' ? null : (
          <ins key={i}>{o.text}</ins>
        ),
      )}
    </>
  );
}

function DiffView({ diff, side }: { diff: TextDiff; side?: 'a' | 'b' }) {
  return (
    <div className="np-hem-text">
      <h2><Ops ops={diff.headline} side={side} /></h2>
      {diff.paragraphs.map((p, i) => (
        <p key={i} className={p.kind ? 'np-hem-edited' : undefined}>
          <Ops ops={p.ops} side={side} />
        </p>
      ))}
    </div>
  );
}

export function HemerotecaPage({ url: page }: InternalPageProps) {
  const { t, formatDate } = useI18n();
  const url = page.query.get('url') ?? '';
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [history, setHistory] = useState<WaybackHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ab, setAb] = useState<[number, number]>([0, 0]);
  const [mode, setMode] = useState<Mode>('unified');
  const [diff, setDiff] = useState<TextDiff | null>(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    void commands.historyRecordSearch(url, 'hemeroteca');
    (async () => {
      try {
        const rows = await commands.waybackCaptures(url);
        const captures: CaptureInput[] = [];
        setProgress({ done: 0, total: rows.length });
        for (const r of rows) {
          if (!alive) return;
          try {
            const html = await commands.waybackCaptureHtml(url, r.timestamp);
            const a = extractFromHtml(html, url);
            if (a) captures.push({ timestamp: r.timestamp, digest: r.digest, text: { headline: a.title, paragraphs: a.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) } });
          } catch {
            /* captura ilegible: se omite */
          }
          setProgress({ done: captures.length, total: rows.length });
        }
        const h = await commands.waybackAnalyze(url, captures);
        if (!alive) return;
        setHistory(h);
        setAb([0, Math.max(0, h.captures.length - 1)]);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (!history || history.captures.length < 2) return setDiff(null);
    const [a, b] = ab;
    void commands.waybackDiff(history.captures[a]!.text, history.captures[b]!.text).then(setDiff);
  }, [history, ab]);

  if (!url) return <p className="np-panel-empty">{t('hemeroteca.noUrl')}</p>;
  if (error) return <p className="np-panel-empty" role="alert">{t('hemeroteca.error', { message: error })}</p>;
  if (!history) {
    return (
      <p className="np-panel-empty" aria-busy="true">
        {progress ? t('hemeroteca.progress', { done: progress.done, total: progress.total }) : t('hemeroteca.loading')}
      </p>
    );
  }
  if (!history.captures.length) return <p className="np-panel-empty">{t('hemeroteca.none')}</p>;
  const edited = new Set(history.edits.map((e) => e.captureIndex));
  const when = (i: number) => formatDate(tsDate(history.captures[i]!.timestamp), { dateStyle: 'medium', timeStyle: 'short' });
  const pick = (slot: 0 | 1, i: number) => setAb((cur) => (slot === 0 ? [i, cur[1]] : [cur[0], i]));
  const b = history.captures[ab[1]]!;

  return (
    <div className="np-hem">
      <header>
        <p className="np-synth-kicker">{t('hemeroteca.kicker')}</p>
        <h1>{history.captures.at(-1)!.text.headline}</h1>
        <p className="np-mono np-muted">{url}</p>
        {history.silent ? (
          <p className="np-hem-silent" role="status">{t('hemeroteca.silent', { n: history.editedCaptures })}</p>
        ) : history.notice ? (
          <p className="np-hint">{t('hemeroteca.notice', { notice: history.notice })}</p>
        ) : null}
      </header>

      <ol className="np-hem-timeline" aria-label={t('hemeroteca.timeline')}>
        {history.captures.map((c, i) => (
          <li key={c.timestamp} className={edited.has(i) ? 'np-hem-cap np-hem-cap--edited' : 'np-hem-cap'}>
            <span className="np-mono">{when(i)}</span>
            <button type="button" aria-pressed={ab[0] === i} onClick={() => pick(0, i)}>A</button>
            <button type="button" aria-pressed={ab[1] === i} onClick={() => pick(1, i)}>B</button>
          </li>
        ))}
      </ol>

      <SegmentedControl
        label={t('hemeroteca.mode.label')}
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        options={(['unified', 'side', 'read'] as const).map((m) => ({ value: m, label: t(`hemeroteca.mode.${m}`) }))}
      />
      <p className="np-muted">{t('hemeroteca.comparing', { a: when(ab[0]), b: when(ab[1]) })}</p>

      {mode === 'unified' && diff ? <DiffView diff={diff} /> : null}
      {mode === 'side' && diff ? (
        <div className="np-hem-side">
          <DiffView diff={diff} side="a" />
          <DiffView diff={diff} side="b" />
        </div>
      ) : null}
      {mode === 'read' ? (
        <div className="np-hem-text">
          <h2>{b.text.headline}</h2>
          {b.text.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : null}
      {history.captures.length < 2 && mode !== 'read' ? <p className="np-muted">{t('hemeroteca.single')}</p> : null}

      {history.edits.length ? (
        <section>
          <h2>{t('hemeroteca.edits')}</h2>
          <ul className="np-hem-edits">
            {history.edits.map((e, i) => (
              <li key={i}>
                <span className="np-tag np-tag--warn">{t(`hemeroteca.kind.${e.kind}`)}</span> <span className="np-mono">{when(e.captureIndex)}</span>
                {e.before ? <del>{e.before}</del> : null}
                {e.after ? <ins>{e.after}</ins> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
