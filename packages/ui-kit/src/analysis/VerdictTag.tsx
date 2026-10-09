import { verdictTone, type VerdictStatusLike } from './tone';

export function VerdictTag({ status, label }: { status: VerdictStatusLike; label: string }) {
  return <span className={`np-tag np-tag--${verdictTone(status)}`}>{label}</span>;
}
