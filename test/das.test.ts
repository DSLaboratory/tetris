import { describe, expect, it } from 'vitest';
import { createGame, tick } from '../src/core/game';
import { IDLE, mkInput, tickN } from './helpers';

const HOLD_RIGHT = mkInput({ rightHeld: true });
const PRESS_RIGHT = mkInput({ rightPressed: true, rightHeld: true });
const HOLD_DOWN = mkInput({ downHeld: true });

describe('DAS (16 / 6)', () => {
  it('press moves immediately; first repeat after 16 frames; then every 6', () => {
    const g = createGame(0); // level 0: gravity is slow enough to ignore
    g.piece = { id: 0, rot: 0, x: 2, y: 5 };

    tick(g, PRESS_RIGHT);
    expect(g.piece!.x).toBe(3); // immediate shift on the press

    tickN(g, 15, HOLD_RIGHT);
    expect(g.piece!.x).toBe(3); // still waiting out the initial delay
    tick(g, HOLD_RIGHT);
    expect(g.piece!.x).toBe(4); // frame 16 of holding: first auto-shift

    tickN(g, 5, HOLD_RIGHT);
    expect(g.piece!.x).toBe(4);
    tick(g, HOLD_RIGHT);
    expect(g.piece!.x).toBe(5); // and every 6 frames after that
  });

  it('a blocked auto-shift leaves DAS fully charged (wall charge)', () => {
    const g = createGame(0);
    g.piece = { id: 0, rot: 0, x: 8, y: 5 }; // T flat against the right wall
    tickN(g, 40, HOLD_RIGHT);
    expect(g.piece!.x).toBe(8);
    expect(g.das).toBe(16); // parked at full charge, ready to fire
  });

  it('a charged DAS carries to the next piece: it shifts on its first frame', () => {
    const g = createGame(0); // gravity 48: the charge completes before the lock
    g.piece = { id: 3, rot: 0, x: 9, y: 18 }; // O against the right wall, on the floor
    const prev = g.piece;
    // Hold right through the lock and the ARE; stop when the next piece spawns.
    for (let i = 0; i < 80 && (g.piece === prev || g.piece === null); i++) tick(g, HOLD_RIGHT);
    expect(g.piece).not.toBe(prev); // a new piece spawned
    expect(g.piece!.x).toBe(5);
    tick(g, HOLD_RIGHT);
    expect(g.piece!.x).toBe(6); // charged DAS fired on the very first frame
  });

  it('holding Down suppresses horizontal movement entirely', () => {
    const g = createGame(0);
    g.piece = { id: 0, rot: 0, x: 5, y: 5 };
    g.downLocked = false;
    tickN(g, 10, mkInput({ downHeld: true, leftHeld: true, leftPressed: true }));
    expect(g.piece!.x).toBe(5); // never shifted
    expect(g.piece!.y).toBeGreaterThan(5); // but it did soft-drop
  });
});

describe('soft drop', () => {
  it('moves one row every 2 frames and awards pushdown points on lock', () => {
    const g = createGame(0);
    g.piece = { id: 3, rot: 0, x: 5, y: 0 }; // O from the top
    tick(g, IDLE); // release Down so the spawn lock clears
    tickN(g, 36, HOLD_DOWN); // 18 rows x 2 frames
    expect(g.piece!.y).toBe(18); // on the floor
    tickN(g, 2, HOLD_DOWN); // next soft-drop attempt fails -> lock
    expect(g.score).toBe(18); // 1 point per row of the final descent
  });

  it('releasing Down forfeits accumulated pushdown points', () => {
    const g = createGame(0);
    g.piece = { id: 3, rot: 0, x: 5, y: 0 };
    tick(g, IDLE);
    tickN(g, 20, HOLD_DOWN); // 10 rows down
    expect(g.pushdown).toBe(10);
    tick(g, IDLE); // let go
    expect(g.pushdown).toBe(0);
  });

  it('Down held through a spawn does NOT slam the next piece', () => {
    const g = createGame(0);
    g.piece = { id: 3, rot: 0, x: 5, y: 18 }; // on the floor
    g.downLocked = false;
    tickN(g, 2, HOLD_DOWN); // soft-drop fails -> lock; Down still held
    tickN(g, 10, HOLD_DOWN); // ride out the ARE
    expect(g.piece!.y).toBe(0); // fresh piece
    tickN(g, 10, HOLD_DOWN);
    expect(g.piece!.y).toBe(0); // gravity (48f) governs; soft drop is locked out
    tick(g, IDLE); // release
    tickN(g, 2, HOLD_DOWN); // re-press
    expect(g.piece!.y).toBe(1); // now it soft-drops again
  });
});
