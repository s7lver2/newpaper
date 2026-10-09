export function StackedChart({ categories, rows, label }: { categories: string[]; rows: { label: string; values: number[] }[]; label: string }) {
  return (
    <div className="np-stacked" role="img" aria-label={label}>
      {rows.map((r) => {
        const total = r.values.reduce((a, b) => a + b, 0) || 1;
        return (
          <div key={r.label} className="np-stacked-row">
            <span className="np-stacked-label">{r.label}</span>
            <span className="np-stacked-bar">
              {r.values.map((v, i) => (
                <span key={categories[i] ?? i} className={`np-series-${(i % 6) + 1}`} style={{ width: `${(v / total) * 100}%` }} title={`${categories[i] ?? ''}: ${v}`} />
              ))}
            </span>
          </div>
        );
      })}
      <div className="np-legend">
        {categories.map((c, i) => (
          <span key={c}>
            <i className={`np-series-${(i % 6) + 1}`} />
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
