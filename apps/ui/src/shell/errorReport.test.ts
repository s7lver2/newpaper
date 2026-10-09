import { describe, expect, it } from 'vitest';
import type { NavFailure } from '../ipc/types';
import { errorCategory, formatErrorReport, type ReportContext } from './errorReport';

const ctx: ReportContext = { privacy: { mode: 'direct', exitCountry: null }, tabWithoutTor: false, blockedInTab: 16, windowSize: { width: 1296, height: 859 }, theme: 'paper' };

const failure = (over: Partial<NavFailure> = {}): NavFailure => ({
  url: 'https://elpais.com/x.html',
  webErrorStatus: 0,
  httpStatus: 403,
  diagnostics: {
    navigationId: 7,
    atMs: Date.UTC(2026, 9, 9, 12, 0, 0),
    appVersion: '0.1.0',
    webview2Version: '154.0.4258.62',
    requestHeaders: [['user-agent', 'UA'], ['accept-language', 'es']],
    responseHeaders: [['server', 'openresty'], ['x-datadome', 'protected']],
  },
  ...over,
});

describe('error report', () => {
  it('classifies failures', () => {
    expect(errorCategory({ webErrorStatus: 0, httpStatus: 403 })).toBe('http');
    expect(errorCategory({ webErrorStatus: 2, httpStatus: null })).toBe('cert');
    expect(errorCategory({ webErrorStatus: 7, httpStatus: null })).toBe('timeout');
    expect(errorCategory({ webErrorStatus: 6, httpStatus: null })).toBe('network');
  });

  it('writes readable key: value lines with headers', () => {
    const text = formatErrorReport(failure(), ctx);
    expect(text).toContain('url: https://elpais.com/x.html');
    expect(text).toContain('error: HTTP 403');
    expect(text).toContain('category: http');
    expect(text).toContain('network: direct');
    expect(text).toContain('time: 2026-10-09T12:00:00.000Z');
    expect(text).toContain('adblock blocked in tab: 16');
    expect(text).toContain('-- request headers --\nuser-agent: UA\naccept-language: es');
    expect(text).toContain('x-datadome: protected');
    expect(text.toLowerCase()).not.toContain('cookie');
  });

  it('names network errors and says when nothing was captured', () => {
    const text = formatErrorReport(failure({ httpStatus: null, webErrorStatus: 13, diagnostics: null }), { ...ctx, privacy: { mode: 'tor', exitCountry: 'ES' } });
    expect(text).toContain('error: HOST_NAME_NOT_RESOLVED (13)');
    expect(text).toContain('network: tor (exit country: ES)');
    expect(text).toContain('(not captured)');
  });
});
