// Keyboard -> per-tick InputFrame. The browser gives us real keydown/keyup
// pairs, which is exactly what DAS needs: we ignore the OS auto-repeat
// (e.repeat) entirely - the game's own DAS counter is the only repeater.
//
// The Keyboard reports PHYSICAL keys; the frame builders below translate
// them into well-space input per game mode. The core never knows which
// way is down on screen.

import { InputFrame } from '../core/game';

export type Button = 'up' | 'down' | 'left' | 'right' | 'cw' | 'ccw' | 'start';

const KEYMAP: Record<string, Button> = {
  ArrowUp: 'up',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'down',
  x: 'cw',
  X: 'cw',
  z: 'ccw',
  Z: 'ccw',
  Enter: 'start',
};

export interface RawInput {
  held: Record<Button, boolean>;
  pressed: Record<Button, boolean>;
}

const BUTTONS: Button[] = ['up', 'down', 'left', 'right', 'cw', 'ccw', 'start'];

function emptyState(): Record<Button, boolean> {
  return { up: false, down: false, left: false, right: false, cw: false, ccw: false, start: false };
}

export class Keyboard {
  private held = emptyState();
  private pressed = emptyState();

  constructor() {
    window.addEventListener('keydown', (e) => {
      const button = KEYMAP[e.key];
      if (!button) return;
      e.preventDefault();
      if (e.repeat) return; // fresh presses only; DAS does the repeating
      this.held[button] = true;
      this.pressed[button] = true;
    });
    window.addEventListener('keyup', (e) => {
      const button = KEYMAP[e.key];
      if (!button) return;
      this.held[button] = false;
    });
  }

  // Consume the edges accumulated since the last snapshot.
  snapshot(): RawInput {
    const raw: RawInput = { held: { ...this.held }, pressed: { ...this.pressed } };
    for (const b of BUTTONS) this.pressed[b] = false;
    return raw;
  }
}

// Combine two input sources (keyboard + gamepad) into one RawInput for the
// frame. held flags and pressed edges OR together, so either device works and
// neither shadows the other (a released gamepad button is just false).
export function mergeRaw(a: RawInput, b: RawInput): RawInput {
  const held = emptyState();
  const pressed = emptyState();
  for (const btn of BUTTONS) {
    held[btn] = a.held[btn] || b.held[btn];
    pressed[btn] = a.pressed[btn] || b.pressed[btn];
  }
  return { held, pressed };
}

// Classic: the identity mapping. Up does nothing, like the NES d-pad.
export function classicFrame(raw: RawInput): InputFrame {
  return {
    leftPressed: raw.pressed.left,
    rightPressed: raw.pressed.right,
    leftHeld: raw.held.left,
    rightHeld: raw.held.right,
    downHeld: raw.held.down,
    cwPressed: raw.pressed.cw,
    ccwPressed: raw.pressed.ccw,
    startPressed: raw.pressed.start,
  };
}

// Horizontal: absolute controls. Up/Down are the lateral pair (and get the
// DAS treatment); the soft-drop key is the arrow pointing at the active
// piece's wall, and the opposite arrow is dead. The two wells are rotated
// opposite ways, so "screen up" is well-right on the right side and
// well-left on the left side - this keeps Up meaning UP on both.
export function horizontalFrame(raw: RawInput, side: number): InputFrame {
  const wellLeft: Button = side === 0 ? 'up' : 'down';
  const wellRight: Button = side === 0 ? 'down' : 'up';
  const soft: Button = side === 0 ? 'left' : 'right';
  return {
    leftPressed: raw.pressed[wellLeft],
    rightPressed: raw.pressed[wellRight],
    leftHeld: raw.held[wellLeft],
    rightHeld: raw.held[wellRight],
    downHeld: raw.held[soft],
    cwPressed: raw.pressed.cw,
    ccwPressed: raw.pressed.ccw,
    startPressed: raw.pressed.start,
  };
}
