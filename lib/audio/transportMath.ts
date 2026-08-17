/**
 * Pure timeline arithmetic for the scheduler.
 *
 * Kept free of Web Audio so the loop-wrap rules — the easiest part of a
 * sequencer to get subtly wrong — can be tested directly.
 */

export type LoopRange = { enabled: boolean; start: number; end: number };

export type ScanWindow = {
  /** First tick in the window, inclusive. */
  from: number;
  /** Last tick in the window, exclusive. */
  to: number;
  /**
   * Tick at which sounding notes must be cut: the loop end while looping, the
   * song end otherwise. Stops a held note bleeding over its own retrigger.
   */
  limit: number;
  /** Tick to resume scheduling from after this window. */
  next: number;
};

/**
 * Work out the next slice of musical time to schedule.
 *
 * Returns `null` when there is nothing left — the playhead has reached the end
 * of the song with looping off (or looping disabled behind it).
 *
 * The loop only captures the playhead while it sits before the loop end, so
 * starting playback past the region plays through to the end of the song
 * instead of being yanked backwards.
 */
export function nextScanWindow({
  scanTick,
  songEnd,
  loop,
  maxTicks,
}: {
  scanTick: number;
  songEnd: number;
  loop: LoopRange;
  maxTicks: number;
}): ScanWindow | null {
  const looping =
    loop.enabled && loop.end > loop.start && scanTick < loop.end;
  const limit = looping ? loop.end : songEnd;
  if (scanTick >= limit) return null;

  const to = Math.min(scanTick + Math.max(1, maxTicks), limit);
  const next = looping && to >= loop.end ? loop.start : to;
  return { from: scanTick, to, limit, next };
}
