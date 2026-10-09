import { useI18n } from '@newpaper/i18n/react';
import type { Synthesis, Verdict } from '@newpaper/pipeline';
import { SegmentedControl, VisualizationView } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { InternalPageProps } from '../../shell/registry';
import { navigate } from '../../shell/navigate';
import { analysisStore } from '../analysis/controller';
import { useParties } from '../analysis/parties';
import { useVizLabels } from '../analysis/vizLabels';
import { applyRewrites } from './rewrites';

type View = 'brief' | 'full' | 'changes';
interface Loaded { synthesis: Synthesis; sources: { id: string; title: string; url: string }[]; original: string | null }

async function load(url: string, hash: string): Promise<Loaded | null> {
  for (const a of Object.values(analysisStore.get().byTab)) {
    const r = a.full;
    if (r && r.url === url && r.hash === hash && r.synthesis) return { synthesis: r.synthesis, sources: r.sources, original: a.article.text };
  }
  const s = await commands.analysisCacheGet(url, hash, 'synthesis');
  if (!s) return null;
  const v = await commands.analysisCacheGet(url, hash, 'verify');
  const seen = new Map<string, { id: string; title: string; url: string }>();
  for (const verdict of v ? (JSON.parse(v.json) as Verdict[]) : []) for (const src of verdict.sources) seen.set(src.id, src);
  return { synthesis: JSON.parse(s.json) as Synthesis, sources: [...seen.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))), original: null };
}

const open = (u: string) => void navigate(u, { newTab: true });

export function SynthesisPage({ url: page }: InternalPageProps) {
  const { t } = useI18n();
  const viz = useVizLabels();
  const parties = useParties();
  const url = page.query.get('url') ?? '';
  const hash = page.query.get('hash') ?? '';
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [view, setView] = useState<View>('brief');
  useEffect(() => {
    void load(url, hash).then(setData);
  }, [url, hash]);

  if (data === undefined) return <p className="np-panel-empty" aria-busy="true">{t('synthesis.loading')}</p>;
  if (data === null) return <p className="np-panel-empty">{t('synthesis.missing')}</p>;
  const s = data.synthesis;
  const n = (id: string) => data.sources.findIndex((x) => x.id === id) + 1;
  const cite = (ids: string[]) =>
    ids.filter((id) => n(id) > 0).map((id) => (
      <button key={id} type="button" className="np-cite" title={data.sources[n(id) - 1]!.title} onClick={() => open(data.sources[n(id) - 1]!.url)}>
        {n(id)}
      </button>
    ));

  return (
    <article className="np-synth">
      <p className="np-synth-kicker">{t('synthesis.kicker')}</p>
      <h1>{s.headline}</h1>
      <SegmentedControl
        label={t('synthesis.view.label')}
        value={view}
        onChange={(v) => setView(v as View)}
        options={(['brief', 'full', 'changes'] as const).map((v) => ({ value: v, label: t(`synthesis.view.${v}`) }))}
      />

      {view === 'brief' ? (
        <ol className="np-synth-summary">
          {s.summary3.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      ) : null}

      {view === 'full' ? (
        <>
          <section>
            <h2>{t('synthesis.facts')}</h2>
            <ul className="np-synth-facts">
              {s.facts.map((f) => (
                <li key={f.id} className={`np-fact np-fact--${f.kind}`}>
                  <span className="np-tag np-tag--muted">{t(`synthesis.factKind.${f.kind}`)}</span> {f.text} {cite(f.sourceIds)}
                </li>
              ))}
            </ul>
          </section>
          {s.parties.length ? (
            <section>
              <h2>{t('synthesis.parties')}</h2>
              <div className="np-synth-parties">
                {s.parties.map((p, i) => (
                  <div key={i} className="np-synth-party">
                    <strong>{p.who}</strong>
                    <p>{p.says} {cite([p.sourceId])}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {s.disputes.map((d) => (
            <section key={d.question} className="np-dispute">
              <h2>{d.question}</h2>
              {d.positions.map((p) => (
                <div key={p.id} className="np-dispute-pos">
                  <p><strong>{p.who}</strong>: {p.claim}</p>
                  <div className="np-dispute-bar" role="meter" aria-label={t('synthesis.evidence')} aria-valuemin={0} aria-valuemax={1} aria-valuenow={p.evidenceWeight}>
                    <span style={{ width: `${p.evidenceWeight * 100}%` }} />
                  </div>
                  <p className="np-muted">{p.detail}</p>
                </div>
              ))}
              {d.conclusion ? <p className="np-dispute-conclusion">{d.conclusion}</p> : null}
            </section>
          ))}
          {s.visualizations.map((v, i) => (
            <VisualizationView key={i} viz={v} sources={data.sources} parties={parties} labels={viz.labels} format={viz.format} regionName={viz.regionName} onOpenSource={open} />
          ))}
          {s.unknowns.length ? (
            <section>
              <h2>{t('synthesis.unknowns')}</h2>
              <ul>
                {s.unknowns.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {view === 'changes' ? (
        data.original ? (
          <div className="np-changes">
            {applyRewrites(data.original, s.rewrites).map((p, i) =>
              p.kind === 'eq' ? (
                <span key={i}>{p.text}</span>
              ) : (
                <span key={i} className="np-change" title={p.reason}>
                  <del>{p.from}</del>
                  {p.to ? <ins>{p.to}</ins> : null}
                </span>
              ),
            )}
          </div>
        ) : (
          <ul className="np-changes-list">
            {s.rewrites.map((r, i) => (
              <li key={i}>
                <del>{r.from}</del> → <ins>{r.to || t('synthesis.removed')}</ins>
                <p className="np-muted">{r.reason}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <p className="np-synth-sources">
        {data.sources.map((x, i) => (
          <button key={x.id} type="button" className="np-link" onClick={() => open(x.url)}>
            [{i + 1}] {x.title}
          </button>
        ))}
      </p>
    </article>
  );
}
