import { neutralityTone } from './tone';

const R = 54;
const C = 2 * Math.PI * R;

/** Anillo de neutralidad (mockup Main): 124 px, la nota en serif y el rótulo dentro. */
export function NeutralityRing({ value, label, caption }: { value: number | null; label: string; caption?: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const tone = value === null ? 'muted' : neutralityTone(v);
  return (
    <figure className={`np-ring np-ring--${tone}`} role="img" aria-label={label}>
      <svg viewBox="0 0 124 124" width="124" height="124" aria-hidden="true">
        <circle className="np-ring-track" cx="62" cy="62" r={R} />
        <circle className="np-ring-value" cx="62" cy="62" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} transform="rotate(-90 62 62)" />
      </svg>
      <span className="np-ring-inner" aria-hidden="true">
        <span className="np-ring-number">{value === null ? '–' : Math.round(v)}</span>
        {caption ? <span className="np-ring-caption">{caption}</span> : null}
      </span>
    </figure>
  );
}
