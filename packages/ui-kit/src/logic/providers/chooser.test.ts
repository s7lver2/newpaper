import type { ProviderEntry } from '@newpaper/pipeline';
import { describe, expect, it } from 'vitest';
import { chooserRows, listable, segmentOf, tagsOf } from './chooser';

const p = (id: string, over: Partial<ProviderEntry> = {}): ProviderEntry =>
  ({ id, name: id, logo: '', category: 'cloud', recommended: false, freeTier: false, openness: 'open', type: 'cloud', adapter: 'openai-compatible', baseUrl: 'https://x.test/v1', auth: 'bearer', keyPrefixes: [], keyUrl: null, models: [], ...over }) as ProviderEntry;

const list = [
  p('groq', { name: 'Groq', freeTier: true }),
  p('anthropic', { name: 'Claude (Anthropic)', openness: 'closed' }),
  p('openrouter', { openness: 'mixed', freeTier: true, login: { flow: 'oauth-pkce-key', status: 'available' } }),
  p('nous', { login: { flow: 'oauth-device', status: 'unverified' } }),
  p('ollama', { category: 'local', type: 'local' }),
  p('custom', { category: 'advanced', openness: 'mixed' }),
];
const nameOf = (x: ProviderEntry) => (x.id === 'anthropic' ? 'Anthropic' : x.name);

describe('provider chooser', () => {
  it('groups by segment, with aggregators among the open ones, and leaves the custom endpoint out', () => {
    expect(listable(list).map((x) => x.id)).not.toContain('custom');
    expect(segmentOf(list[2]!)).toBe('open');
    expect(chooserRows(list, { query: '', segment: 'open', nameOf }).map((x) => x.id)).toEqual(['groq', 'openrouter', 'nous']);
    expect(chooserRows(list, { query: '', segment: 'closed', nameOf }).map((x) => x.id)).toEqual(['anthropic']);
    expect(chooserRows(list, { query: '', segment: 'local', nameOf }).map((x) => x.id)).toEqual(['ollama']);
  });

  it('searches across every segment, ignoring case and accents', () => {
    expect(chooserRows(list, { query: ' ANTHRÓPIC ', segment: 'open', nameOf }).map((x) => x.id)).toEqual(['anthropic']);
    expect(chooserRows(list, { query: 'oll', segment: 'closed', nameOf }).map((x) => x.id)).toEqual(['ollama']);
    expect(chooserRows(list, { query: 'zzz', segment: 'open', nameOf })).toEqual([]);
  });

  it('tags free tiers and working logins, and calls local ones just local', () => {
    expect(tagsOf(list[0]!)).toEqual(['free']);
    expect(tagsOf(list[2]!)).toEqual(['free', 'account']);
    expect(tagsOf(list[3]!)).toEqual([]);
    expect(tagsOf(list[4]!)).toEqual(['local']);
  });
});
