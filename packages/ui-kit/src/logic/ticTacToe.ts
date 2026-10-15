export type Cell = 'X' | 'O' | null;
export type Board = Cell[];
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]] as const;

export function winner(b: Board): 'X' | 'O' | 'draw' | null {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every((x) => x !== null) ? 'draw' : null;
}

function score(b: Board, ai: 'X' | 'O', turn: 'X' | 'O', depth: number, alpha: number, beta: number): number {
  const w = winner(b);
  if (w === ai) return 10 - depth;
  if (w === 'draw') return 0;
  if (w) return depth - 10;
  const other = turn === 'X' ? 'O' : 'X';
  let best = turn === ai ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i] !== null) continue;
    b[i] = turn;
    const s = score(b, ai, other, depth + 1, alpha, beta);
    b[i] = null;
    if (turn === ai) {
      best = Math.max(best, s);
      alpha = Math.max(alpha, s);
    } else {
      best = Math.min(best, s);
      beta = Math.min(beta, s);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function bestMove(board: Board, ai: 'X' | 'O'): number {
  const b = [...board];
  const other = ai === 'X' ? 'O' : 'X';
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i] !== null) continue;
    b[i] = ai;
    const s = score(b, ai, other, 1, -Infinity, Infinity);
    b[i] = null;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}
