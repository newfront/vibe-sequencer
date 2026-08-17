"use client";

import { useRef } from "react";

import { engine } from "@/lib/audio/engine";
import { useIsPlaying, useRafLoop } from "@/lib/hooks";
import {
  MAX_BPM,
  MIN_BPM,
  formatPosition,
  formatTime,
  secondsPerTick,
  ticksPerBar,
} from "@/lib/music";
import { useSequencer } from "@/lib/store";

import {
  Button,
  CommitNumber,
  Divider,
  IconButton,
  Label,
  LoopIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  Select,
  StopIcon,
} from "./ui";

/** Position and elapsed-time readouts, written straight to the DOM each frame. */
function PositionReadout() {
  const positionRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  useRafLoop(() => {
    const { project } = useSequencer.getState();
    const tick = engine.getPositionTick();

    const position = formatPosition(project, tick);
    if (positionRef.current && positionRef.current.textContent !== position) {
      positionRef.current.textContent = position;
    }
    const time = formatTime(tick * secondsPerTick(project));
    if (timeRef.current && timeRef.current.textContent !== time) {
      timeRef.current.textContent = time;
    }
  });

  return (
    <div className="flex items-baseline gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1">
      <span
        ref={positionRef}
        className="tabular w-24 font-mono text-lg leading-6 text-sky-300"
      >
        1.1.00
      </span>
      <span ref={timeRef} className="tabular w-14 font-mono text-xs text-neutral-500">
        0:00.0
      </span>
    </div>
  );
}

const BEATS = [2, 3, 4, 5, 6, 7, 9, 12];
const UNITS = [2, 4, 8, 16];

export function TransportBar() {
  const playing = useIsPlaying();
  const project = useSequencer((state) => state.project);
  const setBpm = useSequencer((state) => state.setBpm);
  const setBars = useSequencer((state) => state.setBars);
  const setTimeSignature = useSequencer((state) => state.setTimeSignature);
  const toggleLoop = useSequencer((state) => state.toggleLoop);
  const setLoop = useSequencer((state) => state.setLoop);

  const barTicks = ticksPerBar(project);
  const toBar = (tick: number) => Math.round((tick / barTicks + 1) * 100) / 100;
  const fromBar = (bar: number) => Math.round((bar - 1) * barTicks);
  const loopBars = Math.round(((project.loop.end - project.loop.start) / barTicks) * 100) / 100;

  return (
    <div className="flex h-14 shrink-0 flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-3">
      <div className="flex items-center gap-1">
        <IconButton
          title="Return to start"
          aria-label="Return to start"
          onClick={() => engine.seek(0)}
        >
          <RewindIcon />
        </IconButton>
        <IconButton
          title={playing ? "Pause (Space)" : "Play (Space)"}
          aria-label={playing ? "Pause" : "Play"}
          variant={playing ? "default" : "primary"}
          onClick={() => engine.toggle()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <IconButton
          title="Stop and rewind (Enter)"
          aria-label="Stop"
          onClick={() => engine.stop()}
        >
          <StopIcon />
        </IconButton>
      </div>

      <PositionReadout />

      <Divider />

      <div className="flex items-center gap-2">
        <Label>Tempo</Label>
        <CommitNumber
          label="Tempo in BPM"
          value={project.bpm}
          onCommit={setBpm}
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          className="w-16"
        />
        <span className="text-[10px] text-neutral-600">BPM</span>
      </div>

      <div className="flex items-center gap-1">
        <Label className="mr-1">Sig</Label>
        <Select
          value={project.beatsPerBar}
          aria-label="Beats per bar"
          className="w-14"
          onChange={(event) =>
            setTimeSignature(Number(event.target.value), project.beatUnit)
          }
        >
          {BEATS.map((beats) => (
            <option key={beats} value={beats}>
              {beats}
            </option>
          ))}
        </Select>
        <span className="text-neutral-600">/</span>
        <Select
          value={project.beatUnit}
          aria-label="Beat unit"
          className="w-14"
          onChange={(event) =>
            setTimeSignature(project.beatsPerBar, Number(event.target.value))
          }
        >
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label>Length</Label>
        <CommitNumber
          label="Song length in bars"
          value={project.bars}
          onCommit={setBars}
          min={1}
          max={512}
          className="w-16"
        />
        <span className="text-[10px] text-neutral-600">BARS</span>
      </div>

      <Divider />

      <div className="flex items-center gap-2">
        <Button
          active={project.loop.enabled}
          onClick={toggleLoop}
          title="Toggle looping (L)"
        >
          <LoopIcon />
          Loop
        </Button>
        <CommitNumber
          label="Loop start bar"
          value={toBar(project.loop.start)}
          onCommit={(bar) => setLoop(fromBar(bar), project.loop.end)}
          min={1}
          max={project.bars}
          step={1}
          className="w-14"
          title="Loop start (bar)"
        />
        <span className="text-neutral-600">→</span>
        <CommitNumber
          label="Loop end bar"
          value={toBar(project.loop.end)}
          onCommit={(bar) => setLoop(project.loop.start, fromBar(bar))}
          min={1}
          max={project.bars + 1}
          step={1}
          className="w-14"
          title="Loop end (bar, exclusive)"
        />
        <span className="tabular text-[10px] text-neutral-600">
          {loopBars} {loopBars === 1 ? "bar" : "bars"}
        </span>
      </div>
    </div>
  );
}
