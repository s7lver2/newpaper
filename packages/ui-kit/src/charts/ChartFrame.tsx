import { useState, type ReactNode } from 'react';

export interface FrameSource { n: number; title: string; url: string }

export function ChartFrame(props: {
  title: string;
  unit?: string;
  sources: FrameSource[];
  labels: { sources: string; showTable: string; showChart: string };
  table: ReactNode;
  onOpenSource?(url: string): void;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="np-chart np-rise">
      <div className="np-chart-head">
        <span className="np-chart-title">{props.title}</span>
        {props.unit ? <span className="np-chart-unit">{props.unit}</span> : null}
        <button type="button" className="np-chart-toggle" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
          {asTable ? props.labels.showChart : props.labels.showTable}
        </button>
      </div>
      <div className="np-chart-body">{asTable ? props.table : props.children}</div>
      <figcaption className="np-chart-sources">
        <span>{props.labels.sources}</span>
        {props.sources.map((s) => (
          <button key={s.n} type="button" className="np-chart-source" title={s.url} onClick={() => props.onOpenSource?.(s.url)}>
            [{s.n}] {s.title}
          </button>
        ))}
      </figcaption>
    </figure>
  );
}
