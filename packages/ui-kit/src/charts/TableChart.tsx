export function TableChart({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="np-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((v, j) => (
              <td key={j} className={typeof v === 'number' ? 'np-num' : undefined}>{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
