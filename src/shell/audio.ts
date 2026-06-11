// Procedural sound layer. An observer in the renderer's spirit: it READS the
// Game once per frame and emits short SFX on the events it sees, and never
// writes a single field back. No core import is mutated; nothing here can
// change the simulation. Diffing against last frame's snapshot is the whole
// mechanism, exactly like a renderer diffing to decide what to repaint.
//
// Every sound is synthesised on the spot - square/triangle oscillators with a
// fast gain envelope, NES-flavoured but deliberately NOT the copyrighted music.
// SFX only, no assets. Move and rotate especially are kept quiet and very short
// so machine-gun DAS play never grates.
//
// Browsers refuse audio until a user gesture, so the AudioContext is lazy: the
// shell calls unlock() on the first input and until then every sound no-ops.

import { Game, Phase } from '../core/game';

// --- voice levels (peak gain per event) -------------------------------------
// Move/rotate sit far below everything else on purpose: they fire constantly.
const VOL_MOVE = 0.04;
const VOL_ROTATE = 0.05;
const VOL_LOCK = 0.10;
const VOL_CLEAR = 0.11;
const VOL_TETRIS = 0.16;
const VOL_LEVEL = 0.12;
const VOL_GAMEOVER = 0.13;

// --- pitches (Hz) -----------------------------------------------------------
// A small chiptune scale; named so the layout reads like the renderer's COLORS.
const C3 = 130.81;
const G3 = 196.00;
const A4 = 440;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const E6 = 1318.51;

// A short rising figure for a normal (1-3 line) clear. The Tetris (4 lines) gets
// its own fanfare in tetris(), too big for a plain arpeggio.
const CLEAR_RISE = [C5, E5, G5];
// The notes of the rising run before the Tetris landing chord.
const TETRIS_RUN = [C5, E5, G5, C6, E6];
// The descending sigh on game over.
const GAMEOVER_FALL = [A5, E5, C5, A4];

// --- durations (seconds) ----------------------------------------------------
const DUR_MOVE = 0.025;
const DUR_ROTATE = 0.04;
const DUR_LOCK = 0.07;
const NOTE_CLEAR = 0.06;   // per note in the rising clear figure
const NOTE_LEVEL = 0.07;   // per note in the level-up tone
const NOTE_GAMEOVER = 0.16; // per note in the descending game-over tone

// What we remember between frames - just enough to diff the events we care
// about. Mirrors the renderer's read-only view of Game.
interface Snapshot {
  px: number | null;   // active piece x, or null when there is no live piece
  rot: number | null;  // active piece rotation
  hadPiece: boolean;   // a piece was falling last frame
  phase: Phase;
  lines: number;
  level: number;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  mute = false;
  private prev: Snapshot | null = null;

  // Create or resume the context. Safe to call on every input; only the first
  // call (under a user gesture) actually does anything. A suspended context -
  // tab backgrounded, autoplay policy - is resumed here too.
  unlock(): void {
    if (!this.ctx) {
      // Guard the vendor-prefixed name without leaning on a global type.
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return; // no Web Audio: stay a silent no-op forever
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      // A compressor on the bus glues simultaneous notes together and gives the
      // bigger events (the Tetris fanfare, a level-up clear) punch without clipping.
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): void {
    this.mute = !this.mute;
  }

  // Drop the remembered frame; the shell calls this when a new game starts so
  // the first observe() of a fresh game emits nothing spurious.
  reset(): void {
    this.prev = null;
  }

  // Called once per frame. Diff against last frame and voice each event. The
  // very first frame after a reset only seeds the snapshot (no sound), so a
  // game start is silent. Paused frames are skipped entirely.
  observe(g: Game): void {
    const snap = snapshot(g);
    const prev = this.prev;
    this.prev = snap;

    if (prev === null || g.paused) return;
    if (!this.ctx || this.mute) return;

    // Game over: a one-shot descending tone the moment the phase flips.
    if (g.phase === 'gameover' && prev.phase !== 'gameover') {
      this.arpeggio(GAMEOVER_FALL, NOTE_GAMEOVER, VOL_GAMEOVER, 'triangle');
      return; // nothing else matters once the game is over
    }

    // Line clears: read off the lines delta. A four-line jump is a Tetris.
    if (g.lines > prev.lines) {
      const cleared = g.lines - prev.lines;
      if (cleared >= 4) this.tetris();
      else this.arpeggio(CLEAR_RISE.slice(0, cleared), NOTE_CLEAR, VOL_CLEAR, 'square');
    }

    // Level up: a quick two-note rise. Independent of the clear above - a
    // level-up clear gets both, exactly as it deserves.
    if (g.level > prev.level) {
      this.arpeggio([G5, C6], NOTE_LEVEL, VOL_LEVEL, 'square');
    }

    // Lock: a piece was falling and is now gone. A no-line lock lands in 'are';
    // a line-clearing lock lands in 'clearing' and gets the clear flourish
    // instead, so we only thud on the entry into 'are' (lines bump later, in
    // finishClear, so a lines-delta guard here would still be false at lock).
    const justLocked = prev.hadPiece && prev.phase === 'falling';
    if (justLocked && g.phase === 'are') {
      this.blip(A4, DUR_LOCK, VOL_LOCK, 'triangle');
    }

    // Live-piece events only make sense while the same piece keeps falling.
    if (g.phase === 'falling' && prev.phase === 'falling' && g.piece && prev.px !== null) {
      if (g.piece.rot !== prev.rot) this.blip(E6, DUR_ROTATE, VOL_ROTATE, 'square');
      else if (g.piece.x !== prev.px) this.blip(C6, DUR_MOVE, VOL_MOVE, 'square');
    }
  }

  // One short note: an oscillator through a percussive gain envelope, started
  // and stopped so it cleans itself up. The ?? guards keep TS happy when the
  // context never came up; unlock() being a no-op makes these no-ops too.
  private blip(freq: number, dur: number, peak: number, type: OscillatorType): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    // Tiny attack to avoid a click, then an exponential decay to near-silence.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // A sequence of blips, one per step, used for clears / level-up / game over.
  private arpeggio(freqs: number[], step: number, peak: number, type: OscillatorType): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const base = ctx.currentTime;
    freqs.forEach((freq, i) => this.scheduled(freq, base + i * step, step, peak, type));
  }

  // As blip(), but at an absolute start time so notes can be chained.
  private scheduled(freq: number, start: number, dur: number, peak: number, type: OscillatorType): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  // The Tetris (4-line) fanfare: a low punch on the hit, then a fast rising run
  // (each note doubled an octave down for body) resolving onto a mid chord that
  // decays on its own — a satisfying landing, no harsh high ring at the tail.
  private tetris(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.scheduled(G3, t, 0.2, VOL_TETRIS, 'square');           // low punch
    this.scheduled(C3, t, 0.2, VOL_TETRIS * 0.8, 'triangle');
    TETRIS_RUN.forEach((f, i) => {                              // rising run, doubled an octave down
      const s = t + 0.03 + i * 0.05;
      this.scheduled(f, s, 0.08, VOL_TETRIS, 'square');
      this.scheduled(f / 2, s, 0.08, VOL_TETRIS * 0.4, 'triangle');
    });
    // Landing chord: lower and softer than the run, mostly triangle, decaying
    // naturally — resolves the fanfare without the held high ring that grated.
    const c = t + 0.03 + TETRIS_RUN.length * 0.05;
    this.scheduled(C5, c, 0.34, VOL_TETRIS * 0.7, 'triangle');
    this.scheduled(E5, c, 0.34, VOL_TETRIS * 0.55, 'triangle');
    this.scheduled(G5, c, 0.34, VOL_TETRIS * 0.5, 'triangle');
    this.scheduled(C6, c, 0.34, VOL_TETRIS * 0.4, 'square');    // a touch of sparkle on top
  }
}

function snapshot(g: Game): Snapshot {
  return {
    px: g.piece ? g.piece.x : null,
    rot: g.piece ? g.piece.rot : null,
    hadPiece: g.piece !== null,
    phase: g.phase,
    lines: g.lines,
    level: g.level,
  };
}
