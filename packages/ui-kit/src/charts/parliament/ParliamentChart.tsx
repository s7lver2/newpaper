import { useMemo, useState } from 'react';
import { assignSeats, coalitionSeats, hemicycleLayout, type PartySeats } from './hemicycle';

export interface ParliamentLabels {
  chart: string;
  majority(n: number): string;
  seatsFor(n: number): string;
  reached: string;
  short(n: number): string;
  hint: string;
  party: string;
  seats: string;
  vote: string;
  yes: string;
  no: string;
  reset: string;
}

const W = 320;
const H = 176;

export function ParliamentChart({ total, majority, parties, labels }: { total: number; majority: number; parties: PartySeats[]; labels: ParliamentLabels }) {
  const [yes, setYes] = useState<Set<string>>(new Set());
  const layout = useMemo(() => hemicycleLayout(total), [total]);
  const filled = useMemo(() => assignSeats(layout, parties), [layout, parties]);
  const ordered = useMemo(() => [...parties].sort((a, b) => a.order - b.order), [parties]);
  const sum = coalitionSeats(parties, yes);
  const r = Math.max(1.6, Math.min(5, 260 / Math.sqrt(total) / 3.2));
  const toggle = (id: string) => setYes((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const building = yes.size > 0;
  return (
    <div className="np-parl">
      <svg viewBox={`0 0 ${W} ${H}`} className="np-svg" role="img" aria-label={labels.chart}>
        {layout.map((s, i) => {
          const p = filled[i];
          const active = !building || (p && yes.has(p.partyId));
          return (
            <circle
              key={i}
              cx={W / 2 + s.x * 150}
              cy={H - 8 - s.y * 150}
              r={r}
              className={active ? 'np-seat' : 'np-seat np-seat--off'}
              style={{ fill: p ? p.color : 'var(--np-line3)' }}
            />
          );
        })}
        <line x1={W / 2} x2={W / 2} y1={H - 170} y2={H - 4} className="np-parl-axis" />
        <text x={W / 2} y={H - 30} textAnchor="middle" className="np-parl-sum">{building ? sum : total}</text>
        <text x={W / 2} y={H - 14} textAnchor="middle" className="np-tick">{labels.majority(majority)}</text>
      </svg>
      <p className={`np-parl-status ${sum >= majority ? 'np-parl-status--ok' : ''}`} aria-live="polite">
        {building ? `${labels.seatsFor(sum)} · ${sum >= majority ? labels.reached : labels.short(majority - sum)}` : labels.hint}
      </p>
      <div className="np-parl-parties" role="group" aria-label={labels.hint}>
        {ordered.map((p) => (
          <button key={p.partyId} type="button" className="np-parl-party" aria-pressed={yes.has(p.partyId)} onClick={() => toggle(p.partyId)}>
            <i style={{ background: p.color }} />
            <span>{p.short}</span>
            <span className="np-mono">{p.seats}</span>
          </button>
        ))}
        {building ? (
          <button type="button" className="np-parl-reset" onClick={() => setYes(new Set())}>
            {labels.reset}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ParliamentTable({ parties, yes, labels }: { parties: PartySeats[]; yes?: Set<string>; labels: ParliamentLabels }) {
  return (
    <table className="np-table">
      <thead>
        <tr>
          <th scope="col">{labels.party}</th>
          <th scope="col">{labels.seats}</th>
          <th scope="col">{labels.vote}</th>
        </tr>
      </thead>
      <tbody>
        {[...parties].sort((a, b) => a.order - b.order).map((p) => (
          <tr key={p.partyId}>
            <td>{p.name}</td>
            <td className="np-num">{p.seats}</td>
            <td>{yes?.has(p.partyId) ? labels.yes : labels.no}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
