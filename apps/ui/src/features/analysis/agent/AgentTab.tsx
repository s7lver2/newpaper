import { useI18n } from '@newpaper/i18n/react';
import type { AgentMode, MediaItem } from '@newpaper/pipeline';
import { Button, IconButton, SegmentedControl, VisualizationView } from '@newpaper/ui-kit';
import { useEffect, useState, type FormEvent } from 'react';
import type { TabInfo } from '../../../ipc/types';
import { navigate } from '../../../shell/navigate';
import { rewriteImage } from '../../../shell/ReaderSurface';
import { latestResult, useTabAnalysis } from '../controller';
import { panelStore, usePanel } from '../panelStore';
import { useParties } from '../parties';
import { useVizLabels } from '../vizLabels';
import { renderCitations, type AgentMessage } from './citations';
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
  const parts = m.done ? renderCitations(m.text, m.citations) : [{ kind: 'text' as const, text: m.text }];
  const noModel = m.error?.includes('no model assigned');
  return (
    <div className="np-agent-msg np-agent-msg--assistant" aria-busy={!m.done}>
      {m.steps.length ? <p className="np-agent-steps">{m.steps.map((s) => t(`agent.tools.${s}`)).join(' · ')}</p> : null}
      <p>
        {parts.map((p, i) =>
          p.kind === 'text' ? (
            <span key={i}>{p.text}</span>
          ) : (
            <button key={i} type="button" className="np-cite" title={p.citation.title} onClick={() => openSource(p.citation.url)}>
              {p.n}
            </button>
          ),
        )}
      </p>
      {m.visuals.map((v, i) => (
        <VisualizationView key={i} viz={v} sources={sources} parties={parties} labels={viz.labels} format={viz.format} regionName={viz.regionName} onOpenSource={openSource} />
      ))}
      {m.media.map((x) => (
        <Media key={x.url} m={x} label={t('agent.openVideo')} />
      ))}
      {m.media.length ? <p className="np-agent-note">{t('agent.mediaNote')}</p> : null}
      {m.error ? <p className="np-agent-error" role="alert">{noModel ? t('agent.noModel') : t('agent.error', { message: m.error })}</p> : null}
    </div>
  );
}

export function AgentTab({ tab }: { tab: TabInfo }) {
  const { t } = useI18n();
  const a = useTabAnalysis(tab.id);
  const result = latestResult(a);
  const { messages, busy, send, stop } = useAgent(tab.id);
  const seed = usePanel((s) => s.agentSeed);
  const wide = usePanel((s) => s.wide);
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
    const q = question.trim();
    if (!q || busy) return;
    void send(q, mode, fragment);
    setQuestion('');
    setFragment(null);
  };

  return (
    <section className="np-agent" aria-label={t('agent.title')}>
      <header className="np-agent-head">
        <p className="np-agent-context">{t('agent.context', { coverages: result?.coverage?.coverages.length ?? 0, sources: sources.length })}</p>
        <IconButton label={wide ? t('agent.narrow') : t('agent.wide')} pressed={wide} icon={<span aria-hidden="true">⇔</span>} onClick={() => panelStore.set({ wide: !wide })} />
      </header>
      <div className="np-agent-log" role="log" aria-live="polite">
        {messages.length === 0 ? <p className="np-panel-empty">{t('agent.empty')}</p> : null}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="np-agent-msg np-agent-msg--user">
              {m.fragment ? <blockquote>{m.fragment}</blockquote> : null}
              <p>{m.text}</p>
            </div>
          ) : (
            <Reply key={m.id} m={m} sources={sources} />
          ),
        )}
      </div>
      <form className="np-agent-composer" onSubmit={submit}>
        <SegmentedControl
          label={t('agent.mode.label')}
          value={mode}
          onChange={(v) => setMode(v as AgentMode)}
          options={(['ask', 'verify', 'explain'] as const).map((v) => ({ value: v, label: t(`agent.mode.${v}`) }))}
        />
        {fragment ? (
          <p className="np-agent-fragment">
            <span>{fragment}</span>
            <button type="button" aria-label={t('agent.clearFragment')} onClick={() => setFragment(null)}>×</button>
          </p>
        ) : null}
        <label className="np-sr-only" htmlFor="np-agent-q">{t('agent.placeholder')}</label>
        <textarea id="np-agent-q" rows={2} value={question} placeholder={t('agent.placeholder')} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit(e)} />
        {busy ? (
          <Button onClick={stop}>{t('agent.stop')}</Button>
        ) : (
          <Button type="submit" variant="primary" disabled={!question.trim()}>
            {t('agent.send')}
          </Button>
        )}
      </form>
    </section>
  );
}
