import type { InstrumentId } from "./types";

/**
 * A compact subtractive-synth patch. One of these drives every voice the
 * built-in engine plays; there are no samples, so the whole kit is a few
 * hundred bytes of numbers.
 */
export type Instrument = {
  id: InstrumentId;
  name: string;
  /** Oscillator shape, or white noise for unpitched percussion. */
  wave: OscillatorType | "noise";
  /** Stacked oscillators, detuned against each other by `detune` cents. */
  voices: 1 | 2;
  detune: number;
  /** Amplitude envelope, in seconds (sustain is a 0-1 level). */
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterType: BiquadFilterType;
  /**
   * Filter cutoff in Hz, or — when `cutoffTracksPitch` is set — a multiplier
   * applied to the note's own frequency.
   */
  cutoff: number;
  cutoffTracksPitch: boolean;
  /** Extra cutoff in Hz at note onset, decaying away with the amp envelope. */
  filterEnv: number;
  q: number;
  /** Semitones of downward pitch sweep at onset (drum-style "thump"). */
  pitchDrop: number;
  pitchDropTime: number;
  /** Patch output level, multiplied by note velocity. */
  gain: number;
};

const base = {
  voices: 1,
  detune: 0,
  filterType: "lowpass",
  cutoffTracksPitch: false,
  filterEnv: 0,
  q: 1,
  pitchDrop: 0,
  pitchDropTime: 0.05,
} satisfies Partial<Instrument>;

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  "pad-warm": {
    ...base,
    id: "pad-warm",
    name: "Warm Pad",
    wave: "triangle",
    voices: 2,
    detune: 7,
    attack: 0.35,
    decay: 0.4,
    sustain: 0.7,
    release: 0.9,
    filterType: "lowpass",
    cutoff: 2200,
    filterEnv: 1200,
    q: 0.6,
    gain: 0.5,
  },
  "lead-saw": {
    ...base,
    id: "lead-saw",
    name: "Saw Lead",
    wave: "sawtooth",
    voices: 2,
    detune: 12,
    attack: 0.01,
    decay: 0.18,
    sustain: 0.6,
    release: 0.22,
    filterType: "lowpass",
    cutoff: 2600,
    filterEnv: 3800,
    q: 3,
    gain: 0.36,
  },
  "bass-square": {
    ...base,
    id: "bass-square",
    name: "Square Bass",
    wave: "square",
    attack: 0.006,
    decay: 0.2,
    sustain: 0.55,
    release: 0.12,
    filterType: "lowpass",
    cutoff: 700,
    filterEnv: 900,
    q: 4,
    gain: 0.5,
  },
  "pluck-tri": {
    ...base,
    id: "pluck-tri",
    name: "Pluck",
    wave: "triangle",
    attack: 0.003,
    decay: 0.28,
    sustain: 0,
    release: 0.18,
    filterType: "lowpass",
    cutoff: 3400,
    filterEnv: 2600,
    q: 1.5,
    gain: 0.55,
  },
  "bell-sine": {
    ...base,
    id: "bell-sine",
    name: "Bell",
    wave: "sine",
    voices: 2,
    detune: 4,
    attack: 0.002,
    decay: 0.9,
    sustain: 0,
    release: 0.8,
    filterType: "lowpass",
    cutoff: 6000,
    q: 0.5,
    gain: 0.45,
  },
  organ: {
    ...base,
    id: "organ",
    name: "Organ",
    wave: "square",
    voices: 2,
    detune: 3,
    attack: 0.012,
    decay: 0.05,
    sustain: 1,
    release: 0.09,
    filterType: "lowpass",
    cutoff: 2400,
    filterEnv: 500,
    q: 0.8,
    gain: 0.3,
  },
  "perc-noise": {
    ...base,
    id: "perc-noise",
    name: "Noise Perc",
    wave: "noise",
    attack: 0.001,
    decay: 0.09,
    sustain: 0,
    release: 0.05,
    filterType: "bandpass",
    cutoff: 3,
    cutoffTracksPitch: true,
    q: 2.5,
    gain: 0.5,
  },
  "kick-sine": {
    ...base,
    id: "kick-sine",
    name: "Kick",
    wave: "sine",
    attack: 0.001,
    decay: 0.32,
    sustain: 0,
    release: 0.06,
    filterType: "lowpass",
    cutoff: 400,
    filterEnv: 200,
    q: 1,
    pitchDrop: 22,
    pitchDropTime: 0.055,
    gain: 0.95,
  },
};

export const INSTRUMENT_LIST: Instrument[] = Object.values(INSTRUMENTS);

export function getInstrument(id: InstrumentId): Instrument {
  return INSTRUMENTS[id] ?? INSTRUMENTS["pluck-tri"];
}
