"use client";

import { useEffect, useRef, useState } from "react";

import { engine } from "@/lib/audio/engine";
import { useMidiState } from "@/lib/hooks";
import { decodeMidiFile, downloadMidiFile } from "@/lib/midi/file";
import { isMidiSupported } from "@/lib/midi/output";
import { useSequencer } from "@/lib/store";

import {
  Button,
  Divider,
  IconButton,
  Label,
  Select,
  TextInput,
  UndoIcon,
} from "./ui";

export function TopBar() {
  const name = useSequencer((state) => state.project.name);
  const setName = useSequencer((state) => state.setName);
  const undo = useSequencer((state) => state.undo);
  const redo = useSequencer((state) => state.redo);
  const hasPast = useSequencer((state) => state.past.length > 0);
  const hasFuture = useSequencer((state) => state.future.length > 0);
  const loadProject = useSequencer((state) => state.loadProject);
  const newProject = useSequencer((state) => state.newProject);

  const midi = useMidiState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [volume, setVolume] = useState(() => engine.getMasterGain());

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    event.target.value = "";
    if (!file) return;
    try {
      const project = decodeMidiFile(await file.arrayBuffer());
      engine.stop();
      loadProject(project);
      setMessage(
        `Imported ${file.name}: ${project.tracks.length} track${
          project.tracks.length === 1 ? "" : "s"
        } at ${project.bpm} BPM.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not read that MIDI file.",
      );
    }
  };

  const handleEnableMidi = async () => {
    try {
      const ports = await engine.midi.enable();
      if (ports.length === 0) {
        setMessage("No MIDI outputs found. Connect a device and try again.");
        return;
      }
      engine.midi.select(ports[0].id);
      setMessage(`MIDI output: ${ports[0].name}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not access MIDI.",
      );
    }
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3">
      <span className="rounded bg-sky-500/15 px-2 py-1 text-[11px] font-bold tracking-widest text-sky-300">
        SEQ
      </span>

      <TextInput
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label="Project name"
        className="w-44"
        placeholder="Untitled"
      />

      <Divider />

      <IconButton
        title="Undo (⌘Z)"
        onClick={undo}
        disabled={!hasPast}
        aria-label="Undo"
      >
        <UndoIcon />
      </IconButton>
      <IconButton
        title="Redo (⇧⌘Z)"
        onClick={redo}
        disabled={!hasFuture}
        aria-label="Redo"
      >
        <UndoIcon flip />
      </IconButton>

      <Divider />

      <Button
        onClick={() => {
          if (
            window.confirm("Start a new empty project? Unsaved changes are lost.")
          ) {
            engine.stop();
            newProject();
          }
        }}
      >
        New
      </Button>
      <Button onClick={() => fileRef.current?.click()}>Import MIDI</Button>
      <Button
        onClick={() => downloadMidiFile(useSequencer.getState().project)}
        title="Download as a Standard MIDI File"
      >
        Export MIDI
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        className="hidden"
        onChange={handleImport}
      />

      {message ? (
        <span className="ml-1 truncate text-xs text-sky-300/90" role="status">
          {message}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {isMidiSupported() ? (
          midi.enabled ? (
            <Select
              value={midi.selectedId ?? ""}
              onChange={(event) =>
                engine.midi.select(event.target.value || null)
              }
              aria-label="MIDI output port"
              className="max-w-44"
            >
              <option value="">No MIDI output</option>
              {midi.ports.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.name}
                </option>
              ))}
            </Select>
          ) : (
            <Button onClick={handleEnableMidi} title="Request Web MIDI access">
              Enable MIDI out
            </Button>
          )
        ) : (
          <span className="text-[11px] text-neutral-600">No Web MIDI</span>
        )}

        <Divider />

        <div className="flex items-center gap-2">
          <Label>Main</Label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Master volume"
            title={`Master volume ${Math.round(volume * 100)}%`}
            className="w-24"
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              engine.setMasterGain(next);
            }}
          />
        </div>
      </div>
    </header>
  );
}
