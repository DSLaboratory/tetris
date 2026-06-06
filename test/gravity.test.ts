import { describe, it, expect } from 'vitest';
import { gravityFrames } from '../src/core/tables';
import { createGame } from '../src/core/game';
import { IDLE, tickN } from './helpers';
import { tick } from '../src/core/game';

describe('NTSC gravity table', () => {
  it('matches the published frames-per-row values exactly', () => {
    const expected = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3];
    for (let level = 0; level <= 18; level++) {
      expect(gravityFrames(level), `level ${level}`).toBe(expected[level]);
    }
    for (let level = 19; level <= 28; level++) {
      expect(gravityFrames(level), `level ${level}`).toBe(2);
    }
    expect(gravityFrames(29)).toBe(1);
    expect(gravityFrames(50)).toBe(1);
  });
});

describe('falling', () => {
  it('drops exactly on the 48th frame at level 0', () => {
    const g = createGame(0);
    tickN(g, 47);
    expect(g.piece!.y).toBe(0);
    tick(g, IDLE);
    expect(g.piece!.y).toBe(1);
  });

  it('drops every 6 frames at level 9', () => {
    const g = createGame(9);
    tickN(g, 6);
    expect(g.piece!.y).toBe(1);
    tickN(g, 6);
    expect(g.piece!.y).toBe(2);
  });
});
