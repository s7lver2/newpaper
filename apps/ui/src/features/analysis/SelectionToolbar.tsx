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

export function SelectionToolbar({ rect, container, onAction }: { rect: DOMRect; container: HTMLElement; onAction(mode: AgentMode): void }) {
  const t = useT();
  const box = container.getBoundingClientRect();
  const top = rect.top - box.top + container.scrollTop - 48;
  const left = Math.max(8, rect.left - box.left + rect.width / 2 - 140);
  const modes: AgentMode[] = ['ask', 'verify', 'explain'];
  return (
    <div className="np-seltool np-rise" role="toolbar" aria-label={t('analysis.selection.label')} style={{ top, left }}>
      {modes.map((m) => (
        <button key={m} type="button" className="np-seltool-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onAction(m)}>
          {t(`analysis.selection.${m}`)}
        </button>
      ))}
    </div>
  );
}
