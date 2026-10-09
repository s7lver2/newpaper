import { describe, expect, it } from 'vitest';
import { buildMenu, clampMenu, type MenuContext } from './menuModel';

const base: MenuContext = {
  source: 'tab', kind: 'page', link: null, imageSrc: null, selection: null, editable: false,
  pageUrl: 'https://d.example/a', canBack: true, canForward: false, readable: true, readerOpen: false,
};
const ids = (c: MenuContext) => buildMenu(c).map((g) => g.map((i) => i.id));

describe('buildMenu', () => {
  it('offers navigation and reader on a plain page, with forward disabled when there is none', () => {
    expect(ids(base)).toEqual([['back', 'forward', 'reload'], ['toggleReader', 'copyPageUrl']]);
    expect(buildMenu(base)[0]!.find((i) => i.id === 'forward')!.disabled).toBe(true);
    expect(ids({ ...base, readable: false })[1]).toEqual(['copyPageUrl']);
  });
  it('offers link actions on a link and does not mix page navigation in', () => {
    expect(ids({ ...base, link: 'https://x.example/' })).toEqual([['openTab', 'openReader', 'copyLink']]);
  });
  it('adds image and selection groups', () => {
    expect(ids({ ...base, kind: 'image', imageSrc: 'https://x.example/a.png' })).toEqual([['openImage', 'copyImageUrl']]);
    const g = buildMenu({ ...base, kind: 'selection', selection: 'una frase muy larga que se recorta para el rótulo del menú' });
    expect(g[0]!.map((i) => i.id)).toEqual(['copy', 'search']);
    expect(g[0]![1]!.params!.text!.length).toBeLessThanOrEqual(28);
  });
  it('editable fields get edit actions; cut and copy need a selection', () => {
    const g = buildMenu({ ...base, editable: true })[0]!;
    expect(g.map((i) => i.id)).toEqual(['cut', 'copy', 'paste', 'selectAll']);
    expect(g.filter((i) => i.disabled).map((i) => i.id)).toEqual(['cut', 'copy']);
  });
  it('the UI itself shows no menu without selection or editing', () => {
    expect(buildMenu({ ...base, source: 'ui' })).toEqual([]);
  });
});

describe('clampMenu', () => {
  it('keeps the menu inside the window', () => {
    expect(clampMenu(100, 100, 200, 150, 1000, 800)).toEqual({ left: 100, top: 100 });
    expect(clampMenu(950, 780, 200, 150, 1000, 800)).toEqual({ left: 792, top: 642 });
  });
});
