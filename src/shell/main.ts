// The shell: a fixed-timestep loop at the NES's 60.0988Hz, independent of
// the display's refresh rate. requestAnimationFrame draws; the accumulator
// decides how many game frames have actually elapsed.

import { createGame, tick, Game } from '../core/game';
import { FRAME_RATE } from '../core/tables';
import { Keyboard, classicFrame, horizontalFrame } from './input';
import {
  renderGame, renderHorizontal, renderMenu, Mode,
  CANVAS_W, CANVAS_H, H_CANVAS_W, H_CANVAS_H,
} from './render';

const STEP_MS = 1000 / FRAME_RATE;
const MAX_STEPS_PER_FRAME = 8; // don't spiral after a background tab stall

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const keyboard = new Keyboard();

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

window.addEventListener('keydown', (e) => {
  if (screen !== 'menu') return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    menuMode = menuMode === 'classic' ? 'horizontal' : 'classic';
  } else if (e.key === 'ArrowLeft') menuLevel = Math.max(0, menuLevel - 1);
  else if (e.key === 'ArrowRight') menuLevel = Math.min(9, menuLevel + 1);
  else if (/^[0-9]$/.test(e.key)) menuLevel = Number(e.key);
  else if (e.key === 'Enter') {
    game = createGame(menuLevel, Date.now() & 0xffff, menuMode === 'horizontal' ? 2 : 1);
    keyboard.snapshot(); // discard the Enter edge so it doesn't pause frame 1
    screen = 'game';
    resize();
  }
});

let last = performance.now();
let acc = 0;

function loop(now: number): void {
  acc += Math.min(now - last, 250); // clamp huge gaps (tab switches)
  last = now;

  if (screen === 'game' && game) {
    let steps = 0;
    while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      const raw = keyboard.snapshot();
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
  }

  if (screen === 'game' && game) {
    if (menuMode === 'horizontal') renderHorizontal(ctx, game);
    else renderGame(ctx, game);
  } else {
    renderMenu(ctx, menuLevel, menuMode);
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
