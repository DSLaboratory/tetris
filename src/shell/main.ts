// The shell: a fixed-timestep loop at the NES's 60.0988Hz, independent of
// the display's refresh rate. requestAnimationFrame draws; the accumulator
// decides how many game frames have actually elapsed.

import { createGame, tick, Game } from '../core/game';
import { FRAME_RATE } from '../core/tables';
import { Keyboard, classicFrame, horizontalFrame, mergeRaw, RawInput, Button } from './input';
import { GamepadInput } from './gamepad';
import {
  renderGame, renderHorizontal, renderMenu, Mode,
  CANVAS_W, CANVAS_H, H_CANVAS_W, H_CANVAS_H,
} from './render';

const STEP_MS = 1000 / FRAME_RATE;
const MAX_STEPS_PER_FRAME = 8; // don't spiral after a background tab stall

const NO_BUTTONS: Record<Button, boolean> = { up: false, down: false, left: false, right: false, cw: false, ccw: false, start: false };

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const keyboard = new Keyboard();
const gamepad = new GamepadInput();

let screen: 'menu' | 'game' = 'menu';
let menuMode: Mode = 'classic';
let menuLevel = 0;
let game: Game | null = null;

function resize(): void {
  const horizontal = screen === 'game' && menuMode === 'horizontal';
  canvas.width = horizontal ? H_CANVAS_W : CANVAS_W;
  canvas.height = horizontal ? H_CANVAS_H : CANVAS_H;
}
resize();

function toggleMode(): void { menuMode = menuMode === 'classic' ? 'horizontal' : 'classic'; }
function levelDown(): void { menuLevel = Math.max(0, menuLevel - 1); }
function levelUp(): void { menuLevel = Math.min(9, menuLevel + 1); }

function startGame(): void {
  game = createGame(menuLevel, Date.now() & 0xffff, menuMode === 'horizontal' ? 2 : 1);
  // Discard the start edge on both devices so it doesn't pause/act on frame 1.
  keyboard.snapshot();
  gamepad.snapshot();
  screen = 'game';
  resize();
}

// Controller-debug overlay: backtick toggles a live readout of the connected
// pad (id / mapping / pressed button indices / axes) for diagnosing an SN30.
let showPadDebug = false;
window.addEventListener('keydown', (e) => { if (e.key === '`') showPadDebug = !showPadDebug; });

function drawPadDebug(): void {
  const info = gamepad.info();
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, canvas.width, 46);
  ctx.font = '11px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  if (!info) {
    ctx.fillStyle = '#ff8040';
    ctx.fillText('GAMEPAD: none - press a button on the pad', 6, 5);
    ctx.fillStyle = '#88aaff';
    ctx.fillText("if still none: hold Start+B (D-input mode), then reload", 6, 22);
  } else {
    ctx.fillStyle = '#80d0ff';
    ctx.fillText(`${info.id.slice(0, 40)}  [${info.mapping}]`, 6, 5);
    ctx.fillStyle = '#ffe040';
    ctx.fillText(`btn: ${info.buttonsDown.join(' ') || '-'}`, 6, 20);
    ctx.fillStyle = '#40e040';
    // show every NON-ZERO axis with its index, so a d-pad-on-a-hat (e.g. axes[9])
    // is visible — not just the first few axes.
    const liveAx = info.axes
      .map((v, i) => ({ v, i }))
      .filter((o) => Math.abs(o.v) > 0.15)
      .map((o) => `${o.i}:${o.v}`)
      .join('  ');
    ctx.fillText(`ax: ${liveAx || '(all 0)'}`, 6, 33);
  }
  ctx.restore();
}

window.addEventListener('keydown', (e) => {
  if (screen !== 'menu') return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') toggleMode();
  else if (e.key === 'ArrowLeft') levelDown();
  else if (e.key === 'ArrowRight') levelUp();
  else if (/^[0-9]$/.test(e.key)) menuLevel = Number(e.key);
  else if (e.key === 'Enter') startGame();
});

let last = performance.now();
let acc = 0;

function loop(now: number): void {
  acc += Math.min(now - last, 250); // clamp huge gaps (tab switches)
  last = now;

  if (screen === 'game' && game) {
    let steps = 0;
    // Snapshot keyboard + gamepad ONCE this frame and reuse for catch-up steps,
    // exactly like the keyboard's own per-step edge behaviour: pressed edges
    // fire on the first step only; held repeats. On a 0-step frame we never
    // enter the loop, so we don't snapshot and never swallow an edge.
    let raw: RawInput = { held: NO_BUTTONS, pressed: NO_BUTTONS };
    while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      if (steps === 0) {
        raw = mergeRaw(keyboard.snapshot(), gamepad.snapshot());
      } else {
        // Catch-up step: keep held flags, drop the (already-consumed) edges.
        raw = { held: raw.held, pressed: { ...NO_BUTTONS } };
      }
      const input = menuMode === 'horizontal' ? horizontalFrame(raw, game.well) : classicFrame(raw);
      tick(game, input);
      if (game.phase === 'gameover' && input.startPressed) {
        screen = 'menu';
        resize();
        break;
      }
      acc -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  } else {
    acc = Math.min(acc, STEP_MS);
    // Menu: the gamepad mirrors the keydown handler, on pressed-edges only.
    const pad = gamepad.snapshot().pressed;
    if (pad.up || pad.down) toggleMode();
    if (pad.left) levelDown();
    if (pad.right) levelUp();
    if (pad.start) startGame();
  }

  if (screen === 'game' && game) {
    if (menuMode === 'horizontal') renderHorizontal(ctx, game);
    else renderGame(ctx, game);
  } else {
    renderMenu(ctx, menuLevel, menuMode);
  }

  if (showPadDebug) drawPadDebug();

  requestAnimationFrame(loop);
}

// Dev hook for headless verification (harmless in production).
(window as unknown as { __dbg?: () => unknown }).__dbg = () => ({
  screen, menuMode, menuLevel, phase: game?.phase, paused: game?.paused,
});

requestAnimationFrame(loop);
