export function ConfidenceMeter({ value, threshold, label, thresholdLabel }: { value: number; threshold: number; label: string; thresholdLabel: string }) {
  const ok = value >= threshold;
  return (
    <div className="np-conf">
      <div className="np-conf-head">
        <span>{label}</span>
        <span className="np-mono">{value.toFixed(2)}</span>
      </div>
      <div className="np-conf-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(value.toFixed(2))}>
        <span className={`np-conf-fill ${ok ? 'np-conf-fill--ok' : 'np-conf-fill--low'}`} style={{ width: `${value * 100}%` }} />
        <span className="np-conf-threshold" title={thresholdLabel} style={{ left: `${threshold * 100}%` }} />
      </div>
    </div>
  );
}
