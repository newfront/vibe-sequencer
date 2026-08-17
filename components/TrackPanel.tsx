"use client";

import { INSTRUMENT_LIST } from "@/lib/instruments";
import { useSequencer } from "@/lib/store";
import type { OutputMode, Track } from "@/lib/types";

import {
  Button,
  CopyIcon,
  IconButton,
  Label,
  PlusIcon,
  Select,
  TextInput,
  TrashIcon,
  cx,
} from "./ui";

const OUTPUTS: { value: OutputMode; label: string }[] = [
  { value: "synth", label: "Synth" },
  { value: "midi", label: "MIDI" },
  { value: "both", label: "Both" },
];

function TrackRow({
  track,
  selected,
  canDelete,
}: {
  track: Track;
  selected: boolean;
  canDelete: boolean;
}) {
  const selectTrack = useSequencer((state) => state.selectTrack);
  const updateTrack = useSequencer((state) => state.updateTrack);
  const removeTrack = useSequencer((state) => state.removeTrack);
  const duplicateTrack = useSequencer((state) => state.duplicateTrack);
  const clearTrack = useSequencer((state) => state.clearTrack);

  return (
    <div
      onPointerDown={() => selectTrack(track.id)}
      className={cx(
        "border-b border-neutral-800/80 px-2 py-2 transition-colors",
        selected ? "bg-neutral-800/50" : "hover:bg-neutral-900",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-6 w-1.5 shrink-0 rounded-full"
          style={{ background: track.color }}
        />
        <TextInput
          value={track.name}
          aria-label={`Track name for ${track.name}`}
          className="h-6 min-w-0 flex-1 border-transparent bg-transparent px-1 font-medium hover:border-neutral-700 focus:bg-neutral-900"
          onChange={(event) => updateTrack(track.id, { name: event.target.value })}
          onKeyDown={(event) => event.stopPropagation()}
        />
        <button
          type="button"
          title="Mute"
          aria-label={`Mute ${track.name}`}
          aria-pressed={track.muted}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
          className={cx(
            "h-6 w-6 shrink-0 rounded border text-[10px] font-bold",
            track.muted
              ? "border-amber-400/60 bg-amber-400/20 text-amber-300"
              : "border-neutral-700 text-neutral-500 hover:text-neutral-300",
          )}
        >
          M
        </button>
        <button
          type="button"
          title="Solo"
          aria-label={`Solo ${track.name}`}
          aria-pressed={track.soloed}
          onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
          className={cx(
            "h-6 w-6 shrink-0 rounded border text-[10px] font-bold",
            track.soloed
              ? "border-sky-400/60 bg-sky-400/20 text-sky-300"
              : "border-neutral-700 text-neutral-500 hover:text-neutral-300",
          )}
        >
          S
        </button>
      </div>

      {selected ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <Select
              value={track.instrumentId}
              aria-label="Instrument"
              className="h-6 min-w-0 flex-1"
              onChange={(event) =>
                updateTrack(track.id, {
                  instrumentId: event.target
                    .value as Track["instrumentId"],
                })
              }
            >
              {INSTRUMENT_LIST.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.name}
                </option>
              ))}
            </Select>
            <Select
              value={track.output}
              aria-label="Output"
              title="Where this track's notes are sent"
              className="h-6 w-20"
              onChange={(event) =>
                updateTrack(track.id, {
                  output: event.target.value as OutputMode,
                })
              }
            >
              {OUTPUTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={track.midiChannel}
              aria-label="MIDI channel"
              title="MIDI channel"
              className="h-6 w-14"
              onChange={(event) =>
                updateTrack(track.id, {
                  midiChannel: Number(event.target.value),
                })
              }
            >
              {Array.from({ length: 16 }, (_, i) => i + 1).map((channel) => (
                <option key={channel} value={channel}>
                  ch{channel}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
            <Label>Vol</Label>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={track.gain}
              aria-label="Track volume"
              onChange={(event) =>
                updateTrack(track.id, { gain: Number(event.target.value) })
              }
            />
            <Label>Pan</Label>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.02}
              value={track.pan}
              aria-label="Track pan"
              onChange={(event) =>
                updateTrack(track.id, { pan: Number(event.target.value) })
              }
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="tabular mr-auto text-[10px] text-neutral-500">
              {track.notes.length} note{track.notes.length === 1 ? "" : "s"}
            </span>
            <Button
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              title="Remove every note on this track"
              onClick={() => clearTrack(track.id)}
              disabled={track.notes.length === 0}
            >
              Clear
            </Button>
            <IconButton
              variant="ghost"
              className="h-6 w-6"
              title="Duplicate track"
              aria-label="Duplicate track"
              onClick={() => duplicateTrack(track.id)}
            >
              <CopyIcon />
            </IconButton>
            <IconButton
              variant="ghost"
              className="h-6 w-6 hover:text-rose-300"
              title="Delete track"
              aria-label="Delete track"
              disabled={!canDelete}
              onClick={() => removeTrack(track.id)}
            >
              <TrashIcon />
            </IconButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TrackPanel() {
  const tracks = useSequencer((state) => state.project.tracks);
  const selectedTrackId = useSequencer((state) => state.selectedTrackId);
  const addTrack = useSequencer((state) => state.addTrack);

  return (
    <aside className="flex w-68 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-neutral-800 px-2">
        <Label>Tracks</Label>
        <span className="tabular text-[10px] text-neutral-600">
          {tracks.length}
        </span>
        <IconButton
          className="ml-auto"
          title="Add track"
          aria-label="Add track"
          onClick={addTrack}
        >
          <PlusIcon />
        </IconButton>
      </div>

      <div className="scroll-dark min-h-0 flex-1 overflow-y-auto">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            selected={track.id === selectedTrackId}
            canDelete={tracks.length > 1}
          />
        ))}
      </div>
    </aside>
  );
}
