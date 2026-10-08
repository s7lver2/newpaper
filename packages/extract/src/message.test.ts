import noticia from '../test/fixtures/noticia.html?raw';
import { describe, expect, it } from 'vitest';
import { buildPageMessage, shortcutFor } from './message';


describe('buildPageMessage', () => {
  it('builds a page message with the extracted article', () => {
    const doc = new DOMParser().parseFromString(noticia, 'text/html');
    const m = buildPageMessage(doc, 'https://diario.example/a');
    expect(m.type).toBe('page');
    expect(m.article).toBe(true);
    expect(m.title).toBe('El SMI sube a 1.184 euros');
    expect(m.signals.ogType).toBe('article');
    expect(m.text.length).toBeGreaterThan(300);
  });
  it('sends signals and an empty body when there is no article', () => {
    const doc = new DOMParser().parseFromString('<title>Tienda</title><p>hola</p>', 'text/html');
    const m = buildPageMessage(doc, 'https://tienda.example/');
    expect(m).toMatchObject({ type: 'page', article: false, title: 'Tienda', html: '', text: '' });
  });
});

describe('shortcutFor', () => {
  const k = (key: string, mods: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
  it('maps the four spec shortcuts', () => {
    expect(shortcutFor(k('l', { ctrlKey: true }))).toBe('focus-address');
    expect(shortcutFor(k('t', { ctrlKey: true }))).toBe('new-tab');
    expect(shortcutFor(k('A', { ctrlKey: true, shiftKey: true }))).toBe('analyze');
    expect(shortcutFor(k('k', { ctrlKey: true }))).toBe('ask-agent');
  });
  it('ignores everything else', () => {
    expect(shortcutFor(k('a', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(k('l'))).toBeNull();
    expect(shortcutFor(k('l', { ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe('dist/content.js', () => {
  it('is an IIFE bundle without exports (built by `pnpm build`)', () => {
    // import.meta.glob no falla si el bundle aún no existe: el Step 5 lo genera y vuelve a ejecutar este test.
    const built = import.meta.glob('../dist/content.js', { query: '?raw', import: 'default', eager: true });
    const src = Object.values(built)[0] as string | undefined;
    if (!src) return;
    expect(src).not.toMatch(/^export /m);
    expect(src).toContain('chrome');
  });
});
