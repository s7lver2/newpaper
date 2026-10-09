export interface FramingAxisLabels { axis: string; left: string; center: string; right: string; article: string; band: string; groupCenter: string; notDeterminable: string }

const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;

export function FramingAxis(props: {
  framing: number | null;
  interval: [number, number] | null;
  groupCenter: number | null;
  others: { id: string; value: number; title: string }[];
  labels: FramingAxisLabels;
}) {
  const { framing, interval, groupCenter, others, labels } = props;
  return (
    <div className="np-axis" role="img" aria-label={labels.axis}>
      <div className="np-axis-track">
        {interval ? <span className="np-axis-band" title={labels.band} style={{ left: pct(interval[0]), width: pct(interval[1] - interval[0]) }} /> : null}
        {groupCenter !== null ? <span className="np-axis-center" title={labels.groupCenter} style={{ left: pct(groupCenter) }} /> : null}
        {others.map((o) => (
          <span key={o.id} className="np-axis-other" title={o.title} style={{ left: pct(o.value) }} />
        ))}
        {framing !== null ? <span className="np-axis-dot" title={labels.article} style={{ left: pct(framing) }} /> : null}
        {framing === null ? <span className="np-axis-nd">{labels.notDeterminable}</span> : null}
      </div>
      <div className="np-axis-scale" aria-hidden="true">
        <span>{labels.left}</span>
        <span>{labels.center}</span>
        <span>{labels.right}</span>
      </div>
    </div>
  );
}
