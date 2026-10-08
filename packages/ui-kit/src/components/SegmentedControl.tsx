import { useRef, type KeyboardEvent } from 'react';

export function SegmentedControl<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, props.options.findIndex((o) => o.value === props.value));
  const move = (delta: number) => {
    const n = props.options.length;
    const next = (index + delta + n) % n;
    props.onChange(props.options[next]!.value);
    refs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  };
  return (
    <div role="radiogroup" aria-label={props.label} className="np-seg" onKeyDown={onKey}>
      {props.options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          tabIndex={o.value === props.value ? 0 : -1}
          className="np-seg-item"
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}