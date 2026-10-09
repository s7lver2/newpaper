export interface Seat { x: number; y: number; row: number; angle: number }
export interface PartySeats { partyId: string; name: string; short: string; color: string; order: number; seats: number }

export const rowsFor = (total: number) => (total <= 20 ? 2 : total <= 100 ? 4 : total <= 400 ? 9 : 12);
export const majorityOf = (total: number) => Math.floor(total / 2) + 1;

const INNER = 0.38;

export function hemicycleLayout(total: number, rows = rowsFor(total)): Seat[] {
  if (total <= 0) return [];
  const n = Math.max(1, Math.min(rows, total));
  const radii = Array.from({ length: n }, (_, i) => (n === 1 ? 1 : INNER + ((1 - INNER) * i) / (n - 1)));
  const sum = radii.reduce((a, b) => a + b, 0);
  const exact = radii.map((r) => (total * r) / sum);
  const counts = exact.map((x) => Math.max(1, Math.floor(x)));
  let rest = total - counts.reduce((a, b) => a + b, 0);
  const byFraction = exact.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || b.i - a.i);
  for (let k = 0; rest > 0; k = (k + 1) % n, rest--) counts[byFraction[k]!.i]!++;
  for (let i = n - 1; rest < 0 && i >= 0; i--) {
    const take = Math.min(-rest, counts[i]! - 1);
    counts[i]! -= take;
    rest += take;
  }
  const seats: Seat[] = [];
  radii.forEach((r, row) => {
    const c = counts[row]!;
    for (let j = 0; j < c; j++) {
      const angle = c === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (c - 1);
      seats.push({ x: r * Math.cos(angle), y: r * Math.sin(angle), row, angle });
    }
  });
  return seats.sort((a, b) => b.angle - a.angle || a.row - b.row);
}

export function assignSeats(layout: Seat[], parties: PartySeats[]): (PartySeats | null)[] {
  const ordered = [...parties].sort((a, b) => a.order - b.order);
  const out: (PartySeats | null)[] = [];
  for (const p of ordered) for (let k = 0; k < p.seats && out.length < layout.length; k++) out.push(p);
  while (out.length < layout.length) out.push(null);
  return out;
}

export function coalitionSeats(parties: PartySeats[], yes: Set<string>): number {
  return parties.filter((p) => yes.has(p.partyId)).reduce((n, p) => n + p.seats, 0);
}
