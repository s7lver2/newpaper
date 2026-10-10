import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useRef, useState, type KeyboardEvent } from 'react';
import { bestMove, winner, type Board } from './ticTacToe';

const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };

export function TicTacToeGame() {
  const t = useT();
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const w = winner(board);
  const play = (i: number) => {
    if (board[i] !== null || w) return;
    const next = board.map((c, j) => (j === i ? 'X' : c));
    if (!winner(next)) {
      const m = bestMove(next, 'O');
      if (m >= 0) next[m] = 'O';
    }
    setBoard(next);
  };
  const key = (i: number) => (e: KeyboardEvent) => {
    const step = KEY_STEPS[e.key];
    if (step !== undefined) {
      e.preventDefault();
      refs.current[(i + step + 9) % 9]?.focus();
    }
  };
  const status = w === 'X' ? t('pages.game.youWin') : w === 'O' ? t('pages.game.iWin') : w === 'draw' ? t('pages.game.draw') : t('pages.game.yourTurn');
  return (
    <section className="np-ttt" aria-label={t('pages.game.title')}>
      <h2>{t('pages.game.title')}</h2>
      <div className="np-ttt-board" role="grid" aria-label={t('pages.game.board')}>
        {board.map((c, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="gridcell"
            className="np-ttt-cell"
            aria-label={t('pages.game.cell', { n: i + 1, value: c ?? t('pages.game.empty') })}
            onClick={() => play(i)}
            onKeyDown={key(i)}
          >
            {c === 'X' ? '×' : c === 'O' ? '○' : ''}
          </button>
        ))}
      </div>
      <p role="status">{status}</p>
      {w ? <Button onClick={() => setBoard(Array(9).fill(null))}>{t('pages.game.again')}</Button> : null}
    </section>
  );
}
