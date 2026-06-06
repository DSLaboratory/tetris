# Horizontal mode

An original design experiment: rotate the classic game sideways, twice,
and join the copies at the middle.

```
                     40 columns wide, 10 rows tall
   +---------------------------+ +---------------------------+
   |   LEFT WELL (20 deep)     | |     RIGHT WELL (20 deep)   |
   |   gravity pulls left      | |    gravity pulls right     |
   |   stack grows from wall   | |  stack grows from wall     |
   +---------------------------+ +---------------------------+
                        spawn at the seam
```

## Rules

- Each half is a standard NES well (10 across, 20 deep in well space).
  Every classic mechanic applies unchanged in well space: gravity table,
  DAS, ARE, NRS rotation, gravity-tick locking, scoring.
- Pieces spawn at the seam, one at a time. Each piece is bound to a side
  by a fair coin flip **rolled at spawn and never announced**. The NEXT
  preview shows the piece in a neutral orientation with no direction;
  guessing which front you will fight next is part of the game.
- Streaks of same-side pieces are real and allowed, exactly like piece
  droughts in the classic randomizer. There is no fairness bag.
- A piece can never cross the seam: moving against gravity does not exist,
  so each half is contaminated only by its own pieces.
- "Lines" are full 10-cell columns. On a clear, that half's stack slides
  outward toward its own wall.
- One score, one lines counter, one level, one fate: either stack reaching
  the seam ends the whole game.

## Controls

Absolute on screen, regardless of which side the piece is on:

- **Up / Down** move the piece along the seam axis. This pair gets the
  full DAS treatment, including wall charging against the top and bottom
  edges.
- **Left / Right** soft-drop, but only the arrow pointing at the active
  piece's wall works; the opposite arrow is dead, like Up on the NES d-pad.
- **Z / X** rotate counter-clockwise / clockwise, as always.

## Implementation notes

- The core game machine is well-count agnostic; the entire mechanical diff
  for this mode is `board: Uint8Array` becoming `wells: Uint8Array[]` plus
  a coin flip at spawn. The word "down" appears nowhere in the core.
- The rotation happens in the renderer only. Each well is drawn as a pure
  rotation of well space: the left well 90 degrees clockwise, the right
  well 90 degrees counter-clockwise. Pure rotations (determinant +1, never
  mirrors) preserve piece chirality, so Z and X mean the same thing on
  both sides.
- The input layer maps physical arrows into well-space directions per side,
  so "screen up" is well-right on one side and well-left on the other and
  the core never knows.

## The side-coin bias

The first implementation shared one LFSR register between the piece picker
and the side coin, and was measurably biased: 45.3 / 54.7 over 60,000
simulated spawns, with 1.6 times the fair rate of lopsided games. The cause
is instructive: the piece picker advances the register a *conditional*
number of steps (one or two, depending on its reroll), and any consumer
reading right after it inherits that structure.

The fix gives sides their own register, read once per spawn. A dedicated
LFSR read this way emits the textbook m-sequence bitstream: balanced over
its whole period, with coin-accurate run lengths. A regression test asserts
fairness using the exact production interleaving.
