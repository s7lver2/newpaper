import { describe, expect, it } from 'vitest';
import { bestMove, winner, type Board } from './ticTacToe';

const b = (s: string): Board => [...s].map((c) => (c === 'X' || c === 'O' ? c : null));

describe('tic-tac-toe minimax', () => {
  it('detects wins and draws', () => {
    expect(winner(b('XXX......'))).toBe('X');
    expect(winner(b('O...O...O'))).toBe('O');
    expect(winner(b('XOXXOOOXX'))).toBe('draw');
    expect(winner(b('X........'))).toBeNull();
  });

  it('wins when it can and blocks when it must', () => {
    expect(bestMove(b('OO.XX....'), 'O')).toBe(2);
    expect(bestMove(b('XX.O.....'), 'O')).toBe(2);
  });

  it('never loses against any sequence of moves', () => {
    const play = (board: Board, human: boolean): void => {
      const w = winner(board);
      if (w) return void expect(w).not.toBe('X');
      if (human) {
        board.forEach((c, i) => {
          if (c === null) play(board.map((x, j) => (j === i ? 'X' : x)), false);
        });
      } else {
        const m = bestMove(board, 'O');
        play(board.map((x, j) => (j === m ? 'O' : x)), true);
      }
    };
    play(b('.........'), true);
  });
});
