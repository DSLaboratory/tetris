import { describe, it, expect } from 'vitest';
import { GamepadInput } from '../src/shell/gamepad';

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
