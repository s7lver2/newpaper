import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { Edition, SavedArticle } from '../../ipc/types';
import { navigate, openInternal } from '../../shell/navigate';
import { TicTacToeGame } from './TicTacToeGame';

export function OfflinePage() {
  const { t, formatDate } = useI18n();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [saved, setSaved] = useState<SavedArticle[]>([]);
  useEffect(() => {
    void commands.offlineEditions().then((e) => setEdition(e.find((x) => x.status === 'ready') ?? null)).catch(() => {});
    void commands.savedList().then((s) => setSaved(s.slice(0, 8))).catch(() => {});
  }, []);
  return (
    <div className="np-404">
      <p className="np-404-kicker">{t('pages.offline.kicker')}</p>
      <h1>{t('pages.offline.title')}</h1>
      <p>{t('pages.offline.body')}</p>
      {edition ? (
        <Button variant="primary" onClick={() => void openInternal('edicion')}>
          {t('pages.offline.edition', { date: formatDate(new Date(edition.createdAt), { dateStyle: 'long' }) })}
        </Button>
      ) : (
        <p className="np-muted">{t('pages.offline.noEdition')}</p>
      )}
      {saved.length ? (
        <section>
          <h2>{t('pages.offline.saved')}</h2>
          <ul className="np-continue">
            {saved.map((s) => (
              <li key={s.url}>
                <button type="button" className="np-link" onClick={() => void navigate(s.url)}>{s.title}</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <TicTacToeGame />
    </div>
  );
}
