// Nintendo Rotation System (NRS), as shipped on the NES (1989).
//
// Each piece is a list of orientations; each orientation is four
// [dx, dy] cell offsets from the piece's position (y grows downward).
// The orientation arrays are ordered so that CLOCKWISE rotation is
// index + 1 (wrapping). Spawn orientation is always index 0.
//
// Faithful properties of NRS worth noticing:
//  - T, J, L have 4 orientations; S, Z, I toggle between 2; O has 1.
//    S/Z/I return to the *same* cells every other rotation - no wobble.
//  - There are no wall kicks. A rotation that collides simply fails.
//  - T, J, L spawn pointing DOWN (flat bar with the nub/foot below),
//    S, Z, I spawn horizontal.

export type PieceId = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// NES piece order. Indexes matter: the randomizer rolls 0..6 over this table.
export const PIECE_NAMES = ['T', 'J', 'Z', 'O', 'S', 'L', 'I'] as const;

export type Cell = readonly [dx: number, dy: number];
export type Orientation = readonly Cell[];

const T: Orientation[] = [
  [[-1, 0], [0, 0], [1, 0], [0, 1]],   // down (spawn)
  [[0, -1], [0, 0], [0, 1], [-1, 0]],  // left
  [[-1, 0], [0, 0], [1, 0], [0, -1]],  // up
  [[0, -1], [0, 0], [0, 1], [1, 0]],   // right
];

const J: Orientation[] = [
  [[-1, 0], [0, 0], [1, 0], [1, 1]],   // down (spawn): foot bottom-right
  [[0, -1], [0, 0], [0, 1], [-1, 1]],  // left: foot bottom-left
  [[-1, -1], [-1, 0], [0, 0], [1, 0]], // up: nub top-left
  [[0, -1], [1, -1], [0, 0], [0, 1]],  // right: nub top-right
];

const Z: Orientation[] = [
  [[-1, 0], [0, 0], [0, 1], [1, 1]],   // horizontal (spawn)
  [[0, -1], [-1, 0], [0, 0], [-1, 1]], // vertical
];

const O: Orientation[] = [
  [[-1, 0], [0, 0], [-1, 1], [0, 1]],
];

const S: Orientation[] = [
  [[0, 0], [1, 0], [-1, 1], [0, 1]],   // horizontal (spawn)
  [[-1, -1], [-1, 0], [0, 0], [0, 1]], // vertical
];

const L: Orientation[] = [
  [[-1, 0], [0, 0], [1, 0], [-1, 1]],  // down (spawn): foot bottom-left
  [[-1, -1], [0, -1], [0, 0], [0, 1]], // left: nub top-left
  [[-1, 0], [0, 0], [1, 0], [1, -1]],  // up: nub top-right
  [[0, -1], [0, 0], [0, 1], [1, 1]],   // right: foot bottom-right
];

const I: Orientation[] = [
  [[-2, 0], [-1, 0], [0, 0], [1, 0]],  // horizontal (spawn)
  [[0, -2], [0, -1], [0, 0], [0, 1]],  // vertical
];

export const PIECES: readonly Orientation[][] = [T, J, Z, O, S, L, I];

// All pieces spawn at the same position on the NES.
export const SPAWN_X = 5;
export const SPAWN_Y = 0;

export function orientationCount(id: PieceId): number {
  return PIECES[id].length;
}

export function cellsOf(id: PieceId, rot: number): Orientation {
  return PIECES[id][rot];
}

export function rotateCw(id: PieceId, rot: number): number {
  return (rot + 1) % PIECES[id].length;
}

export function rotateCcw(id: PieceId, rot: number): number {
  const n = PIECES[id].length;
  return (rot + n - 1) % n;
}
