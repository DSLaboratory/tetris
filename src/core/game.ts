// The core game machine. Pure logic, no DOM: one tick = one NTSC frame.

import {
  PieceId, cellsOf, rotateCw, rotateCcw, SPAWN_X, SPAWN_Y,
} from './pieces';
import { gravityFrames } from './tables';
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

export type Phase = 'falling' | 'gameover';

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
  gravityCounter: number;
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
    gravityCounter: 0,
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

  // Only rows touched by the piece can have completed.
  const rows = [...new Set(cellsOf(p.id, p.rot).map(([, dy]) => p.y + dy))];
  const full = rows
    .filter((r) => r >= 0 && r < HEIGHT)
    .filter((r) => {
      for (let x = 0; x < WIDTH; x++) if (!g.board[r * WIDTH + x]) return false;
      return true;
    })
    .sort((a, b) => a - b);

  for (const r of full) {
    g.board.copyWithin(WIDTH, 0, r * WIDTH); // shift everything above down a row
    g.board.fill(0, 0, WIDTH);
  }

  spawnPiece(g);
}

export function tick(g: Game, input: InputFrame): void {
  if (g.phase === 'gameover') return;

  if (input.startPressed) g.paused = !g.paused;
  if (g.paused) return;

  // Rotation: edge-triggered, one step per press, no auto-repeat.
  if (input.ccwPressed) tryRotate(g, rotateCcw(g.piece!.id, g.piece!.rot));
  if (input.cwPressed) tryRotate(g, rotateCw(g.piece!.id, g.piece!.rot));

  // Horizontal taps. (Held-key auto-shift - DAS - comes with the input commit.)
  if (input.leftPressed) tryMove(g, -1, 0);
  else if (input.rightPressed) tryMove(g, 1, 0);

  // Gravity: the piece drops every gravityFrames(level) frames, and locks
  // on the tick it fails to drop. There is no separate lock-delay timer.
  g.gravityCounter++;
  if (g.gravityCounter >= gravityFrames(g.level)) {
    g.gravityCounter = 0;
    if (!tryMove(g, 0, 1)) lock(g);
  }
}
