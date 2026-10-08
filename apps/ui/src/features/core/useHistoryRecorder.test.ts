import { act, renderHook } from '@testing-library/react';
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TabInfo } from '../../ipc/types';
import { applySnapshot, resetBrowserStore } from '../../state/browser';
import { useHistoryRecorder } from './useHistoryRecorder';

const tab = (extra: Partial<TabInfo>): TabInfo => ({
  id: 1, url: 'https://a.example/', title: '', kind: 'web', private: false, loading: true, canGoBack: false,
  canGoForward: false, view: 'original', isNews: false, failure: null, crashed: false, ...extra,
});

describe('useHistoryRecorder', () => {
  beforeEach(() => resetBrowserStore());

  it('records one visit per loaded url with title', async () => {
    const visits: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === 'history_record_visit') visits.push(args);
      return null;
    });
    renderHook(() => useHistoryRecorder());
    act(() => applySnapshot({ tabs: [tab({})], activeId: 1 }));
    act(() => applySnapshot({ tabs: [tab({ loading: false, title: 'A' })], activeId: 1 }));
    act(() => applySnapshot({ tabs: [tab({ loading: false, title: 'A' })], activeId: 1 }));
    act(() => applySnapshot({ tabs: [tab({ loading: false, title: 'B', url: 'https://a.example/b' })], activeId: 1 }));
    act(() => applySnapshot({ tabs: [tab({ loading: false, title: 'X', url: 'newpaper://inicio', kind: 'internal' })], activeId: 1 }));
    await act(async () => {});
    expect(visits).toEqual([
      { tabId: 1, url: 'https://a.example/', title: 'A' },
      { tabId: 1, url: 'https://a.example/b', title: 'B' },
    ]);
  });
});
