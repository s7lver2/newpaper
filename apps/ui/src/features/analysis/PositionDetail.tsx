import { useI18n } from '@newpaper/i18n/react';
import { mirrorCheck, type Signal } from '@newpaper/pipeline';
import { Button, ConfidenceMeter, FramingAxis } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { getPipeline } from '../ai/pipeline';
import { latestResult, useTabAnalysis } from './controller';
import { panelStore } from './panelStore';
import { useAxisLabels } from './axisLabels';

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await commands.configRead(name)) as T;
  } catch {
    return null;
  }
}

function SignalRow({ s }: { s: Signal }) {
  const { t, formatNumber } = useI18n();
  const pct = ((s.value + 1) / 2) * 100;
  return (
    <li className="np-signal">
      <div className="np-signal-head">
        <span>{t(`position.signal.${s.kind}`)}</span>
        <span className="np-mono">{formatNumber(s.value, { signDisplay: 'always', maximumFractionDigits: 2 })}</span>
      </div>
      <div className="np-signal-bar" aria-hidden="true">
        <span style={{ left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%` }} />
      </div>
      <ul className="np-signal-evidence">
        {s.evidence.slice(0, 4).map((e, i) => (
          <li key={i}>«{e}»</li>
        ))}
      </ul>
    </li>
  );
}

export function PositionDetail({ tab }: { tab: TabInfo }) {
  const { t, formatNumber } = useI18n();
  const axis = useAxisLabels();
  const a = useTabAnalysis(tab.id);
  const result = latestResult(a);
  const score = result?.score ?? null;
  const [threshold, setThreshold] = useState(0.35);
  const [swaps, setSwaps] = useState<[string, string][] | null>(null);
  const [mirror, setMirror] = useState<{ busy: boolean; a: number | null; b: number | null; symmetric: boolean | null }>({ busy: false, a: null, b: null, symmetric: null });

  useEffect(() => {
    void readJson<{ minConfidence?: number }>('framing-weights.json').then((w) => w?.minConfidence !== undefined && setThreshold(w.minConfidence));
    void commands
      .settingsGet<string>('content.locale')
      .then((l) => readJson<{ pairs: [string, string][] }>(`mirror-swaps-${l ?? 'es'}.json`))
      .then((m) => setSwaps(m?.pairs ?? null));
  }, []);

  if (!a || !score) return <p className="np-panel-empty">{t('position.none')}</p>;
  const known = (result?.coverage?.coverages ?? []).map((c) => c.lean).filter((l): l is number => l !== null);
  const groupCenter = known.length ? known.reduce((x, y) => x + y, 0) / known.length : 50;

  const runMirror = async () => {
    if (!swaps) return;
    setMirror({ busy: true, a: null, b: null, symmetric: null });
    const p = await getPipeline();
    const scorer = async (text: string) => (await p.runQuickAnalysis({ ...a.article, text })).score?.framing ?? null;
    const r = await mirrorCheck(scorer, a.article.text, swaps);
    setMirror({ busy: false, ...r });
  };

  return (
    <section className="np-position" aria-label={t('position.title')}>
      <Button variant="quiet" onClick={() => panelStore.set({ detail: 'none' })}>
        {t('position.back')}
      </Button>
      <h2>{t('position.title')}</h2>
      <p className="np-muted">{t('position.intro')}</p>
      <p className="np-tag np-tag--accent">{t('position.blind')}</p>
      <FramingAxis framing={score.framing} interval={score.interval} groupCenter={groupCenter} others={[]} labels={axis} />
      <p className="np-muted">{t('position.relative')}</p>

      <h3>{t('position.signals')}</h3>
      <p className="np-muted">{t('position.signalsHint')}</p>
      <ul className="np-signals">
        {score.signals.map((s, i) => (
          <SignalRow key={`${s.kind}-${i}`} s={s} />
        ))}
      </ul>
      {score.voices.actors.length ? (
        <>
          <h3>{t('position.voices')}</h3>
          <ul className="np-voices">
            {score.voices.actors.map((v) => (
              <li key={v.name}>{t('position.voice', { name: v.name, quotes: v.quotes })}</li>
            ))}
          </ul>
          {score.voices.lastWord ? <p className="np-muted">{t('position.lastWord', { name: score.voices.lastWord })}</p> : null}
        </>
      ) : null}
      {score.omissions.length ? (
        <>
          <h3>{t('position.omissions')}</h3>
          <ul>
            {score.omissions.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </>
      ) : null}

      <h3>{t('position.lexicon')}</h3>
      <p className="np-muted">{t('position.lexiconBody')}</p>

      <ConfidenceMeter value={score.confidence} threshold={threshold} label={t('position.confidence')} thresholdLabel={t('position.threshold', { value: formatNumber(threshold) })} />
      <p className="np-muted">{t('position.confidenceNote')}</p>

      <h3>{t('position.controls')}</h3>
      {score.judges?.length === 2 ? (
        <div className="np-control">
          <strong>{score.crossModelDisagreement ? t('position.judgesDisagree') : t('position.judgesAgree')}</strong>
          <ul>
            {score.judges.map((j) => (
              <li key={j.model}>
                {j.model}: <span className="np-mono">{j.framing === null ? '–' : formatNumber(j.framing)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="np-muted">{t('position.judgesOff')}</p>
      )}
      {swaps ? (
        <div className="np-control">
          <strong>{t('position.mirror')}</strong>
          <p className="np-muted">{t('position.mirrorBody')}</p>
          <Button disabled={mirror.busy} onClick={() => void runMirror()}>
            {mirror.busy ? t('position.mirrorRunning') : t('position.mirrorRun')}
          </Button>
          {mirror.symmetric !== null ? (
            <p role="status">
              {t('position.mirrorResult', { a: mirror.a === null ? '–' : formatNumber(mirror.a), b: mirror.b === null ? '–' : formatNumber(mirror.b) })}{' '}
              <strong>{mirror.symmetric ? t('position.mirrorOk') : t('position.mirrorBad')}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
