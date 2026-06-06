import { describe, it, expect } from 'vitest';
import { createGame, spawnPiece, tick, WIDTH } from '../src/core/game';
import { mkInput, IDLE, tickN, fillRow } from './helpers';

describe('spawning', () => {
  it('pieces spawn at (5, 0) in orientation 0', () => {
    const g = createGame(0);
    expect(g.piece).toMatchObject({ rot: 0, x: 5, y: 0 });
    expect(g.next).toBeGreaterThanOrEqual(0);
    expect(g.next).toBeLessThanOrEqual(6);
  });
});

describe('horizontal movement', () => {
  it('a tap moves exactly one column', () => {
    const g = createGame(0);
    const x0 = g.piece!.x;
    tick(g, mkInput({ leftPressed: true, leftHeld: true }));
    expect(g.piece!.x).toBe(x0 - 1);
    tickN(g, 10); // releasing and waiting moves nothing further
    expect(g.piece!.x).toBe(x0 - 1);
  });

  it('movement into a wall fails silently', () => {
    const g = createGame(0);
    g.piece = { id: 0, rot: 0, x: 1, y: 5 }; // T flat: occupies x 0..2
    tick(g, mkInput({ leftPressed: true, leftHeld: true }));
    expect(g.piece!.x).toBe(1);
  });
});

describe('rotation (NRS: no wall kicks)', () => {
  it('rotates one step per press', () => {
    const g = createGame(0);
    g.piece = { id: 0, rot: 0, x: 5, y: 5 };
    tick(g, mkInput({ cwPressed: true }));
    expect(g.piece!.rot).toBe(1);
    tick(g, mkInput({ ccwPressed: true }));
    expect(g.piece!.rot).toBe(0);
  });

  it('a rotation blocked by the wall fails - the piece does not kick', () => {
    const g = createGame(0);
    // Vertical T hugging the left wall; rotating to spawn orientation
    // needs the column at x = -1, so it must fail and stay vertical.
    g.piece = { id: 0, rot: 1, x: 0, y: 5 };
    tick(g, mkInput({ ccwPressed: true }));
    expect(g.piece!.rot).toBe(1);
    tick(g, mkInput({ cwPressed: true })); // rot 2 needs x -1..1 as well
    expect(g.piece!.rot).toBe(1);
  });

  it('the I piece cannot go vertical while at the ceiling', () => {
    const g = createGame(0);
    g.piece = { id: 6, rot: 0, x: 5, y: 0 }; // vertical I would need y -2, -1
    tick(g, mkInput({ cwPressed: true }));
    expect(g.piece!.rot).toBe(0);
    g.piece.y = 2; // two rows down it fits
    tick(g, mkInput({ cwPressed: true }));
    expect(g.piece!.rot).toBe(1);
  });
});

describe('locking', () => {
  it('locks on the gravity tick that fails, not before', () => {
    const g = createGame(0);
    g.piece = { id: 3, rot: 0, x: 5, y: 18 }; // O resting on the floor
    g.gravityCounter = 0;
    tickN(g, 47);
    expect(g.piece).toMatchObject({ x: 5, y: 18 }); // still live
    tick(g, IDLE); // 48th frame: gravity fails -> lock
    expect(g.wells[0][19 * WIDTH + 5]).toBe(4); // O id 3 -> stored as 4
    expect(g.phase).toBe('are'); // entry delay before the next piece
    tickN(g, 10); // ARE for a bottom-row lock is 10 frames
    expect(g.piece).toMatchObject({ x: 5, y: 0 }); // next piece spawned
  });

  it('a resting piece can still slide before the gravity tick (floor slide)', () => {
    const g = createGame(0);
    g.piece = { id: 3, rot: 0, x: 5, y: 18 };
    g.gravityCounter = 0;
    tickN(g, 30);
    tick(g, mkInput({ leftPressed: true, leftHeld: true }));
    expect(g.piece!.x).toBe(4); // slid along the floor mid-gravity-window
  });

  it('clears a completed row and collapses the stack', () => {
    const g = createGame(0);
    fillRow(g, 19, [4, 5]);
    g.wells[0][18 * WIDTH + 0] = 2; // marker sitting on row 18
    g.piece = { id: 3, rot: 0, x: 5, y: 18 }; // O plugs the gap at 4,5
    g.gravityCounter = 47;
    tick(g, IDLE); // lock -> row 19 completes
    expect(g.phase).toBe('clearing');
    tickN(g, 20); // the clear freeze runs its 20 frames
    // Row 19 cleared; row 18 (marker + O top half) shifted down into it.
    expect(g.wells[0][19 * WIDTH + 0]).toBe(2);
    expect(g.wells[0][19 * WIDTH + 4]).toBe(4);
    expect(g.wells[0][19 * WIDTH + 5]).toBe(4);
    expect(Array.from(g.wells[0].slice(0, 19 * WIDTH)).every((c) => c === 0)).toBe(true);
  });
});

describe('top out', () => {
  it('game over when the spawned piece collides', () => {
    const g = createGame(0);
    g.wells[0][1 * WIDTH + 5] = 1; // T spawn occupies (5,1)
    g.next = 0; // force a T
    spawnPiece(g);
    expect(g.phase).toBe('gameover');
  });

  it('ticking after game over changes nothing', () => {
    const g = createGame(0);
    g.wells[0][1 * WIDTH + 5] = 1;
    g.next = 0;
    spawnPiece(g);
    const snapshot = Array.from(g.wells[0]);
    tickN(g, 10, mkInput({ leftPressed: true, leftHeld: true }));
    expect(Array.from(g.wells[0])).toEqual(snapshot);
  });
});

describe('pause', () => {
  it('start toggles pause and freezes gravity', () => {
    const g = createGame(9);
    tick(g, mkInput({ startPressed: true }));
    expect(g.paused).toBe(true);
    tickN(g, 20);
    expect(g.piece!.y).toBe(0);
    tick(g, mkInput({ startPressed: true }));
    expect(g.paused).toBe(false);
  });
});
