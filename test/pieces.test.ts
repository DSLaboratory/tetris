import { describe, it, expect } from 'vitest';
import {
  PIECES, PIECE_NAMES, PieceId, cellsOf, rotateCw, rotateCcw, orientationCount,
} from '../src/core/pieces';

// Render an orientation onto a 5x5 grid as strings, centered at (2,2),
// so shapes can be asserted visually.
function mask(id: PieceId, rot: number): string[] {
  const grid = Array.from({ length: 5 }, () => Array(5).fill('.'));
  for (const [dx, dy] of cellsOf(id, rot)) grid[2 + dy][2 + dx] = 'X';
  return grid.map((row) => row.join(''));
}

const id = (name: string) => PIECE_NAMES.indexOf(name as never) as PieceId;

describe('NRS orientation counts', () => {
  it('T, J, L have 4; S, Z, I have 2; O has 1', () => {
    expect(PIECES.map((p) => p.length)).toEqual([4, 4, 2, 1, 2, 4, 2]);
  });

  it('every orientation has exactly 4 cells', () => {
    for (const piece of PIECES) {
      for (const orientation of piece) expect(orientation.length).toBe(4);
    }
  });
});

describe('spawn orientations (index 0)', () => {
  it('T spawns pointing down', () => {
    expect(mask(id('T'), 0)).toEqual([
      '.....',
      '.....',
      '.XXX.',
      '..X..',
      '.....',
    ]);
  });

  it('J spawns flat with foot bottom-right', () => {
    expect(mask(id('J'), 0)).toEqual([
      '.....',
      '.....',
      '.XXX.',
      '...X.',
      '.....',
    ]);
  });

  it('L spawns flat with foot bottom-left', () => {
    expect(mask(id('L'), 0)).toEqual([
      '.....',
      '.....',
      '.XXX.',
      '.X...',
      '.....',
    ]);
  });

  it('Z spawns horizontal', () => {
    expect(mask(id('Z'), 0)).toEqual([
      '.....',
      '.....',
      '.XX..',
      '..XX.',
      '.....',
    ]);
  });

  it('S spawns horizontal', () => {
    expect(mask(id('S'), 0)).toEqual([
      '.....',
      '.....',
      '..XX.',
      '.XX..',
      '.....',
    ]);
  });

  it('I spawns horizontal', () => {
    expect(mask(id('I'), 0)).toEqual([
      '.....',
      '.....',
      'XXXX.',
      '.....',
      '.....',
    ]);
  });

  it('O is a square', () => {
    expect(mask(id('O'), 0)).toEqual([
      '.....',
      '.....',
      '.XX..',
      '.XX..',
      '.....',
    ]);
  });
});

describe('clockwise rotation cycle', () => {
  it('T cycles down -> left -> up -> right', () => {
    const t = id('T');
    expect(mask(t, rotateCw(t, 0))).toEqual([
      '.....',
      '..X..',
      '.XX..',
      '..X..',
      '.....',
    ]); // left
    expect(mask(t, rotateCw(t, 1))).toEqual([
      '.....',
      '..X..',
      '.XXX.',
      '.....',
      '.....',
    ]); // up
    expect(mask(t, rotateCw(t, 2))).toEqual([
      '.....',
      '..X..',
      '..XX.',
      '..X..',
      '.....',
    ]); // right
  });

  it('I toggles between horizontal and vertical', () => {
    const i = id('I');
    expect(mask(i, rotateCw(i, 0))).toEqual([
      '..X..',
      '..X..',
      '..X..',
      '..X..',
      '.....',
    ]);
    expect(rotateCw(i, 1)).toBe(0);
    expect(rotateCcw(i, 0)).toBe(1); // CCW reaches the same single alternate
  });

  it('S and Z toggle between exactly two states', () => {
    for (const name of ['S', 'Z'] as const) {
      const p = id(name);
      expect(rotateCw(p, rotateCw(p, 0))).toBe(0);
      expect(rotateCcw(p, rotateCcw(p, 0))).toBe(0);
    }
  });

  it('O never changes', () => {
    const o = id('O');
    expect(rotateCw(o, 0)).toBe(0);
    expect(rotateCcw(o, 0)).toBe(0);
  });

  it('four CW rotations return T, J, L to spawn', () => {
    for (const name of ['T', 'J', 'L'] as const) {
      const p = id(name);
      let rot = 0;
      for (let k = 0; k < 4; k++) rot = rotateCw(p, rot);
      expect(rot).toBe(0);
      expect(orientationCount(p)).toBe(4);
    }
  });
});
