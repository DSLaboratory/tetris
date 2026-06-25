import { describe, expect, it } from 'vitest';
import { createGame, tick, WIDTH } from '../src/core/game';
import { CLEAR_FRAMES, firstLevelUpLines, levelForLines, scoreForLines } from '../src/core/tables';
import { fillRow, IDLE, tickN } from './helpers';

describe('line scores', () => {
  it('uses the 40 / 100 / 300 / 1200 base values', () => {
    expect([1, 2, 3, 4].map(scoreForLines)).toEqual([40, 100, 300, 1200]);
  });
});

describe('level progression', () => {
  it('first level-up: min((s+1)*10, max(100, s*10-50)) lines', () => {
    expect(firstLevelUpLines(0)).toBe(10);
    expect(firstLevelUpLines(5)).toBe(60);
    expect(firstLevelUpLines(9)).toBe(100); // start at 9, stay there for 100 lines
  });

  it('then advances every 10 lines', () => {
    expect(levelForLines(0, 9)).toBe(0);
    expect(levelForLines(0, 10)).toBe(1);
    expect(levelForLines(0, 19)).toBe(1);
    expect(levelForLines(0, 20)).toBe(2);
    expect(levelForLines(9, 99)).toBe(9);
    expect(levelForLines(9, 100)).toBe(10);
    expect(levelForLines(9, 110)).toBe(11);
  });
});

// Drive a real game to a controlled clear: place a piece directly over a
// prepared gap and let one gravity tick lock it.
function clearWithO(g: ReturnType<typeof createGame>, rows: number[]): void {
  // O occupies rows y and y+1 at columns 4,5: drop it straight into the gap.
  g.piece = { id: 3, rot: 0, x: 5, y: rows[0] };
  g.gravityCounter = 999; // force the gravity tick (and the lock) right now
  tick(g, IDLE);
  expect(g.phase).toBe('clearing');
  tickN(g, CLEAR_FRAMES);
}

describe('scoring through play', () => {
  it('a single clear at level 0 scores 40 x (0 + 1)', () => {
    const g = createGame(0);
    fillRow(g, 19, [4, 5]);
    fillRow(g, 18, [4, 5, 6]); // row 18 stays incomplete
    clearWithO(g, [18, 19]); // only row 19 completes... both gaps at 4,5
    // O fills (4,5) on rows 18 and 19; row 18 still has a hole at column 6.
    expect(g.lines).toBe(1);
    expect(g.score).toBe(40);
  });

  it('a double clear scores 100 x (level + 1)', () => {
    const g = createGame(0);
    fillRow(g, 19, [4, 5]);
    fillRow(g, 18, [4, 5]);
    clearWithO(g, [18, 19]);
    expect(g.lines).toBe(2);
    expect(g.score).toBe(100);
  });

  it('a clear that levels up scores with the NEW level (NES order)', () => {
    const g = createGame(0);
    g.lines = 9; // one line away from level 1
    fillRow(g, 19, [4, 5]);
    fillRow(g, 18, [4, 5, 6]);
    clearWithO(g, [18, 19]);
    expect(g.lines).toBe(10);
    expect(g.level).toBe(1);
    expect(g.score).toBe(80); // 40 x (1 + 1), not 40 x (0 + 1)
  });

  it('a tetris with the vertical I scores 1200 x (level + 1)', () => {
    const g = createGame(0);
    for (const r of [16, 17, 18, 19]) fillRow(g, r, [0]);
    g.piece = { id: 6, rot: 1, x: 0, y: 18 }; // vertical I fills rows 16-19 at column 0
    g.gravityCounter = 999;
    tick(g, IDLE);
    expect(g.phase).toBe('clearing');
    expect(g.clearingRows).toEqual([16, 17, 18, 19]);
    tickN(g, CLEAR_FRAMES);
    expect(g.lines).toBe(4);
    expect(g.score).toBe(1200);
    expect(Array.from(g.wells[0]).every((c) => c === 0)).toBe(true); // board fully empty
  });

  it('play is frozen for exactly the 20 clear frames', () => {
    const g = createGame(0);
    fillRow(g, 19, [4, 5]);
    g.piece = { id: 3, rot: 0, x: 5, y: 18 };
    g.gravityCounter = 999;
    tick(g, IDLE);
    tickN(g, CLEAR_FRAMES - 1);
    expect(g.phase).toBe('clearing'); // still frozen on frame 19
    tick(g, IDLE);
    expect(g.phase).not.toBe('clearing'); // frame 20 ends the freeze
    expect(g.wells[0][19 * WIDTH + 0]).toBe(0); // cleared row gone...
    expect(g.wells[0][19 * WIDTH + 4]).toBe(4); // ...and the O's top half collapsed into it
  });
});
