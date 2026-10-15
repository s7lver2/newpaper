import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useRef, useState, type KeyboardEvent } from 'react';
import { bestMove, winner, type Board } from '@newpaper/ui-kit/logic';

const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };

export function TicTacToeGame() {
  const t = useT();
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [score, setScore] = useState({ you: 0, draw: 0, house: 0 });
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
    const r = winner(next);
    if (r) setScore((c) => ({ you: c.you + (r === 'X' ? 1 : 0), draw: c.draw + (r === 'draw' ? 1 : 0), house: c.house + (r === 'O' ? 1 : 0) }));
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
      <div className="np-ttt-side">
        <dl className="np-ttt-score">
          <div><dt>{t('pages.game.scoreYou')}</dt><dd>{score.you}</dd></div>
          <div><dt>{t('pages.game.scoreDraw')}</dt><dd>{score.draw}</dd></div>
          <div data-house><dt>{t('pages.game.scoreHouse')}</dt><dd>{score.house}</dd></div>
        </dl>
        <p role="status" className="np-ttt-status">{status}</p>
        {w ? <Button onClick={() => setBoard(Array(9).fill(null))}>{t('pages.game.again')}</Button> : null}
      </div>
    </section>
  );
}
