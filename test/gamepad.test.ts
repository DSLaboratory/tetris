import { describe, it, expect } from 'vitest';
import { GamepadInput, detectBind, padReleased } from '../src/shell/gamepad';

// Build a fake Gamepad. Defaults match the captured 8BitDo SN30 NON-STANDARD
// layout: 15 buttons, 10 axes, mapping "".
function fakePad(opts: {
  buttons?: number[];      // indices currently pressed
  axes?: number[];
  mapping?: string;
  buttonCount?: number;
  axisCount?: number;
} = {}): Gamepad {
  const buttonCount = opts.buttonCount ?? 15;
  const axisCount = opts.axisCount ?? 10;
  const down = new Set(opts.buttons ?? []);
  const buttons = Array.from({ length: buttonCount }, (_, i) => ({
    pressed: down.has(i),
    touched: down.has(i),
    value: down.has(i) ? 1 : 0,
  }));
  const axes = Array.from({ length: axisCount }, (_, i) => opts.axes?.[i] ?? 0);
  return {
    id: 'fake',
    index: 0,
    connected: true,
    mapping: (opts.mapping ?? '') as GamepadMappingType,
    timestamp: 0,
    buttons: buttons as unknown as readonly GamepadButton[],
    axes,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

// A reader with no DOM listeners (no target) and a controllable pad source.
function reader(pad: () => Gamepad | null) {
  return new GamepadInput({ getPads: () => [pad()] });
}

describe('GamepadInput — SN30 non-standard layout (mapping "")', () => {
  it('reads the D-pad from axes[0]/axes[1]', () => {
    const left = reader(() => fakePad({ axes: [-1, 0] })).snapshot();
    expect(left.held.left).toBe(true);
    expect(left.held.right).toBe(false);

    const right = reader(() => fakePad({ axes: [1, 0] })).snapshot();
    expect(right.held.right).toBe(true);

    const up = reader(() => fakePad({ axes: [0, -1] })).snapshot();
    expect(up.held.up).toBe(true);

    const down = reader(() => fakePad({ axes: [0, 1] })).snapshot();
    expect(down.held.down).toBe(true);
  });

  it('ignores axis noise under the threshold', () => {
    const raw = reader(() => fakePad({ axes: [0.3, -0.4] })).snapshot();
    expect(raw.held.left).toBe(false);
    expect(raw.held.right).toBe(false);
    expect(raw.held.up).toBe(false);
    expect(raw.held.down).toBe(false);
  });

  it('maps A (buttons[1]) -> cw and B (buttons[0]) -> ccw (SN30 fw V6.17 order)', () => {
    const a = reader(() => fakePad({ buttons: [1] })).snapshot();
    expect(a.held.cw).toBe(true);
    expect(a.held.ccw).toBe(false);

    const b = reader(() => fakePad({ buttons: [0] })).snapshot();
    expect(b.held.ccw).toBe(true);
    expect(b.held.cw).toBe(false);
  });

  it('maps Start (buttons[11]) -> start', () => {
    const raw = reader(() => fakePad({ buttons: [11] })).snapshot();
    expect(raw.held.start).toBe(true);
  });

  it('does not treat Select (buttons[10]) as start', () => {
    const raw = reader(() => fakePad({ buttons: [10] })).snapshot();
    expect(raw.held.start).toBe(false);
  });

  it('fires pressed edges once, then only while held it stays held but not pressed', () => {
    let down = false;
    const gp = reader(() => fakePad({ buttons: down ? [1] : [] })); // buttons[1] = A = cw

    // Released.
    expect(gp.snapshot().pressed.cw).toBe(false);

    // First frame pressed: edge fires.
    down = true;
    const first = gp.snapshot();
    expect(first.pressed.cw).toBe(true);
    expect(first.held.cw).toBe(true);

    // Held: still held, no new edge.
    const second = gp.snapshot();
    expect(second.pressed.cw).toBe(false);
    expect(second.held.cw).toBe(true);

    // Released then pressed again: edge fires again.
    down = false;
    gp.snapshot();
    down = true;
    expect(gp.snapshot().pressed.cw).toBe(true);
  });

  it('returns an empty snapshot and resets edges when no pad is connected', () => {
    const gp = reader(() => null);
    const raw = gp.snapshot();
    expect(raw.held.cw).toBe(false);
    expect(raw.pressed.cw).toBe(false);
    expect(raw.held.start).toBe(false);
  });
});

describe('GamepadInput — standard mapping', () => {
  it('reads the D-pad from buttons[12..15] and Start from buttons[9]', () => {
    const up = reader(() => fakePad({ mapping: 'standard', buttonCount: 17, buttons: [12] })).snapshot();
    expect(up.held.up).toBe(true);

    const down = reader(() => fakePad({ mapping: 'standard', buttonCount: 17, buttons: [13] })).snapshot();
    expect(down.held.down).toBe(true);

    const left = reader(() => fakePad({ mapping: 'standard', buttonCount: 17, buttons: [14] })).snapshot();
    expect(left.held.left).toBe(true);

    const right = reader(() => fakePad({ mapping: 'standard', buttonCount: 17, buttons: [15] })).snapshot();
    expect(right.held.right).toBe(true);

    const start = reader(() => fakePad({ mapping: 'standard', buttonCount: 17, buttons: [9] })).snapshot();
    expect(start.held.start).toBe(true);

    // Start is read generously from BOTH index 9 and index 11 regardless of the
    // reported mapping — 8BitDo pads are inconsistent about where Start lands.
    const start11 = reader(() => fakePad({ mapping: 'standard', buttonCount: 17, buttons: [11] })).snapshot();
    expect(start11.held.start).toBe(true);
  });

  it('reads the left stick (axes[0]/axes[1]) as the D-pad', () => {
    const raw = reader(() => fakePad({ mapping: 'standard', buttonCount: 17, axes: [-1, 0] })).snapshot();
    expect(raw.held.left).toBe(true);
  });

  it('maps A->cw and B->ccw the same as non-standard', () => {
    const raw = reader(() => fakePad({ mapping: 'standard', buttonCount: 17, buttons: [0, 1] })).snapshot();
    expect(raw.held.cw).toBe(true);
    expect(raw.held.ccw).toBe(true);
  });
});

// 8BitDo SF30 / SN30 Pro report the D-pad as a single POV "hat" on axis 9:
// Up = -1, then clockwise in steps of 2/7 (right -3/7, down 1/7, left 5/7),
// with the neutral position resting OUTSIDE [-1, 1] at ~3.29.
describe('GamepadInput — 8BitDo POV hat D-pad (axis 9)', () => {
  const UP = -1;
  const UP_RIGHT = -5 / 7;
  const RIGHT = -3 / 7;
  const DOWN = 1 / 7;
  const LEFT = 5 / 7;
  const NEUTRAL = 3.2857;
  const hatPad = (v: number) => fakePad({ axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, v] });

  it('reads Up from axis 9 = -1, with no other direction set', () => {
    const raw = reader(() => hatPad(UP)).snapshot();
    expect(raw.held.up).toBe(true);
    expect(raw.held.down).toBe(false);
    expect(raw.held.left).toBe(false);
    expect(raw.held.right).toBe(false);
  });

  it('reads Down / Left / Right from their hat positions', () => {
    expect(reader(() => hatPad(DOWN)).snapshot().held.down).toBe(true);
    expect(reader(() => hatPad(LEFT)).snapshot().held.left).toBe(true);
    expect(reader(() => hatPad(RIGHT)).snapshot().held.right).toBe(true);
  });

  it('reads a diagonal as two directions', () => {
    const raw = reader(() => hatPad(UP_RIGHT)).snapshot();
    expect(raw.held.up).toBe(true);
    expect(raw.held.right).toBe(true);
    expect(raw.held.down).toBe(false);
    expect(raw.held.left).toBe(false);
  });

  it('treats the out-of-range neutral (~3.29) as nothing pressed', () => {
    const raw = reader(() => hatPad(NEUTRAL)).snapshot();
    expect(raw.held.up || raw.held.down || raw.held.left || raw.held.right).toBe(false);
  });
});

// The config-capture helpers must understand a hat axis too: its neutral rests
// out of range, which both detectBind and padReleased have to treat correctly.
describe('config capture — hat axis', () => {
  const pad = (v: number): { buttons: boolean[]; axes: number[] } => ({
    buttons: [false, false],
    axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, v],
  });

  it('padReleased treats the hat neutral (~3.29) as released, a held direction as not', () => {
    expect(padReleased(pad(3.2857))).toBe(true);
    expect(padReleased(pad(-1))).toBe(false);
  });

  it('detectBind captures a hat press as a hat bind', () => {
    expect(detectBind(pad(3.2857), pad(-1))).toEqual({ kind: 'hat', index: 9, value: -1 });
  });

  it('detectBind does not fire while the hat sits at neutral', () => {
    expect(detectBind(pad(3.2857), pad(3.2857))).toBeNull();
  });
});
