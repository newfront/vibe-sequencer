import { uid } from "./id";
import { INSTRUMENTS } from "./instruments";
import { MAX_BPM, MAX_PITCH, MIN_BPM, MIN_PITCH, PPQ, clamp } from "./music";
import type { InstrumentId, Note, OutputMode, Project, Track } from "./types";

export const TRACK_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#fb7185",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#f97316",
];

export function nextColor(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

export function createTrack(
  index: number,
  overrides: Partial<Track> = {},
): Track {
  return {
    id: uid("trk"),
    name: `Track ${index + 1}`,
    color: nextColor(index),
    instrumentId: "pluck-tri",
    notes: [],
    muted: false,
    soloed: false,
    gain: 0.8,
    pan: 0,
    midiChannel: clamp(index + 1, 1, 16),
    output: "synth",
    ...overrides,
  };
}

export function createNote(overrides: Partial<Note> = {}): Note {
  return {
    id: uid("nte"),
    tick: 0,
    duration: PPQ / 4,
    pitch: 60,
    velocity: 100,
    ...overrides,
  };
}

/** Build a track's notes from `[tick, pitch, duration, velocity?]` tuples. */
function notesFrom(
  rows: [number, number, number, number?][],
  velocity = 100,
): Note[] {
  return rows.map(([tick, pitch, duration, vel]) =>
    createNote({ tick, pitch, duration, velocity: vel ?? velocity }),
  );
}

const BAR = PPQ * 4;

/**
 * The project a fresh session starts from: a two-bar loop in A minor so that
 * pressing play immediately makes a sound.
 */
export function createDefaultProject(): Project {
  const kick = notesFrom(
    [
      [0, 36, 48],
      [BAR / 2, 36, 48],
      [BAR + 0, 36, 48],
      [BAR + BAR / 2, 36, 48],
      [BAR + (BAR * 3) / 4, 36, 48],
    ],
    118,
  );

  const hats: Note[] = [];
  for (let tick = 0; tick < BAR * 2; tick += PPQ / 2) {
    const onBeat = tick % PPQ === 0;
    hats.push(
      createNote({ tick, pitch: 42, duration: PPQ / 4, velocity: onBeat ? 88 : 52 }),
    );
  }

  const bass = notesFrom(
    [
      [0, 33, 168],
      [BAR / 2, 33, 168],
      [BAR, 29, 168],
      [BAR + BAR / 2, 31, 168],
    ],
    100,
  );

  const chords = notesFrom(
    [
      [0, 57, BAR],
      [0, 60, BAR],
      [0, 64, BAR],
      [BAR, 53, BAR / 2],
      [BAR, 57, BAR / 2],
      [BAR, 60, BAR / 2],
      [BAR + BAR / 2, 55, BAR / 2],
      [BAR + BAR / 2, 59, BAR / 2],
      [BAR + BAR / 2, 62, BAR / 2],
    ],
    72,
  );

  const arp = [69, 72, 76, 81, 76, 72, 69, 72, 65, 69, 72, 77, 74, 71, 67, 71];
  const lead = arp.map((pitch, i) =>
    createNote({
      tick: i * (PPQ / 2),
      pitch,
      duration: 44,
      velocity: i % 4 === 0 ? 100 : 84,
    }),
  );

  const tracks: Track[] = [
    createTrack(0, {
      name: "Kick",
      instrumentId: "kick-sine",
      midiChannel: 10,
      notes: kick,
      gain: 0.9,
    }),
    createTrack(1, {
      name: "Hats",
      instrumentId: "perc-noise",
      midiChannel: 10,
      notes: hats,
      gain: 0.5,
    }),
    createTrack(2, {
      name: "Bass",
      instrumentId: "bass-square",
      midiChannel: 1,
      notes: bass,
      gain: 0.85,
    }),
    createTrack(3, {
      name: "Chords",
      instrumentId: "pad-warm",
      midiChannel: 2,
      notes: chords,
      gain: 0.65,
    }),
    createTrack(4, {
      name: "Lead",
      instrumentId: "pluck-tri",
      midiChannel: 3,
      notes: lead,
      gain: 0.8,
    }),
  ];

  return {
    name: "Untitled",
    bpm: 112,
    ppq: PPQ,
    beatsPerBar: 4,
    beatUnit: 4,
    bars: 8,
    loop: { enabled: true, start: 0, end: BAR * 2 },
    tracks,
  };
}

export function createEmptyProject(): Project {
  return {
    name: "Untitled",
    bpm: 120,
    ppq: PPQ,
    beatsPerBar: 4,
    beatUnit: 4,
    bars: 8,
    loop: { enabled: true, start: 0, end: BAR * 4 },
    tracks: [createTrack(0, { name: "Track 1" })],
  };
}

const OUTPUT_MODES: OutputMode[] = ["synth", "midi", "both"];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Coerce untrusted JSON (localStorage, imported files) into a valid Project.
 * Anything unrecognised falls back to a sane default rather than throwing, so a
 * stale save can never leave the app unbootable.
 */
export function normalizeProject(input: unknown): Project {
  const raw = (input ?? {}) as Partial<Project>;
  const ppq = PPQ;
  const beatsPerBar = clamp(Math.round(num(raw.beatsPerBar, 4)), 1, 16);
  const beatUnit = [1, 2, 4, 8, 16].includes(num(raw.beatUnit, 4))
    ? num(raw.beatUnit, 4)
    : 4;
  const ticksPerBar = ((ppq * 4) / beatUnit) * beatsPerBar;
  const bars = clamp(Math.round(num(raw.bars, 8)), 1, 512);
  const songEnd = ticksPerBar * bars;

  const rawTracks = Array.isArray(raw.tracks) ? raw.tracks : [];
  const tracks: Track[] = rawTracks.slice(0, 64).map((t, index) => {
    const track = (t ?? {}) as Partial<Track>;
    const instrumentId = (
      track.instrumentId && track.instrumentId in INSTRUMENTS
        ? track.instrumentId
        : "pluck-tri"
    ) as InstrumentId;
    const rawNotes = Array.isArray(track.notes) ? track.notes : [];
    const notes: Note[] = rawNotes
      .slice(0, 20000)
      .map((n) => {
        const note = (n ?? {}) as Partial<Note>;
        return {
          id: typeof note.id === "string" && note.id ? note.id : uid("nte"),
          tick: clamp(Math.round(num(note.tick, 0)), 0, songEnd),
          duration: clamp(Math.round(num(note.duration, ppq / 4)), 1, songEnd),
          pitch: clamp(Math.round(num(note.pitch, 60)), MIN_PITCH, MAX_PITCH),
          velocity: clamp(Math.round(num(note.velocity, 100)), 1, 127),
        };
      })
      .sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);

    return {
      id: typeof track.id === "string" && track.id ? track.id : uid("trk"),
      name: typeof track.name === "string" ? track.name : `Track ${index + 1}`,
      color: /^#[0-9a-f]{6}$/i.test(String(track.color))
        ? String(track.color)
        : nextColor(index),
      instrumentId,
      notes,
      muted: Boolean(track.muted),
      soloed: Boolean(track.soloed),
      gain: clamp(num(track.gain, 0.8), 0, 1.5),
      pan: clamp(num(track.pan, 0), -1, 1),
      midiChannel: clamp(Math.round(num(track.midiChannel, index + 1)), 1, 16),
      output: OUTPUT_MODES.includes(track.output as OutputMode)
        ? (track.output as OutputMode)
        : "synth",
    };
  });

  const rawLoop = (raw.loop ?? {}) as Partial<Project["loop"]>;
  const loopStart = clamp(Math.round(num(rawLoop.start, 0)), 0, songEnd - 1);
  const loopEnd = clamp(
    Math.round(num(rawLoop.end, ticksPerBar * Math.min(2, bars))),
    loopStart + 1,
    songEnd,
  );

  return {
    name: typeof raw.name === "string" && raw.name ? raw.name : "Untitled",
    bpm: clamp(num(raw.bpm, 120), MIN_BPM, MAX_BPM),
    ppq,
    beatsPerBar,
    beatUnit,
    bars,
    loop: {
      enabled: rawLoop.enabled !== false,
      start: loopStart,
      end: loopEnd,
    },
    tracks: tracks.length ? tracks : [createTrack(0)],
  };
}
