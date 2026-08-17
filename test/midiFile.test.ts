import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeMidiFile, encodeMidiFile } from "../lib/midi/file";
import { createDefaultProject } from "../lib/project";
import type { Note, Project } from "../lib/types";

/** Compare notes by musical content; ids are regenerated on import. */
function shape(notes: Note[]) {
  return [...notes]
    .map((note) => [note.tick, note.pitch, note.duration, note.velocity])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function roundTrip(project: Project): Project {
  const bytes = encodeMidiFile(project);
  return decodeMidiFile(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );
}

test("writes a well-formed SMF header", () => {
  const project = createDefaultProject();
  const bytes = encodeMidiFile(project);
  assert.equal(
    String.fromCharCode(...bytes.slice(0, 4)),
    "MThd",
    "starts with the header chunk",
  );
  const view = new DataView(bytes.buffer as ArrayBuffer);
  assert.equal(view.getUint32(4), 6, "header chunk is 6 bytes");
  assert.equal(view.getUint16(8), 1, "format 1");
  assert.equal(
    view.getUint16(10),
    project.tracks.length + 1,
    "one track per part plus the conductor track",
  );
  assert.equal(view.getUint16(12), project.ppq, "division is the project PPQ");
});

test("round-trips the default project through a MIDI file", () => {
  const project = createDefaultProject();
  const decoded = roundTrip(project);

  assert.equal(decoded.bpm, project.bpm, "tempo survives");
  assert.equal(decoded.beatsPerBar, project.beatsPerBar);
  assert.equal(decoded.beatUnit, project.beatUnit);
  assert.equal(decoded.tracks.length, project.tracks.length);

  for (const [index, source] of project.tracks.entries()) {
    const target = decoded.tracks[index];
    assert.equal(target.name, source.name, `track ${index} name`);
    assert.equal(
      target.midiChannel,
      source.midiChannel,
      `track ${index} channel`,
    );
    assert.deepEqual(
      shape(target.notes),
      shape(source.notes),
      `track ${index} notes`,
    );
  }
});

test("round-trips positions that need multi-byte delta times", () => {
  // Deltas above 127 ticks must be encoded as variable-length quantities.
  const project: Project = {
    name: "VLQ",
    bpm: 90,
    ppq: 96,
    beatsPerBar: 4,
    beatUnit: 4,
    bars: 400,
    loop: { enabled: false, start: 0, end: 384 },
    tracks: [
      {
        id: "t1",
        name: "Sparse",
        color: "#38bdf8",
        instrumentId: "pluck-tri",
        notes: [
          { id: "a", tick: 0, duration: 24, pitch: 60, velocity: 100 },
          { id: "b", tick: 129, duration: 300, pitch: 62, velocity: 40 },
          { id: "c", tick: 100_000, duration: 4096, pitch: 48, velocity: 127 },
        ],
        muted: false,
        soloed: false,
        gain: 0.8,
        pan: 0,
        midiChannel: 5,
        output: "synth",
      },
    ],
  };

  const decoded = roundTrip(project);
  assert.equal(decoded.tracks.length, 1);
  assert.deepEqual(shape(decoded.tracks[0].notes), shape(project.tracks[0].notes));
  assert.equal(decoded.bpm, 90);
  assert.equal(decoded.tracks[0].midiChannel, 5);
});

test("keeps repeated pitches separate rather than merging them", () => {
  // Two back-to-back notes on the same pitch: the note-off for the first must
  // sort before the note-on for the second, or they collapse into one note.
  const project: Project = {
    name: "Repeat",
    bpm: 120,
    ppq: 96,
    beatsPerBar: 4,
    beatUnit: 4,
    bars: 2,
    loop: { enabled: false, start: 0, end: 384 },
    tracks: [
      {
        id: "t1",
        name: "Repeat",
        color: "#38bdf8",
        instrumentId: "pluck-tri",
        notes: [
          { id: "a", tick: 0, duration: 96, pitch: 60, velocity: 100 },
          { id: "b", tick: 96, duration: 96, pitch: 60, velocity: 80 },
          { id: "c", tick: 192, duration: 96, pitch: 60, velocity: 60 },
        ],
        muted: false,
        soloed: false,
        gain: 0.8,
        pan: 0,
        midiChannel: 1,
        output: "synth",
      },
    ],
  };

  const decoded = roundTrip(project);
  assert.equal(decoded.tracks[0].notes.length, 3, "all three notes survive");
  assert.deepEqual(shape(decoded.tracks[0].notes), shape(project.tracks[0].notes));
});

test("rejects files that are not MIDI", () => {
  const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.throws(
    () => decodeMidiFile(junk.buffer as ArrayBuffer),
    /Not a MIDI file/,
  );
});
