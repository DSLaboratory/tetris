// The shell: a fixed-timestep loop at the NES's 60.0988Hz, independent of
// the display's refresh rate. requestAnimationFrame draws; the accumulator
// decides how many game frames have actually elapsed.

import { createGame, tick, Game } from '../core/game';
import { FRAME_RATE } from '../core/tables';
import { Keyboard } from './input';
import { renderGame, renderMenu, CANVAS_W, CANVAS_H } from './render';

const STEP_MS = 1000 / FRAME_RATE;
const MAX_STEPS_PER_FRAME = 8; // don't spiral after a background tab stall

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d')!;

const keyboard = new Keyboard();

let mode: 'menu' | 'game' = 'menu';
let menuLevel = 0;
let game: Game | null = null;

window.addEventListener('keydown', (e) => {
  if (mode !== 'menu') return;
  if (e.key === 'ArrowLeft') menuLevel = Math.max(0, menuLevel - 1);
  else if (e.key === 'ArrowRight') menuLevel = Math.min(9, menuLevel + 1);
  else if (/^[0-9]$/.test(e.key)) menuLevel = Number(e.key);
  else if (e.key === 'Enter') {
    game = createGame(menuLevel, Date.now() & 0xffff);
    keyboard.snapshot(); // discard the Enter edge so it doesn't pause frame 1
    mode = 'game';
  }
});

let last = performance.now();
let acc = 0;

function loop(now: number): void {
  acc += Math.min(now - last, 250); // clamp huge gaps (tab switches)
  last = now;

  if (mode === 'game' && game) {
    let steps = 0;
    while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      const input = keyboard.snapshot();
      tick(game, input);
      if (game.phase === 'gameover' && input.startPressed) {
        mode = 'menu';
        break;
      }
      acc -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  } else {
    acc = Math.min(acc, STEP_MS);
  }

  if (mode === 'game' && game) renderGame(ctx, game);
  else renderMenu(ctx, menuLevel);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
