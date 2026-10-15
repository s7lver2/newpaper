import { useI18n } from '@newpaper/i18n/react';
import type { AgentMode, MediaItem } from '@newpaper/pipeline';
import { VisualizationView } from '@newpaper/ui-kit';
import { useEffect, useState, type FormEvent } from 'react';
import type { TabInfo } from '../../../ipc/types';
import { navigate } from '../../../shell/navigate';
import { rewriteImage } from '../../../shell/ReaderSurface';
import { latestResult, useTabAnalysis } from '../controller';
import { panelStore, usePanel } from '../panelStore';
import { useParties } from '../parties';
import { useVizLabels } from '../vizLabels';
import { renderCitations, type AgentMessage } from '@newpaper/ui-kit/logic';
import { useAgent } from './useAgent';

const openSource = (url: string) => void navigate(url, { newTab: true });

function Media({ m, label }: { m: MediaItem; label: string }) {
  return (
    <figure className="np-agent-media">
      {m.kind === 'image' ? (
        <img src={rewriteImage(m.url)} alt={m.caption} loading="lazy" />
      ) : (
        <button type="button" className="np-agent-video" onClick={() => openSource(m.url)}>
          {label}
        </button>
      )}
      <figcaption>{m.caption}</figcaption>
    </figure>
  );
}

function Reply({ m, sources }: { m: AgentMessage; sources: { id: string; title: string; url: string }[] }) {
  const { t } = useI18n();
  const viz = useVizLabels();
  const parties = useParties();
  const [stepsOpen, setStepsOpen] = useState(false);
  const [cited, setCited] = useState<number | null>(null);
  const parts = m.done ? renderCitations(m.text, m.citations) : [{ kind: 'text' as const, text: m.text }];
  const noModel = m.error?.includes('no model assigned');
  const steps = m.steps.map((s) => t(`agent.tools.${s}`));
  return (
    <div className="np-agent-msg np-agent-msg--assistant np-rise" aria-busy={!m.done}>
      {steps.length && m.done ? (
        <>
          <button type="button" className="np-agent-stepstoggle" aria-expanded={stepsOpen} onClick={() => setStepsOpen(!stepsOpen)}>
            <span className="np-chev" aria-hidden="true">›</span>
            {t('agent.steps', { steps: steps.length, sources: m.citations.length })}
          </button>
          {stepsOpen ? <div className="np-agent-steps np-rise">{steps.map((s, i) => <div key={i}>{s}</div>)}</div> : null}
        </>
      ) : null}
      {!m.done ? (
        <div className="np-agent-live" role="status">
          {steps.map((s, i) => (
            <div key={i} className="np-agent-live-step np-agent-live-step--done"><span aria-hidden="true" />{s}</div>
          ))}
          {!m.text ? <div className="np-agent-live-step"><span aria-hidden="true" />{t('agent.thinking')}</div> : null}
        </div>
      ) : null}
      {m.text ? (
        <p className="np-agent-text">
          {parts.map((p, i) =>
            p.kind === 'text' ? (
              <span key={i}>{p.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                className={`np-cite${cited === p.n ? ' np-cite--on' : ''}`}
                title={p.citation.title}
                onClick={() => {
                  setCited(p.n);
                  openSource(p.citation.url);
                }}
              >
                {p.n}
              </button>
            ),
          )}
        </p>
      ) : null}
      {m.visuals.map((v, i) => (
        <VisualizationView key={i} viz={v} sources={sources} parties={parties} labels={viz.labels} format={viz.format} regionName={viz.regionName} onOpenSource={openSource} />
      ))}
      {m.media.map((x) => (
        <Media key={x.url} m={x} label={t('agent.openVideo')} />
      ))}
      {m.media.length ? <p className="np-agent-note">{t('agent.mediaNote')}</p> : null}
      {m.done && m.citations.length ? (
        <ol className="np-agent-sources">
          {m.citations.map((c) => (
            <li key={c.n} className={cited === c.n ? 'np-agent-source np-agent-source--on' : 'np-agent-source'}>
              <button type="button" onClick={() => (setCited(c.n), openSource(c.url))}>
                <span className="np-mono">{c.n}</span>
                <span>{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {m.error ? <p className="np-agent-error" role="alert">{noModel ? t('agent.noModel') : t('agent.error', { message: m.error })}</p> : null}
    </div>
  );
}

const IconSend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconStop = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);

export function AgentTab({ tab }: { tab: TabInfo }) {
  const { t } = useI18n();
  const a = useTabAnalysis(tab.id);
  const result = latestResult(a);
  const { messages, busy, send, stop } = useAgent(tab.id);
  const seed = usePanel((s) => s.agentSeed);
  const [mode, setMode] = useState<AgentMode>('ask');
  const [fragment, setFragment] = useState<string | null>(null);
  const [question, setQuestion] = useState('');

  useEffect(() => {
    if (!seed) return;
    setMode(seed.mode);
    setFragment(seed.fragment);
    if (seed.question) void send(seed.question, seed.mode, seed.fragment);
    else if (seed.fragment && seed.mode !== 'ask') void send(t(`agent.auto.${seed.mode}`), seed.mode, seed.fragment);
    panelStore.set({ agentSeed: null });
  }, [seed, send, t]);

  if (!a) return <p className="np-panel-empty">{t('agent.needsArticle')}</p>;
  const sources = (result?.sources ?? []).map((s) => ({ id: s.id, title: s.title, url: s.url }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim() || (fragment ? t(`agent.auto.${mode}`) : '');
    if (!q || busy) return;
    void send(q, mode, fragment);
    setQuestion('');
    setFragment(null);
  };
  const placeholder = fragment ? t('agent.placeholderFragment') : mode === 'verify' ? t('agent.placeholderVerify') : mode === 'explain' ? t('agent.placeholderExplain') : t('agent.placeholderAsk');

  return (
    <section className="np-agent" aria-label={t('agent.title')}>
      <div className="np-agent-log" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="np-agent-empty np-rise">
            <h2>{t('agent.emptyTitle')}</h2>
            <p>{t('agent.emptyBody', { coverages: result?.coverage?.coverages.length ?? 0 })}</p>
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="np-agent-msg np-agent-msg--user np-rise">
              {m.fragment ? <blockquote>«{m.fragment.length > 120 ? `${m.fragment.slice(0, 120)}…` : m.fragment}»</blockquote> : null}
              <p>{m.text}</p>
            </div>
          ) : (
            <Reply key={m.id} m={m} sources={sources} />
          ),
        )}
      </div>
      <form className="np-agent-composer" onSubmit={submit}>
        {fragment ? (
          <div className="np-agent-fragment np-rise">
            <span className="np-agent-fragment-label">{t('agent.fragment')}</span>
            <span className="np-agent-fragment-text">«{fragment.length > 140 ? `${fragment.slice(0, 140)}…` : fragment}»</span>
            <button type="button" aria-label={t('agent.clearFragment')} onClick={() => setFragment(null)}>×</button>
          </div>
        ) : null}
        <div className="np-agent-modes" role="group" aria-label={t('agent.mode.label')}>
          {(['ask', 'verify', 'explain'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}>
              {t(`agent.mode.${v}`)}
            </button>
          ))}
        </div>
        <div className="np-agent-input">
          <label className="np-sr-only" htmlFor="np-agent-q">{t('agent.placeholder')}</label>
          <input id="np-agent-q" type="text" autoComplete="off" value={question} placeholder={placeholder} onChange={(e) => setQuestion(e.target.value)} />
          {busy ? (
            <button type="button" className="np-agent-send" aria-label={t('agent.stop')} onClick={stop}>
              <IconStop />
            </button>
          ) : (
            <button type="submit" className="np-agent-send" aria-label={t('agent.send')} disabled={!question.trim() && !fragment}>
              <IconSend />
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
