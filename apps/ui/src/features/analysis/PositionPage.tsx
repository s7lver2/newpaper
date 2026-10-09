import { useI18n } from '@newpaper/i18n/react';
import { mirrorCheck, type Signal } from '@newpaper/pipeline';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { LexiconScore } from '../../ipc/types';
import type { InternalPageProps } from '../../shell/registry';
import { getPipeline } from '../ai/pipeline';
import { latestResult, useTabAnalysis } from './controller';
import { openPanel } from './panelStore';

const MIRROR_TOLERANCE = 8;
const JUDGE_LIMIT = 20;

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await commands.configRead(name)) as T;
  } catch {
    return null;
  }
}

/** −1…+1, con el signo menos tipográfico del mockup. */
const signed = (v: number, fmt: (n: number, o: Intl.NumberFormatOptions) => string) => fmt(v, { signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('-', '−');
const unit = (framing: number) => (framing - 50) / 50;

/** Barra divergente: roja a la izquierda del centro (izquierda política), azul a la derecha. */
function DivBar({ value, height = '100%', delay = 0, muted = false }: { value: number; height?: string; delay?: number; muted?: boolean }) {
  const w = Math.min(1, Math.abs(value)) * 50;
  return <span className={`np-divbar ${value < 0 ? 'np-divbar--l' : 'np-divbar--r'}${muted ? ' np-divbar--muted' : ''}`} style={{ width: `${w}%`, height, transitionDelay: `${delay}ms` }} />;
}

function Evidence({ s }: { s: Signal }) {
  const { t } = useI18n();
  if (!s.evidence.length) return <p className="np-pos-noev">{t('position.noEvidence')}</p>;
  return (
    <>
      {s.evidence.slice(0, 4).map((e, i) => (
        <div key={i} className="np-pos-ev">
          <div>«<mark>{e}</mark>»</div>
        </div>
      ))}
    </>
  );
}

export function PositionPage({ url, tab }: InternalPageProps) {
  const { t, formatNumber } = useI18n();
  const source = Number(url.query.get('tab'));
  const a = useTabAnalysis(Number.isFinite(source) ? source : null);
  const result = latestResult(a);
  const score = result?.score ?? null;
  const [blind, setBlind] = useState(true);
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const [placed, setPlaced] = useState(false);
  const [threshold, setThreshold] = useState(0.35);
  const [swaps, setSwaps] = useState<[string, string][] | null>(null);
  const [lexicon, setLexicon] = useState<LexiconScore | null>(null);
  const [mirror, setMirror] = useState<{ busy: boolean; a: number | null; b: number | null; symmetric: boolean | null }>({ busy: false, a: null, b: null, symmetric: null });

  useEffect(() => {
    const id = window.setTimeout(() => setPlaced(true), 150);
    void readJson<{ minConfidence?: number }>('framing-weights.json').then((w) => w?.minConfidence !== undefined && setThreshold(w.minConfidence));
    void commands
      .settingsGet<string>('content.locale')
      .then((l) => readJson<{ pairs: [string, string][] }>(`mirror-swaps-${l ?? 'es'}.json`))
      .then((m) => setSwaps(m?.pairs ?? null));
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!a) return;
    void commands
      .settingsGet<string>('content.locale')
      .then((l) => commands.lexiconScore(a.article.text, l ?? 'es'))
      .then(setLexicon)
      .catch(() => setLexicon(null));
  }, [a?.article.text]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    if (Number.isFinite(source)) void commands.tabActivate(source).then(() => openPanel('analysis'));
    void commands.tabClose(tab.id);
  };

  if (!a || !score) {
    return (
      <div className="np-pos">
        <button type="button" className="np-pos-back" onClick={back}>‹ {t('position.back')}</button>
        <p className="np-panel-empty">{t('position.demoMissing')}</p>
      </div>
    );
  }

  const coverages = (result?.coverage?.coverages ?? []).filter((c) => c.lean !== null);
  const docLetter = (i: number) => String.fromCharCode(66 + i);
  const known = [...coverages.map((c) => c.lean as number), ...(score.framing !== null ? [score.framing] : [])];
  const groupCenter = known.length ? known.reduce((x, y) => x + y, 0) / known.length : 50;
  const framing = score.framing;
  const nd = framing === null;
  const diff = framing === null ? 0 : framing - groupCenter;
  const verdict = nd ? 'none' : Math.abs(diff) < 8 ? 'center' : diff < 0 ? 'left' : 'right';
  const lo = score.interval?.[0] ?? (framing ?? 50);
  const hi = score.interval?.[1] ?? (framing ?? 50);
  const P = (v: number) => (placed ? v : 50);
  const doc = blind ? t('position.doc', { letter: 'A' }) : (a.article.siteName ?? '');
  const withEvidence = score.signals.filter((s) => s.evidence.length).length;
  const confOk = score.confidence >= threshold;

  const runMirror = async () => {
    if (!swaps) return;
    setMirror({ busy: true, a: null, b: null, symmetric: null });
    const p = await getPipeline();
    const scorer = async (text: string) => (await p.runQuickAnalysis({ ...a.article, text })).score?.framing ?? null;
    const r = await mirrorCheck(scorer, a.article.text, swaps, MIRROR_TOLERANCE);
    setMirror({ busy: false, ...r });
  };
  const dec = (n: number) => formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const topLex = lexicon?.status === 'ok' ? [...lexicon.matches].sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight)).slice(0, 3) : [];

  return (
    <div className="np-pos np-stagger">
      <div>
        <button type="button" className="np-pos-back" onClick={back}>‹ {t('position.back')}</button>
      </div>

      <header className="np-pos-head">
        <div>
          <div className="np-pos-doc">{(blind ? t('position.docBlind', { n: coverages.length }) : t('position.docOpen', { outlet: a.article.siteName ?? '' })).toUpperCase()}</div>
          <h1>{t('position.title')}</h1>
          <p>{t('position.intro')}</p>
        </div>
        <div className="np-pos-blind">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4 9.5 6-.4.8-1.2 2-2.4 3.2M6.5 7.6C4.6 8.9 3.2 10.6 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.3-1" />
          </svg>
          <div>
            <div>{t('position.blind')}</div>
            <small>{blind ? t('position.blindOn', { last: docLetter(Math.max(0, coverages.length - 1)) }) : t('position.blindOff')}</small>
          </div>
          <button type="button" role="switch" aria-checked={blind} aria-label={t('position.blind')} className="np-pos-switch" onClick={() => setBlind(!blind)}>
            <span />
          </button>
        </div>
      </header>

      <section className="np-pos-card np-pos-axiscard">
        <div className="np-pos-axishead">
          <div className="np-pos-kicker">{t('position.relativeTitle')}</div>
          <div className={`np-pos-verdict${nd ? ' np-pos-verdict--nd' : ''}`}>{t(`position.verdict.${verdict}`)}</div>
        </div>
        <div className="np-pos-axis">
          <div className="np-pos-axisline"><i /><i /><i /></div>
          {score.interval ? <div className={`np-pos-band${nd ? ' np-pos-band--nd' : ''}`} style={{ left: `${P(lo)}%`, width: `${placed ? hi - lo : 0}%` }} /> : null}
          <div className="np-pos-center" style={{ left: `${P(groupCenter)}%` }}><span>{t('position.groupCenter')}</span></div>
          {coverages.map((c, i) => (
            <div key={c.url} className="np-pos-other" style={{ top: i % 2 ? 50 : 30, left: `${P(c.lean as number)}%`, transitionDelay: `${i * 80}ms` }}>
              <span style={{ marginBottom: i % 2 ? 4 : 24 }}>{blind ? t('position.doc', { letter: docLetter(i) }) : c.outlet}</span>
              <i />
            </div>
          ))}
          {!nd ? (
            <div className="np-pos-me" style={{ left: `${P(framing)}%` }}>
              <span>{t('position.thisOne', { doc })}</span>
              <i />
              <small>{formatNumber(Math.round(framing))}{score.interval ? ` ± ${formatNumber(Math.round((hi - lo) / 2))}` : ''}</small>
            </div>
          ) : (
            <div className="np-pos-nd np-rise">{t('position.verdict.none')}</div>
          )}
        </div>
        <div className="np-pos-scale"><span>{t('analysis.axis.left')}</span><span>{t('analysis.axis.center')}</span><span>{t('analysis.axis.right')}</span></div>
        <div className="np-pos-legend">
          <span><i className="dot-me" />{t('position.legend.me')}</span>
          <span><i className="dot-band" />{t('position.legend.band')}</span>
          {coverages.length ? <span><i className="dot-other" />{t('position.legend.others', { n: coverages.length })}</span> : null}
          <em>{t('position.relative')}</em>
        </div>
      </section>

      <div className="np-pos-cols">
        <section className="np-pos-card np-pos-signals">
          <div className="np-pos-signalshead">
            <div>
              <h2>{t('position.signals')}</h2>
              <p>{t('position.signalsHint')}</p>
            </div>
            <div className="np-pos-signalslegend"><span>{t('position.signalsLeft')}</span><i /><span>{t('position.signalsRight')}</span></div>
          </div>
          {score.signals.map((s, i) => {
            // Por defecto se abre la primera señal que tiene evidencia citada (mockup Posicion).
            const isOpen = (open === undefined ? score.signals.findIndex((x) => x.evidence.length) === i : open === `${s.kind}-${i}`);
            return (
              <div key={`${s.kind}-${i}`} className="np-pos-signal">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : `${s.kind}-${i}`)}>
                  <span className="np-pos-signalname">
                    <strong>{t(`position.signal.${s.kind}`)}</strong>
                    <small>{t(`position.signalDesc.${s.kind}`)}</small>
                  </span>
                  <span className="np-pos-signalbar"><DivBar value={placed ? s.value : 0} delay={i * 70} muted={nd} /></span>
                  <span className={`np-pos-signalval${nd ? ' np-pos-signalval--nd' : ''}`}>{signed(s.value, formatNumber)}</span>
                  <span className="np-chev" aria-hidden="true">›</span>
                </button>
                {isOpen ? (
                  <div className="np-pos-signalbody np-rise">
                    <Evidence s={s} />
                    {s.kind === 'voces' && score.voices.actors.length ? (
                      <div className="np-pos-counts">
                        {score.voices.actors.map((v) => (
                          <span key={v.name}>{v.name} <b>{v.quotes}</b></span>
                        ))}
                      </div>
                    ) : null}
                    {s.kind === 'voces' && score.voices.lastWord ? <p className="np-pos-note">{t('position.lastWord', { name: score.voices.lastWord })}</p> : null}
                    {s.kind === 'omision' && score.omissions.length ? (
                      <div className="np-pos-omits">
                        {score.omissions.map((o) => (
                          <div key={o}><i>—</i><span>{o}</span><em>{t('position.omittedBy')}</em></div>
                        ))}
                      </div>
                    ) : null}
                    <div className="np-pos-foot">{t(`position.signalFoot.${s.kind}`)}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        <div className="np-pos-side">
          <section className="np-pos-card">
            <div className="np-pos-mono np-pos-upper">{t('position.lexiconKicker')}</div>
            <h2>{t('position.lexicon')}</h2>
            <p>{t('position.lexiconBody')}</p>
            <div className="np-pos-lexicon">
              {topLex.map((m, i) => (
                <div key={m.phrase}>
                  <span><b>«{m.phrase}»</b></span>
                  <span className="np-pos-lexbar"><DivBar value={placed ? m.weight : 0} delay={300 + i * 90} /></span>
                  <code>{signed(m.weight, formatNumber)}</code>
                </div>
              ))}
              {lexicon && lexicon.status === 'ok' && !topLex.length ? <p className="np-pos-note">{t('position.lexiconNone')}</p> : null}
              {lexicon?.status === 'insufficient' ? <p className="np-pos-note">{t('position.lexiconInsufficient')}</p> : null}
              {lexicon?.status === 'unavailable' ? <p className="np-pos-note">{t('position.lexiconUnavailable')}</p> : null}
            </div>
          </section>

          <section className="np-pos-card">
            <div className="np-pos-confhead">
              <h2>{t('position.confidence')}</h2>
              <span className={`np-pos-confval ${nd ? 'is-nd' : confOk ? 'is-ok' : 'is-low'}`}>
                {nd ? t('position.confidenceNone') : t(confOk ? 'position.confidenceHigh' : 'position.confidenceLow', { value: formatNumber(score.confidence, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}
              </span>
            </div>
            <div className="np-pos-confbar" role="meter" aria-label={t('position.confidence')} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(score.confidence.toFixed(2))}>
              <span className={confOk && !nd ? 'ok' : 'low'} style={{ width: `${placed ? score.confidence * 100 : 0}%` }} />
              <i style={{ left: `${threshold * 100}%` }} />
            </div>
            <div className="np-pos-confscale"><span>0</span><span style={{ marginLeft: `${Math.max(0, threshold * 100 - 12)}%` }}>{t('position.threshold', { value: formatNumber(threshold) })}</span><span>1</span></div>
            <p className={`np-pos-confnote${confOk ? '' : ' is-low'}`}>{confOk && !nd ? t('position.confidenceNoteOk', { n: withEvidence }) : t('position.confidenceNoteLow', { value: formatNumber(score.confidence, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</p>
            <p className="np-pos-note">{t('position.confidenceNote')}</p>
          </section>
        </div>
      </div>

      <section>
        <div className="np-pos-controlshead">
          <div>
            <h2>{t('position.controls')}</h2>
            <p>{t('position.controlsHint')}</p>
          </div>
        </div>
        <div className="np-pos-controls">
          {swaps ? (
            <div className="np-pos-card np-pos-control">
              <div className="np-pos-controltitle">
                <strong>{t('position.mirror')}</strong>
                {mirror.symmetric !== null ? <span className={`np-pos-chip ${mirror.symmetric ? 'is-ok' : 'is-bad'}`}>{mirror.symmetric ? `✓ ${t('position.mirrorChipOk')}` : t('position.mirrorChipBad')}</span> : null}
              </div>
              <p>{t('position.mirrorBody')}</p>
              {mirror.symmetric !== null && mirror.a !== null && mirror.b !== null ? (
                <>
                  {([['mirrorOriginal', mirror.a], ['mirrorMirror', mirror.b]] as const).map(([k, v], i) => (
                    <div key={k} className="np-pos-mirrow">
                      <span>{t(`position.${k}`)}</span>
                      <span className="np-pos-mirtrack"><i /><b className={unit(v) < 0 ? 'l' : 'r'} style={{ left: `${P(50 + unit(v) * 50)}%`, transitionDelay: `${i * 250}ms` }} /></span>
                      <code>{signed(unit(v), formatNumber)}</code>
                    </div>
                  ))}
                  <div className="np-pos-mono">{t('position.mirrorStats', { gap: dec(Math.abs(mirror.a - 50 + (mirror.b - 50)) / 50), tolerance: dec(MIRROR_TOLERANCE / 50) })}</div>
                </>
              ) : null}
              <button type="button" className="np-pos-run" disabled={mirror.busy} onClick={() => void runMirror()}>
                {mirror.busy ? t('position.mirrorRunning') : t('position.mirrorRun')}
              </button>
            </div>
          ) : null}
          {score.judges?.length === 2 ? (
            <div className="np-pos-card np-pos-control">
              <div className="np-pos-controltitle">
                <strong>{t('position.judgesTitle')}</strong>
                <span className={`np-pos-chip ${score.crossModelDisagreement ? 'is-bad' : 'is-ok'}`}>{score.crossModelDisagreement ? t('position.judgesDisagreeChip') : `✓ ${t('position.judgesAgreeChip')}`}</span>
              </div>
              <p>{t('position.judgesBody')}</p>
              {score.judges.map((j, i) => (
                <div key={`${j.model}-${i}`} className="np-pos-mirrow">
                  <span>{j.model}</span>
                  <span className="np-pos-lexbar"><DivBar value={placed && j.framing !== null ? unit(j.framing) : 0} delay={i * 120} /></span>
                  <code>{j.framing === null ? '–' : signed(unit(j.framing), formatNumber)}</code>
                </div>
              ))}
              {score.judges[0]?.framing != null && score.judges[1]?.framing != null ? (
                <div className="np-pos-mono">{t('position.judgesStats', { gap: dec(Math.abs(score.judges[0].framing - score.judges[1].framing) / 50), limit: dec(JUDGE_LIMIT / 50) })}</div>
              ) : null}
            </div>
          ) : (
            <div className="np-pos-card np-pos-control">
              <div className="np-pos-controltitle"><strong>{t('position.judgesTitle')}</strong></div>
              <p>{t('position.judgesOff')}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
