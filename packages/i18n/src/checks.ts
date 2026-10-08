import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import ts from 'typescript';
import { LOCALES, type Locale } from './catalog';

type Catalogs = Record<Locale, Record<string, string>>;

export function missingKeys(cats: Catalogs): Record<Locale, string[]> {
  const all = new Set(LOCALES.flatMap((l) => Object.keys(cats[l])));
  const out = {} as Record<Locale, string[]>;
  for (const l of LOCALES) out[l] = [...all].filter((k) => !(k in cats[l])).sort();
  return out;
}

export function invalidMessages(cats: Catalogs): { locale: Locale; key: string; error: string }[] {
  const out: { locale: Locale; key: string; error: string }[] = [];
  for (const locale of LOCALES) {
    for (const [key, msg] of Object.entries(cats[locale])) {
      try {
        parse(msg);
      } catch (e) {
        out.push({ locale, key, error: String(e) });
      }
    }
  }
  return out;
}

function argNames(elements: MessageFormatElement[], into = new Set<string>()): Set<string> {
  for (const el of elements) {
    if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
    if ('value' in el && typeof el.value === 'string' && el.type !== TYPE.tag) into.add(el.value);
    if ('options' in el) for (const opt of Object.values(el.options)) argNames(opt.value, into);
    if (el.type === TYPE.tag) argNames(el.children, into);
  }
  return into;
}

export function argumentMismatches(cats: Catalogs): { key: string; locales: Record<Locale, string[]> }[] {
  const out: { key: string; locales: Record<Locale, string[]> }[] = [];
  const keys = new Set(LOCALES.flatMap((l) => Object.keys(cats[l])));
  for (const key of [...keys].sort()) {
    const locales = {} as Record<Locale, string[]>;
    let ok = true;
    for (const l of LOCALES) {
      const msg = cats[l][key];
      if (msg === undefined) continue;
      try {
        locales[l] = [...argNames(parse(msg))].sort();
      } catch {
        ok = false;
      }
    }
    const signatures = new Set(Object.values(locales).map((a) => a.join(',')));
    if (ok && signatures.size > 1) out.push({ key, locales });
  }
  return out;
}

export const HARDCODED_ALLOWLIST: ReadonlySet<string> = new Set(['newpaper', 'Tor']);
const USER_FACING_ATTRS = new Set(['title', 'placeholder', 'alt', 'aria-label', 'aria-description', 'label']);
const LETTERS = /\p{L}{2,}/u;

export function findHardcodedText(source: string, file: string): { file: string; line: number; text: string }[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = source.split('\n');
  const out: { file: string; line: number; text: string }[] = [];
  const report = (node: ts.Node, raw: string) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!LETTERS.test(text) || HARDCODED_ALLOWLIST.has(text)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (lines[line - 1]?.includes('i18n-ignore')) return;
    out.push({ file, line, text });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text);
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf);
      if (USER_FACING_ATTRS.has(name)) report(node, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function listSourceFiles(root: string, dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(p);
    }
  };
  for (const d of dirs) {
    const abs = join(root, d);
    if (existsSync(abs)) walk(abs);
  }
  return out.sort();
}