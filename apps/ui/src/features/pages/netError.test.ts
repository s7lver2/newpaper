import { describe, expect, it } from 'vitest';
import { classifyFailure } from './netError';

const f = (webErrorStatus: number, httpStatus: number | null = null) => ({ url: 'https://d.example/a', webErrorStatus, httpStatus });
const ok = { online: true, torBlocked: false };

describe('classifyFailure', () => {
  it('never offers to continue past an invalid certificate', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      const r = classifyFailure(f(s), ok);
      expect(r.kind).toBe('cert');
      expect(r.actions).toEqual(['back']);
    }
  });

  it('prefers the kill switch and offline state over the raw status', () => {
    expect(classifyFailure(f(12), { online: true, torBlocked: true })).toEqual({ kind: 'torBlocked', actions: ['openWithoutTor', 'retry'] });
    expect(classifyFailure(f(13), { online: false, torBlocked: false }).kind).toBe('offline');
    expect(classifyFailure(f(11), ok).actions).toContain('offlinePage');
  });

  it('maps dns, timeout, unreachable and http statuses', () => {
    expect(classifyFailure(f(13), ok).kind).toBe('dns');
    expect(classifyFailure(f(7), ok).kind).toBe('timeout');
    expect(classifyFailure(f(6), ok).kind).toBe('unreachable');
    expect(classifyFailure(f(0, 404), ok)).toEqual({ kind: 'notFound', actions: ['archive', 'back'] });
    expect(classifyFailure(f(0, 503), ok).kind).toBe('server');
    expect(classifyFailure(f(99), ok).kind).toBe('unknown');
  });
});
