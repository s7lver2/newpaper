import { useI18n } from '@newpaper/i18n/react';
import type { AgentMode } from '@newpaper/pipeline';
import { VisualizationView, type PartyInfo, type VizLabels } from '@newpaper/ui-kit';
import { applyAgentEvent, renderCitations, type AgentMessage, type CitedPart } from '@newpaper/ui-kit/logic';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getPipeline } from '../ai/pipeline';
import { ipc } from '../ipc';
import { go, back } from '../router';
import { useAiReady } from '../aiReady';
import { NeedProviderSheet } from '../components';
import { loadArticle, readingState, useReading } from '../readingStore';
import { IconBack, IconChevron } from '../icons';

let seq = 0;

interface Thread { url: string; title: string; at: number }
const THREADS_KEY = 'np.agent.threads';

/** Hilos recientes (solo el índice; el texto de las respuestas no se guarda en el móvil). Escribir en localStorage es best-effort. */
function readThreads(): Thread[] {
  try {
    return JSON.parse(localStorage.getItem(THREADS_KEY) ?? '[]') as Thread[];
  } catch {
    return [];
  }
}
function rememberThread(th: Thread) {
  try {
    const rest = readThreads().filter((x) => x.url !== th.url);
    localStorage.setItem(THREADS_KEY, JSON.stringify([th, ...rest].slice(0, 50)));
  } catch {
    /* sin almacenamiento: el hilo solo existe en esta sesión */
  }
}

/** Raíz del Agente: conversaciones por noticia, o estado vacío. */
export function AgentIndex() {
  const { t, formatDate } = useI18n();
  const [threads, setThreads] = useState<Thread[]>([]);
  useEffect(() => setThreads(readThreads()), []);
  return (
    <div>
      <h1 className="m-large">{t('mobile.agent.index.title')}</h1>
      <p className="m-sub">{t('mobile.agent.index.subtitle')}</p>
      {threads.length === 0 ? (
        <p className="m-empty">
          <b>{t('mobile.agent.index.emptyTitle')}</b>
          {t('mobile.agent.index.empty')}
        </p>
      ) : (
        <>
          <h2 className="m-sec">{t('mobile.agent.index.recent')}</h2>
          <div className="m-group" style={{ margin: '0 var(--m-gutter)' }}>
            {threads.map((th) => (
              <button key={th.url} type="button" className="m-row" onClick={() => go('agente', { u: th.url })}>
                <span className="m-row-body">
                  <b>{th.title || th.url}</b>
                  <span>{formatDate(new Date(th.at), { dateStyle: 'medium' })}</span>
                </span>
                <IconChevron />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="m-btn-row" style={{ marginTop: 22 }}>
        <button type="button" className="m-btn sec" onClick={() => go('leer')}>{t('mobile.agent.index.openReading')}</button>
      </div>
    </div>
  );
}

/** Agente sobre un articulo: citas que abren la fuente en la webview original y graficos del resultado. */
export function Agent({ url }: { url: string | null }) {
  const { t, formatNumber, locale } = useI18n();
  const s = useReading();
  const [mode, setMode] = useState<AgentMode>('ask');
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<AgentMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [parties, setParties] = useState<PartyInfo[]>([]);
  const ready = useAiReady() === true;
  const [need, setNeed] = useState(false);
  useEffect(() => {
    if (url) void loadArticle(url);
  }, [url]);
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
  const sources = (result?.sources ?? []).map((x) => ({ id: x.id, title: x.title, url: x.url }));
  const openSource = (u: string) => void ipc.originalOpen(u, { close: t('mobile.reading.close'), analyze: t('mobile.reading.analyzeOriginal') });

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return setNeed(true);
    const question = q.trim();
    const a = readingState().article;
    if (!question || !a || busy) return;
    rememberThread({ url: a.url, title: a.title, at: Date.now() });
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

  const header = (
    <header className="m-appbar">
      <button type="button" className="m-back" aria-label={t('mobile.nav.back')} onClick={() => back()}>
        <IconBack />
      </button>
      <div className="m-bar-title">
        {s.article?.title ?? t('mobile.agent.index.title')}
        <span className="m-bar-sub">{t('agent.context', { coverages: result?.coverage?.coverages.length ?? 0, sources: sources.length })}</span>
      </div>
    </header>
  );

  if (!url && !s.article) return <div>{header}<p className="m-empty">{t('agent.needsArticle')}</p></div>;
  if (!s.article) return <div>{header}<p className="m-empty">{s.busy ? t('mobile.reading.loading') : t('agent.needsArticle')}</p></div>;

  return (
    <section className="m-agent">
      {header}
      <div style={{ padding: '0 var(--m-gutter) 8px' }}>
        {msgs.length === 0 ? (
          <div className="m-empty" style={{ margin: '24px 0' }}>
            <b>{t('mobile.agent.chat.emptyTitle')}</b>
            {t('mobile.agent.chat.empty')}
          </div>
        ) : null}
        {msgs.map((m) => {
          if (m.role === 'user') {
            return (
              <p key={m.id} style={{ margin: '0 0 12px 40px', padding: '12px 16px', borderRadius: '16px 16px 4px 16px', background: 'var(--np-ink)', color: 'var(--np-on-ink)' }}>
                {m.text}
              </p>
            );
          }
          const parts: CitedPart[] = m.done ? renderCitations(m.text, m.citations) : [{ kind: 'text', text: m.text }];
          return (
            <div key={m.id} className="m-card" aria-busy={!m.done} style={{ margin: '0 0 12px', borderLeft: '3px solid var(--np-accent)', font: '400 17px/1.6 var(--np-font-read)' }}>
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
                <button key={x.url} type="button" className="m-btn sec sm" onClick={() => openSource(x.url)}>{x.caption}</button>
              ))}
              {m.error ? <p role="alert">{m.error}</p> : null}
            </div>
          );
        })}
      </div>
      <form onSubmit={(e) => void send(e)} className="m-composer" style={{ position: 'sticky', bottom: 0, padding: '12px var(--m-gutter) var(--m-bottom)', background: 'var(--np-paper)', boxShadow: '0 -8px 20px rgba(23,23,26,.06)', display: 'grid', gap: 10 }}>
        <div role="radiogroup" aria-label={t('agent.mode.label')} className="m-chips" style={{ padding: 0 }}>
          {(['ask', 'verify', 'explain'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={mode === v} className="m-chip" aria-pressed={mode === v} onClick={() => setMode(v)}>
              {t(`agent.mode.${v}`)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <label className="m-sr" htmlFor="m-agent-q">{t('agent.placeholder')}</label>
          <input id="m-agent-q" className="m-input" style={{ borderRadius: 26, height: 52 }} value={q} placeholder={ready ? t('agent.placeholder') : t('mobile.needProvider.banner')} readOnly={!ready} onClick={() => !ready && setNeed(true)} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="m-btn" style={{ width: 52, height: 52, padding: 0, borderRadius: 26 }} disabled={ready && (busy || !q.trim())} aria-label={t('agent.send')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
          </button>
        </div>
      </form>
      {need ? <NeedProviderSheet onClose={() => setNeed(false)} /> : null}
    </section>
  );
}
