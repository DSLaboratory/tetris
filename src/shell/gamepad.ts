// Gamepad input source. Mirrors the Keyboard class: it produces the same
// RawInput { held, pressed } snapshot the frame builders consume, so it merges
// with the keyboard with no changes to the game/core. The Gamepad API is
// poll-based, so we read navigator.getGamepads() fresh every frame (cached
// Gamepad objects go stale) and derive pressed-edges ourselves by diffing
// against the last snapshot.
//
// Designed for an 8BitDo SN30 (a digital, stick-less SNES-style pad) but robust
// to anything. Measured on firmware V6.17, the SN30 reports the W3C south/east
// face order: B (south) = buttons[0], A (east) = buttons[1], Y = 2, X = 3.
//   * D-pad shows up on axes[0/1] as discrete -1/0/+1 (non-standard) and/or on
//     buttons[12..15] (standard) — we read both.
//   * Start is read from BOTH index 9 and 11, Select from 8 and 10 (8BitDo
//     pads are inconsistent about these depending on mode).
//
// Action mapping for NES Tetris: D-pad -> up/down/left/right ; A (buttons[1]) ->
// cw ; B (buttons[0]) -> ccw ; Start -> start. (X/Y/Select are unused in-game.)

import { Button, RawInput } from './input';

const DPAD_AXIS_THRESHOLD = 0.5; // treat an axis past this as a digital D-pad press

// 8BitDo SN30 (firmware V6.17) reports the W3C south/east order, so the printed
// A button is EAST = index 1 and B is SOUTH = index 0. NES Tetris: A rotates
// clockwise, B counter-clockwise.
const BTN_A = 1;   // physical A (east) -> rotate CW
const BTN_B = 0;   // physical B (south) -> rotate CCW
const STD_START = 9 /*, STD_SELECT = 8 */;
const STD_D_UP = 12, STD_D_DOWN = 13, STD_D_LEFT = 14, STD_D_RIGHT = 15;
// 8BitDo SN30 non-standard (D-input) layout.
const ALT_START = 11 /*, ALT_SELECT = 10 */;

// 8BitDo pads (SF30 / SN30 Pro) report the D-pad as a single POV "hat" on one
// axis (axis 9, measured), NOT as up/down on axes[1]. The eight directions are
// encoded from -1 (Up) clockwise in steps of 2/7 — right -0.43, down 0.14,
// left 0.71 — and the neutral position rests OUTSIDE [-1, 1] (~3.29). So a hat
// axis is recognised by its out-of-range rest value, and decoded by snapping
// the pressed value to one of the eight positions.
const HAT_AXIS = 9;
const HAT_STEP = 2 / 7;    // spacing between adjacent hat positions
const HAT_NEUTRAL = 1.05;  // |value| beyond this means centred / not pressed

// Decode a hat-axis value into D-pad directions; diagonals set two flags. All
// false when the hat is centred (out of range, or resting near 0 on a pad that
// has no hat at this index).
function hatDirections(v: number): { up: boolean; down: boolean; left: boolean; right: boolean } {
  const off = { up: false, down: false, left: false, right: false };
  if (Math.abs(v) > HAT_NEUTRAL || Math.abs(v) < 0.05) return off;
  const k = Math.round((v + 1) / HAT_STEP) & 7; // 0=Up, 1=Up-Right, … 7=Up-Left
  return {
    up: k === 0 || k === 1 || k === 7,
    right: k === 1 || k === 2 || k === 3,
    down: k === 3 || k === 4 || k === 5,
    left: k === 5 || k === 6 || k === 7,
  };
}

const BUTTONS: Button[] = ['up', 'down', 'left', 'right', 'cw', 'ccw', 'start'];

function emptyState(): Record<Button, boolean> {
  return { up: false, down: false, left: false, right: false, cw: false, ccw: false, start: false };
}

/* --------------------------- per-pad remapping --------------------------- */
// A bound physical input: a button index, or an axis past the threshold in a
// direction. Bindings are stored per pad id, so every controller remembers its
// own mapping and the two players stay independent automatically. When a pad has
// no saved binding it falls back to the 8BitDo SN30 defaults below.

export type Bind =
  | { kind: 'button'; index: number }
  | { kind: 'axis'; index: number; dir: 1 | -1 }
  | { kind: 'hat'; index: number; value: number }; // POV hat: match a target value
export type Binding = Partial<Record<Button, Bind>>;
export type RawPad = { buttons: boolean[]; axes: number[] };

// The order the config flow asks the player to bind, and the labels it shows.
// Top-down d-pad first (Up, Down, Left, Right), then the action buttons.
export const BIND_ORDER: Button[] = ['up', 'down', 'left', 'right', 'ccw', 'cw', 'start'];
export const BIND_LABELS: Record<Button, string> = {
  up: 'Up', down: 'Down (soft drop)', left: 'Left', right: 'Right',
  cw: 'Rotate CW', ccw: 'Rotate CCW', start: 'Start / Pause',
};

// The newly-activated input vs a neutral baseline: a button that went down, or an
// axis that left centre. The config flow captures one press per action with this.
export function detectBind(rest: RawPad, now: RawPad): Bind | null {
  for (let i = 0; i < now.buttons.length; i++) {
    if (now.buttons[i] && !rest.buttons[i]) return { kind: 'button', index: i };
  }
  for (let i = 0; i < now.axes.length; i++) {
    const r = rest.axes[i] ?? 0;
    const v = now.axes[i] ?? 0;
    // POV hat: rests outside [-1, 1] and snaps to a discrete position when pressed.
    if (Math.abs(r) > HAT_NEUTRAL && Math.abs(v) <= HAT_NEUTRAL) {
      return { kind: 'hat', index: i, value: v };
    }
    // Stick / standard axis: rests near centre, leaves it past the threshold.
    if (Math.abs(r) < DPAD_AXIS_THRESHOLD) {
      if (v > DPAD_AXIS_THRESHOLD) return { kind: 'axis', index: i, dir: 1 };
      if (v < -DPAD_AXIS_THRESHOLD) return { kind: 'axis', index: i, dir: -1 };
    }
  }
  return null;
}

export function padReleased(s: RawPad): boolean {
  // A hat axis at neutral rests OUTSIDE [-1, 1], so treat that as released too;
  // otherwise the "release, then press" step could never complete on an 8BitDo.
  return s.buttons.every((b) => !b)
    && s.axes.every((a) => Math.abs(a) < DPAD_AXIS_THRESHOLD || Math.abs(a) > HAT_NEUTRAL);
}

export function bindLabel(b: Bind): string {
  if (b.kind === 'button') return `button ${b.index}`;
  if (b.kind === 'hat') return `hat ${b.index} @ ${b.value.toFixed(2)}`;
  return `axis ${b.index}${b.dir > 0 ? '+' : '-'}`;
}

const bindKey = (padId: string): string => `tetris.pad.${padId}`;
export function saveBinding(padId: string, binding: Binding): void {
  try { localStorage.setItem(bindKey(padId), JSON.stringify(binding)); } catch { /* ignore */ }
}
function loadBinding(padId: string): Binding | null {
  try { const raw = localStorage.getItem(bindKey(padId)); return raw ? (JSON.parse(raw) as Binding) : null; }
  catch { return null; }
}

export interface GamepadInfo {
  id: string;
  mapping: string;
  buttonsDown: number[]; // indices currently pressed
  axes: number[];        // rounded
}

export class GamepadInput {
  private prevHeld = emptyState();
  private getPads: () => (Gamepad | null)[];
  private playerIndex: number; // 0 = first connected pad, 1 = second (two-player)
  connectedId: string | null = null;
  private binding: Binding | null = null; // this pad's saved remap, or null = SN30 defaults
  private bindingId: string | null = null;

  constructor(opts: { target?: Window; getPads?: () => (Gamepad | null)[]; playerIndex?: number } = {}) {
    this.playerIndex = opts.playerIndex ?? 0;
    this.getPads = opts.getPads
      ?? (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []));
    const target = opts.target ?? (typeof window !== 'undefined' ? window : undefined);
    if (target) {
      target.addEventListener('gamepadconnected', (e) => {
        this.connectedId = (e as GamepadEvent).gamepad?.id ?? null;
      });
      target.addEventListener('gamepaddisconnected', () => {
        this.connectedId = null;
        this.reset();
      });
      // Don't leave a direction "held" across focus loss.
      target.addEventListener('blur', () => this.reset());
    }
  }

  private reset(): void {
    this.prevHeld = emptyState();
  }

  private active(): Gamepad | null {
    let n = 0;
    for (const p of this.getPads()) {
      if (p && p.connected) {
        if (n === this.playerIndex) return p;
        n++;
      }
    }
    return null;
  }

  // Live snapshot for an optional on-screen debug overlay.
  info(): GamepadInfo | null {
    const pad = this.active();
    if (!pad) return null;
    const buttonsDown: number[] = [];
    pad.buttons.forEach((b, i) => { if (b.pressed) buttonsDown.push(i); });
    return {
      id: pad.id,
      mapping: pad.mapping || 'non-standard',
      buttonsDown,
      axes: pad.axes.map((a) => Math.round(a * 100) / 100),
    };
  }

  // The raw pad state (every button + axis), for the config flow's press detection.
  rawState(): RawPad | null {
    const pad = this.active();
    if (!pad) return null;
    return { buttons: pad.buttons.map((b) => b.pressed), axes: pad.axes.map((a) => a) };
  }
  activePadId(): string | null { return this.active()?.id ?? null; }
  // Drop the cached binding so the next snapshot reloads it (after a config save).
  reloadBinding(): void { this.bindingId = null; }

  private syncBinding(pad: Gamepad): void {
    if (pad.id === this.bindingId) return;
    this.bindingId = pad.id;
    this.binding = loadBinding(pad.id);
  }
  private readBind(pad: Gamepad, b: Bind | undefined): boolean {
    if (!b) return false;
    if (b.kind === 'button') return pad.buttons[b.index]?.pressed ?? false;
    const v = pad.axes[b.index] ?? 0;
    if (b.kind === 'hat') {
      // Within half a step of the bound position (positions are 2/7 apart).
      return Math.abs(v) <= HAT_NEUTRAL && Math.abs(v - b.value) < HAT_STEP / 2;
    }
    return b.dir > 0 ? v > DPAD_AXIS_THRESHOLD : v < -DPAD_AXIS_THRESHOLD;
  }

  // Same { held, pressed } shape the Keyboard produces. Reads via the pad's saved
  // binding if it has one, else the 8BitDo SN30 defaults (d-pad on axes OR buttons).
  snapshot(): RawInput {
    const pad = this.active();
    if (!pad) {
      this.reset();
      this.bindingId = null;
      return { held: emptyState(), pressed: emptyState() };
    }
    this.syncBinding(pad);

    const held = emptyState();
    if (this.binding) {
      for (const b of BUTTONS) held[b] = this.readBind(pad, this.binding[b]);
    } else {
      const btn = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
      const ax = (i: number): number => pad.axes[i] ?? 0;
      const ax0 = ax(0), ax1 = ax(1);
      // D-pad can arrive three ways: a POV hat (8BitDo SF30/SN30 Pro), a stick
      // on axes[0/1], or the standard buttons 12-15. Accept all of them.
      const hat = hatDirections(ax(HAT_AXIS));
      held.left = ax0 < -DPAD_AXIS_THRESHOLD || btn(STD_D_LEFT) || hat.left;
      held.right = ax0 > DPAD_AXIS_THRESHOLD || btn(STD_D_RIGHT) || hat.right;
      held.up = ax1 < -DPAD_AXIS_THRESHOLD || btn(STD_D_UP) || hat.up;
      held.down = ax1 > DPAD_AXIS_THRESHOLD || btn(STD_D_DOWN) || hat.down;
      held.cw = btn(BTN_A);   // A (east, 1) -> CW
      held.ccw = btn(BTN_B);  // B (south, 0) -> CCW
      held.start = btn(STD_START) || btn(ALT_START);
    }

    const pressed = emptyState();
    for (const b of BUTTONS) {
      pressed[b] = held[b] && !this.prevHeld[b];
      this.prevHeld[b] = held[b];
    }
    return { held, pressed };
  }
}
