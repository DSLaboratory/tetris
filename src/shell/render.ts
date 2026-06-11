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
const ACCENT = '#6cb6ff'; // the selected menu row / live thing
const GREEN = '#28c76f';  // a bound / confirmed value in the config screen

// Two-player (versus) layout: two FULL-SIZE classic wells (same cell as classic),
// back to back, each player's NEXT preview on their OUTER side (P1 left, P2 right).
export const V_CELL = CELL;        // same size as classic mode
const V_WELL_W = WIDTH * V_CELL;   // 280
const V_WELL_H = HEIGHT * V_CELL;  // 560
const V_MARGIN = 20;
const V_NEXT_W = 96;               // outer NEXT-preview column per player
const V_TOP = 48;                  // room above a well for the PLAYER label
const V_GAP = 128;                 // generous space between the two wells
const V_HUD_H = 96;                // compact HUD below each well
export const V_CANVAS_W = V_MARGIN * 2 + V_NEXT_W * 2 + V_WELL_W * 2 + V_GAP; // 920
export const V_CANVAS_H = V_TOP + V_WELL_H + V_HUD_H + 16;                    // 720

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

// A pause / game-over overlay with selectable rows; the shell owns the cursor.
export interface OverlayMenu {
  title: string;
  note?: string;        // e.g. the final score
  options: string[];    // e.g. RESUME / RESTART / MAIN MENU
  sel: number;
  hideBoard?: boolean;  // pause hides the playfield (NES style); game-over shows it
}

function drawOverlayMenu(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ov: OverlayMenu): void {
  ctx.fillStyle = 'rgba(16, 16, 20, 0.9)';
  ctx.fillRect(x, y, w, h);
  const cx = x + w / 2;
  ctx.textAlign = 'center';
  const blockH = 36 + (ov.note ? 26 : 0) + 12 + ov.options.length * 34;
  let ty = y + (h - blockH) / 2 + 26;
  text(ctx, ov.title, cx, ty, 28, /WIN/.test(ov.title) ? ACCENT : TEXT);
  ty += ov.note ? 24 : 36;
  if (ov.note) { text(ctx, ov.note, cx, ty, 14, DIM); ty += 30; }
  ty += 8;
  ov.options.forEach((opt, i) => {
    const oy = ty + i * 34;
    const on = i === ov.sel;
    if (on) { ctx.fillStyle = 'rgba(108,182,255,0.12)'; ctx.fillRect(cx - 120, oy - 19, 240, 28); }
    text(ctx, opt, cx, oy, 18, on ? ACCENT : DIM);
  });
  text(ctx, 'UP / DOWN   ·   START SELECT', cx, y + h - 22, 11, DIM);
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

export function renderGame(ctx: CanvasRenderingContext2D, g: Game, ov?: OverlayMenu): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = WELL_BG;
  ctx.fillRect(BOARD_X, BOARD_Y, WIDTH * CELL, HEIGHT * CELL);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(BOARD_X - 2, BOARD_Y - 2, WIDTH * CELL + 4, HEIGHT * CELL + 4);

  if (!ov?.hideBoard) drawClassicBoard(ctx, g); // pause hides the board (NES style)
  drawClassicHud(ctx, g);
  if (ov) drawOverlayMenu(ctx, BOARD_X, BOARD_Y, WIDTH * CELL, HEIGHT * CELL, ov);
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

export function renderHorizontal(ctx: CanvasRenderingContext2D, g: Game, ov?: OverlayMenu): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, H_CANVAS_W, H_CANVAS_H);
  ctx.fillStyle = WELL_BG;
  ctx.fillRect(BOARD_X, BOARD_Y, H_BOARD_W, H_BOARD_H);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(BOARD_X - 2, BOARD_Y - 2, H_BOARD_W + 4, H_BOARD_H + 4);

  if (!ov?.hideBoard) {
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
  }
  drawHorizontalHud(ctx, g);
  if (ov) drawOverlayMenu(ctx, BOARD_X, BOARD_Y, H_BOARD_W, H_BOARD_H, ov);
}

/* ------------------------------- versus -------------------------------- */

// One player's panel in two-player mode: a PLAYER label, a compact well, and a
// small HUD below, drawn at horizontal offset `ox`. Same rules, smaller cells.
function drawVersusPlayer(ctx: CanvasRenderingContext2D, g: Game, ox: number, nextX: number, label: string): void {
  const oy = V_TOP;
  ctx.textAlign = 'center';
  text(ctx, label, ox + V_WELL_W / 2, oy - 16, 16, DIM);
  ctx.textAlign = 'left';

  ctx.fillStyle = WELL_BG;
  ctx.fillRect(ox, oy, V_WELL_W, V_WELL_H);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - 2, oy - 2, V_WELL_W + 4, V_WELL_H + 4);

  const blanked = blankedCells(g);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const v = g.wells[0][y * WIDTH + x];
      if (!v) continue;
      if (g.clearingRows.includes(y) && blanked.has(x)) continue;
      cell(ctx, ox + x * V_CELL, oy + y * V_CELL, V_CELL, COLORS[v - 1]);
    }
  }
  if (g.piece) {
    for (const [dx, dy] of cellsOf(g.piece.id, g.piece.rot)) {
      const y = g.piece.y + dy;
      if (y >= 0) cell(ctx, ox + (g.piece.x + dx) * V_CELL, oy + y * V_CELL, V_CELL, COLORS[g.piece.id]);
    }
  }

  // HUD below the well: score / level / lines (NEXT now lives on the outer side).
  const hy = oy + V_WELL_H + 30;
  text(ctx, `SCORE ${String(g.score).padStart(6, '0')}`, ox, hy, 16);
  text(ctx, `LEVEL ${String(g.level).padStart(2, '0')}`, ox, hy + 28, 14, DIM);
  text(ctx, `LINES ${String(g.lines).padStart(3, '0')}`, ox + 116, hy + 28, 14, DIM);

  // NEXT box on the player's OUTER side, near the top of the well; piece centred.
  const NC = 16;
  const ny = oy + 26;
  text(ctx, 'NEXT', nextX + 4, ny - 8, 12, DIM);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(nextX, ny, 5 * NC, 4 * NC);
  const cells = cellsOf(g.next, 0);
  const xs = cells.map(([dx]) => dx);
  const pcx = (Math.min(...xs) + Math.max(...xs)) / 2; // centre the piece in the box
  for (const [dx, dy] of cells) {
    cell(ctx, nextX + (dx - pcx + 2) * NC, ny + (dy + 1) * NC, NC, COLORS[g.next]);
  }
}

export function renderVersus(ctx: CanvasRenderingContext2D, g1: Game, g2: Game, ov?: OverlayMenu): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, V_CANVAS_W, V_CANVAS_H);
  const p1Well = V_MARGIN + V_NEXT_W;              // P1 well, NEXT to its left
  const p2Well = p1Well + V_WELL_W + V_GAP;        // P2 well, NEXT to its right
  drawVersusPlayer(ctx, g1, p1Well, V_MARGIN + 4, 'PLAYER 1');
  drawVersusPlayer(ctx, g2, p2Well, p2Well + V_WELL_W + 8, 'PLAYER 2');
  if (ov) drawOverlayMenu(ctx, 0, 0, V_CANVAS_W, V_CANVAS_H, ov);
}

/* -------------------------------- menu --------------------------------- */

export type Mode = 'classic' | 'horizontal' | 'versus';
const MODE_LABEL: Record<Mode, string> = { classic: 'CLASSIC', horizontal: 'HORIZONTAL', versus: '2-PLAYER' };

// The menu's selectable rows, in order; the shell owns the cursor (`sel`).
export const MENU_ROWS = ['mode', 'level', 'config1', 'config2', 'start'] as const;
export type MenuRow = typeof MENU_ROWS[number];

export function renderMenu(ctx: CanvasRenderingContext2D, sel: number, mode: Mode, level: number): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const cx = CANVAS_W / 2;
  ctx.textAlign = 'center';
  text(ctx, 'TETRIS', cx, 116, 52);
  text(ctx, 'NES mechanics, as they were', cx, 148, 14, DIM);

  const rows: [string, string][] = [
    ['MODE', `< ${MODE_LABEL[mode]} >`],
    ['LEVEL', `< ${level} >`],
    ['', 'CONFIGURE P1 PAD'],
    ['', 'CONFIGURE P2 PAD'],
    ['', 'START'],
  ];
  const top = 222;
  const gap = 46;
  rows.forEach(([label, value], i) => {
    const y = top + i * gap;
    const on = i === sel;
    if (on) {
      ctx.fillStyle = 'rgba(108,182,255,0.10)';
      ctx.fillRect(cx - 210, y - 24, 420, 36);
    }
    const color = on ? ACCENT : TEXT;
    if (label) {
      ctx.textAlign = 'left';
      text(ctx, label, cx - 188, y, 18, on ? ACCENT : DIM);
      ctx.textAlign = 'right';
      text(ctx, value, cx + 188, y, 20, color);
    } else {
      ctx.textAlign = 'center';
      text(ctx, value, cx, y, 20, color);
    }
    ctx.textAlign = 'center';
  });

  const settingRow = sel === 0 || sel === 1;
  text(ctx, settingRow ? 'UP/DOWN MOVE   LEFT/RIGHT CHANGE   ENTER SELECT' : 'UP/DOWN MOVE   ENTER SELECT',
    cx, CANVAS_H - 64, 13, DIM);
  const controls = mode === 'horizontal'
    ? 'PLAY: UP/DOWN MOVE · LEFT/RIGHT DROP · Z/X ROTATE'
    : mode === 'versus'
      ? 'P1: ARROWS + Z/X     P2: WASD + Q/E     (or two gamepads)'
      : 'PLAY: ARROWS MOVE/DROP · Z CCW · X CW · ENTER PAUSE';
  text(ctx, controls, cx, CANVAS_H - 40, 12, DIM);
  ctx.textAlign = 'left';
}

/* --------------------------- gamepad config ---------------------------- */

export interface ConfigRow { label: string; value: string; state: 'done' | 'current' | 'pending'; }

// The per-pad bind walkthrough. Presentation only — main.ts owns the capture flow
// and hands this plain strings, so render.ts keeps reading nothing it shouldn't.
export function renderConfig(
  ctx: CanvasRenderingContext2D,
  player: number, connected: boolean, rows: ConfigRow[], prompt: string, hint: string,
): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const cx = CANVAS_W / 2;
  ctx.textAlign = 'center';
  text(ctx, `CONFIGURE PLAYER ${player} PAD`, cx, 64, 22);

  if (!connected) {
    text(ctx, 'Connect player ' + player + "'s controller", cx, 220, 17);
    text(ctx, 'and press any button to begin', cx, 248, 13, DIM);
    text(ctx, hint, cx, CANVAS_H - 40, 12, DIM);
    ctx.textAlign = 'left';
    return;
  }

  text(ctx, prompt, cx, 104, 18, ACCENT);

  const top = 152;
  const gap = 40;
  const colX = cx - 170;
  const colW = 340;
  rows.forEach((row, i) => {
    const y = top + i * gap;
    if (row.state === 'current') {
      ctx.fillStyle = 'rgba(108,182,255,0.10)';
      ctx.fillRect(colX - 12, y - 20, colW + 24, 30);
    }
    const labelColor = row.state === 'current' ? ACCENT : row.state === 'pending' ? DIM : TEXT;
    const valueColor = row.state === 'current' ? ACCENT : row.state === 'done' ? GREEN : DIM;
    ctx.textAlign = 'left';
    text(ctx, row.label, colX, y, 15, labelColor);
    ctx.textAlign = 'right';
    text(ctx, row.value, colX + colW, y, 15, valueColor);
  });

  ctx.textAlign = 'center';
  text(ctx, hint, cx, CANVAS_H - 40, 12, DIM);
  ctx.textAlign = 'left';
}
