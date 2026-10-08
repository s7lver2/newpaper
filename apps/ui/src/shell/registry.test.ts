import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetRegistry, registerInternalPage, registerSettingsSection, registerShortcut, registerToolbarItem,
  resolveInternalPage, settingsSections, shortcutHandler, toolbarItems,
} from './registry';

const A = () => null;
const B = () => null;

describe('registry', () => {
  beforeEach(() => _resetRegistry());

  it('resolves internal pages by name', () => {
    registerInternalPage('sintesis', A);
    expect(resolveInternalPage('sintesis')).toBe(A);
    expect(resolveInternalPage('nada')).toBeUndefined();
  });

  it('sorts settings sections and toolbar items by order and replaces by id', () => {
    registerSettingsSection({ id: 'red', order: 20, titleKey: 'x', Component: A });
    registerSettingsSection({ id: 'general', order: 10, titleKey: 'y', Component: A });
    registerSettingsSection({ id: 'red', order: 20, titleKey: 'z', Component: B });
    expect(settingsSections().map((s) => [s.id, s.titleKey])).toEqual([['general', 'y'], ['red', 'z']]);
    registerToolbarItem({ id: 'tor', order: 2, Component: A });
    registerToolbarItem({ id: 'shield', order: 1, Component: B });
    expect(toolbarItems().map((t) => t.id)).toEqual(['shield', 'tor']);
  });

  it('keeps the last shortcut handler per action', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    registerShortcut('analyze', h1);
    registerShortcut('analyze', h2);
    shortcutHandler('analyze')?.({ tab: null, selection: '' });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
    expect(shortcutHandler('ask-agent')).toBeUndefined();
  });
});
