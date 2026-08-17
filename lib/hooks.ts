"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { engine } from "./audio/engine";

/** Transport state, kept in sync with the engine rather than duplicated. */
export function useIsPlaying(): boolean {
  return useSyncExternalStore(
    (onChange) => engine.subscribe(onChange),
    () => engine.isPlaying(),
    () => false,
  );
}

const neverChanges = () => () => {};

/**
 * True only after hydration — gates browser-only UI.
 *
 * Implemented with `useSyncExternalStore` rather than a mount effect so the
 * server snapshot (`false`) and the client snapshot (`true`) are declared
 * rather than reconciled through a cascading render.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

/**
 * Run a callback every animation frame. The callback is read from a ref so it
 * can close over fresh values without restarting the loop.
 */
export function useRafLoop(callback: () => void) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    let frame = requestAnimationFrame(function tick() {
      latest.current();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
}

/** Web MIDI availability and port list, re-read whenever the ports change. */
export function useMidiState() {
  const [, bump] = useState(0);
  useEffect(() => engine.midi.onChange(() => bump((n) => n + 1)), []);
  return {
    enabled: engine.midi.enabled,
    ports: engine.midi.listPorts(),
    selectedId: engine.midi.selectedId,
  };
}
