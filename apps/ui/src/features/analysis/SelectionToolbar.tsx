import { useT } from '@newpaper/i18n/react';
import type { AgentMode } from '@newpaper/pipeline';
import { useEffect, useState, type RefObject } from 'react';

export function useTextSelection(ref: RefObject<HTMLElement | null>): { text: string; rect: DOMRect } | null {
  const [sel, setSel] = useState<{ text: string; rect: DOMRect } | null>(null);
  useEffect(() => {
    const onChange = () => {
      const s = document.getSelection();
      const root = ref.current;
      if (!s || s.isCollapsed || !root || s.rangeCount === 0) return setSel(null);
      const range = s.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return setSel(null);
      const text = s.toString().trim();
      if (text.length < 3 || text.length > 2000) return setSel(null);
      setSel({ text, rect: range.getBoundingClientRect() });
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, [ref]);
  return sel;
}

/** Barra oscura sobre la selección (mockup Main): `container` es el bloque de texto con `position: relative`. */
export function SelectionToolbar({ rect, container, onAction }: { rect: DOMRect; container: HTMLElement; onAction(mode: AgentMode): void }) {
  const t = useT();
  const box = container.getBoundingClientRect();
  const top = Math.max(4, rect.top - box.top - 52);
  const left = Math.min(Math.max(120, rect.left - box.left + rect.width / 2), Math.max(120, box.width - 120));
  const modes: AgentMode[] = ['ask', 'verify', 'explain'];
  return (
    <div className="np-seltool" role="toolbar" aria-label={t('analysis.selection.label')} style={{ top, left }}>
      {modes.map((m) => (
        <button key={m} type="button" className="np-seltool-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onAction(m)}>
          {m === 'ask' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5h16v11H9l-5 4z" />
            </svg>
          ) : null}
          {t(`analysis.selection.${m}`)}
        </button>
      ))}
    </div>
  );
}
