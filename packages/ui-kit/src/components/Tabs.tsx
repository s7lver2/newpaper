import { useRef, type KeyboardEvent } from 'react';

export function Tabs<T extends string>(props: { tabs: { id: T; label: string; badge?: string }[]; active: T; onChange(id: T): void; label: string; idPrefix: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, props.tabs.findIndex((t) => t.id === props.active));
  const go = (i: number) => {
    props.onChange(props.tabs[i]!.id);
    refs.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const n = props.tabs.length;
    if (e.key === 'ArrowRight') { e.preventDefault(); go((index + 1) % n); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go((index - 1 + n) % n); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(n - 1); }
  };
  return (
    <div role="tablist" aria-label={props.label} className="np-tabs" onKeyDown={onKey}>
      {props.tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          id={`${props.idPrefix}-tab-${t.id}`}
          aria-controls={`${props.idPrefix}-panel-${t.id}`}
          aria-selected={t.id === props.active}
          tabIndex={t.id === props.active ? 0 : -1}
          className="np-tab"
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
          {t.badge ? <span className="np-tab-badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
