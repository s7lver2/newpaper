import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DARK_QUERY, setMediaQuery, setReducedMotion } from './test/media';
import { applyTheme, watchSystemTheme } from './theme';
import { useReducedMotion } from './useReducedMotion';

describe('applyTheme', () => {
  it('sets data-theme for explicit choices', () => {
    expect(applyTheme('ink')).toBe('ink');
    expect(document.documentElement.dataset.theme).toBe('ink');
    expect(applyTheme('paper')).toBe('paper');
    expect(document.documentElement.dataset.theme).toBe('paper');
  });

  it('follows prefers-color-scheme for "system"', () => {
    setMediaQuery(DARK_QUERY, true);
    expect(applyTheme('system')).toBe('ink');
    setMediaQuery(DARK_QUERY, false);
    expect(applyTheme('system')).toBe('paper');
  });

  it('notifies system theme changes', () => {
    const cb = vi.fn();
    const stop = watchSystemTheme(cb);
    setMediaQuery(DARK_QUERY, true);
    expect(cb).toHaveBeenCalledWith('ink');
    stop();
    setMediaQuery(DARK_QUERY, false);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('useReducedMotion', () => {
  it('tracks the media query', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
    act(() => setReducedMotion(false));
    expect(result.current).toBe(false);
  });
});
