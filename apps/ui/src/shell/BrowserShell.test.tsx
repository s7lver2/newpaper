import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TabInfo, TabPageEvent } from '../ipc/types';
import { applyPage, applySnapshot, resetBrowserStore } from '../state/browser';
import { renderWithI18n } from '../test/renderWithI18n';
import { BrowserShell } from './BrowserShell';
import { DefaultReader } from './ReaderSurface';
import { FallbackCrash, FallbackError } from './FallbackSurfaces';
import { _resetRegistry, registerInternalPage, registerReaderView, registerTabSurface } from './registry';

const tab = (extra: Partial<TabInfo> = {}): TabInfo => ({
  id: 1, url: 'https://d.example/a', title: 'T', kind: 'web', private: false, loading: false, canGoBack: false,
  canGoForward: false, view: 'original', isNews: false, failure: null, crashed: false, ...extra,
});
const page: TabPageEvent = {
  tabId: 1, isNews: true,
  article: { type: 'page', article: true, url: 'https://d.example/a', title: 'Titular', byline: 'Ana', siteName: 'Diario', published: null, lang: 'es', html: '<p>Cuerpo</p>', text: 'Cuerpo', excerpt: null, signals: { ogType: 'article', jsonLdTypes: [] } },
};

describe('BrowserShell surfaces', () => {
  beforeEach(() => {
    resetBrowserStore();
    _resetRegistry();
    registerReaderView(DefaultReader);
    registerTabSurface('error', FallbackError);
    registerTabSurface('crash', FallbackCrash);
    registerInternalPage('inicio', () => <p>inicio-page</p>);
    mockIPC(() => null);
  });

  it('renders internal pages', () => {
    applySnapshot({ tabs: [tab({ url: 'newpaper://inicio', kind: 'internal' })], activeId: 1 });
    renderWithI18n(<BrowserShell />);
    expect(screen.getByText('inicio-page')).toBeInTheDocument();
  });

  it('shows "not found" for unknown internal pages', () => {
    applySnapshot({ tabs: [tab({ url: 'newpaper://nada', kind: 'internal' })], activeId: 1 });
    renderWithI18n(<BrowserShell />);
    expect(screen.getByText('Esta página interna no existe.')).toBeInTheDocument();
  });

  it('renders the reader and switches to the original', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return null;
    });
    applySnapshot({ tabs: [tab({ view: 'reader', isNews: true })], activeId: 1 });
    act(() => applyPage(page));
    renderWithI18n(<BrowserShell />);
    expect(screen.getByRole('heading', { level: 1, name: 'Titular' })).toBeInTheDocument();
    expect(screen.getByText('Por Ana')).toBeInTheDocument();
    await userEvent.click(document.querySelector('.np-reader-actions button')!);
    expect(calls).toContainEqual(['tab_set_view', { tabId: 1, view: 'original' }]);
  });

  it('shows error and crash surfaces with retry', async () => {
    const calls: string[] = [];
    mockIPC((cmd) => {
      calls.push(cmd);
      return null;
    });
    applySnapshot({ tabs: [tab({ failure: { url: 'https://d.example/a', webErrorStatus: 0, httpStatus: 404 } })], activeId: 1 });
    const { unmount } = renderWithI18n(<BrowserShell />);
    expect(screen.getByText('No se ha podido cargar la página')).toBeInTheDocument();
    expect(screen.getByText('Código 404')).toBeInTheDocument();
    unmount();
    applySnapshot({ tabs: [tab({ crashed: true })], activeId: 1 });
    renderWithI18n(<BrowserShell />);
    await userEvent.click(screen.getByRole('button', { name: 'Recargar la pestaña' }));
    expect(calls).toContain('tab_reload');
  });
});
