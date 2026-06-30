// The shell: a fixed-timestep loop at the NES's 60.0988Hz, independent of
// the display's refresh rate. requestAnimationFrame draws; the accumulator
// decides how many game frames have actually elapsed.

import { createGame, type Game, type Phase, tick } from '../core/game';
import { FRAME_RATE } from '../core/tables';
import { Audio } from './audio';
import {
  BIND_LABELS,
  BIND_ORDER,
  type Binding,
  bindLabel,
  detectBind,
  GamepadInput,
  padReleased,
  saveBinding,
} from './gamepad';
import {
  type Button,
  classicFrame,
  horizontalFrame,
  KEYMAP_P1,
  KEYMAP_P2,
  Keyboard,
  mergeRaw,
  type RawInput,
} from './input';
import {
  CANVAS_H,
  CANVAS_W,
  type ConfigRow,
  H_CANVAS_H,
  H_CANVAS_W,
  MENU_ROWS,
  type Mode,
  type OverlayMenu,
  renderConfig,
  renderGame,
  renderHorizontal,
  renderMenu,
  renderVersus,
  V_CANVAS_H,
  V_CANVAS_W,
} from './render';

const STEP_MS = 1000 / FRAME_RATE;
const MAX_STEPS_PER_FRAME = 8; // don't spiral after a background tab stall

const NO_BUTTONS: Record<Button, boolean> = {
  up: false,
  down: false,
  left: false,
  right: false,
  cw: false,
  ccw: false,
  start: false,
};
const emptyRaw = (): RawInput => ({ held: { ...NO_BUTTONS }, pressed: { ...NO_BUTTONS } });

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// P1: arrows + Z/X + Enter, and the first connected pad. P2 (versus): WASD + Q/E,
// and the second connected pad.
const keyboard1 = new Keyboard(KEYMAP_P1);
const keyboard2 = new Keyboard(KEYMAP_P2);
const gamepad1 = new GamepadInput({ playerIndex: 0 });
const gamepad2 = new GamepadInput({ playerIndex: 1 });
const audio = new Audio();

let screen: 'menu' | 'game' | 'config' = 'menu';
let menuSel = 0; // cursor over MENU_ROWS
let menuMode: Mode = 'classic';
let menuLevel = 0;
let configPlayer = 1; // which pad the config screen targets
// gamepad config (per-pad bind walkthrough) state
let cfgStep = 0;
let cfgPhase: 'wait' | 'capture' | 'saved' = 'wait';
let cfgRest: { buttons: boolean[]; axes: number[] } | null = null;
let cfgBinding: Binding = {};
let game: Game | null = null;
let game2: Game | null = null; // player 2 (versus only)
let versusPaused = false;
let versusWinner: string | null = null;
// Pause / game-over overlay menu — shell-owned, shared by single-player and versus.
const PAUSE_OPTS = ['RESUME', 'RESTART', 'MAIN MENU'];
const OVER_OPTS = ['RESTART', 'MAIN MENU'];
let overlaySel = 0;
let shellPaused = false; // single-player pause (versus uses versusPaused)

function resize(): void {
  if (screen === 'game' && menuMode === 'horizontal') {
    canvas.width = H_CANVAS_W;
    canvas.height = H_CANVAS_H;
  } else if (screen === 'game' && menuMode === 'versus') {
    canvas.width = V_CANVAS_W;
    canvas.height = V_CANVAS_H;
  } else {
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
  }
}
resize();

function cycleMode(dir: number): void {
  const order: Mode[] = ['classic', 'horizontal', 'versus'];
  menuMode = order[(order.indexOf(menuMode) + dir + order.length) % order.length];
}
function levelDown(): void {
  menuLevel = Math.max(0, menuLevel - 1);
}
function levelUp(): void {
  menuLevel = Math.min(9, menuLevel + 1);
}

function startGame(): void {
  audio.unlock();
  shellPaused = false;
  overlaySel = 0;
  const seed = Date.now() & 0xffff;
  if (menuMode === 'versus') {
    // Same seed -> identical piece stream for both players; only strategy differs.
    game = createGame(menuLevel, seed, 1);
    game2 = createGame(menuLevel, seed, 1);
    versusPaused = false;
    versusWinner = null;
  } else {
    game = createGame(menuLevel, seed, menuMode === 'horizontal' ? 2 : 1);
    game2 = null;
    audio.reset(); // fresh observer snapshot for single-player sound
  }
  // Discard start edges on every device so frame 1 doesn't pause/act.
  keyboard1.snapshot();
  keyboard2.snapshot();
  gamepad1.snapshot();
  gamepad2.snapshot();
  screen = 'game';
  resize();
}

function gotoConfig(player: number): void {
  configPlayer = player;
  cfgStep = 0;
  cfgPhase = 'wait';
  cfgRest = null;
  cfgBinding = {};
  screen = 'config';
  resize();
}
function activateMenuRow(): void {
  switch (MENU_ROWS[menuSel]) {
    case 'start':
      startGame();
      break;
    case 'config1':
      gotoConfig(1);
      break;
    case 'config2':
      gotoConfig(2);
      break;
    // mode / level rows are changed with Left/Right; Enter does nothing on them.
  }
}

// Walk the player through binding every control on their pad. Reads the RAW pad
// (every button/axis) so it can detect whatever they press, saves per pad id.
function configRows(): ConfigRow[] {
  return BIND_ORDER.map((action, i) => {
    const bound = cfgBinding[action];
    const isCurrent = cfgPhase !== 'saved' && i === cfgStep;
    return {
      label: BIND_LABELS[action],
      value: bound ? bindLabel(bound) : isCurrent ? '…' : '—',
      state: bound ? 'done' : isCurrent ? 'current' : 'pending',
    };
  });
}

function stepConfig(): void {
  const pad = configPlayer === 1 ? gamepad1 : gamepad2;
  const kStart = keyboard1.snapshot().pressed.start;
  keyboard2.snapshot();
  gamepad1.snapshot();
  gamepad2.snapshot(); // drain edges
  const now = pad.rawState();

  if (!now) {
    renderConfig(ctx, configPlayer, false, configRows(), '', 'ESC — back to menu');
    return;
  }
  if (cfgPhase === 'saved') {
    if (kStart) {
      screen = 'menu';
      resize();
      return;
    }
    renderConfig(
      ctx,
      configPlayer,
      true,
      configRows(),
      'Saved — all controls bound.',
      'ENTER — done   ·   ESC — menu',
    );
    return;
  }

  if (!cfgRest) cfgRest = now;
  if (cfgPhase === 'wait') {
    // make the player let go first, so one push binds one control
    if (padReleased(now)) {
      cfgRest = now;
      cfgPhase = 'capture';
    }
  } else {
    const bind = detectBind(cfgRest, now);
    if (bind) {
      cfgBinding[BIND_ORDER[cfgStep]] = bind;
      cfgStep += 1;
      if (cfgStep >= BIND_ORDER.length) {
        const id = pad.activePadId();
        if (id) {
          saveBinding(id, cfgBinding);
          pad.reloadBinding();
        }
        cfgPhase = 'saved';
      } else {
        cfgPhase = 'wait';
      }
    }
  }

  const action = BIND_ORDER[Math.min(cfgStep, BIND_ORDER.length - 1)];
  const prompt =
    cfgPhase === 'wait'
      ? 'Release, then press the next input…'
      : `Press the input for:  ${BIND_LABELS[action]}`;
  renderConfig(
    ctx,
    configPlayer,
    true,
    configRows(),
    prompt,
    `${cfgStep}/${BIND_ORDER.length} bound   ·   ESC — cancel`,
  );
}

// Dump every connected pad's RAW state to the console: id, mapping, pressed
// button indices, and ALL axes at full precision (unfiltered, unrounded). Press
// P with a button/direction held to capture an exact snapshot to copy out — the
// fastest way to diagnose a pad's D-pad encoding in one go.
function dumpPads(): void {
  const pads =
    typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  const lines = ['=== GAMEPAD DUMP (press P) ==='];
  let any = false;
  pads.forEach((p, i) => {
    if (!p) return;
    any = true;
    const pressed = p.buttons.map((b, bi) => (b.pressed ? bi : -1)).filter((bi) => bi >= 0);
    const axes = p.axes.map((a, ai) => `[${ai}]=${a.toFixed(4)}`).join('  ');
    lines.push(`pad[${i}] id="${p.id}" mapping="${p.mapping || '(non-standard)'}"`);
    lines.push(`  buttons pressed: [${pressed.join(', ')}]  (of ${p.buttons.length})`);
    lines.push(`  axes (${p.axes.length}): ${axes}`);
  });
  if (!any) lines.push('(no pad seen yet — press a button on the pad first, then P)');
  console.log(lines.join('\n'));
}

// backtick toggles a pad-debug overlay; P dumps raw pad state to the console;
// Escape backs out of the config screen.
let showPadDebug = false;
window.addEventListener('keydown', (e) => {
  audio.unlock(); // first user gesture unblocks Web Audio
  if (e.key === '`') showPadDebug = !showPadDebug;
  if (e.key === 'p' || e.key === 'P') dumpPads();
  if (e.key === 'm' || e.key === 'M') audio.toggleMute();
  if (e.key === 'Escape' && screen === 'config') {
    screen = 'menu';
    resize();
  }
});

function drawPadDebug(): void {
  const info = gamepad1.info();
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, canvas.width, 46);
  ctx.font = '11px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  if (!info) {
    ctx.fillStyle = '#ff8040';
    ctx.fillText('GAMEPAD: none - press a button on the pad', 6, 5);
    ctx.fillStyle = '#88aaff';
    ctx.fillText('if still none: hold Start+B (D-input mode), then reload', 6, 22);
  } else {
    ctx.fillStyle = '#80d0ff';
    ctx.fillText(`${info.id.slice(0, 40)}  [${info.mapping}]`, 6, 5);
    ctx.fillStyle = '#ffe040';
    ctx.fillText(`btn: ${info.buttonsDown.join(' ') || '-'}`, 6, 20);
    ctx.fillStyle = '#40e040';
    const liveAx = info.axes
      .map((v, i) => ({ v, i }))
      .filter((o) => Math.abs(o.v) > 0.15)
      .map((o) => `${o.i}:${o.v}`)
      .join('  ');
    ctx.fillText(`ax: ${liveAx || '(all 0)'}`, 6, 33);
  }
  ctx.restore();
}

// --- per-mode step functions -------------------------------------------

function chooseOverlay(opt: string): void {
  if (opt === 'RESUME') shellPaused = false;
  else if (opt === 'RESTART') startGame();
  else {
    shellPaused = false;
    screen = 'menu';
    resize();
  } // MAIN MENU
}

function stepSingle(): void {
  const g = game!;
  // Paused or game over -> a selectable overlay menu; the world is frozen.
  if (shellPaused || g.phase === 'gameover') {
    const raw = mergeRaw(keyboard1.snapshot(), gamepad1.snapshot());
    const opts = g.phase === 'gameover' ? OVER_OPTS : PAUSE_OPTS;
    if (raw.pressed.up) overlaySel = (overlaySel + opts.length - 1) % opts.length;
    if (raw.pressed.down) overlaySel = (overlaySel + 1) % opts.length;
    if (raw.pressed.start) chooseOverlay(opts[overlaySel]);
    return;
  }

  let steps = 0;
  let raw: RawInput = emptyRaw();
  while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
    if (steps === 0) raw = mergeRaw(keyboard1.snapshot(), gamepad1.snapshot());
    else raw = { held: raw.held, pressed: { ...NO_BUTTONS } };
    if (raw.pressed.start) {
      shellPaused = true;
      overlaySel = 0;
      acc = 0;
      return;
    } // open pause menu
    const input = menuMode === 'horizontal' ? horizontalFrame(raw, g.well) : classicFrame(raw);
    input.startPressed = false; // shell owns pause; the core never pauses itself
    tick(g, input);
    if ((g.phase as Phase) === 'gameover') {
      overlaySel = 0;
      break;
    } // tick() may have ended it
    acc -= STEP_MS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0;
}

function chooseVersusOverlay(opt: string): void {
  if (opt === 'RESUME') versusPaused = false;
  else if (opt === 'RESTART') startGame();
  else {
    screen = 'menu';
    resize();
  } // MAIN MENU
}

function stepVersus(): void {
  const g1 = game!;
  const g2 = game2!;
  // Paused or decided -> a selectable overlay menu; either player can drive it.
  if (versusPaused || versusWinner) {
    const raw = mergeRaw(
      mergeRaw(keyboard1.snapshot(), gamepad1.snapshot()),
      mergeRaw(keyboard2.snapshot(), gamepad2.snapshot()),
    );
    const opts = versusWinner ? OVER_OPTS : PAUSE_OPTS;
    if (raw.pressed.up) overlaySel = (overlaySel + opts.length - 1) % opts.length;
    if (raw.pressed.down) overlaySel = (overlaySel + 1) % opts.length;
    if (raw.pressed.start) chooseVersusOverlay(opts[overlaySel]);
    return;
  }

  let steps = 0;
  let r1: RawInput = emptyRaw();
  let r2: RawInput = emptyRaw();
  while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
    if (steps === 0) {
      r1 = mergeRaw(keyboard1.snapshot(), gamepad1.snapshot());
      r2 = mergeRaw(keyboard2.snapshot(), gamepad2.snapshot());
    } else {
      r1 = { held: r1.held, pressed: { ...NO_BUTTONS } };
      r2 = { held: r2.held, pressed: { ...NO_BUTTONS } };
    }
    // Either Start opens the shared pause menu; the cores never see Start.
    if (r1.pressed.start || r2.pressed.start) {
      versusPaused = true;
      overlaySel = 0;
      acc = 0;
      return;
    }
    const i1 = classicFrame(r1);
    i1.startPressed = false;
    const i2 = classicFrame(r2);
    i2.startPressed = false;
    tick(g1, i1);
    tick(g2, i2);
    if (g1.phase === 'gameover' || g2.phase === 'gameover') {
      const d1 = g1.phase === 'gameover';
      const d2 = g2.phase === 'gameover';
      versusWinner =
        d1 && d2
          ? g1.score >= g2.score
            ? 'PLAYER 1 WINS'
            : 'PLAYER 2 WINS'
          : d1
            ? 'PLAYER 2 WINS'
            : 'PLAYER 1 WINS';
      overlaySel = 0;
      break;
    }
    acc -= STEP_MS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0;
}

// --- the loop ----------------------------------------------------------

let last = performance.now();
let acc = 0;

function loop(now: number): void {
  acc += Math.min(now - last, 250); // clamp huge gaps (tab switches)
  last = now;

  if (screen === 'menu') {
    acc = Math.min(acc, STEP_MS);
    const k = keyboard1.snapshot().pressed;
    const p = gamepad1.snapshot().pressed;
    if (p.up || p.down || p.left || p.right || p.start) audio.unlock();
    keyboard2.snapshot();
    gamepad2.snapshot(); // drain P2 edges so none leak into a game
    if (k.up || p.up) menuSel = (menuSel + MENU_ROWS.length - 1) % MENU_ROWS.length;
    if (k.down || p.down) menuSel = (menuSel + 1) % MENU_ROWS.length;
    if (k.left || p.left) {
      if (menuSel === 0) cycleMode(-1);
      else if (menuSel === 1) levelDown();
    }
    if (k.right || p.right) {
      if (menuSel === 0) cycleMode(1);
      else if (menuSel === 1) levelUp();
    }
    if (k.start || p.start) activateMenuRow();
    renderMenu(ctx, menuSel, menuMode, menuLevel);
  } else if (screen === 'config') {
    acc = Math.min(acc, STEP_MS);
    stepConfig();
  } else if (menuMode === 'versus' && game && game2) {
    stepVersus(); // no audio in two-player
    const ov: OverlayMenu | undefined = versusWinner
      ? { title: versusWinner, options: OVER_OPTS, sel: overlaySel }
      : versusPaused
        ? { title: 'PAUSE', options: PAUSE_OPTS, sel: overlaySel }
        : undefined;
    renderVersus(ctx, game, game2, ov);
  } else if (game) {
    stepSingle();
    audio.observe(game); // sound: single-player only
    const ov: OverlayMenu | undefined =
      game.phase === 'gameover'
        ? {
            title: 'GAME OVER',
            note: `SCORE ${String(game.score).padStart(6, '0')}`,
            options: OVER_OPTS,
            sel: overlaySel,
          }
        : shellPaused
          ? { title: 'PAUSE', options: PAUSE_OPTS, sel: overlaySel, hideBoard: true }
          : undefined;
    if (menuMode === 'horizontal') renderHorizontal(ctx, game, ov);
    else renderGame(ctx, game, ov);
  }

  if (showPadDebug) drawPadDebug();
  requestAnimationFrame(loop);
}

// Dev hook for headless verification (harmless in production).
(window as unknown as { __dbg?: () => unknown }).__dbg = () => ({
  screen,
  menuMode,
  menuSel,
  menuLevel,
  phase: game?.phase,
  phase2: game2?.phase,
  versusWinner,
  versusPaused,
});

// PWA: register the service worker so "Add to Home Screen" launches the game with no network.
// PROD-only — keeps the dev server and any headless verification free of a controlling worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

requestAnimationFrame(loop);
