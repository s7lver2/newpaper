import type { Article } from '@newpaper/extract';
import { useT } from '@newpaper/i18n/react';
import { IconButton } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { useArticle } from '../../state/browser';
import { localizeImages, realEditionDeps } from './buildEdition';

const Bookmark = ({ filled }: { filled: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
);

export function SaveButton({ tab }: { tab: TabInfo | null }) {
  const t = useT();
  const page = useArticle(tab?.id ?? null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = page?.article.url;
  useEffect(() => {
    if (!url) return;
    void commands.savedGet(url).then((s) => setSaved(Boolean(s)));
  }, [url]);
  if (!page || !page.article.article) return null;
  const a = page.article;
  const toggle = async () => {
    if (saved) {
      await commands.savedRemove(a.url);
      setSaved(false);
      return;
    }
    setBusy(true);
    try {
      const { type: _t, article: _a, signals: _s, ...plain } = a;
      // Las imágenes se guardan comprimidas en local (carpeta `saved`) para poder leer el artículo sin conexión.
      const local = await localizeImages(plain as unknown as Article, 'saved', Date.now(), realEditionDeps()).catch(() => plain as unknown as Article);
      await commands.savedAdd({ url: a.url, title: a.title, outlet: a.siteName, articleJson: JSON.stringify(local), savedAt: Math.floor(Date.now() / 1000) });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };
  return <IconButton label={saved ? t('sources.save.remove') : t('sources.save.add')} pressed={saved} aria-busy={busy} disabled={busy} icon={<Bookmark filled={saved} />} onClick={toggle} />;
}
