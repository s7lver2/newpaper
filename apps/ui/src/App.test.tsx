import { render, screen, waitFor } from '@testing-library/react';
import { mockIPC } from '@tauri-apps/api/mocks';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import './features';

describe('App', () => {
  it('detects and saves the system locale on first run, then opens a new tab', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE']);
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'settings_get') return null;
      if (cmd === 'tabs_snapshot') return { tabs: [], activeId: null };
      return null;
    });
    render(<App />);
    await waitFor(() => expect(calls).toContainEqual(['settings_set', { key: 'general.locale', value: 'de' }]));
    await waitFor(() => expect(calls.some(([c]) => c === 'tab_open')).toBe(true));
    expect(await screen.findByRole('button', { name: 'Neuer Tab' })).toBeInTheDocument();
  });
});
