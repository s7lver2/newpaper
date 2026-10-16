import { useI18n } from '@newpaper/i18n/react';
import { AnnotatedText, markTone, ReaderView, type LensMark } from '@newpaper/ui-kit';
import { addPluginListener } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ipc, type HistoryEntry, type SavedArticle } from '../ipc';
import { go, back, useBackClose } from '../router';
import { loadArticle, showHtml, useReading } from '../readingStore';
import { useAiReady } from '../aiReady';
import { NeedProviderSheet } from '../components';
import { AnalysisSheet } from './AnalysisSheet';
import { IconBack, IconChevron, IconLens } from '../icons';

/** Raíz de "Leyendo": lo abierto y lo guardado para leer más tarde. Sin contenido: estado vacío. */
export function ReadingIndex() {
  const { t, formatDate } = useI18n();
  const [recent, setRecent] = useState<HistoryEntry[] | null>(null);
  const [saved, setSaved] = useState<SavedArticle[]>([]);
  useEffect(() => {
    void ipc.historySearch({ kind: 'visit', limit: 30 }).then(setRecent).catch(() => setRecent([]));
    void ipc.savedList().then(setSaved).catch(() => {});
  }, []);
  const items = (recent ?? []).filter((x) => x.url);
  return (
    <div>
      <h1 className="m-large">{t('mobile.reading.index.title')}</h1>
      <p className="m-sub">{t('mobile.reading.index.subtitle')}</p>
      {saved.length > 0 ? (
        <>
          <h2 className="m-sec">{t('mobile.reading.index.saved')}</h2>
          <div className="m-group" style={{ margin: '0 var(--m-gutter)' }}>
            {saved.map((s) => (
              <button key={s.url} type="button" className="m-row" onClick={() => go('leer', { u: s.url })}>
                <span className="m-row-body">
                  <b>{s.title}</b>
                  {s.outlet ? <span>{s.outlet}</span> : null}
                </span>
                <IconChevron />
              </button>
            ))}
          </div>
        </>
      ) : null}
      <h2 className="m-sec">{t('mobile.reading.index.recent')}</h2>
      {recent === null ? (
        <div aria-busy="true" style={{ padding: '0 var(--m-gutter)', display: 'grid', gap: 14 }}>
          {[0, 1, 2].map((i) => <span key={i} className="m-skel" style={{ height: 52 }} />)}
        </div>
      ) : items.length === 0 ? (
        <p className="m-empty"><b>{t('mobile.reading.index.emptyTitle')}</b>{t('mobile.reading.index.empty')}</p>
      ) : (
        <div className="m-group m-stagger" style={{ margin: '0 var(--m-gutter)' }}>
          {items.map((h, i) => (
            <button key={h.id} type="button" className="m-row" style={{ ['--i' as string]: Math.min(i, 8) } as CSSProperties} onClick={() => go('leer', { u: h.url! })}>
              <span className="m-row-body">
                <b>{h.title || h.url}</b>
                <span className="np-mono">
                  {h.outlet ?? ''}
                  {h.outlet ? ' · ' : ''}
                  {formatDate(new Date(h.at), { timeStyle: 'short' })}
                  {h.analyzed ? ` · ${t('history.analyzed')}` : ''}
                </span>
              </span>
              <IconChevron />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lector con la lente. Las imagenes no se cargan en movil: "Ver original" las muestra por la webview nativa. */
export function Reading({ url }: { url: string | null }) {
  const { t } = useI18n();
  const s = useReading();
  const [sheet, setSheet] = useState(false);
  const [lens, setLens] = useState(true);
  const ready = useAiReady() === true;
  const [need, setNeed] = useState(false);
  const closeSheet = useBackClose(sheet && ready, () => setSheet(false));
  useEffect(() => {
    if (url) void loadArticle(url);
  }, [url]);
  useEffect(() => {
    // Al volver de "Ver original" llega el HTML de la pagina: se reextrae el articulo.
    const l = addPluginListener('np-mobile', 'original-html', (e: { url: string; html: string }) => {
      void ipc.originalClose().catch(() => {});
      void showHtml(e.url, e.html);
    }).catch(() => null);
    // Cerrar la webview original (botón o Atrás) también cierra su SOCKS de sesión en Rust.
    const c = addPluginListener('np-mobile', 'original-closed', () => void ipc.originalClose().catch(() => {})).catch(() => null);
    return () => {
      void l.then((x) => x?.unregister());
      void c.then((x) => x?.unregister());
    };
  }, []);
  const result = s.full ?? s.quick;
  const marks = useMemo<LensMark[]>(() => {
    if (!result) return [];
    const st = new Map((result.verdicts ?? []).map((v) => [v.claimId, v.status]));
    return [
      ...(result.claims?.claims ?? []).map((c) => ({ id: c.id, start: c.span[0], end: c.span[1], kind: st.get(c.id) ?? 'pendiente', priority: 2 })),
      ...(result.claims?.loadedPhrases ?? []).map((l, i) => ({ id: `l${i}`, start: l.span[0], end: l.span[1], kind: 'cargada', priority: 1 })),
    ];
  }, [result]);
  const labels = { close: t('mobile.reading.close'), analyze: t('mobile.reading.analyzeOriginal') };

  const bar = (
    <header className="m-appbar">
      <button type="button" className="m-back" aria-label={t('mobile.nav.back')} onClick={() => back()}>
        <IconBack />
      </button>
      <div className="m-bar-title" style={{ font: '500 14px/1.2 var(--np-font-ui)' }}>
        <span className="m-bar-sub">{s.article?.siteName ?? ''}</span>
      </div>
      <button
        type="button"
        className="m-lens"
        aria-pressed={ready && lens}
        aria-label={t('analysis.lens.toggle')}
        disabled={ready && !result}
        onClick={() => (ready ? setLens(!lens) : setNeed(true))}
      >
        <IconLens />
      </button>
    </header>
  );

  if (!url && !s.article) return <div>{bar}<p className="m-empty">{t('mobile.reading.empty')}</p></div>;
  if (s.busy === 'loading') return <div>{bar}<div aria-busy="true" style={{ padding: 'var(--m-gutter)', display: 'grid', gap: 12 }}><span className="m-skel" style={{ height: 34 }} /><span className="m-skel" style={{ height: 200 }} /></div></div>;
  if (!s.article) {
    return (
      <div>
        {bar}
        <p role="alert" className="m-empty">{s.error === 'not-article' ? t('mobile.reading.notArticle') : t('mobile.reading.failed')}</p>
        {url ? (
          <div className="m-btn-row">
            <button type="button" className="m-btn sec" onClick={() => void ipc.originalOpen(url, labels)}>{t('mobile.reading.original')}</button>
          </div>
        ) : null}
      </div>
    );
  }
  const a = s.article;
  return (
    <article className="m-reader" lang={a.lang ?? undefined}>
      {bar}
      <div style={{ padding: '0 var(--m-gutter)' }}>
        <h1 style={{ font: '500 31px/1.14 var(--np-font-read)', letterSpacing: '-.02em', margin: '6px 0 14px' }}>{a.title}</h1>
        <button type="button" className="m-card" style={{ margin: '0 0 18px', width: '100%' }} onClick={() => (ready ? setSheet(true) : setNeed(true))}>
          <span className="m-kicker">{t('mobile.reading.analysis')}</span>
          <span style={{ font: '400 15px/1.4 var(--np-font-ui)' }}>{!ready ? t('mobile.needProvider.banner') : result ? t('mobile.reading.bannerReady') : t('mobile.reading.bannerEmpty')}</span>
        </button>
        {ready && lens && result && marks.length > 0 ? (
          <AnnotatedText
            text={a.text}
            lang={a.lang}
            marks={marks}
            classOf={(m) => `np-mark--${markTone(m.kind)}`}
            describe={(m) => (m.kind === 'cargada' ? t('analysis.lens.loaded') : t(`analysis.verdict.${m.kind}`))}
            onActivate={() => setSheet(true)}
          />
        ) : (
          <ReaderView article={a} rewriteImage={() => null} onOpenLink={(u) => go('leer', { u })} />
        )}
        <div className="m-btn-row" style={{ padding: 0, margin: '22px 0 8px', flexDirection: 'column' }}>
          <button type="button" className="m-btn sec" onClick={() => void ipc.originalOpen(a.url, labels)}>{t('mobile.reading.original')}</button>
          <button type="button" className="m-btn sec" onClick={() => void ipc.savedAdd({ url: a.url, title: a.title, outlet: a.siteName, articleJson: JSON.stringify(a), savedAt: Date.now() })}>{t('sources.save.add')}</button>
          <button type="button" className="m-btn sec" onClick={() => go('agente', { u: a.url })}>{t('mobile.reading.askAgent')}</button>
        </div>
      </div>
      {sheet && ready ? <AnalysisSheet onClose={closeSheet} /> : null}
      {need ? <NeedProviderSheet onClose={() => setNeed(false)} /> : null}
    </article>
  );
}
