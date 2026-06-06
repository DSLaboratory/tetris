// The published NTSC NES Tetris tables. These numbers ARE the game;
// every value here is asserted by the test suite.

// NTSC NES frame rate. The logic is frame-counted, exactly like the NES;
// the shell is responsible for ticking at this rate regardless of display.
export const FRAME_RATE = 60.0988;

// Frames the piece waits before dropping one row, by level (NTSC).
const GRAVITY_TABLE = [
  48, 43, 38, 33, 28, // levels 0-4
  23, 18, 13, 8, 6,   // levels 5-9
  5, 5, 5,            // 10-12
  4, 4, 4,            // 13-15
  3, 3, 3,            // 16-18
] as const;

export function gravityFrames(level: number): number {
  if (level <= 18) return GRAVITY_TABLE[level];
  if (level <= 28) return 2;
  return 1;
}

// Soft drop moves the piece one row every 2 frames (NTSC).
export const SOFT_DROP_FRAMES = 2;

// DAS: first auto-shift after 16 frames; the counter then reloads to 10,
// so subsequent shifts fire every 6 frames. A blocked shift leaves the
// counter fully charged at 16 (this is what makes wall charging work).
export const DAS_CHARGED = 16;
export const DAS_RELOAD = 10;

// Line clear scoring base values; multiplied by (level + 1) using the
// level AFTER any level-up from those lines, as on the NES.
const LINE_SCORES = [0, 40, 100, 300, 1200] as const;

export function scoreForLines(cleared: number): number {
  return LINE_SCORES[cleared];
}

export const MAX_SCORE = 999_999; // the NES score display caps here

// Level progression. From a starting level s, the first level-up happens at
//   min((s + 1) * 10, max(100, s * 10 - 50))
// lines, then every 10 lines after. Notably, starting at level 9 keeps you
// on 9 for a full 100 lines.
export function firstLevelUpLines(startLevel: number): number {
  return Math.min((startLevel + 1) * 10, Math.max(100, startLevel * 10 - 50));
}

export function levelForLines(startLevel: number, lines: number): number {
  const first = firstLevelUpLines(startLevel);
  if (lines < first) return startLevel;
  return startLevel + 1 + Math.floor((lines - first) / 10);
}

// ARE (entry delay): frames between a piece locking and the next spawning.
// 10 frames when locking in the bottom two rows, +2 per 4-row band above,
// capped at 18. lockRow is the row of the locked piece's lowest cell (0-19).
export function areFrames(lockRow: number): number {
  return 10 + 2 * Math.min(4, Math.floor((19 - lockRow + 2) / 4));
}

// The line-clear animation freezes play for 20 frames (5 steps x 4 frames,
// blanking column pairs from the center outward), before ARE runs.
export const CLEAR_FRAMES = 20;
