// Canvas renderer. Deliberately plain: flat colours, wells, a HUD.
// Every mechanic is visible here; none of the 1989 presentation is.
//
// The horizontal renderer draws each well as a PURE ROTATION of well space
// (left well 90° clockwise, right well 90° counter-clockwise), so piece
// chirality is preserved and Z/X mean the same thing everywhere.

import { Game, WIDTH, HEIGHT } from '../core/game';
import { cellsOf } from '../core/pieces';
import { CLEAR_FRAMES } from '../core/tables';

export const CELL = 28;
export const BOARD_X = 24;
export const BOARD_Y = 24;
export const CANVAS_W = 560;
export const CANVAS_H = BOARD_Y * 2 + HEIGHT * CELL;

export const H_CELL = 24;
export const H_CANVAS_W = BOARD_X * 2 + 2 * HEIGHT * H_CELL; // two 20-deep wells
export const H_CANVAS_H = BOARD_Y + WIDTH * H_CELL + 176;

const SIDEBAR_X = BOARD_X + WIDTH * CELL + 36;

// T J Z O S L I
const COLORS = ['#b14ae3', '#4361ee', '#ef3b4c', '#f5c518', '#28c76f', '#f77f1b', '#22c1dd'];

const BG = '#101014';
const WELL_BG = '#16161c';
const BORDER = '#3a3a46';
const SEAM = '#5a5a6a';
const TEXT = '#d8d8e0';
const DIM = '#7a7a88';

function cell(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size = 16, color = TEXT): void {
  ctx.fillStyle = color;
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(s, x, y);
}

function overlay(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lines: [string, number][]): void {
  ctx.fillStyle = 'rgba(16, 16, 20, 0.82)';
  ctx.fillRect(x, y, w, h);
  const cx = x + w / 2;
  let ty = y + h / 2 - (lines.length * 24) / 2;
  ctx.textAlign = 'center';
  for (const [s, size] of lines) {
    text(ctx, s, cx, ty, size);
    ty += size + 18;
  }
  ctx.textAlign = 'left';
}

// During the clear freeze, completed lines blank out in cell pairs from
// their center outward, one pair per 4 frames - the NES cadence.
function blankedCells(g: Game): Set<number> {
  const blanked = new Set<number>();
  if (g.phase !== 'clearing') return blanked;
  const elapsed = CLEAR_FRAMES - g.clearCounter;
  const pairs = Math.min(5, Math.floor(elapsed / 4) + 1);
  for (let i = 0; i < pairs; i++) {
    blanked.add(4 - i);
    blanked.add(5 + i);
  }
  return blanked;
}

/* ------------------------------- classic ------------------------------- */

function classicCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  cell(ctx, BOARD_X + x * CELL, BOARD_Y + y * CELL, CELL, color);
}

function drawClassicBoard(ctx: CanvasRenderingContext2D, g: Game): void {
  const blanked = blankedCells(g);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const v = g.wells[0][y * WIDTH + x];
      if (!v) continue;
      if (g.clearingRows.includes(y) && blanked.has(x)) continue;
      classicCell(ctx, x, y, COLORS[v - 1]);
    }
  }
  if (g.piece) {
    for (const [dx, dy] of cellsOf(g.piece.id, g.piece.rot)) {
      const y = g.piece.y + dy;
      if (y >= 0) classicCell(ctx, g.piece.x + dx, y, COLORS[g.piece.id]);
    }
  }
}

function drawClassicHud(ctx: CanvasRenderingContext2D, g: Game): void {
  const x = SIDEBAR_X;
  text(ctx, 'SCORE', x, 60, 14, DIM);
  text(ctx, String(g.score).padStart(6, '0'), x, 84, 22);
  text(ctx, 'LINES', x, 132, 14, DIM);
  text(ctx, String(g.lines).padStart(3, '0'), x, 156, 22);
  text(ctx, 'LEVEL', x, 204, 14, DIM);
  text(ctx, String(g.level).padStart(2, '0'), x, 228, 22);

  text(ctx, 'NEXT', x, 286, 14, DIM);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, 300, 5 * CELL, 4 * CELL);
  for (const [dx, dy] of cellsOf(g.next, 0)) {
    cell(ctx, x + (dx + 2) * CELL + CELL / 2, 300 + (dy + 1) * CELL + CELL / 2, CELL, COLORS[g.next]);
  }
}

export function renderGame(ctx: CanvasRenderingContext2D, g: Game): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = WELL_BG;
  ctx.fillRect(BOARD_X, BOARD_Y, WIDTH * CELL, HEIGHT * CELL);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(BOARD_X - 2, BOARD_Y - 2, WIDTH * CELL + 4, HEIGHT * CELL + 4);

  // The NES hides the playfield while paused - no free planning time.
  if (g.paused) {
    overlay(ctx, BOARD_X, BOARD_Y, WIDTH * CELL, HEIGHT * CELL, [['PAUSE', 28], ['ENTER TO RESUME', 13]]);
    drawClassicHud(ctx, g);
    return;
  }

  drawClassicBoard(ctx, g);
  drawClassicHud(ctx, g);

  if (g.phase === 'gameover') {
    overlay(ctx, BOARD_X, BOARD_Y, WIDTH * CELL, HEIGHT * CELL,
      [['GAME OVER', 28], [`SCORE ${String(g.score).padStart(6, '0')}`, 16], ['ENTER FOR MENU', 13]]);
  }
}

/* ----------------------------- horizontal ------------------------------ */

const H_BOARD_W = 2 * HEIGHT * H_CELL;
const H_BOARD_H = WIDTH * H_CELL;

// Well space -> screen cell. Left well rotated 90° CW, right well 90° CCW;
// both spawn rows (well y = 0) land on the seam in the middle.
function hScreen(well: number, wx: number, wy: number): [number, number] {
  return well === 0 ? [HEIGHT - 1 - wy, wx] : [HEIGHT + wy, WIDTH - 1 - wx];
}

function hCell(ctx: CanvasRenderingContext2D, col: number, row: number, color: string): void {
  cell(ctx, BOARD_X + col * H_CELL, BOARD_Y + row * H_CELL, H_CELL, color);
}

function drawHorizontalBoard(ctx: CanvasRenderingContext2D, g: Game): void {
  const blanked = blankedCells(g);
  for (let w = 0; w < 2; w++) {
    for (let wy = 0; wy < HEIGHT; wy++) {
      for (let wx = 0; wx < WIDTH; wx++) {
        const v = g.wells[w][wy * WIDTH + wx];
        if (!v) continue;
        if (w === g.well && g.clearingRows.includes(wy) && blanked.has(wx)) continue;
        const [col, row] = hScreen(w, wx, wy);
        hCell(ctx, col, row, COLORS[v - 1]);
      }
    }
  }
  if (g.piece) {
    for (const [dx, dy] of cellsOf(g.piece.id, g.piece.rot)) {
      const wy = g.piece.y + dy;
      if (wy < 0) continue;
      const [col, row] = hScreen(g.well, g.piece.x + dx, wy);
      hCell(ctx, col, row, COLORS[g.piece.id]);
    }
  }
}

function drawHorizontalHud(ctx: CanvasRenderingContext2D, g: Game): void {
  const y = BOARD_Y + H_BOARD_H + 44;
  text(ctx, 'SCORE', BOARD_X, y, 14, DIM);
  text(ctx, String(g.score).padStart(6, '0'), BOARD_X, y + 26, 22);
  text(ctx, 'LINES', BOARD_X + 180, y, 14, DIM);
  text(ctx, String(g.lines).padStart(3, '0'), BOARD_X + 180, y + 26, 22);
  text(ctx, 'LEVEL', BOARD_X + 320, y, 14, DIM);
  text(ctx, String(g.level).padStart(2, '0'), BOARD_X + 320, y + 26, 22);

  // Next preview: the piece only, drawn in a NEUTRAL orientation. Its side
  // is rolled at spawn and deliberately not shown - guessing the front is
  // part of the game.
  const boxX = BOARD_X + 460;
  const boxY = y - 14;
  text(ctx, 'NEXT', boxX, y, 14, DIM);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 60, boxY, 5 * H_CELL, 4 * H_CELL);
  for (const [dx, dy] of cellsOf(g.next, 0)) {
    cell(ctx, boxX + 60 + (dx + 2) * H_CELL + H_CELL / 2, boxY + (dy + 1) * H_CELL + H_CELL / 2, H_CELL, COLORS[g.next]);
  }
}

export function renderHorizontal(ctx: CanvasRenderingContext2D, g: Game): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, H_CANVAS_W, H_CANVAS_H);
  ctx.fillStyle = WELL_BG;
  ctx.fillRect(BOARD_X, BOARD_Y, H_BOARD_W, H_BOARD_H);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(BOARD_X - 2, BOARD_Y - 2, H_BOARD_W + 4, H_BOARD_H + 4);

  if (g.paused) {
    overlay(ctx, BOARD_X, BOARD_Y, H_BOARD_W, H_BOARD_H, [['PAUSE', 28], ['ENTER TO RESUME', 13]]);
    drawHorizontalHud(ctx, g);
    return;
  }

  // The seam: where pieces spawn, and where both stacks must never reach.
  ctx.strokeStyle = SEAM;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(BOARD_X + HEIGHT * H_CELL, BOARD_Y);
  ctx.lineTo(BOARD_X + HEIGHT * H_CELL, BOARD_Y + H_BOARD_H);
  ctx.stroke();
  ctx.setLineDash([]);

  drawHorizontalBoard(ctx, g);
  drawHorizontalHud(ctx, g);

  if (g.phase === 'gameover') {
    overlay(ctx, BOARD_X, BOARD_Y, H_BOARD_W, H_BOARD_H,
      [['GAME OVER', 28], [`SCORE ${String(g.score).padStart(6, '0')}`, 16], ['ENTER FOR MENU', 13]]);
  }
}

/* -------------------------------- menu --------------------------------- */

export type Mode = 'classic' | 'horizontal';

export function renderMenu(ctx: CanvasRenderingContext2D, level: number, mode: Mode): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const cx = CANVAS_W / 2;
  ctx.textAlign = 'center';
  text(ctx, 'TETRIS', cx, 150, 52);
  text(ctx, 'NES mechanics, as they were', cx, 185, 14, DIM);
  text(ctx, `MODE   ${mode === 'classic' ? '· CLASSIC ·' : '· HORIZONTAL ·'}`, cx, 280, 18);
  text(ctx, '(up/down to change)', cx, 304, 12, DIM);
  text(ctx, `LEVEL  <  ${level}  >`, cx, 360, 22);
  text(ctx, 'ENTER TO START', cx, 410, 16);
  const controls = mode === 'classic'
    ? 'ARROWS MOVE/DROP   Z CCW   X CW   ENTER PAUSE'
    : 'UP/DOWN MOVE   LEFT/RIGHT DROP TOWARD WALL   Z/X ROTATE';
  text(ctx, controls, cx, 500, 13, DIM);
  ctx.textAlign = 'left';
}
