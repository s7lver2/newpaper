import { describe, expect, it } from 'vitest';
import { flatten } from './catalog';
import { createTranslator, resolveLocale } from './translator';

const source = {
  es: { 'a.hello': 'Hola, {name}', 'a.n': '{count, plural, one {# hecho} other {# hechos}}', 'only.es': 'Solo español' },
  en: { 'a.hello': 'Hello, {name}', 'a.n': '{count, plural, one {# fact} other {# facts}}' },
  de: { 'a.hello': 'Hallo, {name}', 'a.n': '{count, plural, one {# Fakt} other {# Fakten}}' },
};

describe('flatten', () => {
  it('joins nested keys with dots', () => {
    expect(flatten({ a: { b: 'x', c: { d: 'y' } } })).toEqual({ 'a.b': 'x', 'a.c.d': 'y' });
  });
});

describe('createTranslator', () => {
  it('formats ICU arguments and plurals per locale', () => {
    const en = createTranslator('en', source);
    expect(en.t('a.hello', { name: 'Ana' })).toBe('Hello, Ana');
    expect(en.t('a.n', { count: 1 })).toBe('1 fact');
    expect(createTranslator('de', source).t('a.n', { count: 3 })).toBe('3 Fakten');
  });

  it('falls back to Spanish and then to the key', () => {
    const de = createTranslator('de', source);
    expect(de.t('only.es')).toBe('Solo español');
    expect(de.t('missing.key')).toBe('missing.key');
    expect(de.has('missing.key')).toBe(false);
  });

  it('formats numbers, dates and currency with Intl', () => {
    const es = createTranslator('es', source);
    expect(es.formatNumber(1234.5)).toBe('1234,5');
    expect(createTranslator('en', source).formatNumber(1234.5)).toBe('1,234.5');
    expect(es.formatCurrency(3.5, 'EUR')).toMatch(/3,50\s€/);
    expect(es.formatDate(new Date(Date.UTC(2026, 9, 6, 12)), { dateStyle: 'long', timeZone: 'UTC' })).toBe('6 de octubre de 2026');
  });

  it('formats relative days', () => {
    expect(createTranslator('es', source).formatRelativeDays(-1)).toBe('ayer');
    expect(createTranslator('en', source).formatRelativeDays(0)).toBe('today');
  });
});

describe('resolveLocale', () => {
  it('picks the first supported base language', () => {
    expect(resolveLocale(['de-AT', 'en-US'])).toBe('de');
    expect(resolveLocale(['fr-FR', 'en-GB'])).toBe('en');
    expect(resolveLocale(['fr-FR'])).toBe('es');
    expect(resolveLocale([])).toBe('es');
  });
});