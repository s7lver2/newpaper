export type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'accent' | 'ai';
export type VerdictStatusLike = 'verificado' | 'enganoso' | 'falso' | 'falta_contexto' | 'opinion' | 'no_verificable';

export function verdictTone(s: VerdictStatusLike): Tone {
  switch (s) {
    case 'verificado':
      return 'ok';
    case 'enganoso':
      return 'warn';
    case 'falso':
    case 'falta_contexto':
      return 'bad';
    case 'opinion':
      return 'accent';
    default:
      return 'muted';
  }
}

export function neutralityTone(n: number): Tone {
  return n >= 75 ? 'ok' : n >= 55 ? 'accent' : n >= 35 ? 'warn' : 'bad';
}

/** Marca de la lente: veredicto de la afirmación, `pendiente` (sin verificar) o `cargada` (frase cargada). */
export function markTone(kind: string): Tone {
  if (kind === 'cargada') return 'ai';
  if (kind === 'pendiente') return 'muted';
  return verdictTone(kind as VerdictStatusLike);
}
