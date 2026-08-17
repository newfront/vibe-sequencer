import type { Project } from "./types";

/** Ticks per quarter note. 96 divides cleanly by 2, 3, 4, 6, 8, 12, 16, 24, 32. */
export const PPQ = 96;

export const MIN_PITCH = 0;
export const MAX_PITCH = 127;
export const MIN_BPM = 20;
export const MAX_BPM = 300;

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

/** Pitch classes that are black keys on a piano. */
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(pitch: number): boolean {
  return BLACK_KEYS.has(((pitch % 12) + 12) % 12);
}

/** "C4" for MIDI note 60. */
export function pitchName(pitch: number): string {
  const name = NOTE_NAMES[((pitch % 12) + 12) % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return `${name}${octave}`;
}

export function midiToFreq(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

export function ticksPerBeat(project: Project): number {
  // A "beat" is one unit of the time signature denominator: in 6/8 a beat is an eighth.
  return (project.ppq * 4) / project.beatUnit;
}

export function ticksPerBar(project: Project): number {
  return ticksPerBeat(project) * project.beatsPerBar;
}

export function songEndTick(project: Project): number {
  return ticksPerBar(project) * project.bars;
}

export function secondsPerTick(project: Project): number {
  // ppq ticks per quarter note; bpm is quarter notes per minute.
  return 60 / (project.bpm * project.ppq);
}

/** Musical position as `bar.beat.tick`, all 1-based, for the transport display. */
export function formatPosition(project: Project, tick: number): string {
  const tpb = ticksPerBeat(project);
  const tpBar = ticksPerBar(project);
  const clamped = Math.max(0, tick);
  const bar = Math.floor(clamped / tpBar) + 1;
  const beat = Math.floor((clamped % tpBar) / tpb) + 1;
  const rest = Math.floor(clamped % tpb);
  return `${bar}.${beat}.${String(rest).padStart(2, "0")}`;
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const ms = Math.floor((total % 1) * 10);
  return `${mins}:${String(secs).padStart(2, "0")}.${ms}`;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Grid resolutions offered in the snap selector, in ticks (based on PPQ). */
export const SNAP_OPTIONS: { label: string; ticks: number }[] = [
  { label: "1/1", ticks: PPQ * 4 },
  { label: "1/2", ticks: PPQ * 2 },
  { label: "1/4", ticks: PPQ },
  { label: "1/8", ticks: PPQ / 2 },
  { label: "1/8T", ticks: PPQ / 3 },
  { label: "1/16", ticks: PPQ / 4 },
  { label: "1/16T", ticks: PPQ / 6 },
  { label: "1/32", ticks: PPQ / 8 },
  { label: "Off", ticks: 1 },
];

export function snapTick(tick: number, snap: number): number {
  if (snap <= 1) return Math.round(tick);
  return Math.round(tick / snap) * snap;
}

export function floorToSnap(tick: number, snap: number): number {
  if (snap <= 1) return Math.floor(tick);
  return Math.floor(tick / snap) * snap;
}
