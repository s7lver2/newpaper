import { Bar } from './Bar';
import type { Article } from '@newpaper/extract';
import { useI18n } from '@newpaper/i18n/react';
import { Button, ReaderView } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
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
        <Button variant="quiet" onClick={() => setOpen(null)}>{t('mobile.edition.back')}</Button>
        <ReaderView article={open} rewriteImage={() => null} />
      </div>
    );
  }
  return (
    <section className="m-body">
      <Bar title={t('mobile.edition.title')} />
      <p className="np-muted">{t('mobile.edition.hint')}</p>
      {saved.length === 0 ? <p className="np-muted">{t('mobile.edition.empty')}</p> : null}
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
