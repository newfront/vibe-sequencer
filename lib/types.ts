/** Core domain model for the sequencer. All time is expressed in ticks. */

export type InstrumentId =
  | "pad-warm"
  | "lead-saw"
  | "bass-square"
  | "pluck-tri"
  | "bell-sine"
  | "organ"
  | "perc-noise"
  | "kick-sine";

/** A single MIDI note placed on a track. */
export type Note = {
  id: string;
  /** Start position in ticks from the beginning of the song. */
  tick: number;
  /** Length in ticks. Always > 0. */
  duration: number;
  /** MIDI note number, 0-127. */
  pitch: number;
  /** MIDI velocity, 1-127. */
  velocity: number;
};

/** Where a track's notes are sent when the transport is running. */
export type OutputMode = "synth" | "midi" | "both";

export type Track = {
  id: string;
  name: string;
  /** Hex colour used for the track header and its notes in the piano roll. */
  color: string;
  instrumentId: InstrumentId;
  notes: Note[];
  muted: boolean;
  soloed: boolean;
  /** Linear gain, 0-1.5. */
  gain: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan: number;
  /** MIDI channel 1-16, used for external output and file export. */
  midiChannel: number;
  output: OutputMode;
};

/** The loop region. `end` is exclusive: playback wraps back to `start` on reaching it. */
export type LoopRegion = {
  enabled: boolean;
  start: number;
  end: number;
};

export type Project = {
  name: string;
  bpm: number;
  /** Ticks per quarter note. Fixed for the lifetime of a project. */
  ppq: number;
  /** Time signature numerator, e.g. 4 in 4/4. */
  beatsPerBar: number;
  /** Time signature denominator, e.g. 4 in 4/4. */
  beatUnit: number;
  /** Song length in bars. */
  bars: number;
  loop: LoopRegion;
  tracks: Track[];
};
