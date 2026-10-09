import { useT } from '@newpaper/i18n/react';
import { IconButton } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { useArticle } from '../../state/browser';

const Bookmark = ({ filled }: { filled: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
);

export function SaveButton({ tab }: { tab: TabInfo | null }) {
  const t = useT();
  const page = useArticle(tab?.id ?? null);
  const [saved, setSaved] = useState(false);
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
    const { type: _t, article: _a, signals: _s, ...plain } = a;
    await commands.savedAdd({ url: a.url, title: a.title, outlet: a.siteName, articleJson: JSON.stringify(plain), savedAt: Math.floor(Date.now() / 1000) });
    setSaved(true);
  };
  return <IconButton label={saved ? t('sources.save.remove') : t('sources.save.add')} pressed={saved} icon={<Bookmark filled={saved} />} onClick={toggle} />;
}
