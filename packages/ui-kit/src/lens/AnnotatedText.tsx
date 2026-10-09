import type { KeyboardEvent } from 'react';
import { paragraphRanges, segmentText, type LensMark } from './segmentText';

export function AnnotatedText(props: {
  text: string;
  lang?: string | null;
  marks: LensMark[];
  classOf(m: LensMark): string;
  describe(m: LensMark): string;
  activeId?: string | null;
  onActivate?(m: LensMark): void;
  paragraphClass?(index: number): string | undefined;
}) {
  const { text, marks, classOf, describe, activeId, onActivate, paragraphClass } = props;
  const key = (m: LensMark) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate?.(m);
    }
  };
  return (
    <div className="np-lens" lang={props.lang ?? undefined}>
      {paragraphRanges(text).map((p, i) => (
        <p key={p.start} className={paragraphClass?.(i)}>
          {segmentText(text, marks, p.start, p.end).map((s) => {
            const top = s.marks[0];
            if (!top) return <span key={s.start}>{s.text}</span>;
            return (
              <mark
                key={s.start}
                className={`${classOf(top)}${activeId === top.id ? ' np-lens-active' : ''}`}
                data-mark={top.id}
                tabIndex={onActivate ? 0 : undefined}
                role={onActivate ? 'button' : undefined}
                aria-label={onActivate ? describe(top) : undefined}
                onClick={onActivate ? () => onActivate(top) : undefined}
                onKeyDown={onActivate ? key(top) : undefined}
              >
                {s.text}
              </mark>
            );
          })}
        </p>
      ))}
    </div>
  );
}
