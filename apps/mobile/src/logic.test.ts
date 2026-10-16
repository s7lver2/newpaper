import { describe, expect, it } from 'vitest';
import { buildReport, formatBytes } from './aboutReport';
import { hasProvider } from './aiReadyLogic';
import { countAt } from './countUp';
import { applyInsets } from './insets';
import type { AboutInfo } from './ipc';

describe('ojo y proveedores', () => {
  it('sin proveedores conectados el ojo no se abre', () => {
    expect(hasProvider(null, null)).toBe(false);
    expect(hasProvider([], [])).toBe(false);
    expect(hasProvider(undefined, [{ id: 'otro' }])).toBe(false);
  });
  it('con un proveedor conectado o el Ollama del PC sí', () => {
    expect(hasProvider(['anthropic'], null)).toBe(true);
    expect(hasProvider([], [{ id: 'ollama', baseUrl: 'http://x/v1' }])).toBe(true);
  });
});

describe('contadores', () => {
  it('suben de forma monótona y terminan exactos', () => {
    expect(countAt(0, 100, 0)).toBe(0);
    expect(countAt(0, 100, 1)).toBe(100);
    expect(countAt(0, 100, 5)).toBe(100);
    let prev = 0;
    for (let k = 0; k <= 1; k += 0.1) {
      const v = countAt(10, 500, k);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('márgenes del sistema', () => {
  it('publica solo valores válidos como variables CSS', () => {
    const el = document.createElement('div');
    applyInsets({ top: 24, bottom: 48.4, left: -3, right: Number.NaN }, el);
    expect(el.style.getPropertyValue('--np-inset-top')).toBe('24px');
    expect(el.style.getPropertyValue('--np-inset-bottom')).toBe('48px');
    expect(el.style.getPropertyValue('--np-inset-left')).toBe('');
    expect(el.style.getPropertyValue('--np-inset-right')).toBe('');
  });
});

describe('Acerca de', () => {
  const info: AboutInfo = {
    build: { version: '0.1.0', profile: 'debug', builtAt: 1_760_000_000, git: 'dev', gitDirty: false, deps: [['tauri', '2.12.1']] },
    device: { webview: 'com.google.android.webview 140.0', androidRelease: '14', sdk: 34, manufacturer: 'Google', model: 'sdk_gphone', abi: 'x86_64', debuggable: true },
    netMode: 'direct',
    dataBytes: 1536,
  };
  it('formatea tamaños', () => {
    expect(formatBytes(0, 'en')).toBe('0 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
  });
  it('el informe lleva lo útil y nada sensible', () => {
    const r = buildReport(info, 'es');
    expect(r).toContain('newpaper 0.1.0 (debug)');
    expect(r).toContain('commit: dev');
    expect(r).toContain('android: 14 (API 34)');
    expect(r).toContain('webview: com.google.android.webview 140.0');
    expect(r).toContain('tauri 2.12.1');
    expect(r).not.toMatch(/key|token|\b\d{1,3}(\.\d{1,3}){3}\b/i);
  });
});
