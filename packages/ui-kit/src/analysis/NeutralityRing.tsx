import { neutralityTone } from './tone';

const R = 30;
const C = 2 * Math.PI * R;

export function NeutralityRing({ value, label, caption }: { value: number | null; label: string; caption?: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const tone = value === null ? 'muted' : neutralityTone(v);
  return (
    <figure className={`np-ring np-ring--${tone}`} role="img" aria-label={label}>
      <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
        <circle className="np-ring-track" cx="36" cy="36" r={R} />
        <circle className="np-ring-value" cx="36" cy="36" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} transform="rotate(-90 36 36)" />
      </svg>
      <span className="np-ring-number" aria-hidden="true">{value === null ? '–' : Math.round(v)}</span>
      {caption ? <figcaption className="np-ring-caption">{caption}</figcaption> : null}
    </figure>
  );
}
