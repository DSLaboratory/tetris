import { describe, it, expect } from 'vitest';
import { areFrames, CLEAR_FRAMES } from '../src/core/tables';
import { createGame, tick } from '../src/core/game';
import { mkInput, IDLE, tickN, fillRow } from './helpers';

describe('ARE table', () => {
  it('is 10 frames in the bottom two rows, +2 per 4-row band, capped at 18', () => {
    expect(areFrames(19)).toBe(10);
    expect(areFrames(18)).toBe(10);
    expect(areFrames(17)).toBe(12);
    expect(areFrames(14)).toBe(12);
    expect(areFrames(13)).toBe(14);
    expect(areFrames(10)).toBe(14);
    expect(areFrames(9)).toBe(16);
    expect(areFrames(6)).toBe(16);
    expect(areFrames(5)).toBe(18);
    expect(areFrames(0)).toBe(18);
  });
});

describe('entry delay', () => {
  it('a bottom-row lock waits exactly 10 frames before the next spawn', () => {
    const g = createGame(0);
    g.piece = { id: 3, rot: 0, x: 5, y: 18 }; // O on the floor (lock row 19)
    g.gravityCounter = 999;
    tick(g, IDLE); // lock
    expect(g.phase).toBe('are');
    tickN(g, 9);
    expect(g.piece).toBeNull(); // frame 9: still waiting
    tick(g, IDLE);
    expect(g.piece).toMatchObject({ x: 5, y: 0 }); // frame 10: spawn
  });

  it('a clear inserts its 20-frame freeze before the ARE', () => {
    const g = createGame(0);
    fillRow(g, 19, [4, 5]);
    g.piece = { id: 3, rot: 0, x: 5, y: 18 };
    g.gravityCounter = 999;
    tick(g, IDLE); // lock -> clearing
    tickN(g, CLEAR_FRAMES);
    expect(g.phase).toBe('are');
    tickN(g, 10); // bottom-row ARE
    expect(g.piece).toMatchObject({ x: 5, y: 0 }); // 30 frames after lock
  });

  it('DAS charges while waiting out the ARE', () => {
    const g = createGame(0);
    g.piece = { id: 3, rot: 0, x: 5, y: 18 };
    g.gravityCounter = 999;
    tick(g, IDLE); // lock; das is 0
    expect(g.das).toBe(0);
    tickN(g, 10, mkInput({ rightHeld: true })); // hold right through the ARE
    expect(g.das).toBe(10); // charged 1 per frame
    expect(g.piece).not.toBeNull();
    tickN(g, 6, mkInput({ rightHeld: true })); // das reaches 16 -> auto-shift
    expect(g.piece!.x).toBe(6);
  });
});
