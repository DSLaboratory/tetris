// The core game machine. Pure logic, no DOM: one tick = one NTSC frame.

import {
  PieceId, cellsOf, rotateCw, rotateCcw, SPAWN_X, SPAWN_Y,
} from './pieces';
import {
  gravityFrames, scoreForLines, levelForLines, MAX_SCORE, CLEAR_FRAMES,
  SOFT_DROP_FRAMES, DAS_CHARGED, DAS_RELOAD, areFrames,
} from './tables';
import { Rng, DEFAULT_SEED } from './rng';

export const WIDTH = 10;
export const HEIGHT = 20;

// One frame of input, as the NES sees it: edges (pressed this frame)
// and levels (currently held).
export interface InputFrame {
  leftPressed: boolean;
  rightPressed: boolean;
  leftHeld: boolean;
  rightHeld: boolean;
  downHeld: boolean;
  cwPressed: boolean;
  ccwPressed: boolean;
  startPressed: boolean;
}

export type Phase = 'falling' | 'clearing' | 'are' | 'gameover';

export interface ActivePiece {
  id: PieceId;
  rot: number;
  x: number;
  y: number;
}

export interface Game {
  // Row-major 10x20; 0 = empty, otherwise pieceId + 1.
  board: Uint8Array;
  piece: ActivePiece | null;
  next: PieceId;
  phase: Phase;
  paused: boolean;
  startLevel: number;
  level: number;
  score: number;
  lines: number;
  gravityCounter: number;
  // DAS (delayed auto-shift): a fresh press moves immediately and zeroes
  // the counter; holding charges it 1/frame; at 16 the piece shifts and
  // the counter reloads to 10 (so repeats fire every 6 frames). A BLOCKED
  // shift leaves it at 16 - that is wall charging.
  das: number;
  // Soft drop: one row per 2 frames while Down is held. The pushdown
  // counter tracks rows of the current uninterrupted descent and is
  // awarded as points if the piece locks mid-drop; releasing Down resets it.
  softCounter: number;
  pushdown: number;
  // Down must be RELEASED after a spawn before soft drop applies again,
  // so holding Down through a lock cannot slam the next piece.
  downLocked: boolean;
  // Line clear freeze: play stops for CLEAR_FRAMES while the completed
  // rows blank out, exactly as the NES pauses during its clear animation.
  clearCounter: number;
  clearingRows: number[];
  // ARE (entry delay): 10-18 frames between lock and next spawn, set by
  // how low the piece locked. DAS keeps charging during it.
  areCounter: number;
  rng: Rng;
}

export function createGame(startLevel: number, seed: number = DEFAULT_SEED): Game {
  const rng = new Rng(seed);
  const game: Game = {
    board: new Uint8Array(WIDTH * HEIGHT),
    piece: null,
    next: rng.nextPiece() as PieceId,
    phase: 'falling',
    paused: false,
    startLevel,
    level: startLevel,
    score: 0,
    lines: 0,
    gravityCounter: 0,
    das: 0,
    softCounter: 0,
    pushdown: 0,
    downLocked: true,
    clearCounter: 0,
    clearingRows: [],
    areCounter: 0,
    rng,
  };
  spawnPiece(game);
  return game;
}

// A position collides if any cell is outside the well or on the stack.
// Cells above the top (y < 0) count as collisions: vertical rotations are
// simply not possible until the piece has fallen clear of the ceiling.
export function collides(board: Uint8Array, id: PieceId, rot: number, x: number, y: number): boolean {
  for (const [dx, dy] of cellsOf(id, rot)) {
    const cx = x + dx;
    const cy = y + dy;
    if (cx < 0 || cx >= WIDTH || cy < 0 || cy >= HEIGHT) return true;
    if (board[cy * WIDTH + cx]) return true;
  }
  return false;
}

export function spawnPiece(g: Game): void {
  const id = g.next;
  g.next = g.rng.nextPiece() as PieceId;
  g.piece = { id, rot: 0, x: SPAWN_X, y: SPAWN_Y };
  g.gravityCounter = 0;
  g.softCounter = 0;
  g.pushdown = 0;
  g.downLocked = true; // Down must be released before it soft-drops this piece
  g.phase = 'falling';
  if (collides(g.board, id, 0, SPAWN_X, SPAWN_Y)) {
    // Top out: the piece locks where it spawned and the game ends.
    writePiece(g);
    g.phase = 'gameover';
  }
}

function writePiece(g: Game): void {
  const p = g.piece!;
  for (const [dx, dy] of cellsOf(p.id, p.rot)) {
    const cy = p.y + dy;
    const cx = p.x + dx;
    if (cy >= 0 && cy < HEIGHT) g.board[cy * WIDTH + cx] = p.id + 1;
  }
}

function tryMove(g: Game, dx: number, dy: number): boolean {
  const p = g.piece!;
  if (collides(g.board, p.id, p.rot, p.x + dx, p.y + dy)) return false;
  p.x += dx;
  p.y += dy;
  return true;
}

function tryRotate(g: Game, rot: number): boolean {
  const p = g.piece!;
  if (collides(g.board, p.id, rot, p.x, p.y)) return false; // no kicks: it just fails
  p.rot = rot;
  return true;
}

function lock(g: Game): void {
  writePiece(g);
  const p = g.piece!;
  g.piece = null;

  // Pushdown points: rows of the final uninterrupted soft drop.
  g.score = Math.min(MAX_SCORE, g.score + g.pushdown);
  g.pushdown = 0;

  // Only rows touched by the piece can have completed.
  const rows = [...new Set(cellsOf(p.id, p.rot).map(([, dy]) => p.y + dy))];
  const full = rows
    .filter((r) => r >= 0 && r < HEIGHT)
    .filter((r) => {
      for (let x = 0; x < WIDTH; x++) if (!g.board[r * WIDTH + x]) return false;
      return true;
    })
    .sort((a, b) => a - b);

  // Entry delay depends on how low the piece locked (its lowest cell row).
  const lockRow = Math.max(...cellsOf(p.id, p.rot).map(([, dy]) => p.y + dy));
  g.areCounter = areFrames(lockRow);

  if (full.length > 0) {
    g.phase = 'clearing'; // ARE runs after the clear freeze
    g.clearCounter = CLEAR_FRAMES;
    g.clearingRows = full;
  } else {
    g.phase = 'are';
  }
}

function finishClear(g: Game): void {
  for (const r of g.clearingRows) {
    g.board.copyWithin(WIDTH, 0, r * WIDTH); // shift everything above down a row
    g.board.fill(0, 0, WIDTH);
  }
  const cleared = g.clearingRows.length;
  g.clearingRows = [];

  g.lines += cleared;
  // The NES levels up first and THEN scores, so points for a level-up
  // clear are multiplied by the NEW level + 1.
  g.level = Math.max(g.level, levelForLines(g.startLevel, g.lines));
  g.score = Math.min(MAX_SCORE, g.score + scoreForLines(cleared) * (g.level + 1));

  g.phase = 'are'; // areCounter was set at lock time
}

// With no live piece (clear freeze, ARE) there is nothing to shift, but the
// DAS counter still responds to the d-pad: a press zeroes it, holding
// charges it. Holding through ARE is how a charged piece flies at spawn.
function chargeDasDuringDelay(g: Game, input: InputFrame): void {
  if (input.leftPressed || input.rightPressed) g.das = 0;
  else if (input.leftHeld !== input.rightHeld) {
    if (g.das < DAS_CHARGED) g.das++;
  }
}

// Held left/right under DAS rules. The NES checks Down first and skips
// shifting entirely while it is held - you cannot shift and soft-drop
// at the same time.
function handleShift(g: Game, input: InputFrame): void {
  if (input.downHeld) return;

  if (input.leftPressed || input.rightPressed) {
    g.das = 0;
    tryMove(g, input.leftPressed ? -1 : 1, 0);
    return;
  }

  const dir = input.leftHeld === input.rightHeld ? 0 : input.leftHeld ? -1 : 1;
  if (dir === 0) return;

  if (g.das < DAS_CHARGED) g.das++;
  if (g.das >= DAS_CHARGED) {
    if (tryMove(g, dir, 0)) g.das = DAS_RELOAD;
    // else: the counter stays fully charged against the wall
  }
}

function handleDrop(g: Game, input: InputFrame): void {
  if (g.downLocked && !input.downHeld) g.downLocked = false;
  const softDropping = input.downHeld && !g.downLocked;

  if (softDropping) {
    g.gravityCounter = 0; // soft drop preempts gravity
    if (++g.softCounter >= SOFT_DROP_FRAMES) {
      g.softCounter = 0;
      if (tryMove(g, 0, 1)) g.pushdown++;
      else lock(g);
    }
    return;
  }

  g.softCounter = 0;
  g.pushdown = 0; // releasing Down forfeits accumulated pushdown points

  // Gravity: the piece drops every gravityFrames(level) frames, and locks
  // on the tick it fails to drop. There is no separate lock-delay timer.
  g.gravityCounter++;
  if (g.gravityCounter >= gravityFrames(g.level)) {
    g.gravityCounter = 0;
    if (!tryMove(g, 0, 1)) lock(g);
  }
}

export function tick(g: Game, input: InputFrame): void {
  if (g.phase === 'gameover') return;

  if (input.startPressed) g.paused = !g.paused;
  if (g.paused) return;

  if (g.phase === 'clearing') {
    chargeDasDuringDelay(g, input);
    if (--g.clearCounter <= 0) finishClear(g);
    return;
  }

  if (g.phase === 'are') {
    chargeDasDuringDelay(g, input);
    if (--g.areCounter <= 0) spawnPiece(g);
    return;
  }

  // Rotation: edge-triggered, one step per press, no auto-repeat.
  if (input.ccwPressed) tryRotate(g, rotateCcw(g.piece!.id, g.piece!.rot));
  if (input.cwPressed) tryRotate(g, rotateCw(g.piece!.id, g.piece!.rot));

  handleShift(g, input);
  handleDrop(g, input);
}
