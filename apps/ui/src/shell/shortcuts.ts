import { shortcutFor, type ShortcutAction } from '@newpaper/extract';
import { commands } from '../ipc/commands';
import { onTabShortcut } from '../ipc/events';
import { browserStore } from '../state/browser';
import { registerShortcut, shortcutHandler } from './registry';
import { focusAddressBar } from './shellBus';

export function dispatchShortcut(action: ShortcutAction): boolean {
  const handler = shortcutHandler(action);
  if (!handler) return false;
  const { tabs, activeId } = browserStore.get().snapshot;
  handler({ tab: tabs.find((t) => t.id === activeId) ?? null, selection: window.getSelection()?.toString().trim() ?? '' });
  return true;
}

export async function installShortcuts(): Promise<() => void> {
  const onKey = (e: KeyboardEvent) => {
    const action = shortcutFor(e);
    if (action && dispatchShortcut(action)) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  const off = await onTabShortcut((e) => dispatchShortcut(e.action));
  return () => {
    window.removeEventListener('keydown', onKey);
    off();
  };
}

export function registerCoreShortcuts(): void {
  registerShortcut('focus-address', () => focusAddressBar());
  registerShortcut('new-tab', () => void commands.tabOpen());
}
