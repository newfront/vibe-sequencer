import { create } from "zustand";

import { engine } from "./audio/engine";
import { uid } from "./id";
import {
  MAX_BPM,
  MAX_PITCH,
  MIN_BPM,
  MIN_PITCH,
  PPQ,
  clamp,
  snapTick,
  ticksPerBar,
} from "./music";
import { saveProjectToStorage } from "./persist";
import {
  createDefaultProject,
  createEmptyProject,
  createNote,
  createTrack,
  nextColor,
} from "./project";
import type { Note, Project, Track } from "./types";

const HISTORY_LIMIT = 80;

export type SequencerState = {
  project: Project;
  /** Undo/redo stacks of whole-document snapshots. */
  past: Project[];
  future: Project[];

  selectedTrackId: string;
  /** Selected note ids, always within the selected track. */
  selectedNoteIds: string[];

  /** Grid resolution in ticks. */
  snap: number;
  /** Length used for the next drawn note, in ticks. */
  drawLength: number;
  /** Horizontal zoom, in pixels per tick. */
  pxPerTick: number;
  /** Vertical zoom, in pixels per semitone row. */
  rowHeight: number;
  showGhosts: boolean;
  followPlayhead: boolean;

  // -- document ----------------------------------------------------------
  /** Snapshot the document for undo. Call once at the start of an edit. */
  beginEdit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  loadProject: (project: Project, options?: { resetHistory?: boolean }) => void;
  newProject: () => void;
  setName: (name: string) => void;
  setBpm: (bpm: number) => void;
  setBars: (bars: number) => void;
  setTimeSignature: (beatsPerBar: number, beatUnit: number) => void;

  // -- loop --------------------------------------------------------------
  toggleLoop: () => void;
  setLoop: (start: number, end: number) => void;
  loopToSelection: () => void;

  // -- tracks ------------------------------------------------------------
  selectTrack: (trackId: string) => void;
  addTrack: () => void;
  removeTrack: (trackId: string) => void;
  duplicateTrack: (trackId: string) => void;
  updateTrack: (trackId: string, patch: Partial<Track>) => void;
  clearTrack: (trackId: string) => void;

  // -- notes -------------------------------------------------------------
  addNote: (trackId: string, note: Partial<Note>) => string;
  /** Bulk edit specific notes. Used by drag gestures, so it skips history. */
  patchNotes: (
    trackId: string,
    ids: readonly string[],
    patch: (note: Note) => Partial<Note>,
  ) => void;
  deleteNotes: (trackId: string, ids: readonly string[]) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  transposeSelection: (semitones: number) => void;
  nudgeSelection: (ticks: number) => void;
  setSelectionVelocity: (velocity: number) => void;
  quantizeSelection: () => void;
  setSelection: (ids: readonly string[]) => void;
  selectAllInTrack: () => void;

  // -- view --------------------------------------------------------------
  setSnap: (ticks: number) => void;
  setDrawLength: (ticks: number) => void;
  setPxPerTick: (value: number) => void;
  setRowHeight: (value: number) => void;
  toggleGhosts: () => void;
  toggleFollow: () => void;
};

function songEnd(project: Project): number {
  return ticksPerBar(project) * project.bars;
}

function withTrack(
  project: Project,
  trackId: string,
  fn: (track: Track) => Track,
): Project {
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId) return track;
    const next = fn(track);
    changed = next !== track;
    return next;
  });
  return changed ? { ...project, tracks } : project;
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
}

const initialProject = createDefaultProject();

export const useSequencer = create<SequencerState>((set, get) => {
  /** Apply a document change without touching the undo stack. */
  const mutate = (fn: (project: Project) => Project) => {
    set((state) => {
      const project = fn(state.project);
      return project === state.project ? state : { project };
    });
  };

  /** Snapshot for undo, then apply a document change. */
  const edit = (fn: (project: Project) => Project) => {
    get().beginEdit();
    mutate(fn);
  };

  return {
    project: initialProject,
    past: [],
    future: [],
    selectedTrackId: initialProject.tracks[0].id,
    selectedNoteIds: [],
    snap: PPQ / 4,
    drawLength: PPQ / 4,
    pxPerTick: 0.5,
    rowHeight: 16,
    showGhosts: true,
    followPlayhead: true,

    beginEdit: () =>
      set((state) => ({
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), structuredClone(state.project)],
        future: [],
      })),

    undo: () =>
      set((state) => {
        const previous = state.past[state.past.length - 1];
        if (!previous) return state;
        return {
          past: state.past.slice(0, -1),
          future: [structuredClone(state.project), ...state.future].slice(0, HISTORY_LIMIT),
          project: previous,
          selectedNoteIds: [],
          selectedTrackId: previous.tracks.some((t) => t.id === state.selectedTrackId)
            ? state.selectedTrackId
            : previous.tracks[0].id,
        };
      }),

    redo: () =>
      set((state) => {
        const next = state.future[0];
        if (!next) return state;
        return {
          future: state.future.slice(1),
          past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
          project: next,
          selectedNoteIds: [],
          selectedTrackId: next.tracks.some((t) => t.id === state.selectedTrackId)
            ? state.selectedTrackId
            : next.tracks[0].id,
        };
      }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    loadProject: (project, options) =>
      set((state) => ({
        project,
        past: options?.resetHistory === false ? state.past : [],
        future: [],
        selectedTrackId: project.tracks[0]?.id ?? "",
        selectedNoteIds: [],
      })),

    newProject: () => {
      const project = createEmptyProject();
      get().loadProject(project);
    },

    setName: (name) => mutate((project) => ({ ...project, name })),

    setBpm: (bpm) =>
      mutate((project) => ({
        ...project,
        bpm: clamp(Math.round(bpm * 10) / 10, MIN_BPM, MAX_BPM),
      })),

    setBars: (bars) =>
      edit((project) => {
        const next = clamp(Math.round(bars), 1, 512);
        const end = ticksPerBar(project) * next;
        return {
          ...project,
          bars: next,
          loop: {
            ...project.loop,
            start: clamp(project.loop.start, 0, Math.max(0, end - 1)),
            end: clamp(project.loop.end, 1, end),
          },
        };
      }),

    setTimeSignature: (beatsPerBar, beatUnit) =>
      edit((project) => ({
        ...project,
        beatsPerBar: clamp(Math.round(beatsPerBar), 1, 16),
        beatUnit,
      })),

    toggleLoop: () =>
      mutate((project) => ({
        ...project,
        loop: { ...project.loop, enabled: !project.loop.enabled },
      })),

    setLoop: (start, end) =>
      mutate((project) => {
        const limit = songEnd(project);
        const lo = clamp(Math.round(Math.min(start, end)), 0, Math.max(0, limit - 1));
        const hi = clamp(Math.round(Math.max(start, end)), lo + 1, limit);
        return { ...project, loop: { ...project.loop, start: lo, end: hi } };
      }),

    loopToSelection: () => {
      const { project, selectedTrackId, selectedNoteIds } = get();
      const track = project.tracks.find((t) => t.id === selectedTrackId);
      if (!track) return;
      const ids = new Set(selectedNoteIds);
      const notes = track.notes.filter((note) => ids.has(note.id));
      if (notes.length === 0) return;
      const bar = ticksPerBar(project);
      const from = Math.min(...notes.map((note) => note.tick));
      const to = Math.max(...notes.map((note) => note.tick + note.duration));
      get().setLoop(Math.floor(from / bar) * bar, Math.ceil(to / bar) * bar);
      mutate((p) => ({ ...p, loop: { ...p.loop, enabled: true } }));
    },

    selectTrack: (trackId) =>
      set((state) =>
        state.selectedTrackId === trackId
          ? state
          : { selectedTrackId: trackId, selectedNoteIds: [] },
      ),

    addTrack: () => {
      get().beginEdit();
      const index = get().project.tracks.length;
      const track = createTrack(index, { color: nextColor(index) });
      mutate((project) => ({ ...project, tracks: [...project.tracks, track] }));
      set({ selectedTrackId: track.id, selectedNoteIds: [] });
    },

    removeTrack: (trackId) => {
      const { project } = get();
      if (project.tracks.length <= 1) return;
      get().beginEdit();
      const index = project.tracks.findIndex((t) => t.id === trackId);
      mutate((p) => ({
        ...p,
        tracks: p.tracks.filter((track) => track.id !== trackId),
      }));
      set((state) => {
        if (state.selectedTrackId !== trackId) return state;
        const tracks = state.project.tracks;
        const fallback = tracks[Math.min(index, tracks.length - 1)];
        return { selectedTrackId: fallback?.id ?? "", selectedNoteIds: [] };
      });
    },

    duplicateTrack: (trackId) => {
      const source = get().project.tracks.find((t) => t.id === trackId);
      if (!source) return;
      get().beginEdit();
      const index = get().project.tracks.length;
      const copy: Track = {
        ...source,
        id: uid("trk"),
        name: `${source.name} copy`,
        color: nextColor(index),
        soloed: false,
        notes: source.notes.map((note) => ({ ...note, id: uid("nte") })),
      };
      mutate((project) => {
        const at = project.tracks.findIndex((t) => t.id === trackId);
        const tracks = [...project.tracks];
        tracks.splice(at + 1, 0, copy);
        return { ...project, tracks };
      });
      set({ selectedTrackId: copy.id, selectedNoteIds: [] });
    },

    updateTrack: (trackId, patch) =>
      mutate((project) =>
        withTrack(project, trackId, (track) => ({ ...track, ...patch })),
      ),

    clearTrack: (trackId) =>
      edit((project) =>
        withTrack(project, trackId, (track) =>
          track.notes.length === 0 ? track : { ...track, notes: [] },
        ),
      ),

    addNote: (trackId, partial) => {
      const project = get().project;
      const limit = songEnd(project);
      const note = createNote({
        ...partial,
        tick: clamp(Math.round(partial.tick ?? 0), 0, Math.max(0, limit - 1)),
        pitch: clamp(Math.round(partial.pitch ?? 60), MIN_PITCH, MAX_PITCH),
        velocity: clamp(Math.round(partial.velocity ?? 100), 1, 127),
        duration: Math.max(1, Math.round(partial.duration ?? get().drawLength)),
      });
      mutate((p) =>
        withTrack(p, trackId, (track) => ({
          ...track,
          notes: sortNotes([...track.notes, note]),
        })),
      );
      return note.id;
    },

    patchNotes: (trackId, ids, patch) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      mutate((project) => {
        const limit = songEnd(project);
        return withTrack(project, trackId, (track) => {
          let touched = false;
          const notes = track.notes.map((note) => {
            if (!idSet.has(note.id)) return note;
            const changes = patch(note);
            const next: Note = {
              ...note,
              ...changes,
              tick: clamp(
                Math.round(changes.tick ?? note.tick),
                0,
                Math.max(0, limit - 1),
              ),
              pitch: clamp(
                Math.round(changes.pitch ?? note.pitch),
                MIN_PITCH,
                MAX_PITCH,
              ),
              duration: clamp(
                Math.round(changes.duration ?? note.duration),
                1,
                limit,
              ),
              velocity: clamp(
                Math.round(changes.velocity ?? note.velocity),
                1,
                127,
              ),
            };
            if (
              next.tick !== note.tick ||
              next.pitch !== note.pitch ||
              next.duration !== note.duration ||
              next.velocity !== note.velocity
            ) {
              touched = true;
              return next;
            }
            return note;
          });
          return touched ? { ...track, notes: sortNotes(notes) } : track;
        });
      });
    },

    deleteNotes: (trackId, ids) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      mutate((project) =>
        withTrack(project, trackId, (track) => ({
          ...track,
          notes: track.notes.filter((note) => !idSet.has(note.id)),
        })),
      );
      set((state) => ({
        selectedNoteIds: state.selectedNoteIds.filter((id) => !idSet.has(id)),
      }));
    },

    deleteSelection: () => {
      const { selectedTrackId, selectedNoteIds } = get();
      if (selectedNoteIds.length === 0) return;
      get().beginEdit();
      get().deleteNotes(selectedTrackId, selectedNoteIds);
    },

    duplicateSelection: () => {
      const { project, selectedTrackId, selectedNoteIds } = get();
      const track = project.tracks.find((t) => t.id === selectedTrackId);
      if (!track || selectedNoteIds.length === 0) return;
      const idSet = new Set(selectedNoteIds);
      const chosen = track.notes.filter((note) => idSet.has(note.id));
      if (chosen.length === 0) return;
      const from = Math.min(...chosen.map((note) => note.tick));
      const to = Math.max(...chosen.map((note) => note.tick + note.duration));
      // Place the copy immediately after the selection, rounded to the grid.
      const snap = get().snap;
      const offset = Math.max(snap, snapTick(to - from, snap) || snap);
      get().beginEdit();
      const copies = chosen.map((note) => ({
        ...note,
        id: uid("nte"),
        tick: note.tick + offset,
      }));
      mutate((p) =>
        withTrack(p, selectedTrackId, (t) => ({
          ...t,
          notes: sortNotes([...t.notes, ...copies]),
        })),
      );
      set({ selectedNoteIds: copies.map((note) => note.id) });
    },

    transposeSelection: (semitones) => {
      const { selectedTrackId, selectedNoteIds } = get();
      if (selectedNoteIds.length === 0) return;
      get().beginEdit();
      get().patchNotes(selectedTrackId, selectedNoteIds, (note) => ({
        pitch: note.pitch + semitones,
      }));
    },

    nudgeSelection: (ticks) => {
      const { selectedTrackId, selectedNoteIds } = get();
      if (selectedNoteIds.length === 0) return;
      get().beginEdit();
      get().patchNotes(selectedTrackId, selectedNoteIds, (note) => ({
        tick: Math.max(0, note.tick + ticks),
      }));
    },

    setSelectionVelocity: (velocity) => {
      const { selectedTrackId, selectedNoteIds } = get();
      if (selectedNoteIds.length === 0) return;
      get().patchNotes(selectedTrackId, selectedNoteIds, () => ({ velocity }));
    },

    quantizeSelection: () => {
      const { selectedTrackId, selectedNoteIds, snap } = get();
      if (selectedNoteIds.length === 0 || snap <= 1) return;
      get().beginEdit();
      get().patchNotes(selectedTrackId, selectedNoteIds, (note) => ({
        tick: snapTick(note.tick, snap),
      }));
    },

    setSelection: (ids) => set({ selectedNoteIds: [...ids] }),

    selectAllInTrack: () => {
      const { project, selectedTrackId } = get();
      const track = project.tracks.find((t) => t.id === selectedTrackId);
      set({ selectedNoteIds: track ? track.notes.map((note) => note.id) : [] });
    },

    setSnap: (ticks) => set({ snap: ticks }),
    setDrawLength: (ticks) => set({ drawLength: Math.max(1, ticks) }),
    setPxPerTick: (value) => set({ pxPerTick: clamp(value, 0.08, 4) }),
    setRowHeight: (value) => set({ rowHeight: clamp(Math.round(value), 8, 40) }),
    toggleGhosts: () => set((state) => ({ showGhosts: !state.showGhosts })),
    toggleFollow: () => set((state) => ({ followPlayhead: !state.followPlayhead })),
  };
});

// Keep the audio engine in step with the document, and autosave.
engine.setProject(initialProject);

let saveTimer: ReturnType<typeof setTimeout> | null = null;

useSequencer.subscribe((state, previous) => {
  if (state.project === previous.project) return;
  engine.setProject(state.project);
  if (typeof window === "undefined") return;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveProjectToStorage(useSequencer.getState().project);
  }, 500);
});

// -- selectors -------------------------------------------------------------

export function useSelectedTrack(): Track | undefined {
  return useSequencer((state) =>
    state.project.tracks.find((track) => track.id === state.selectedTrackId),
  );
}
