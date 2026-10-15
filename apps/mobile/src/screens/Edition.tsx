import { Bar } from './Bar';
import type { Article } from '@newpaper/extract';
import { useI18n } from '@newpaper/i18n/react';
import { ReaderView } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { IconBack } from '../icons';
import { ipc, type SavedArticle } from '../ipc';

/** Leer mas tarde: los articulos guardados (sincronizados) se leen aqui sin red, porque guardan el texto extraido. */
export function Edition() {
  const { t } = useI18n();
  const [saved, setSaved] = useState<SavedArticle[]>([]);
  const [open, setOpen] = useState<Article | null>(null);
  useEffect(() => {
    void ipc.savedList().then(setSaved).catch(() => {});
  }, []);
  if (open) {
    return (
      <div>
        <header className="m-appbar"><button type="button" className="m-back" aria-label={t('mobile.edition.back')} onClick={() => setOpen(null)}><IconBack /></button></header>
        <div className="m-readfit" style={{ padding: '0 var(--m-gutter)' }}><ReaderView article={open} rewriteImage={() => null} /></div>
      </div>
    );
  }
  return (
    <section>
      <Bar title={t('mobile.edition.title')} />
      <p className="m-sub">{t('mobile.edition.hint')}</p>
      {saved.length === 0 ? <p className="m-empty">{t('mobile.edition.empty')}</p> : null}
      {saved.map((s) => (
        <button
          key={s.url}
          type="button"
          className="m-card"
          onClick={() => {
            try {
              setOpen(JSON.parse(s.articleJson) as Article);
            } catch {
              /* guardado con un formato que ya no se lee: se omite */
            }
          }}
        >
          <strong>{s.title}</strong>
          {s.outlet ? <span className="np-mono np-muted">{s.outlet}</span> : null}
        </button>
      ))}
    </section>
  );
}
