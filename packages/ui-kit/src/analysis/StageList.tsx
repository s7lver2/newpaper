export interface StageItem { id: string; label: string; status: 'pending' | 'running' | 'done' | 'cached' | 'failed' | 'skipped'; statusLabel: string }

export function StageList({ items, label }: { items: StageItem[]; label: string }) {
  return (
    <ol className="np-stages" aria-label={label}>
      {items.map((s) => (
        <li key={s.id} className={`np-stage np-stage--${s.status}`} aria-busy={s.status === 'running' || undefined}>
          <span className="np-stage-dot" aria-hidden="true" />
          <span className="np-stage-label">{s.label}</span>
          <span className="np-stage-status">{s.statusLabel}</span>
        </li>
      ))}
    </ol>
  );
}
