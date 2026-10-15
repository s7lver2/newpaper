import { useI18n } from '@newpaper/i18n/react';
import { AnnotatedText, Button, markTone, ReaderView, type LensMark } from '@newpaper/ui-kit';
import { addPluginListener } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { ipc } from '../ipc';
import { go } from '../router';
import { loadArticle, showHtml, useReading } from '../readingStore';
import { AnalysisSheet } from './AnalysisSheet';

/** Lector con la lente. Las imagenes no se cargan en movil: "Ver original" las muestra por la webview nativa. */
export function Reading({ url }: { url: string | null }) {
  const { t } = useI18n();
  const s = useReading();
  const [sheet, setSheet] = useState(false);
  const [lens, setLens] = useState(true);
  useEffect(() => {
    if (url) void loadArticle(url);
  }, [url]);
  useEffect(() => {
    // Al volver de "Ver original" llega el HTML de la pagina: se reextrae el articulo.
    const l = addPluginListener('np-mobile', 'original-html', (e: { url: string; html: string }) => {
      void ipc.originalClose().catch(() => {});
      void showHtml(e.url, e.html);
    }).catch(() => null);
    return () => void l.then((x) => x?.unregister());
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

  if (!url && !s.article) return <p className="np-muted">{t('mobile.reading.empty')}</p>;
  if (s.busy === 'loading') return <p aria-busy="true">{t('mobile.reading.loading')}</p>;
  if (!s.article) {
    return (
      <div>
        <p role="alert">{s.error === 'not-article' ? t('mobile.reading.notArticle') : t('mobile.reading.failed')}</p>
        {url ? <Button onClick={() => void ipc.originalOpen(url, labels)}>{t('mobile.reading.original')}</Button> : null}
      </div>
    );
  }
  const a = s.article;
  return (
    <article className="m-reader" lang={a.lang ?? undefined}>
      <div className="m-row">
        <Button variant="primary" onClick={() => setSheet(true)}>{t('mobile.reading.analysis')}</Button>
        <Button variant="quiet" aria-pressed={lens} disabled={!result} onClick={() => setLens(!lens)}>{t('analysis.lens.toggle')}</Button>
        <Button variant="quiet" onClick={() => void ipc.originalOpen(a.url, labels)}>{t('mobile.reading.original')}</Button>
        <Button variant="quiet" onClick={() => void ipc.savedAdd({ url: a.url, title: a.title, outlet: a.siteName, articleJson: JSON.stringify(a), savedAt: Date.now() })}>{t('sources.save.add')}</Button>
      </div>
      <h1 className="m-title">{a.title}</h1>
      {lens && result ? (
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
      {sheet ? <AnalysisSheet onClose={() => setSheet(false)} /> : null}
    </article>
  );
}
