# Sequencer

Client-only browser MIDI sequencer: multi-track piano roll, looping, a built-in Web Audio synth, optional Web MIDI out to hardware, and Standard MIDI File (`.mid`) import/export. No server, auth, or database — projects autosave to `localStorage`.

Architecture, keyboard map, and file layout: [README.md](README.md).

## Run

```bash
pnpm install
pnpm dev      # http://localhost:3000
```

## MIDI import / export

Both live in the top bar:

| Action | How |
| --- | --- |
| **Import** | Click **Import MIDI** → pick a `.mid` / `.midi` file. Playback stops and the file replaces the current project (tracks, notes, tempo from the first tempo event). |
| **Export** | Click **Export MIDI** → downloads `{project-name}.mid` as a Standard MIDI File for a DAW. |

Under the hood: `decodeMidiFile` / `downloadMidiFile` in `lib/midi/file.ts`. Channels in one MIDI track become separate tracks on import. One tempo and time signature per project; SMPTE timecode files are rejected.
