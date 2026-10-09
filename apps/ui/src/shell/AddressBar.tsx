import { useT } from '@newpaper/i18n/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { commands } from '../ipc/commands';
import type { Suggestion, TabInfo } from '../ipc/types';
import { IconLock, IconSearch } from './icons';
import { navigate } from './navigate';
import { shellBus } from './shellBus';
import { useUnderlay } from './underlay';

/** "host/" (muted) + "path" (ink), like the mockup; null when the URL is not a plain web address. */
export function splitDisplayUrl(url: string): { host: string; path: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return { host: `${u.host}/`, path: `${u.pathname.slice(1)}${u.search}${u.hash}` };
  } catch {
    return null;
  }
}

const looksLikeSearch = (s: string) => /\s/.test(s.trim()) || !s.includes('.');

export function AddressBar({ tab, children }: { tab: TabInfo | null; children?: ReactNode }) {
  const t = useT();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(tab?.url ?? '');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [index, setIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  useUnderlay(open && items.length > 0);
  const [focused, setFocused] = useState(false);

  useEffect(() => setText(tab?.url ?? ''), [tab?.id, tab?.url]);
  useEffect(() => {
    const focus = () => {
      input.current?.focus();
      input.current?.select();
    };
    shellBus.addEventListener('focus-address', focus);
    return () => shellBus.removeEventListener('focus-address', focus);
  }, []);
  useEffect(() => {
    if (!open || text.trim() === '') return void setItems([]);
    let alive = true;
    const h = setTimeout(() => {
      commands.omniboxSuggest(text).then((s) => alive && (setItems(s), setIndex(-1)));
    }, 80);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [text, open]);

  const go = async (value: string, typed: string) => {
    setOpen(false);
    setItems([]);
    if (value === typed && looksLikeSearch(typed)) await commands.historyRecordSearch(typed.trim(), 'bar');
    await navigate(value);
    input.current?.blur();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = index >= 0 ? items[index] : undefined;
      void go(chosen ? chosen.value : text, text);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setText(tab?.url ?? '');
    }
  };

  const display = !focused && tab?.kind === 'web' && text === tab.url ? splitDisplayUrl(tab.url) : null;
  return (
    <div className="np-address">
      {tab?.kind === 'web' && tab.url.startsWith('https:') && !tab.failure && !tab.crashed ? <IconLock /> : <IconSearch />}
      <div className="np-address-field">
        {display ? (
          <span className="np-address-display" aria-hidden="true">
            {display.host}
            <span className="np-address-path">{display.path}</span>
          </span>
        ) : null}
        <input
        ref={input}
        role="combobox"
        aria-label={t('shell.address.label')}
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={index >= 0 ? `${listId}-${index}` : undefined}
        aria-autocomplete="list"
        className="np-address-input"
        data-display={display !== null}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKey}
      />
      </div>
      {open && items.length > 0 ? (
        <ul id={listId} role="listbox" aria-label={t('shell.address.suggestions')} className="np-address-list">
          {items.map((s, i) => (
            <li
              key={`${s.kind}-${s.value}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === index}
              className="np-address-option"
              onMouseDown={(e) => {
                e.preventDefault();
                void go(s.value, text);
              }}
            >
              <span className="np-address-kind">{t(`shell.address.kind.${s.kind}`)}</span>
              <span className="np-address-label">{s.label}</span>
              {s.detail ? <span className="np-address-detail np-mono">{s.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {children}
    </div>
  );
}
