import { mockIPC } from '@tauri-apps/api/mocks';
import { describe, expect, it } from 'vitest';
import { commands } from './commands';

describe('commands', () => {
  it('invokes Rust commands with camelCase arguments', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'tab_open') return { id: 1 };
      if (cmd === 'secret_has') return true;
      return null;
    });
    await commands.tabOpen({ url: 'https://a.example/', private: true });
    await commands.tabNavigate(1, 'elpais.com');
    await commands.historyRecordSearch('smi', 'bar');
    expect(await commands.secretHas('ai.openai')).toBe(true);
    expect(calls).toEqual([
      ['tab_open', { url: 'https://a.example/', private: true }],
      ['tab_navigate', { tabId: 1, input: 'elpais.com' }],
      ['history_record_search', { query: 'smi', source: 'bar' }],
      ['secret_has', { key: 'ai.openai' }],
    ]);
  });
});
