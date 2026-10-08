// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogs } from './catalog';
import { argumentMismatches, findHardcodedText, invalidMessages, listSourceFiles, missingKeys } from './checks';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('repository i18n', () => {
  it('has the same keys in es, en and de', () => {
    expect(missingKeys(catalogs)).toEqual({ es: [], en: [], de: [] });
  });
  it('has only valid ICU messages', () => {
    expect(invalidMessages(catalogs)).toEqual([]);
  });
  it('uses the same placeholders in every locale', () => {
    expect(argumentMismatches(catalogs)).toEqual([]);
  });
  it('has no hand-written UI text in components', () => {
    const files = listSourceFiles(ROOT, ['apps/ui/src', 'apps/mobile/src', 'packages/ui-kit/src']);
    const findings = files.flatMap((f) => findHardcodedText(readFileSync(f, 'utf8'), f.slice(ROOT.length)));
    expect(findings).toEqual([]);
  });
});