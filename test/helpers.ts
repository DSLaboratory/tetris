import { Game, InputFrame, tick } from '../src/core/game';

export function mkInput(partial: Partial<InputFrame> = {}): InputFrame {
  return {
    leftPressed: false,
    rightPressed: false,
    leftHeld: false,
    rightHeld: false,
    downHeld: false,
    cwPressed: false,
    ccwPressed: false,
    startPressed: false,
    ...partial,
  };
}

export const IDLE = mkInput();

export function tickN(g: Game, n: number, input: InputFrame = IDLE): void {
  for (let i = 0; i < n; i++) tick(g, input);
}

// Fill a board row, optionally leaving gaps at the given columns.
export function fillRow(g: Game, row: number, except: number[] = []): void {
  for (let x = 0; x < 10; x++) {
    if (!except.includes(x)) g.wells[0][row * 10 + x] = 1;
  }
}
