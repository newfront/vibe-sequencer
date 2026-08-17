"use client";

import { useEffect } from "react";

import { engine } from "@/lib/audio/engine";
import { useMounted } from "@/lib/hooks";
import { ticksPerBar } from "@/lib/music";
import { loadProjectFromStorage } from "@/lib/persist";
import { useSequencer } from "@/lib/store";

import { Editor } from "./Editor";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { TrackPanel } from "./TrackPanel";
import { TransportBar } from "./TransportBar";

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable
  );
}

export function SequencerApp() {
  const mounted = useMounted();

  // Restore the autosaved project once we're on the client.
  useEffect(() => {
    const saved = loadProjectFromStorage();
    if (saved) useSequencer.getState().loadProject(saved);
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const store = useSequencer.getState();
      const mod = event.metaKey || event.ctrlKey;
      const bar = ticksPerBar(store.project);
      const step = event.shiftKey ? bar : Math.max(1, store.snap);

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        store.redo();
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        store.duplicateSelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault();
        store.selectAllInTrack();
        return;
      }
      if (mod) return;

      switch (event.key) {
        case " ":
          event.preventDefault();
          engine.toggle();
          break;
        case "Enter":
          event.preventDefault();
          engine.stop();
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          store.deleteSelection();
          break;
        case "Escape":
          store.setSelection([]);
          break;
        case "ArrowLeft":
          event.preventDefault();
          store.nudgeSelection(-step);
          break;
        case "ArrowRight":
          event.preventDefault();
          store.nudgeSelection(step);
          break;
        case "ArrowUp":
          event.preventDefault();
          store.transposeSelection(event.shiftKey ? 12 : 1);
          break;
        case "ArrowDown":
          event.preventDefault();
          store.transposeSelection(event.shiftKey ? -12 : -1);
          break;
        case "l":
        case "L":
          store.toggleLoop();
          break;
        case "q":
        case "Q":
          store.quantizeSelection();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Silence the transport if the component ever goes away.
  useEffect(() => () => engine.stop(), []);

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-600">
        Loading sequencer…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <TransportBar />
      <div className="flex min-h-0 flex-1">
        <TrackPanel />
        <Editor />
      </div>
      <StatusBar />
    </div>
  );
}
