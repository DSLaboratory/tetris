// Keyboard -> per-tick InputFrame. The browser gives us real keydown/keyup
// pairs, which is exactly what DAS needs: we ignore the OS auto-repeat
// (e.repeat) entirely - the game's own DAS counter is the only repeater.

import { InputFrame } from '../core/game';

type Button = 'left' | 'right' | 'down' | 'cw' | 'ccw' | 'start';

const KEYMAP: Record<string, Button> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'down',
  x: 'cw',
  X: 'cw',
  z: 'ccw',
  Z: 'ccw',
  Enter: 'start',
};

export class Keyboard {
  private held: Record<Button, boolean> = {
    left: false, right: false, down: false, cw: false, ccw: false, start: false,
  };
  private pressed: Record<Button, boolean> = {
    left: false, right: false, down: false, cw: false, ccw: false, start: false,
  };

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
  snapshot(): InputFrame {
    const frame: InputFrame = {
      leftPressed: this.pressed.left,
      rightPressed: this.pressed.right,
      leftHeld: this.held.left,
      rightHeld: this.held.right,
      downHeld: this.held.down,
      cwPressed: this.pressed.cw,
      ccwPressed: this.pressed.ccw,
      startPressed: this.pressed.start,
    };
    for (const k of Object.keys(this.pressed) as Button[]) this.pressed[k] = false;
    return frame;
  }
}
