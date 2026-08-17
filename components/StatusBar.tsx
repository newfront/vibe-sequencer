"use client";

import { useMemo } from "react";

import { pitchName } from "@/lib/music";
import { useSelectedTrack, useSequencer } from "@/lib/store";

import { Button, Divider, Label } from "./ui";

export function StatusBar() {
  const track = useSelectedTrack();
  const selectedNoteIds = useSequencer((state) => state.selectedNoteIds);
  const beginEdit = useSequencer((state) => state.beginEdit);
  const quantizeSelection = useSequencer((state) => state.quantizeSelection);
  const transposeSelection = useSequencer((state) => state.transposeSelection);
  const setSelectionVelocity = useSequencer((state) => state.setSelectionVelocity);
  const duplicateSelection = useSequencer((state) => state.duplicateSelection);
  const deleteSelection = useSequencer((state) => state.deleteSelection);
  const loopToSelection = useSequencer((state) => state.loopToSelection);

  const notes = useMemo(() => {
    if (!track) return [];
    const ids = new Set(selectedNoteIds);
    return track.notes.filter((note) => ids.has(note.id));
  }, [track, selectedNoteIds]);

  const hasSelection = notes.length > 0;
  const velocity = hasSelection
    ? Math.round(
        notes.reduce((sum, note) => sum + note.velocity, 0) / notes.length,
      )
    : 100;

  return (
    <footer className="flex h-9 shrink-0 items-center gap-2 border-t border-neutral-800 bg-neutral-950 px-3 text-xs">
      <span className="tabular w-40 shrink-0 text-neutral-400">
        {hasSelection
          ? `${notes.length} selected${
              notes.length === 1 ? ` · ${pitchName(notes[0].pitch)}` : ""
            }`
          : "No selection"}
      </span>

      <Divider />

      <Button
        onClick={quantizeSelection}
        disabled={!hasSelection}
        title="Snap selected notes to the grid (Q)"
      >
        Quantize
      </Button>

      <div className="flex items-center gap-1">
        <Label className="mr-1">Pitch</Label>
        <Button
          onClick={() => transposeSelection(-12)}
          disabled={!hasSelection}
          title="Down an octave (⇧↓)"
        >
          −12
        </Button>
        <Button
          onClick={() => transposeSelection(-1)}
          disabled={!hasSelection}
          title="Down a semitone (↓)"
        >
          −1
        </Button>
        <Button
          onClick={() => transposeSelection(1)}
          disabled={!hasSelection}
          title="Up a semitone (↑)"
        >
          +1
        </Button>
        <Button
          onClick={() => transposeSelection(12)}
          disabled={!hasSelection}
          title="Up an octave (⇧↑)"
        >
          +12
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Label>Vel</Label>
        <input
          type="range"
          min={1}
          max={127}
          step={1}
          value={velocity}
          disabled={!hasSelection}
          aria-label="Velocity of selected notes"
          className="w-28 disabled:opacity-40"
          onPointerDown={() => hasSelection && beginEdit()}
          onChange={(event) => setSelectionVelocity(Number(event.target.value))}
        />
        <span className="tabular w-6 text-neutral-500">{velocity}</span>
      </div>

      <Divider />

      <Button
        onClick={duplicateSelection}
        disabled={!hasSelection}
        title="Duplicate after the selection (⌘D)"
      >
        Duplicate
      </Button>
      <Button
        onClick={loopToSelection}
        disabled={!hasSelection}
        title="Set the loop region around the selection"
      >
        Loop to selection
      </Button>
      <Button
        variant="danger"
        onClick={deleteSelection}
        disabled={!hasSelection}
        title="Delete selected notes (Delete)"
      >
        Delete
      </Button>

      <span className="ml-auto hidden shrink-0 text-[11px] text-neutral-600 lg:block">
        drag to draw · ⌥click erase · ⌘drag box-select · space play
      </span>
    </footer>
  );
}
