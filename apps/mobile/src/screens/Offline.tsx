import { Bar } from './Bar';
import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { bestMove, winner, type Board, type Cell } from '@newpaper/ui-kit/logic';
import { useState } from 'react';
import { go } from '../router';

/** Sin conexion: aviso, acceso a lo guardado y un tres en raya contra la maquina (minimax). */
export function Offline() {
  const t = useT();
  const [b, setB] = useState<Board>(Array<Cell>(9).fill(null));
  const w = winner(b);
  const play = (i: number) => {
    if (b[i] || w) return;
    const n: Board = b.map((c, j) => (j === i ? 'X' : c));
    if (!winner(n)) n[bestMove(n, 'O')] = 'O';
    setB(n);
  };
  return (
    <section className="m-body">
      <Bar title={t('pages.offline.title')} />
      <p>{t('pages.offline.body')}</p>
      <Button variant="primary" onClick={() => go('edicion')}>{t('mobile.edition.title')}</Button>
      <h2 className="np-mono np-muted">{t('pages.game.title')}</h2>
      <div className="np-ttt-board" role="grid" aria-label={t('pages.game.board')}>
        {b.map((c, i) => (
          <button
            key={i}
            type="button"
            role="gridcell"
            className="np-ttt-cell"
            aria-label={t('pages.game.cell', { n: i + 1, value: c ?? t('pages.game.empty') })}
            onClick={() => play(i)}
          >
            {c === 'X' ? '×' : c === 'O' ? '○' : ''}
          </button>
        ))}
      </div>
      <p role="status">
        {w === 'X' ? t('pages.game.youWin') : w === 'O' ? t('pages.game.iWin') : w === 'draw' ? t('pages.game.draw') : t('pages.game.yourTurn')}
      </p>
      {w ? <Button onClick={() => setB(Array<Cell>(9).fill(null))}>{t('pages.game.again')}</Button> : null}
    </section>
  );
}
