// The NES Tetris pseudo-random number generator and piece picker.
//
// The PRNG is a 16-bit LFSR: the feedback bit is bit 9 XOR bit 1, the
// register shifts right, and the feedback enters at bit 15. (On the 6502
// this is two EORs and a ROR through $0017-$0018.) Its period is 32767.
//
// Piece selection is the famous "dice roll with one reroll":
//   1. roll = (high byte + spawn count) & 7   -> 0..7, but there are only
//      7 pieces, so 7 itself is an invalid roll.
//   2. If the roll is 7 OR repeats the previous piece, reroll ONCE from a
//      fresh LFSR byte and accept the result unconditionally.
//
// Net effect: repeats are possible but suppressed (~1/28 instead of 1/7),
// droughts are real. This is NOT the modern 7-bag.
//
// Fidelity note: on hardware the second roll mixes in the previous piece's
// orientation id rather than using a fresh byte; the distribution is
// near-identical and the "reroll once" character is what defines the feel.

export function lfsrNext(value: number): number {
  const bit = ((value >> 9) ^ (value >> 1)) & 1;
  return ((value >> 1) | (bit << 15)) & 0xffff;
}

// The NES seeds its LFSR with 0x8988 on boot.
export const DEFAULT_SEED = 0x8988;

export class Rng {
  state: number;
  prev: number;
  spawnCount: number;

  constructor(seed: number = DEFAULT_SEED) {
    this.state = seed & 0xffff || DEFAULT_SEED; // an LFSR must never be 0
    this.prev = 7; // no previous piece yet; 7 never matches a real id
    this.spawnCount = 0;
  }

  // A raw coin flip off the LFSR, used for spawn-side assignment in
  // multi-well modes. Deliberately unfair over short runs.
  nextBit(): number {
    this.state = lfsrNext(this.state);
    return (this.state >> 8) & 1;
  }

  nextPiece(): number {
    this.spawnCount = (this.spawnCount + 1) & 0xff;
    this.state = lfsrNext(this.state);
    let roll = ((this.state >> 8) + this.spawnCount) & 7;
    if (roll === 7 || roll === this.prev) {
      this.state = lfsrNext(this.state);
      roll = ((this.state >> 8) & 0xff) % 7;
    }
    this.prev = roll;
    return roll;
  }
}
