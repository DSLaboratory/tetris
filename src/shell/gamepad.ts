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

const BUTTONS: Button[] = ['up', 'down', 'left', 'right', 'cw', 'ccw', 'start'];

function emptyState(): Record<Button, boolean> {
  return { up: false, down: false, left: false, right: false, cw: false, ccw: false, start: false };
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
  connectedId: string | null = null;

  constructor(opts: { target?: Window; getPads?: () => (Gamepad | null)[] } = {}) {
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
    for (const p of this.getPads()) if (p && p.connected) return p;
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

  // Same { held, pressed } shape the Keyboard produces. pressed is the rising
  // edge versus the previous snapshot; held is the live state.
  snapshot(): RawInput {
    const pad = this.active();
    if (!pad) {
      this.reset();
      return { held: emptyState(), pressed: emptyState() };
    }

    const btn = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
    const ax = (i: number): number => pad.axes[i] ?? 0;

    const ax0 = ax(0), ax1 = ax(1);
    const held = emptyState();

    // D-pad as booleans, read UNCONDITIONALLY from BOTH the axis form (axes[0/1]
    // as discrete -1/0/+1, or a left stick) AND the button form (buttons[12..15])
    // — not gated on mapping, since an 8BitDo SN30 can report the D-pad either
    // way depending on firmware/mode.
    held.left = ax0 < -DPAD_AXIS_THRESHOLD || btn(STD_D_LEFT);
    held.right = ax0 > DPAD_AXIS_THRESHOLD || btn(STD_D_RIGHT);
    held.up = ax1 < -DPAD_AXIS_THRESHOLD || btn(STD_D_UP);
    held.down = ax1 > DPAD_AXIS_THRESHOLD || btn(STD_D_DOWN);

    held.cw = btn(BTN_A);   // A button (east, index 1) -> rotate clockwise
    held.ccw = btn(BTN_B);  // B button (south, index 0) -> rotate counter-clockwise
    // Check BOTH Start indices regardless of reported mapping — 8BitDo pads are
    // inconsistent about where Start lands, so be generous (matches rally).
    held.start = btn(STD_START) || btn(ALT_START);

    const pressed = emptyState();
    for (const b of BUTTONS) {
      pressed[b] = held[b] && !this.prevHeld[b];
      this.prevHeld[b] = held[b];
    }

    return { held, pressed };
  }
}
