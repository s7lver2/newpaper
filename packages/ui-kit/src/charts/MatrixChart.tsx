type Cell = 'si' | 'par' | 'mal' | 'no';
const GLYPH: Record<Cell, string> = { si: '●', par: '◐', mal: '○', no: '✕' };

export function MatrixChart({ columns, rows, cellLabel, label }: { columns: string[]; rows: { label: string; cells: Cell[] }[]; cellLabel(c: Cell): string; label: string }) {
  return (
    <table className="np-matrix" aria-label={label}>
      <thead>
        <tr>
          <td />
          {columns.map((c) => (
            <th key={c} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            {r.cells.map((c, i) => (
              <td key={columns[i] ?? i} className={`np-matrix-${c}`} aria-label={cellLabel(c)} title={cellLabel(c)}>
                {GLYPH[c]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
