"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { engine } from "@/lib/audio/engine";
import { useRafLoop } from "@/lib/hooks";
import {
  MAX_PITCH,
  MIN_PITCH,
  SNAP_OPTIONS,
  floorToSnap,
  isBlackKey,
  pitchName,
  snapTick,
  ticksPerBar,
  ticksPerBeat,
} from "@/lib/music";
import { useSequencer } from "@/lib/store";
import type { Note, Project, Track } from "@/lib/types";

import { Button, Divider, IconButton, Label, Select, cx } from "./ui";

const KEY_WIDTH = 72;
const LOOP_LANE = 12;
const RULER_HEIGHT = 30;
const ROW_COUNT = MAX_PITCH - MIN_PITCH + 1;
/** Grab zone on a note's right edge for length dragging. */
const RESIZE_GRIP = 7;

type Gesture =
  | { kind: "draw"; noteId: string; anchorTick: number }
  | {
      kind: "move";
      anchorId: string;
      startTick: number;
      startPitch: number;
      lastPitch: number;
      origins: Map<string, { tick: number; pitch: number }>;
    }
  | { kind: "resize"; startTick: number; origins: Map<string, number> }
  | { kind: "marquee"; x0: number; y0: number };

type Marquee = { left: number; top: number; width: number; height: number };

// -- toolbar ---------------------------------------------------------------

function EditorToolbar({ track }: { track: Track | undefined }) {
  const snap = useSequencer((state) => state.snap);
  const drawLength = useSequencer((state) => state.drawLength);
  const pxPerTick = useSequencer((state) => state.pxPerTick);
  const rowHeight = useSequencer((state) => state.rowHeight);
  const showGhosts = useSequencer((state) => state.showGhosts);
  const followPlayhead = useSequencer((state) => state.followPlayhead);
  const setSnap = useSequencer((state) => state.setSnap);
  const setDrawLength = useSequencer((state) => state.setDrawLength);
  const setPxPerTick = useSequencer((state) => state.setPxPerTick);
  const setRowHeight = useSequencer((state) => state.setRowHeight);
  const toggleGhosts = useSequencer((state) => state.toggleGhosts);
  const toggleFollow = useSequencer((state) => state.toggleFollow);

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
        {track ? (
          <>
            <span
              aria-hidden
              className="h-3 w-1.5 rounded-full"
              style={{ background: track.color }}
            />
            {track.name}
          </>
        ) : (
          "No track"
        )}
      </span>

      <Divider />

      <div className="flex items-center gap-1.5">
        <Label>Grid</Label>
        <Select
          value={snap}
          aria-label="Grid resolution"
          className="w-20"
          onChange={(event) => setSnap(Number(event.target.value))}
        >
          {SNAP_OPTIONS.map((option) => (
            <option key={option.label} value={option.ticks}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Label>Length</Label>
        <Select
          value={drawLength}
          aria-label="Length of newly drawn notes"
          className="w-20"
          onChange={(event) => setDrawLength(Number(event.target.value))}
        >
          {SNAP_OPTIONS.filter((option) => option.ticks > 1).map((option) => (
            <option key={option.label} value={option.ticks}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <Divider />

      <div className="flex items-center gap-1">
        <Label className="mr-1">Zoom</Label>
        <IconButton
          title="Zoom out"
          aria-label="Zoom out horizontally"
          onClick={() => setPxPerTick(pxPerTick / 1.4)}
        >
          −
        </IconButton>
        <IconButton
          title="Zoom in"
          aria-label="Zoom in horizontally"
          onClick={() => setPxPerTick(pxPerTick * 1.4)}
        >
          +
        </IconButton>
      </div>

      <div className="flex items-center gap-1">
        <Label className="mr-1">Rows</Label>
        <IconButton
          title="Shorter rows"
          aria-label="Shorter rows"
          onClick={() => setRowHeight(rowHeight - 2)}
        >
          −
        </IconButton>
        <IconButton
          title="Taller rows"
          aria-label="Taller rows"
          onClick={() => setRowHeight(rowHeight + 2)}
        >
          +
        </IconButton>
      </div>

      <Divider />

      <Button
        active={showGhosts}
        onClick={toggleGhosts}
        title="Show notes from other tracks behind this one"
      >
        Ghosts
      </Button>
      <Button
        active={followPlayhead}
        onClick={toggleFollow}
        title="Scroll to keep the playhead in view"
      >
        Follow
      </Button>
    </div>
  );
}

// -- piano key gutter ------------------------------------------------------

function KeyGutter({
  rowHeight,
  track,
}: {
  rowHeight: number;
  track: Track | undefined;
}) {
  const keys = useMemo(() => {
    const rows: { pitch: number; black: boolean; label: string | null }[] = [];
    for (let pitch = MAX_PITCH; pitch >= MIN_PITCH; pitch -= 1) {
      rows.push({
        pitch,
        black: isBlackKey(pitch),
        // Label every C, plus every key once rows are tall enough to read.
        label: pitch % 12 === 0 || rowHeight >= 18 ? pitchName(pitch) : null,
      });
    }
    return rows;
  }, [rowHeight]);

  return (
    <div
      className="sticky left-0 z-20 shrink-0 border-r border-neutral-700 bg-neutral-900"
      style={{ width: KEY_WIDTH }}
    >
      {keys.map((key) => (
        <button
          key={key.pitch}
          type="button"
          tabIndex={-1}
          aria-label={`Preview ${pitchName(key.pitch)}`}
          onPointerDown={() => track && engine.preview(track, key.pitch)}
          className={cx(
            "flex w-full items-center justify-end gap-1 pr-1.5 text-[9px] transition-colors",
            key.black
              ? "bg-neutral-900 text-neutral-500 hover:bg-sky-900"
              : "bg-neutral-300 text-neutral-600 hover:bg-sky-200",
            key.pitch % 12 === 0 && !key.black && "font-semibold text-sky-700",
          )}
          style={{
            height: rowHeight,
            borderBottom: key.black ? "1px solid #09090b" : "1px solid #a1a1aa",
          }}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}

// -- ruler + loop lane -----------------------------------------------------

function Ruler({
  project,
  pxPerTick,
  width,
  markerRef,
}: {
  project: Project;
  pxPerTick: number;
  width: number;
  markerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const setLoop = useSequencer((state) => state.setLoop);
  const barTicks = ticksPerBar(project);
  const barWidth = barTicks * pxPerTick;
  // Thin out bar numbers when zoomed out so they never collide.
  const labelEvery = barWidth < 34 ? Math.ceil(34 / Math.max(barWidth, 1)) : 1;

  const dragRef = useRef<{ mode: "new" | "start" | "end"; anchor: number } | null>(
    null,
  );

  const tickAt = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / pxPerTick);
  };

  const handleLoopDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const lane = event.currentTarget;
    lane.setPointerCapture(event.pointerId);
    const tick = tickAt(event.clientX, lane);
    const nearStart = Math.abs(tick - project.loop.start) * pxPerTick < 6;
    const nearEnd = Math.abs(tick - project.loop.end) * pxPerTick < 6;

    if (nearStart) {
      dragRef.current = { mode: "start", anchor: project.loop.end };
    } else if (nearEnd) {
      dragRef.current = { mode: "end", anchor: project.loop.start };
    } else {
      const anchor = snapTick(tick, barTicks);
      dragRef.current = { mode: "new", anchor };
      setLoop(anchor, anchor + barTicks);
    }
  };

  const handleLoopMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const tick = snapTick(tickAt(event.clientX, event.currentTarget), barTicks);
    if (drag.mode === "start") setLoop(tick, drag.anchor);
    else if (drag.mode === "end") setLoop(drag.anchor, tick);
    else setLoop(drag.anchor, tick === drag.anchor ? tick + barTicks : tick);
  };

  const endLoopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="relative shrink-0 bg-neutral-900" style={{ width }}>
      {/* Loop lane: drag to define a loop, drag an edge to resize it. */}
      <div
        className="relative cursor-cell border-b border-neutral-800 bg-neutral-950"
        style={{ height: LOOP_LANE }}
        title="Drag to set the loop region"
        onPointerDown={handleLoopDown}
        onPointerMove={handleLoopMove}
        onPointerUp={endLoopDrag}
        onPointerCancel={endLoopDrag}
      >
        <div
          className={cx(
            "absolute top-0 h-full rounded-sm",
            project.loop.enabled
              ? "bg-sky-500/70"
              : "bg-neutral-700/70",
          )}
          style={{
            left: project.loop.start * pxPerTick,
            width: Math.max(
              2,
              (project.loop.end - project.loop.start) * pxPerTick,
            ),
          }}
        >
          <span className="absolute top-0 -left-px h-full w-1 cursor-ew-resize bg-white/70" />
          <span className="absolute top-0 -right-px h-full w-1 cursor-ew-resize bg-white/70" />
        </div>
      </div>

      {/* Bar numbers: click or drag to move the playhead. */}
      <div
        className="relative cursor-text select-none"
        style={{ height: RULER_HEIGHT - LOOP_LANE }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          engine.seek(
            snapTick(
              tickAt(event.clientX, event.currentTarget),
              ticksPerBeat(project),
            ),
          );
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          engine.seek(
            snapTick(
              tickAt(event.clientX, event.currentTarget),
              ticksPerBeat(project),
            ),
          );
        }}
      >
        {Array.from({ length: project.bars }, (_, bar) => (
          <div
            key={bar}
            className="absolute top-0 h-full border-l border-neutral-700"
            style={{ left: bar * barWidth }}
          >
            {bar % labelEvery === 0 ? (
              <span className="tabular pl-1 text-[10px] leading-4 text-neutral-400">
                {bar + 1}
              </span>
            ) : null}
          </div>
        ))}
        <div
          ref={markerRef}
          className="absolute top-0 left-0 h-full w-0 will-change-transform"
        >
          <span className="absolute top-0 -left-[4px] border-x-4 border-t-[5px] border-x-transparent border-t-sky-300" />
        </div>
      </div>
    </div>
  );
}

// -- note grid -------------------------------------------------------------

function noteStyle(
  note: Note,
  pxPerTick: number,
  rowHeight: number,
): React.CSSProperties {
  return {
    left: note.tick * pxPerTick,
    top: (MAX_PITCH - note.pitch) * rowHeight,
    width: Math.max(3, note.duration * pxPerTick),
    height: Math.max(3, rowHeight - 1),
  };
}

export function Editor() {
  const project = useSequencer((state) => state.project);
  const selectedTrackId = useSequencer((state) => state.selectedTrackId);
  const selectedNoteIds = useSequencer((state) => state.selectedNoteIds);
  const snap = useSequencer((state) => state.snap);
  const pxPerTick = useSequencer((state) => state.pxPerTick);
  const rowHeight = useSequencer((state) => state.rowHeight);
  const showGhosts = useSequencer((state) => state.showGhosts);

  const track = project.tracks.find((item) => item.id === selectedTrackId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  /** Mirrors `marquee` so pointerup reads the box even before React re-renders. */
  const marqueeRef = useRef<Marquee | null>(null);

  const songTicks = ticksPerBar(project) * project.bars;
  const gridWidth = songTicks * pxPerTick;
  const gridHeight = ROW_COUNT * rowHeight;
  const selected = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);

  /**
   * Bring a track's notes into view vertically. Runs on mount and whenever the
   * selected track changes, but only when nothing on that track is already
   * visible — otherwise it would fight the scroll position you chose.
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const state = useSequencer.getState();
    const height = state.rowHeight;
    const current = state.project.tracks.find(
      (item) => item.id === state.selectedTrackId,
    );
    const notes = current?.notes ?? [];

    const viewTop = element.scrollTop;
    const viewBottom = viewTop + element.clientHeight - RULER_HEIGHT;
    const rowOf = (pitch: number) => (MAX_PITCH - pitch) * height;
    if (notes.some((note) => {
      const y = rowOf(note.pitch);
      return y >= viewTop && y + height <= viewBottom;
    })) {
      return;
    }

    // Centre on the middle of the track's range, or on C4 for an empty track.
    const pitches = notes.map((note) => note.pitch);
    const centre = pitches.length
      ? (Math.min(...pitches) + Math.max(...pitches)) / 2
      : 64;
    element.scrollTop = Math.max(
      0,
      rowOf(centre) - (element.clientHeight - RULER_HEIGHT) / 2,
    );
  }, [selectedTrackId]);

  // Playhead: written directly to the DOM so note editing never waits on it.
  useRafLoop(() => {
    const state = useSequencer.getState();
    const x = engine.getPositionTick() * state.pxPerTick;
    const transform = `translate3d(${x}px,0,0)`;
    if (playheadRef.current) playheadRef.current.style.transform = transform;
    if (markerRef.current) markerRef.current.style.transform = transform;

    const scroller = scrollRef.current;
    if (!scroller || !state.followPlayhead || !engine.isPlaying()) return;
    const viewLeft = scroller.scrollLeft;
    const viewWidth = scroller.clientWidth - KEY_WIDTH;
    const cursor = x - viewLeft;
    if (cursor > viewWidth - 60 || cursor < 0) {
      scroller.scrollLeft = Math.max(0, x - viewWidth * 0.25);
    }
  });

  const ghostNotes = useMemo(() => {
    if (!showGhosts) return [];
    const rows: { note: Note; color: string }[] = [];
    for (const item of project.tracks) {
      if (item.id === selectedTrackId || item.muted) continue;
      for (const note of item.notes) {
        rows.push({ note, color: item.color });
        if (rows.length >= 4000) return rows;
      }
    }
    return rows;
  }, [project.tracks, selectedTrackId, showGhosts]);

  const localPoint = (clientX: number, clientY: number) => {
    const rect = gridRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const tickAt = (clientX: number) => localPoint(clientX, 0).x / pxPerTick;
  const pitchAt = (clientY: number) =>
    MAX_PITCH - Math.floor(localPoint(0, clientY).y / rowHeight);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!track || event.button !== 0) return;
    const store = useSequencer.getState();
    const target = event.target as HTMLElement;
    const noteElement = target.closest<HTMLElement>("[data-note-id]");
    const noteId = noteElement?.dataset.noteId;

    event.currentTarget.setPointerCapture(event.pointerId);

    // Alt-click erases.
    if (noteId && event.altKey) {
      store.beginEdit();
      store.deleteNotes(track.id, [noteId]);
      return;
    }

    if (noteId) {
      let ids = store.selectedNoteIds;
      if (event.shiftKey) {
        ids = ids.includes(noteId)
          ? ids.filter((id) => id !== noteId)
          : [...ids, noteId];
        store.setSelection(ids);
        if (!ids.includes(noteId)) return;
      } else if (!ids.includes(noteId)) {
        ids = [noteId];
        store.setSelection(ids);
      }

      const chosen = track.notes.filter((note) => ids.includes(note.id));
      const anchor = track.notes.find((note) => note.id === noteId);
      if (!anchor) return;
      store.beginEdit();

      if (target.dataset.resize === "1") {
        gestureRef.current = {
          kind: "resize",
          startTick: tickAt(event.clientX),
          origins: new Map(chosen.map((note) => [note.id, note.duration])),
        };
      } else {
        gestureRef.current = {
          kind: "move",
          anchorId: noteId,
          startTick: tickAt(event.clientX),
          startPitch: pitchAt(event.clientY),
          lastPitch: anchor.pitch,
          origins: new Map(
            chosen.map((note) => [note.id, { tick: note.tick, pitch: note.pitch }]),
          ),
        };
      }
      return;
    }

    // Empty space: ⌘/Ctrl drags a selection box, otherwise draw a note.
    if (event.metaKey || event.ctrlKey) {
      const point = localPoint(event.clientX, event.clientY);
      gestureRef.current = { kind: "marquee", x0: point.x, y0: point.y };
      const box = { left: point.x, top: point.y, width: 0, height: 0 };
      marqueeRef.current = box;
      setMarquee(box);
      return;
    }

    const anchorTick = Math.max(
      0,
      snap > 1 ? floorToSnap(tickAt(event.clientX), snap) : Math.round(tickAt(event.clientX)),
    );
    const pitch = pitchAt(event.clientY);
    if (pitch < MIN_PITCH || pitch > MAX_PITCH) return;

    store.beginEdit();
    const id = store.addNote(track.id, {
      tick: anchorTick,
      pitch,
      duration: store.drawLength,
      velocity: 100,
    });
    store.setSelection([id]);
    engine.preview(track, pitch);
    gestureRef.current = { kind: "draw", noteId: id, anchorTick };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || !track) return;
    const store = useSequencer.getState();

    if (gesture.kind === "draw") {
      const raw = tickAt(event.clientX);
      const minimum = snap > 1 ? snap : 1;
      const end =
        snap > 1
          ? Math.max(gesture.anchorTick + snap, snapTick(raw, snap))
          : Math.max(gesture.anchorTick + 1, Math.round(raw));
      store.patchNotes(track.id, [gesture.noteId], () => ({
        duration: Math.max(minimum, end - gesture.anchorTick),
      }));
      return;
    }

    if (gesture.kind === "move") {
      const origin = gesture.origins.get(gesture.anchorId);
      if (!origin) return;
      const rawDelta = tickAt(event.clientX) - gesture.startTick;
      const deltaTick =
        snap > 1
          ? snapTick(origin.tick + rawDelta, snap) - origin.tick
          : Math.round(rawDelta);
      const deltaPitch = pitchAt(event.clientY) - gesture.startPitch;

      store.patchNotes(track.id, [...gesture.origins.keys()], (note) => {
        const start = gesture.origins.get(note.id)!;
        return {
          tick: Math.max(0, start.tick + deltaTick),
          pitch: start.pitch + deltaPitch,
        };
      });

      const pitch = origin.pitch + deltaPitch;
      if (pitch !== gesture.lastPitch) {
        gesture.lastPitch = pitch;
        engine.preview(track, pitch, 90, 0.25);
      }
      return;
    }

    if (gesture.kind === "resize") {
      const rawDelta = tickAt(event.clientX) - gesture.startTick;
      const delta = snap > 1 ? snapTick(rawDelta, snap) : Math.round(rawDelta);
      const minimum = snap > 1 ? snap : 1;
      store.patchNotes(track.id, [...gesture.origins.keys()], (note) => ({
        duration: Math.max(
          minimum,
          (gesture.origins.get(note.id) ?? note.duration) + delta,
        ),
      }));
      return;
    }

    const point = localPoint(event.clientX, event.clientY);
    const box = {
      left: Math.min(gesture.x0, point.x),
      top: Math.min(gesture.y0, point.y),
      width: Math.abs(point.x - gesture.x0),
      height: Math.abs(point.y - gesture.y0),
    };
    marqueeRef.current = box;
    setMarquee(box);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!gesture || !track) return;
    const store = useSequencer.getState();

    if (gesture.kind === "draw") {
      // Remember the drawn length so the next note matches it.
      const note = store.project.tracks
        .find((item) => item.id === track.id)
        ?.notes.find((item) => item.id === gesture.noteId);
      if (note) store.setDrawLength(note.duration);
      return;
    }

    if (gesture.kind === "marquee") {
      const box = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      if (!box || (box.width < 3 && box.height < 3)) {
        store.setSelection([]);
        return;
      }
      const fromTick = box.left / pxPerTick;
      const toTick = (box.left + box.width) / pxPerTick;
      const highPitch = MAX_PITCH - Math.floor(box.top / rowHeight);
      const lowPitch = MAX_PITCH - Math.floor((box.top + box.height) / rowHeight);
      store.setSelection(
        track.notes
          .filter(
            (note) =>
              note.tick < toTick &&
              note.tick + note.duration > fromTick &&
              note.pitch >= lowPitch &&
              note.pitch <= highPitch,
          )
          .map((note) => note.id),
      );
    }
  };

  const beatWidth = ticksPerBeat(project) * pxPerTick;
  const barWidth = ticksPerBar(project) * pxPerTick;
  const snapWidth = snap > 1 ? snap * pxPerTick : 0;

  const rows = useMemo(
    () =>
      Array.from({ length: ROW_COUNT }, (_, index) => {
        const pitch = MAX_PITCH - index;
        return { pitch, black: isBlackKey(pitch) };
      }),
    [],
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-neutral-950">
      <EditorToolbar track={track} />

      <div
        ref={scrollRef}
        className="scroll-dark relative min-h-0 flex-1 overflow-auto"
      >
        <div
          className="relative"
          style={{ width: KEY_WIDTH + gridWidth, minWidth: "100%" }}
        >
          {/* Sticky header row: corner box + ruler. */}
          <div
            className="sticky top-0 z-30 flex"
            style={{ height: RULER_HEIGHT }}
          >
            <div
              className="sticky left-0 z-40 shrink-0 border-r border-b border-neutral-700 bg-neutral-900"
              style={{ width: KEY_WIDTH }}
            />
            <Ruler
              project={project}
              pxPerTick={pxPerTick}
              width={gridWidth}
              markerRef={markerRef}
            />
          </div>

          <div className="flex">
            <KeyGutter rowHeight={rowHeight} track={track} />

            <div
              ref={gridRef}
              className="relative shrink-0 touch-none"
              style={{ width: gridWidth, height: gridHeight }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onContextMenu={(event) => {
                event.preventDefault();
                const id = (event.target as HTMLElement).closest<HTMLElement>(
                  "[data-note-id]",
                )?.dataset.noteId;
                if (!id || !track) return;
                const store = useSequencer.getState();
                store.beginEdit();
                store.deleteNotes(track.id, [id]);
              }}
            >
              {/* Row stripes. */}
              <div className="absolute inset-0">
                {rows.map((row) => (
                  <div
                    key={row.pitch}
                    className={cx(
                      row.pitch % 12 === 0 && "border-b border-neutral-800",
                    )}
                    style={{
                      height: rowHeight,
                      background: row.black ? "#131316" : "#1b1b1f",
                    }}
                  />
                ))}
              </div>

              {/* Bar / beat / subdivision lines. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: [
                    `repeating-linear-gradient(to right, rgba(255,255,255,0.13) 0 1px, transparent 1px ${barWidth}px)`,
                    `repeating-linear-gradient(to right, rgba(255,255,255,0.06) 0 1px, transparent 1px ${beatWidth}px)`,
                    snapWidth >= 6
                      ? `repeating-linear-gradient(to right, rgba(255,255,255,0.03) 0 1px, transparent 1px ${snapWidth}px)`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", "),
                }}
              />

              {/* Loop region. */}
              <div
                aria-hidden
                className={cx(
                  "pointer-events-none absolute top-0 bottom-0 border-x",
                  project.loop.enabled
                    ? "border-sky-400/50 bg-sky-400/[0.06]"
                    : "border-neutral-600/40",
                )}
                style={{
                  left: project.loop.start * pxPerTick,
                  width: Math.max(
                    1,
                    (project.loop.end - project.loop.start) * pxPerTick,
                  ),
                }}
              />

              {/* Ghost notes from other tracks. */}
              {ghostNotes.map(({ note, color }) => (
                <div
                  key={`ghost-${note.id}`}
                  aria-hidden
                  className="pointer-events-none absolute rounded-sm opacity-20"
                  style={{
                    ...noteStyle(note, pxPerTick, rowHeight),
                    background: color,
                  }}
                />
              ))}

              {/* Editable notes for the selected track. */}
              {track?.notes.map((note) => {
                const isSelected = selected.has(note.id);
                const width = Math.max(3, note.duration * pxPerTick);
                return (
                  <div
                    key={note.id}
                    data-note-id={note.id}
                    title={`${pitchName(note.pitch)} · vel ${note.velocity}`}
                    className={cx(
                      "absolute cursor-grab rounded-sm border active:cursor-grabbing",
                      isSelected
                        ? "border-white shadow-[0_0_0_1px_rgba(255,255,255,0.5)]"
                        : "border-black/40",
                    )}
                    style={{
                      ...noteStyle(note, pxPerTick, rowHeight),
                      background: track.color,
                      // Velocity reads as brightness, the way a DAW shows it.
                      opacity: 0.45 + (note.velocity / 127) * 0.55,
                    }}
                  >
                    <span
                      data-resize="1"
                      className="absolute top-0 right-0 h-full cursor-ew-resize"
                      style={{ width: Math.min(RESIZE_GRIP, Math.max(2, width / 2)) }}
                    />
                  </div>
                );
              })}

              {/* Selection box. */}
              {marquee ? (
                <div
                  className="pointer-events-none absolute border border-sky-300/80 bg-sky-300/10"
                  style={marquee}
                />
              ) : null}

              {/* Playhead. */}
              <div
                ref={playheadRef}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 h-full w-px bg-sky-300 will-change-transform"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
