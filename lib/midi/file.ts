/**
 * Standard MIDI File (SMF) reader and writer.
 *
 * Export produces a format-1 file: a conductor track carrying tempo, time
 * signature and loop markers, followed by one track per sequencer track.
 */

import { uid } from "../id";
import { PPQ, clamp } from "../music";
import { nextColor } from "../project";
import type { InstrumentId, Note, Project, Track } from "../types";

// -- writing ---------------------------------------------------------------

function ascii(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i) & 0x7f);
  return out;
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

/** Variable-length quantity, the delta-time encoding used throughout SMF. */
function vlq(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  v >>>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return bytes;
}

function chunk(id: string, payload: number[]): number[] {
  return [...ascii(id), ...u32(payload.length), ...payload];
}

function metaText(type: number, text: string): number[] {
  const bytes = ascii(text).slice(0, 127);
  return [0xff, type, ...vlq(bytes.length), ...bytes];
}

type TimedEvent = { tick: number; order: number; bytes: number[] };

function serializeEvents(events: TimedEvent[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out: number[] = [];
  let last = 0;
  for (const event of events) {
    out.push(...vlq(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  out.push(...vlq(0), 0xff, 0x2f, 0x00); // end of track
  return out;
}

export function encodeMidiFile(project: Project): Uint8Array {
  const header = chunk("MThd", [
    ...u16(1), // format 1: multiple simultaneous tracks
    ...u16(project.tracks.length + 1),
    ...u16(project.ppq),
  ]);

  const microsPerQuarter = Math.round(60000000 / project.bpm);
  const conductor: TimedEvent[] = [
    { tick: 0, order: 0, bytes: metaText(0x03, project.name || "Sequence") },
    {
      tick: 0,
      order: 1,
      bytes: [
        0xff,
        0x51,
        0x03,
        (microsPerQuarter >> 16) & 0xff,
        (microsPerQuarter >> 8) & 0xff,
        microsPerQuarter & 0xff,
      ],
    },
    {
      tick: 0,
      order: 2,
      bytes: [
        0xff,
        0x58,
        0x04,
        project.beatsPerBar,
        Math.round(Math.log2(project.beatUnit)),
        24,
        8,
      ],
    },
  ];
  if (project.loop.enabled) {
    conductor.push({
      tick: project.loop.start,
      order: 3,
      bytes: metaText(0x06, "LoopStart"),
    });
    conductor.push({
      tick: project.loop.end,
      order: 3,
      bytes: metaText(0x06, "LoopEnd"),
    });
  }

  const bytes = [...header, ...chunk("MTrk", serializeEvents(conductor))];

  for (const track of project.tracks) {
    const channel = clamp(Math.round(track.midiChannel) - 1, 0, 15);
    const events: TimedEvent[] = [
      { tick: 0, order: 0, bytes: metaText(0x03, track.name) },
    ];
    for (const note of track.notes) {
      const pitch = clamp(Math.round(note.pitch), 0, 127);
      const velocity = clamp(Math.round(note.velocity), 1, 127);
      const end = note.tick + Math.max(1, Math.round(note.duration));
      // Note-offs sort before note-ons at the same tick so a repeated pitch
      // retriggers cleanly instead of cutting itself off.
      events.push({
        tick: Math.round(note.tick),
        order: 2,
        bytes: [0x90 | channel, pitch, velocity],
      });
      events.push({
        tick: Math.round(end),
        order: 1,
        bytes: [0x80 | channel, pitch, 0x40],
      });
    }
    bytes.push(...chunk("MTrk", serializeEvents(events)));
  }

  return new Uint8Array(bytes);
}

export function midiFilename(project: Project): string {
  const base = (project.name || "sequence")
    .trim()
    .replace(/[^\w\-. ]+/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${base || "sequence"}.mid`;
}

/** Trigger a browser download of the project as a .mid file. */
export function downloadMidiFile(project: Project) {
  const data = encodeMidiFile(project);
  const blob = new Blob([data as BlobPart], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = midiFilename(project);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the download a beat to start before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// -- reading ---------------------------------------------------------------

class Reader {
  pos = 0;
  constructor(private readonly view: DataView) {}

  get remaining(): number {
    return this.view.byteLength - this.pos;
  }

  u8(): number {
    if (this.pos >= this.view.byteLength) throw new Error("Unexpected end of file");
    const value = this.view.getUint8(this.pos);
    this.pos += 1;
    return value;
  }

  u16(): number {
    const value = this.view.getUint16(this.pos);
    this.pos += 2;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.pos);
    this.pos += 4;
    return value;
  }

  tag(): string {
    let out = "";
    for (let i = 0; i < 4; i += 1) out += String.fromCharCode(this.u8());
    return out;
  }

  bytes(length: number): Uint8Array {
    const start = this.view.byteOffset + this.pos;
    if (this.pos + length > this.view.byteLength) {
      throw new Error("Unexpected end of file");
    }
    this.pos += length;
    return new Uint8Array(this.view.buffer, start, length);
  }

  vlq(): number {
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    return value;
  }
}

const DATA_LENGTHS: Record<number, number> = {
  0x80: 2,
  0x90: 2,
  0xa0: 2,
  0xb0: 2,
  0xc0: 1,
  0xd0: 1,
  0xe0: 2,
};

type ParsedNote = { channel: number; note: Note };

function decodeAscii(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    if (byte >= 32 && byte < 127) out += String.fromCharCode(byte);
  }
  return out.trim();
}

function pickInstrument(channel: number, avgPitch: number): InstrumentId {
  if (channel === 9) return "perc-noise"; // zero-based channel 10
  if (avgPitch < 45) return "bass-square";
  if (avgPitch < 60) return "organ";
  if (avgPitch < 76) return "pluck-tri";
  return "lead-saw";
}

/**
 * Parse a Standard MIDI File into a project.
 *
 * Tempo and time signature come from the first such event found; per-track
 * tempo maps are collapsed to a single tempo, which is all this sequencer
 * models. Ticks are rescaled from the file's division to the app's PPQ.
 */
export function decodeMidiFile(buffer: ArrayBuffer): Project {
  const reader = new Reader(new DataView(buffer));
  if (reader.tag() !== "MThd") {
    throw new Error("Not a MIDI file (missing MThd header).");
  }
  const headerLength = reader.u32();
  const headerEnd = reader.pos + headerLength;
  reader.u16(); // format — we handle 0, 1 and 2 the same way
  const trackCount = reader.u16();
  const division = reader.u16();
  reader.pos = headerEnd;

  if (division & 0x8000) {
    throw new Error("SMPTE timecode MIDI files are not supported.");
  }
  if (division === 0) throw new Error("Invalid MIDI file: zero division.");

  const scale = PPQ / division;
  let bpm = 120;
  let beatsPerBar = 4;
  let beatUnit = 4;
  let sawTempo = false;
  let sawTimeSig = false;

  /** Notes keyed by `trackIndex:channel`, plus a name per track index. */
  const groups = new Map<string, ParsedNote[]>();
  const trackNames = new Map<number, string>();

  for (let index = 0; index < trackCount && reader.remaining > 8; index += 1) {
    const tag = reader.tag();
    const length = reader.u32();
    const end = reader.pos + length;
    if (tag !== "MTrk") {
      reader.pos = end;
      continue;
    }

    let tick = 0;
    let runningStatus = 0;
    // Open note-ons awaiting a matching note-off, keyed by channel:pitch.
    const pending = new Map<string, { tick: number; velocity: number }[]>();

    while (reader.pos < end) {
      tick += reader.vlq();
      let status = reader.u8();
      if (status < 0x80) {
        // Running status: reuse the previous status byte and rewind.
        reader.pos -= 1;
        status = runningStatus;
        if (status < 0x80) break;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        const type = reader.u8();
        const dataLength = reader.vlq();
        const data = reader.bytes(dataLength);
        if (type === 0x51 && dataLength === 3 && !sawTempo) {
          const micros = (data[0] << 16) | (data[1] << 8) | data[2];
          if (micros > 0) {
            bpm = clamp(Math.round((60000000 / micros) * 100) / 100, 20, 300);
            sawTempo = true;
          }
        } else if (type === 0x58 && dataLength >= 2 && !sawTimeSig) {
          beatsPerBar = clamp(data[0] || 4, 1, 16);
          const denominator = 2 ** data[1];
          beatUnit = [1, 2, 4, 8, 16].includes(denominator) ? denominator : 4;
          sawTimeSig = true;
        } else if (type === 0x03 && dataLength > 0) {
          const name = decodeAscii(data);
          if (name && !trackNames.has(index)) trackNames.set(index, name);
        } else if (type === 0x2f) {
          break;
        }
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        reader.bytes(reader.vlq());
        continue;
      }

      const kind = status & 0xf0;
      const channel = status & 0x0f;
      const dataLength = DATA_LENGTHS[kind] ?? 0;
      const first = dataLength > 0 ? reader.u8() : 0;
      const second = dataLength > 1 ? reader.u8() : 0;

      const isNoteOn = kind === 0x90 && second > 0;
      const isNoteOff = kind === 0x80 || (kind === 0x90 && second === 0);
      if (!isNoteOn && !isNoteOff) continue;

      const key = `${channel}:${first}`;
      if (isNoteOn) {
        const stack = pending.get(key) ?? [];
        stack.push({ tick, velocity: second });
        pending.set(key, stack);
        continue;
      }

      const stack = pending.get(key);
      const started = stack?.pop();
      if (!started) continue;
      const groupKey = `${index}:${channel}`;
      const list = groups.get(groupKey) ?? [];
      list.push({
        channel,
        note: {
          id: uid("nte"),
          tick: Math.round(started.tick * scale),
          duration: Math.max(1, Math.round((tick - started.tick) * scale)),
          pitch: clamp(first, 0, 127),
          velocity: clamp(started.velocity, 1, 127),
        },
      });
      groups.set(groupKey, list);
    }

    reader.pos = end;
  }

  const ticksPerBar = ((PPQ * 4) / beatUnit) * beatsPerBar;
  let contentEnd = 0;
  const tracks: Track[] = [];
  let colorIndex = 0;

  for (const [groupKey, entries] of groups) {
    if (entries.length === 0) continue;
    const [trackIndexRaw, channelRaw] = groupKey.split(":");
    const trackIndex = Number(trackIndexRaw);
    const channel = Number(channelRaw);
    const notes = entries
      .map((entry) => entry.note)
      .sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
    for (const note of notes) {
      contentEnd = Math.max(contentEnd, note.tick + note.duration);
    }
    const avgPitch =
      notes.reduce((sum, note) => sum + note.pitch, 0) / notes.length;
    // Several channels inside one MIDI track become separate tracks here, so
    // label them when the distinction matters.
    const channelsInTrack = Array.from(groups.keys()).filter((key) =>
      key.startsWith(`${trackIndex}:`),
    ).length;
    const baseName = trackNames.get(trackIndex) ?? `Track ${trackIndex + 1}`;
    const name =
      channelsInTrack > 1 ? `${baseName} ch${channel + 1}` : baseName;

    tracks.push({
      id: uid("trk"),
      name: name.slice(0, 40),
      color: nextColor(colorIndex),
      instrumentId: pickInstrument(channel, avgPitch),
      notes,
      muted: false,
      soloed: false,
      gain: 0.8,
      pan: 0,
      midiChannel: channel + 1,
      output: "synth",
    });
    colorIndex += 1;
  }

  if (tracks.length === 0) {
    throw new Error("No notes found in that MIDI file.");
  }

  const bars = clamp(Math.ceil(contentEnd / ticksPerBar) || 4, 1, 512);
  const songEnd = bars * ticksPerBar;

  return {
    name: "Imported",
    bpm,
    ppq: PPQ,
    beatsPerBar,
    beatUnit,
    bars,
    loop: { enabled: true, start: 0, end: songEnd },
    tracks,
  };
}
