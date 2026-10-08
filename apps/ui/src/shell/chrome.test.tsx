import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TabInfo } from '../ipc/types';
import { applySnapshot, resetBrowserStore } from '../state/browser';
import { renderWithI18n } from '../test/renderWithI18n';
import { AddressBar } from './AddressBar';
import { measureSlot } from './ContentSlot';
import { TabStrip } from './TabStrip';

const tab = (id: number, url: string, extra: Partial<TabInfo> = {}): TabInfo => ({
  id, url, title: `T${id}`, kind: 'web', private: false, loading: false, canGoBack: false, canGoForward: false,
  view: 'original', isNews: false, readable: false, failure: null, crashed: false, ...extra,
});

describe('TabStrip', () => {
  beforeEach(() => resetBrowserStore());

  it('lists tabs, activates and closes them', async () => {
    const calls: string[] = [];
    mockIPC((cmd, args) => {
      calls.push(`${cmd}:${JSON.stringify(args)}`);
      return null;
    });
    applySnapshot({ tabs: [tab(1, 'https://a.example/'), tab(2, 'https://b.example/', { private: true })], activeId: 1 });
    renderWithI18n(<TabStrip />);
    expect(screen.getByRole('tab', { name: /T1/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /T2/ })).toHaveTextContent('Privada');
    await userEvent.click(screen.getByRole('tab', { name: /T2/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar la pestaña T1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Nueva pestaña' }));
    expect(calls).toEqual(['tab_activate:{"tabId":2}', 'tab_close:{"tabId":1}', 'tab_open:{}']);
  });
});

describe('AddressBar', () => {
  beforeEach(() => resetBrowserStore());

  it('shows suggestions and navigates with the keyboard', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'omnibox_suggest')
        return [
          { kind: 'search', label: 'smi', value: 'newpaper://inicio?q=smi', detail: null },
          { kind: 'history', label: 'Subida del SMI', value: 'https://a.example/smi', detail: 'https://a.example/smi' },
        ];
      return null;
    });
    const t = tab(1, 'https://a.example/');
    applySnapshot({ tabs: [t], activeId: 1 });
    renderWithI18n(<AddressBar tab={t} />);
    const box = screen.getByRole('combobox', { name: 'Buscar o escribir una dirección' });
    await userEvent.clear(box);
    await userEvent.type(box, 'smi');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(calls).toContainEqual(['tab_navigate', { tabId: 1, input: 'https://a.example/smi' }]);
  });

  it('records searches typed in the bar', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return cmd === 'omnibox_suggest' ? [] : null;
    });
    const t = tab(1, 'https://a.example/');
    applySnapshot({ tabs: [t], activeId: 1 });
    renderWithI18n(<AddressBar tab={t} />);
    const box = screen.getByRole('combobox');
    await userEvent.clear(box);
    await userEvent.type(box, 'subida del smi{Enter}');
    expect(calls).toContainEqual(['history_record_search', { query: 'subida del smi', source: 'bar' }]);
    expect(calls).toContainEqual(['tab_navigate', { tabId: 1, input: 'subida del smi' }]);
  });
});

describe('measureSlot', () => {
  it('returns the element rectangle in CSS pixels', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ x: 0, y: 92.4, left: 0, top: 92.4, width: 1280.2, height: 700, right: 0, bottom: 0, toJSON: () => ({}) });
    act(() => undefined);
    expect(measureSlot(el)).toEqual({ x: 0, y: 92, width: 1280, height: 700 });
  });
});
