export interface FramingAxisLabels { axis: string; me: string; left: string; center: string; right: string; article: string; band: string; groupCenter: string; notDeterminable: string }

const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;

/** Eje de encuadre (mockup Main/Posicion): línea en tres tramos, las otras coberturas como puntos y «este» como punto oscuro. */
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
        <span className="np-axis-line" aria-hidden="true"><i /><i /><i /></span>
        {interval ? <span className="np-axis-band" title={labels.band} style={{ left: pct(interval[0]), width: pct(interval[1] - interval[0]) }} /> : null}
        {groupCenter !== null ? <span className="np-axis-center" title={labels.groupCenter} style={{ left: pct(groupCenter) }} /> : null}
        {others.map((o) => (
          <span key={o.id} className="np-axis-other" title={o.title} style={{ left: pct(o.value) }} />
        ))}
        {framing !== null ? (
          <span className="np-axis-me" title={labels.article} style={{ left: pct(framing) }}>
            <span className="np-axis-dot" />
            <span className="np-axis-melabel">{labels.me}</span>
          </span>
        ) : null}
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
