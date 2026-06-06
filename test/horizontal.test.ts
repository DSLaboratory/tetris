import { describe, it, expect } from 'vitest';
import { createGame, spawnPiece, tick, Game, WIDTH } from '../src/core/game';
import { lfsrNext } from '../src/core/rng';
import { IDLE, tickN, fillRow } from './helpers';

// Horizontal mode is the same machine with two wells. Everything here
// tests the ONLY new mechanics: the side roll and the shared fate.
const horizontal = (level = 0, seed = 0x8988) => createGame(level, seed, 2);

// Wind the side register so the NEXT roll lands on the wanted side.
// Sides are rolled at spawn and not exposed anywhere beforehand, so tests
// steer the register itself.
function forceNextSide(g: Game, side: number): void {
  for (let s = 1; ; s++) {
    if (((lfsrNext(s) >> 8) & 1) === side) {
      g.rng.sideState = s;
      return;
    }
  }
}

describe('spawn side assignment', () => {
  it('every piece is bound to one of the two wells', () => {
    const g = horizontal();
    expect(g.wells.length).toBe(2);
    expect([0, 1]).toContain(g.well);
  });

  it('the side is rolled at spawn time, never announced in advance', () => {
    const g = horizontal();
    // Nothing in the observable state names the next side...
    expect('nextWell' in g).toBe(false);
    // ...but the roll is still deterministic at the moment of spawn.
    forceNextSide(g, 1);
    spawnPiece(g);
    expect(g.well).toBe(1);
    forceNextSide(g, 0);
    spawnPiece(g);
    expect(g.well).toBe(0);
  });

  it('distributes roughly 50/50 over many spawns', () => {
    const g = horizontal();
    const counts = [0, 0];
    for (let i = 0; i < 2000; i++) {
      spawnPiece(g);
      counts[g.well]++;
    }
    expect(counts[0]).toBeGreaterThan(900);
    expect(counts[1]).toBeGreaterThan(900);
  });

  it('allows streaks - there is no direction fairness bag', () => {
    const g = horizontal();
    let run = 1;
    let maxRun = 1;
    let prev = g.well;
    for (let i = 0; i < 2000; i++) {
      spawnPiece(g);
      run = g.well === prev ? run + 1 : 1;
      maxRun = Math.max(maxRun, run);
      prev = g.well;
    }
    expect(maxRun).toBeGreaterThanOrEqual(4); // droughts are part of the game
  });

  it('is deterministic for a given seed', () => {
    const a = horizontal(0, 0x4242);
    const b = horizontal(0, 0x4242);
    const sidesA: number[] = [];
    const sidesB: number[] = [];
    for (let i = 0; i < 50; i++) {
      spawnPiece(a);
      sidesA.push(a.well);
      spawnPiece(b);
      sidesB.push(b.well);
    }
    expect(sidesA).toEqual(sidesB);
  });
});

describe('well independence', () => {
  it('a piece locks only into its own well', () => {
    const g = horizontal();
    g.next = 3; // O
    forceNextSide(g, 1);
    spawnPiece(g);
    expect(g.well).toBe(1);
    g.piece = { id: 3, rot: 0, x: 5, y: 18 };
    g.gravityCounter = 999;
    tick(g, IDLE); // lock in well 1
    expect(g.wells[1][19 * WIDTH + 5]).toBe(4);
    expect(Array.from(g.wells[0]).every((c) => c === 0)).toBe(true);
  });

  it('a clear in one well leaves the other well untouched', () => {
    const g = horizontal();
    g.wells[0][19 * WIDTH + 7] = 5; // bystander cells in the left well
    g.wells[0][10 * WIDTH + 3] = 5;
    g.next = 3;
    forceNextSide(g, 1);
    spawnPiece(g);
    fillRow(g, 19, [4, 5], 1);
    g.piece = { id: 3, rot: 0, x: 5, y: 18 };
    g.gravityCounter = 999;
    tick(g, IDLE);
    expect(g.phase).toBe('clearing');
    tickN(g, 20);
    expect(g.lines).toBe(1);
    expect(g.wells[0][19 * WIDTH + 7]).toBe(5); // left well exactly as it was
    expect(g.wells[0][10 * WIDTH + 3]).toBe(5);
  });
});

describe('shared fate', () => {
  it('score, lines and level accumulate across both wells', () => {
    const g = horizontal();
    for (const well of [0, 1] as const) {
      g.next = 3;
      forceNextSide(g, well);
      spawnPiece(g);
      fillRow(g, 19, [4, 5], well);
      g.piece = { id: 3, rot: 0, x: 5, y: 18 };
      g.gravityCounter = 999;
      tick(g, IDLE);
      tickN(g, 20);
    }
    expect(g.lines).toBe(2); // one clear per well, one shared counter
    expect(g.score).toBe(80); // 40 x (0+1), twice
  });

  it('a blocked spawn on either side ends the whole game', () => {
    const g = horizontal();
    g.wells[1][1 * WIDTH + 5] = 1; // right well's seam is contaminated
    g.next = 0; // T spawn occupies (5,1)
    forceNextSide(g, 1);
    spawnPiece(g);
    expect(g.phase).toBe('gameover'); // left well being empty does not save you
  });
});
