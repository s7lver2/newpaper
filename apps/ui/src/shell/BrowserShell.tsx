import { useT } from '@newpaper/i18n/react';
import { useActiveTab, useArticle } from '../state/browser';
import { ContentSlot } from './ContentSlot';
import { parseInternalUrl } from './internalUrl';
import { overlays, readerView, resolveInternalPage, tabSurface } from './registry';
import { TabStrip } from './TabStrip';
import { Toolbar } from './Toolbar';

function ActiveSurface() {
  const t = useT();
  const tab = useActiveTab();
  const page = useArticle(tab?.id ?? null);
  if (!tab) return null;
  if (tab.kind === 'internal') {
    const url = parseInternalUrl(tab.url);
    const Page = url ? resolveInternalPage(url.page) : undefined;
    return <div className="np-surface">{Page && url ? <Page url={url} tab={tab} /> : <p className="np-fallback">{t('shell.notFound')}</p>}</div>;
  }
  if (tab.crashed) {
    const Crash = tabSurface('crash');
    return Crash ? <Crash tab={tab} /> : null;
  }
  if (tab.failure) {
    const Err = tabSurface('error');
    return Err ? <Err tab={tab} /> : null;
  }
  if (tab.view === 'reader' && page) {
    const Reader = readerView();
    return Reader ? <Reader tab={tab} page={page.article} /> : null;
  }
  return null;
}

export function BrowserShell() {
  return (
    <div className="np-app np-root">
      <TabStrip />
      <Toolbar />
      <main className="np-main">
        <ContentSlot />
        <ActiveSurface />
      </main>
      {overlays().map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </div>
  );
}
