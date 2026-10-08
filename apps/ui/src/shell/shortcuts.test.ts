import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBrowserStore } from '../state/browser';
import { _resetRegistry, registerShortcut } from './registry';
import { shellBus } from './shellBus';
import { dispatchShortcut, installShortcuts, registerCoreShortcuts } from './shortcuts';

describe('shortcuts', () => {
  beforeEach(() => {
    _resetRegistry();
    resetBrowserStore();
  });

  it('routes Ctrl+L to the address bar and Ctrl+T to a new tab', async () => {
    const cmds: string[] = [];
    mockIPC((cmd) => {
      cmds.push(cmd);
      return null;
    });
    registerCoreShortcuts();
    const focus = vi.fn();
    shellBus.addEventListener('focus-address', focus);
    const stop = await installShortcuts();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', ctrlKey: true }));
    stop();
    expect(focus).toHaveBeenCalledOnce();
    expect(cmds).toContain('tab_open');
  });

  it('passes the current selection to registered handlers', () => {
    const h = vi.fn();
    registerShortcut('ask-agent', h);
    const p = document.createElement('p');
    p.textContent = 'fragmento elegido';
    document.body.append(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(dispatchShortcut('ask-agent')).toBe(true);
    expect(h).toHaveBeenCalledWith({ tab: null, selection: 'fragmento elegido' });
    expect(dispatchShortcut('analyze')).toBe(false);
  });
});
