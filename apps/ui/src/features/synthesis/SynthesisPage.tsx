import { useI18n } from '@newpaper/i18n/react';
import type { Synthesis, Verdict } from '@newpaper/pipeline';
import { SegmentedControl, VisualizationView } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { InternalPageProps } from '../../shell/registry';
import { navigate } from '../../shell/navigate';
import { analysisStore } from '../analysis/controller';
import { openPanel } from '../analysis/panelStore';
import { useParties } from '../analysis/parties';
import { useVizLabels } from '../analysis/vizLabels';

type View = 'brief' | 'full' | 'changes';
type Src = { id: string; title: string; url: string; kind?: 'primary' | 'coverage' };
interface Loaded { synthesis: Synthesis; sources: Src[]; original: string | null }

async function load(url: string, hash: string): Promise<Loaded | null> {
  for (const a of Object.values(analysisStore.get().byTab)) {
    const r = a.full;
    if (r && r.url === url && r.hash === hash && r.synthesis) return { synthesis: r.synthesis, sources: r.sources, original: a.article.text };
  }
  const s = await commands.analysisCacheGet(url, hash, 'synthesis');
  if (!s) return null;
  const v = await commands.analysisCacheGet(url, hash, 'verify');
  const seen = new Map<string, Src>();
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
  const [view, setView] = useState<View>('full');
  const [selected, setSelected] = useState<string | null>(null);
  const [openPos, setOpenPos] = useState<string | null>(null);
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

  const factKinds = s.facts.filter((f) => f.sourceIds.some((id) => n(id) > 0)).length;
  const sel = s.facts.find((f) => f.id === selected) ?? s.facts[0];
  const selSources = sel ? sel.sourceIds.map((id) => data.sources.find((x) => x.id === id)).filter((x): x is Src => !!x) : [];
  const analysis = Object.values(analysisStore.get().byTab).find((a) => a.url === url);
  const coverages = (analysis?.full?.coverage?.coverages ?? []).filter((c) => c.lean !== null);

  return (
    <div className="np-synth-page">
      <div className="np-synth-main">
        <div className="np-synth-bar">
          <SegmentedControl
            label={t('synthesis.view.label')}
            value={view}
            onChange={(v) => setView(v as View)}
            options={(['brief', 'full', 'changes'] as const).map((v) => ({ value: v, label: t(`synthesis.view.${v}`) }))}
          />
        </div>
        <article className="np-synth np-stagger">
          <div className="np-synth-head">
            <span className="np-synth-kicker">{t('synthesis.kicker')}</span>
            {s.facts.length ? (
              <span className="np-synth-conf">
                <span className="np-synth-bars">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < Math.round((factKinds / s.facts.length) * 5) ? 'on' : undefined} />)}</span>
                {t('synthesis.confidence', { n: factKinds, total: s.facts.length })}
              </span>
            ) : null}
          </div>
          <h1>{s.headline}</h1>
          <p className="np-synth-lead">{t('synthesis.lead')}</p>

          {view !== 'changes' ? (
            <div className="np-synth-card">
              <p className="np-synth-h">{t('synthesis.threeLines')}</p>
              <ol className="np-synth-summary">
                {s.summary3.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {view === 'full' ? (
            <>
              <section>
                <h2 className="np-synth-h">{t('synthesis.facts')}</h2>
                <div className="np-synth-facts">
                  {s.facts.map((f) => (
                    <button key={f.id} type="button" className={`np-fact np-fact--${f.kind}${sel?.id === f.id ? ' np-fact--on' : ''}`} onClick={() => setSelected(f.id)}>
                      {f.text}
                    </button>
                  ))}
                </div>
                <p className="np-synth-hint">{t('synthesis.pickFact')}</p>
              </section>
              {s.visualizations.length ? (
                <section className="np-synth-viz">
                  <div className="np-synth-vizhead">
                    <h2 className="np-synth-h">{t('synthesis.data')}</h2>
                    <span><b>{t('synthesis.auto')}</b>{t('synthesis.dataHint')}</span>
                  </div>
                  {s.visualizations.map((v, i) => (
                    <VisualizationView key={i} viz={v} sources={data.sources} parties={parties} labels={viz.labels} format={viz.format} regionName={viz.regionName} onOpenSource={open} />
                  ))}
                </section>
              ) : null}
              {s.parties.length ? (
                <section>
                  <h2 className="np-synth-h">{t('synthesis.parties')}</h2>
                  <div className="np-synth-parties">
                    {s.parties.map((p, i) => (
                      <div key={i} className="np-synth-party">
                        <strong>{p.who}</strong>
                        <p>{p.says}</p>
                        <span>{cite([p.sourceId])}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {s.disputes.map((d) => (
                <section key={d.question} className="np-dispute">
                  <h2 className="np-synth-h np-synth-h--warn">{t('synthesis.dispute')}</h2>
                  <div className="np-dispute-q">{d.question}</div>
                  <div className="np-dispute-list">
                    {d.positions.map((p) => (
                      <div key={p.id} className={`np-dispute-pos${openPos === p.id ? ' is-open' : ''}`}>
                        <button type="button" aria-expanded={openPos === p.id} onClick={() => setOpenPos(openPos === p.id ? null : p.id)}>
                          <span><b>{p.claim}</b><small>{p.who}</small></span>
                          <span className="np-dispute-w">
                            <small>{t('synthesis.evidence')}</small>
                            <span className="np-dispute-bar" role="meter" aria-label={t('synthesis.evidence')} aria-valuemin={0} aria-valuemax={1} aria-valuenow={p.evidenceWeight}>
                              <span className={p.evidenceWeight >= 0.6 ? 'ok' : undefined} style={{ width: `${p.evidenceWeight * 100}%` }} />
                            </span>
                          </span>
                        </button>
                        {openPos === p.id ? <p className="np-rise">{p.detail}</p> : null}
                      </div>
                    ))}
                  </div>
                  {d.conclusion ? <p className="np-dispute-conclusion">{d.conclusion}</p> : null}
                </section>
              ))}
              {s.unknowns.length ? (
                <section>
                  <h2 className="np-synth-h">{t('synthesis.unknowns')}</h2>
                  <ul className="np-synth-unknowns">
                    {s.unknowns.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {view === 'changes' ? (
            <section className="np-changes">
              <h2 className="np-synth-h">{t('synthesis.changesTitle')}</h2>
              {s.rewrites.map((r, i) => (
                <div key={i} className="np-change-card np-rise" style={{ animationDelay: `${i * 90}ms` }}>
                  <del>«{r.from}»</del>
                  <ins>{r.to || t('synthesis.removed')}</ins>
                  <small>{r.reason}</small>
                </div>
              ))}
            </section>
          ) : null}

          <footer className="np-synth-foot">
            <span>{t('synthesis.footer', { coverages: coverages.length, sources: data.sources.length })}</span>
            <button type="button" onClick={() => openPanel('agent')}>{t('synthesis.askAgent')}</button>
          </footer>
        </article>
      </div>
      <aside className="np-synth-aside">
        {sel ? (
          <div>
            <p className="np-synth-h">{t('synthesis.sourcesOf')}</p>
            <div key={sel.id} className="np-synth-sel np-rise">
              <div className="np-synth-seltext">{sel.text}</div>
              <span className={`np-synth-badge np-synth-badge--${sel.kind}`}>{t(`synthesis.factKind.${sel.kind}`)}</span>
              {selSources.map((x) => (
                <button key={x.id} type="button" className="np-synth-src" onClick={() => open(x.url)}>
                  <i className={x.kind === 'primary' ? 'ok' : undefined} />
                  <span><b>{x.title}</b><small>{x.kind === 'primary' ? t('synthesis.primary') : t('synthesis.coverageSource')}</small></span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {coverages.length ? (
          <div>
            <p className="np-synth-h">{t('synthesis.contrasted')}</p>
            {coverages.map((c) => (
              <div key={c.url} className="np-synth-outlet"><i className={`np-coverage-dot np-coverage-dot--${c.bucket}`} /><span>{c.outlet}</span><em>{Math.round(c.lean as number)}</em></div>
            ))}
          </div>
        ) : null}
        <div className="np-synth-stats">
          <div><b>{s.rewrites.length}</b><span>{t('synthesis.statRewritten')}</span></div>
          <div><b>{s.facts.length}</b><span>{t('synthesis.statFacts')}</span></div>
          <div><b>{data.sources.length}</b><span>{t('synthesis.statSources')}</span></div>
        </div>
        <p className="np-synth-all">
          {data.sources.map((x, i) => (
            <button key={x.id} type="button" className="np-link" onClick={() => open(x.url)}>[{i + 1}] {x.title}</button>
          ))}
        </p>
      </aside>
    </div>
  );
}
