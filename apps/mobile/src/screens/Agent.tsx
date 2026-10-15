import { useI18n } from '@newpaper/i18n/react';
import type { AgentMode } from '@newpaper/pipeline';
import { Button, SegmentedControl, VisualizationView, type PartyInfo, type VizLabels } from '@newpaper/ui-kit';
import { applyAgentEvent, renderCitations, type AgentMessage, type CitedPart } from '@newpaper/ui-kit/logic';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getPipeline } from '../ai/pipeline';
import { ipc } from '../ipc';
import { readingState, useReading } from '../readingStore';

let seq = 0;

/** Agente sobre el articulo abierto: citas que abren la fuente en la webview original y graficos del resultado. */
export function Agent() {
  const { t, formatNumber, locale } = useI18n();
  const s = useReading();
  const [mode, setMode] = useState<AgentMode>('ask');
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<AgentMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [parties, setParties] = useState<PartyInfo[]>([]);
  useEffect(() => {
    void ipc
      .settingsGet<string>('content.locale')
      .then((l) => ipc.configRead(`parties-${l ?? 'es'}.json`))
      .then((txt) => setParties((JSON.parse(txt) as { parties: PartyInfo[] }).parties))
      .catch(() => {});
  }, []);
  const labels = useMemo<VizLabels>(() => ({
    sources: t('charts.sources'), showTable: t('charts.showTable'), showChart: t('charts.showChart'), label: t('charts.label'), value: t('charts.value'), region: t('charts.region'),
    matrix: (c) => t(`charts.matrix.${c}`),
    parliament: {
      chart: t('charts.parliament.chart'), majority: (n) => t('charts.parliament.majority', { n }), seatsFor: (n) => t('charts.parliament.seatsFor', { n }),
      reached: t('charts.parliament.reached'), short: (n) => t('charts.parliament.short', { n }), hint: t('charts.parliament.hint'), party: t('charts.parliament.party'),
      seats: t('charts.parliament.seats'), vote: t('charts.parliament.vote'), yes: t('charts.parliament.yes'), no: t('charts.parliament.no'), reset: t('charts.parliament.reset'),
    },
  }), [t]);
  const region = useMemo(() => new Intl.DisplayNames([locale], { type: 'region' }), [locale]);
  const result = s.full ?? s.quick;
  if (!s.article) return <p className="np-muted">{t('agent.needsArticle')}</p>;
  const sources = (result?.sources ?? []).map((x) => ({ id: x.id, title: x.title, url: x.url }));
  const openSource = (url: string) => void ipc.originalOpen(url, { close: t('mobile.reading.close'), analyze: t('mobile.reading.analyzeOriginal') });

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    const a = readingState().article;
    if (!question || !a || busy) return;
    const reply: AgentMessage = { id: `a${++seq}`, role: 'assistant', mode, text: '', fragment: null, citations: [], visuals: [], media: [], steps: [], done: false, error: null };
    const user: AgentMessage = { ...reply, id: `u${++seq}`, role: 'user', text: question, done: true };
    const history = msgs.filter((m) => m.done && !m.error).map((m) => ({ role: m.role, content: m.text }));
    setMsgs((m) => [...m, user, reply]);
    setQ('');
    setBusy(true);
    const patch = (f: (m: AgentMessage) => AgentMessage) => setMsgs((list) => list.map((m) => (m.id === reply.id ? f(m) : m)));
    try {
      const p = await getPipeline();
      await p.askAgent({ article: { url: a.url, title: a.title, text: a.text }, previous: result, mode, question, history, onEvent: (ev) => patch((m) => applyAgentEvent(m, ev)) });
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      patch((m) => ({ ...m, done: true, error: msg.includes('no model assigned') ? t('agent.noModel') : t('agent.error', { message: msg }) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="m-agent">
      <p className="np-muted">{t('agent.context', { coverages: result?.coverage?.coverages.length ?? 0, sources: sources.length })}</p>
      {msgs.map((m) => {
        if (m.role === 'user') return <p key={m.id} className="m-card">{m.text}</p>;
        const parts: CitedPart[] = m.done ? renderCitations(m.text, m.citations) : [{ kind: 'text', text: m.text }];
        return (
          <div key={m.id} className="m-card" aria-busy={!m.done}>
            <p>
              {parts.map((part, i) =>
                part.kind === 'text' ? (
                  <span key={i}>{part.text}</span>
                ) : (
                  <button key={i} type="button" className="np-cite" title={part.citation.title} onClick={() => openSource(part.citation.url)}>
                    {part.n}
                  </button>
                ),
              )}
            </p>
            {m.visuals.map((v, i) => (
              <VisualizationView
                key={i}
                viz={v}
                sources={sources}
                parties={parties}
                labels={labels}
                format={(n) => formatNumber(n)}
                regionName={(c) => (/^[A-Z]{2}$/i.test(c) ? (region.of(c.toUpperCase()) ?? c) : c)}
                onOpenSource={openSource}
              />
            ))}
            {m.media.map((x) => (
              <Button key={x.url} variant="quiet" onClick={() => openSource(x.url)}>{x.caption}</Button>
            ))}
            {m.error ? <p role="alert">{m.error}</p> : null}
          </div>
        );
      })}
      <form onSubmit={(e) => void send(e)} className="m-composer">
        <SegmentedControl label={t('agent.mode.label')} value={mode} onChange={(v) => setMode(v)} options={(['ask', 'verify', 'explain'] as const).map((v) => ({ value: v, label: t(`agent.mode.${v}`) }))} />
        <label className="np-sr-only" htmlFor="m-agent-q">{t('agent.placeholder')}</label>
        <input id="m-agent-q" className="m-input" value={q} placeholder={t('agent.placeholder')} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="primary" disabled={busy || !q.trim()}>{t('agent.send')}</Button>
      </form>
    </section>
  );
}
