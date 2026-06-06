// Canvas renderer. Deliberately plain: flat colours, a well, a HUD.
// Every 1989 mechanic is visible here; none of the 1989 presentation is.

import { Game, WIDTH, HEIGHT } from '../core/game';
import { cellsOf, PieceId } from '../core/pieces';
import { CLEAR_FRAMES } from '../core/tables';

export const CELL = 28;
export const BOARD_X = 24;
export const BOARD_Y = 24;
export const CANVAS_W = 560;
export const CANVAS_H = BOARD_Y * 2 + HEIGHT * CELL;

const SIDEBAR_X = BOARD_X + WIDTH * CELL + 36;

// T J Z O S L I
const COLORS = ['#b14ae3', '#4361ee', '#ef3b4c', '#f5c518', '#28c76f', '#f77f1b', '#22c1dd'];

const BG = '#101014';
const WELL_BG = '#16161c';
const BORDER = '#3a3a46';
const TEXT = '#d8d8e0';
const DIM = '#7a7a88';

function cell(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
}

function boardCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  cell(ctx, BOARD_X + x * CELL, BOARD_Y + y * CELL, color);
}

function drawWell(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = WELL_BG;
  ctx.fillRect(BOARD_X, BOARD_Y, WIDTH * CELL, HEIGHT * CELL);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(BOARD_X - 2, BOARD_Y - 2, WIDTH * CELL + 4, HEIGHT * CELL + 4);
}

function drawBoard(ctx: CanvasRenderingContext2D, g: Game): void {
  // During the clear freeze, completed rows blank out in column pairs from
  // the center outward, one pair per 4 frames - the NES cadence.
  const blanked = new Set<number>();
  if (g.phase === 'clearing') {
    const elapsed = CLEAR_FRAMES - g.clearCounter;
    const pairs = Math.min(5, Math.floor(elapsed / 4) + 1);
    for (let i = 0; i < pairs; i++) {
      blanked.add(4 - i);
      blanked.add(5 + i);
    }
  }
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const v = g.board[y * WIDTH + x];
      if (!v) continue;
      if (g.phase === 'clearing' && g.clearingRows.includes(y) && blanked.has(x)) continue;
      boardCell(ctx, x, y, COLORS[v - 1]);
    }
  }
  if (g.piece) {
    for (const [dx, dy] of cellsOf(g.piece.id, g.piece.rot)) {
      const x = g.piece.x + dx;
      const y = g.piece.y + dy;
      if (y >= 0) boardCell(ctx, x, y, COLORS[g.piece.id]);
    }
  }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size = 16, color = TEXT): void {
  ctx.fillStyle = color;
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(s, x, y);
}

function drawHud(ctx: CanvasRenderingContext2D, g: Game): void {
  const x = SIDEBAR_X;
  text(ctx, 'SCORE', x, 60, 14, DIM);
  text(ctx, String(g.score).padStart(6, '0'), x, 84, 22);
  text(ctx, 'LINES', x, 132, 14, DIM);
  text(ctx, String(g.lines).padStart(3, '0'), x, 156, 22);
  text(ctx, 'LEVEL', x, 204, 14, DIM);
  text(ctx, String(g.level).padStart(2, '0'), x, 228, 22);

  text(ctx, 'NEXT', x, 286, 14, DIM);
  const boxX = x;
  const boxY = 300;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, 5 * CELL, 4 * CELL);
  for (const [dx, dy] of cellsOf(g.next, 0)) {
    cell(ctx, boxX + (dx + 2) * CELL + CELL / 2, boxY + (dy + 1) * CELL + CELL / 2, COLORS[g.next]);
  }
}

function overlay(ctx: CanvasRenderingContext2D, lines: [string, number][]): void {
  ctx.fillStyle = 'rgba(16, 16, 20, 0.82)';
  ctx.fillRect(BOARD_X, BOARD_Y, WIDTH * CELL, HEIGHT * CELL);
  const cx = BOARD_X + (WIDTH * CELL) / 2;
  let y = BOARD_Y + 220;
  ctx.textAlign = 'center';
  for (const [s, size] of lines) {
    text(ctx, s, cx, y, size);
    y += size + 18;
  }
  ctx.textAlign = 'left';
}

export function renderGame(ctx: CanvasRenderingContext2D, g: Game): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawWell(ctx);

  // The NES hides the playfield while paused - no free planning time.
  if (g.paused) {
    overlay(ctx, [['PAUSE', 28], ['ENTER TO RESUME', 13]]);
    drawHud(ctx, g);
    return;
  }

  drawBoard(ctx, g);
  drawHud(ctx, g);

  if (g.phase === 'gameover') {
    overlay(ctx, [['GAME OVER', 28], [`SCORE ${String(g.score).padStart(6, '0')}`, 16], ['ENTER FOR MENU', 13]]);
  }
}

export function renderMenu(ctx: CanvasRenderingContext2D, level: number): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const cx = CANVAS_W / 2;
  ctx.textAlign = 'center';
  text(ctx, 'TETRIS', cx, 170, 52);
  text(ctx, 'NES mechanics, as they were', cx, 205, 14, DIM);
  text(ctx, `LEVEL  <  ${level}  >`, cx, 310, 22);
  text(ctx, 'ENTER TO START', cx, 360, 16);
  text(ctx, 'ARROWS MOVE/DROP   Z CCW   X CW   ENTER PAUSE', cx, 480, 13, DIM);
  ctx.textAlign = 'left';
}
