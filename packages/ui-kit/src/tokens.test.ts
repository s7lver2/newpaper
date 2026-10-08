// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('tokens.css and motion.css', () => {
  const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
  const motion = readFileSync(new URL('./motion.css', import.meta.url), 'utf8');
  it('defines the spec colours, fonts and easings', () => {
    for (const decl of [
      '--np-paper: #F6F4EF',
      '--np-ink: #17171A',
      '--np-accent: #2340B8',
      '--np-tor: #4A2FB8',
      '--np-ai: #993556',
      '--np-ok: #0B6B50',
      '--np-warn: #8A5300',
      '--np-bad: #A3271B',
      "--np-font-read: 'Newsreader'",
      "--np-font-ui: 'IBM Plex Sans'",
      "--np-font-mono: 'IBM Plex Mono'",
      '--np-ease: cubic-bezier(.22,1,.36,1)',
      '--np-bounce: cubic-bezier(.34,1.56,.64,1)',
      '--np-hit: 44px',
    ])
      expect(tokens).toContain(decl);
    expect(tokens).toContain("[data-theme='ink']");
  });
  it('disables animation and transition with reduced motion', () => {
    expect(motion).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(motion).toContain('animation: none !important');
    expect(motion).toContain('transition: none !important');
  });
});