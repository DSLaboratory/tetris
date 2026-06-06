# NES Tetris — mechanics as they were

A from-scratch implementation of the 1989 NES Tetris ruleset (NTSC). Every
mechanic on the cartridge, none of its presentation. No sound, no sprite art,
no level palettes — and none of the modern guideline either: no hold, no
ghost piece, no hard drop, no wall kicks, no 7-bag.

## Run it

```
npm install
npm run dev      # then open the printed localhost URL
npm test         # the mechanics test suite
```

Classic controls: **← →** move · **↓** soft drop · **Z** rotate
counter-clockwise · **X** rotate clockwise · **Enter** start / pause.

## Horizontal mode

The same machine, rotated. Two standard wells back-to-back (each 10 across,
20 deep in well space), rendered as pure rotations: the left well 90°
clockwise, the right well 90° counter-clockwise. Pieces spawn at the seam
in the middle and each is bound to a side by a raw LFSR coin flip — streaks
are real, exactly like piece droughts. One piece at a time, one score, one
level: either stack reaching the seam ends the whole game.

"Lines" are full 10-cell columns; on a clear, that half's stack slides
outward toward its wall. Every NES mechanic (gravity table, DAS, ARE,
NRS, gravity-tick locking, scoring) applies unchanged in well space —
the core never knows which way is down on screen.

Horizontal controls: **↑ ↓** move (this is the lateral pair, with DAS) ·
**← →** soft drop, but only the arrow pointing at the active piece's wall
works; the other is dead · **Z X** rotate as always. The NEXT preview shows
the coming piece with its direction arrow.

## The mechanics, with their numbers

Everything below is asserted by the test suite in `test/`.

| Mechanic | Behaviour |
|---|---|
| Playfield | 10 × 20; pieces spawn at column 5, row 0 |
| Rotation | Nintendo Rotation System: T/J/L have 4 states, S/Z/I toggle between 2, O has 1. No wall kicks — a blocked rotation simply fails |
| Gravity | Frames per row by level: 48, 43, 38, 33, 28, 23, 18, 13, 8, 6, then 5 (10–12), 4 (13–15), 3 (16–18), 2 (19–28), 1 (29+) |
| Locking | No lock-delay timer. The piece locks on the gravity tick it fails to fall — which is why floor slides work at low levels and vanish at high ones |
| DAS | Press moves immediately; first auto-shift after 16 frames; repeats every 6. A blocked shift keeps the counter charged (wall charging), and the charge carries across spawns |
| Soft drop | One row per 2 frames; 1 point per row of the final uninterrupted descent; Down must be released after each spawn |
| Randomizer | 16-bit LFSR (period 32767), roll 0–7 with one reroll on 7 or a repeat. Streaks and droughts are real; it is not 7-bag |
| Line clears | Play freezes 20 frames while rows blank out in column pairs from the center |
| ARE | 10–18 frames of entry delay after lock, set by lock height; DAS charges through it |
| Scoring | 40 / 100 / 300 / 1200 × (level + 1), using the level *after* a level-up clear; capped at 999,999 |
| Levels | From start level s, first level-up at min((s+1)·10, max(100, s·10−50)) lines, then every 10. Starting at 9 holds for 100 lines |
| Pause | Hides the playfield, as the NES does — no free planning time |
| Top out | Game over when a spawned piece overlaps the stack |

## Architecture

```
src/core/    pure game logic, no DOM — one tick() per NTSC frame
  pieces.ts  NRS orientation tables
  rng.ts     the NES LFSR and piece picker
  tables.ts  every published constant in one place
  game.ts    the state machine: falling -> clearing -> ARE -> falling
src/shell/   the browser around it
  input.ts   keydown/keyup -> per-frame input (OS key-repeat ignored)
  render.ts  flat canvas drawing
  main.ts    fixed-timestep accumulator at 60.0988Hz, display-rate independent
```

## Deliberate deviations

Honesty section: where this is not cycle-exact NES behaviour.

- The randomizer's *second* roll uses a fresh LFSR byte mod 7; hardware mixes
  in the previous piece's orientation id. Distribution is near-identical.
- Cells above the well (y < 0) are treated as collisions, so a vertical
  rotation isn't possible until the piece clears the ceiling. The NES reads
  out-of-bounds memory there; behaviour in the top two rows differs subtly.
- The clear freeze is a flat 20 frames (the NES varies 17–20 with PPU timing).
- The pushdown counter has no BCD wraparound bug above 15 rows.
- NTSC only. PAL has its own gravity and DAS tables; they are not here.
