import { describe, it, expect } from 'vitest';
import { lfsrNext, Rng, DEFAULT_SEED } from '../src/core/rng';

describe('NES LFSR', () => {
  it('has the documented period of 32767', () => {
    let v = DEFAULT_SEED;
    let n = 0;
    do {
      v = lfsrNext(v);
      n++;
    } while (v !== DEFAULT_SEED && n <= 70000);
    expect(n).toBe(32767);
  });

  it('never reaches the all-zero lockup state from the NES seed', () => {
    let v = DEFAULT_SEED;
    for (let i = 0; i < 32767; i++) {
      v = lfsrNext(v);
      expect(v).not.toBe(0);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = new Rng(0x1234);
    const b = new Rng(0x1234);
    const seqA = Array.from({ length: 50 }, () => a.nextPiece());
    const seqB = Array.from({ length: 50 }, () => b.nextPiece());
    expect(seqA).toEqual(seqB);
  });
});

describe('reroll-once piece picker', () => {
  const N = 10_000;

  it('only produces valid piece ids 0..6', () => {
    const rng = new Rng();
    for (let i = 0; i < N; i++) {
      const p = rng.nextPiece();
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(6);
    }
  });

  it('distributes roughly evenly across the 7 pieces', () => {
    const rng = new Rng();
    const counts = Array(7).fill(0);
    for (let i = 0; i < N; i++) counts[rng.nextPiece()]++;
    const expected = N / 7; // ~1429
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.8);
      expect(c).toBeLessThan(expected * 1.2);
    }
  });

  it('suppresses but does not eliminate back-to-back repeats', () => {
    // P(repeat) = P(reroll) * P(second roll hits prev) = 1/4 * 1/7 = ~3.6%,
    // versus ~14.3% for a memoryless uniform picker.
    const rng = new Rng();
    let prev = -1;
    let repeats = 0;
    for (let i = 0; i < N; i++) {
      const p = rng.nextPiece();
      if (p === prev) repeats++;
      prev = p;
    }
    const rate = repeats / N;
    expect(rate).toBeGreaterThan(0.005); // repeats must still exist (not 7-bag)
    expect(rate).toBeLessThan(0.08);     // but far below uniform's 14.3%
  });
});
