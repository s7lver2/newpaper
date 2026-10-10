import { useActiveTab, useArticle } from '../state/browser';
import { ContentSlot } from './ContentSlot';
import { ContextMenuHost } from './ContextMenu';
import { PageTransition } from './PageTransition';
import { ReaderLoading } from './ReaderLoading';
import { NativeUnderlay } from './underlay';
import { parseInternalUrl } from './internalUrl';
import { NotFoundPage } from '../features/pages/NotFoundPage';
import { overlays, readerView, resolveInternalPage, sidePanel, tabSurface } from './registry';
import { TabStrip } from './TabStrip';
import { Toolbar } from './Toolbar';

function ActiveSurface() {
  const tab = useActiveTab();
  const page = useArticle(tab?.id ?? null);
  if (!tab) return null;
  if (tab.kind === 'internal') {
    const url = parseInternalUrl(tab.url);
    const Page = url ? resolveInternalPage(url.page) : undefined;
    // `key`: cada pestaña interna tiene su propia instancia (si no, dos pestañas de la misma página compartirían estado y scroll).
    return <div key={tab.id} className="np-surface">{Page && url ? <Page url={url} tab={tab} /> : <NotFoundPage address={tab.url} />}</div>;
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
  // La original no se enseña mientras se espera a saber si abre el lector (ni en el instante entre la vista y el artículo).
  if (tab.readerPending || tab.view === 'reader') return <ReaderLoading tab={tab} />;
  return null;
}

export function BrowserShell() {
  const tab = useActiveTab();
  const Panel = sidePanel();
  return (
    <div className="np-app np-root">
      <TabStrip />
      <Toolbar />
      <div className="np-workspace">
        <main className="np-main">
          <ContentSlot />
          <ActiveSurface />
          <PageTransition />
          <NativeUnderlay />
          <ContextMenuHost />
        </main>
        {Panel && tab && tab.kind === 'web' ? <Panel tab={tab} /> : null}
      </div>
      {overlays().map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </div>
  );
}
