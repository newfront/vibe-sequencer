import assert from "node:assert/strict";
import { test } from "node:test";

import { nextScanWindow, type LoopRange } from "../lib/audio/transportMath";

const noLoop: LoopRange = { enabled: false, start: 0, end: 0 };

/** Run the scheduler forward and collect the windows it would produce. */
function scan(
  options: {
    songEnd: number;
    loop: LoopRange;
    maxTicks: number;
    from?: number;
  },
  steps: number,
) {
  const windows: { from: number; to: number; limit: number }[] = [];
  let tick = options.from ?? 0;
  for (let i = 0; i < steps; i += 1) {
    const window = nextScanWindow({
      scanTick: tick,
      songEnd: options.songEnd,
      loop: options.loop,
      maxTicks: options.maxTicks,
    });
    if (!window) return { windows, finished: true };
    windows.push({ from: window.from, to: window.to, limit: window.limit });
    tick = window.next;
  }
  return { windows, finished: false };
}

test("tiles the song end to end when not looping", () => {
  const { windows, finished } = scan(
    { songEnd: 60, loop: noLoop, maxTicks: 24 },
    5,
  );
  assert.deepEqual(
    windows.map((w) => [w.from, w.to]),
    [
      [0, 24],
      [24, 48],
      [48, 60],
    ],
  );
  assert.equal(finished, true, "reports the song as finished at the end");
  // Notes are clipped at the song end, never past it.
  assert.deepEqual(new Set(windows.map((w) => w.limit)), new Set([60]));
});

test("wraps back to the loop start at the loop end", () => {
  const loop: LoopRange = { enabled: true, start: 0, end: 48 };
  const { windows, finished } = scan({ songEnd: 384, loop, maxTicks: 24 }, 5);
  assert.deepEqual(
    windows.map((w) => [w.from, w.to]),
    [
      [0, 24],
      [24, 48],
      [0, 24],
      [24, 48],
      [0, 24],
    ],
  );
  assert.equal(finished, false, "a loop never finishes on its own");
  // While looping, the clip point is the loop end, not the song end.
  assert.deepEqual(new Set(windows.map((w) => w.limit)), new Set([48]));
});

test("clamps the final window of a loop that is not a whole number of scans", () => {
  const loop: LoopRange = { enabled: true, start: 10, end: 40 };
  const { windows } = scan({ songEnd: 384, loop, maxTicks: 24, from: 10 }, 4);
  assert.deepEqual(
    windows.map((w) => [w.from, w.to]),
    [
      [10, 34],
      [34, 40],
      [10, 34],
      [34, 40],
    ],
  );
});

test("plays on to the song end when starting past the loop region", () => {
  const loop: LoopRange = { enabled: true, start: 0, end: 48 };
  const { windows, finished } = scan(
    { songEnd: 96, loop, maxTicks: 48, from: 48 },
    4,
  );
  assert.deepEqual(
    windows.map((w) => [w.from, w.to]),
    [[48, 96]],
    "does not get yanked back into a loop it started after",
  );
  assert.equal(finished, true);
  assert.equal(windows[0].limit, 96, "clips at the song end, not the loop end");
});

test("ignores a loop region that is empty or inverted", () => {
  for (const loop of [
    { enabled: true, start: 24, end: 24 },
    { enabled: true, start: 48, end: 12 },
  ] satisfies LoopRange[]) {
    const { windows, finished } = scan({ songEnd: 48, loop, maxTicks: 48 }, 3);
    assert.deepEqual(
      windows.map((w) => [w.from, w.to]),
      [[0, 48]],
      `treated ${JSON.stringify(loop)} as no loop`,
    );
    assert.equal(finished, true);
  }
});

test("stops immediately when the playhead is already at the end", () => {
  assert.equal(
    nextScanWindow({
      scanTick: 96,
      songEnd: 96,
      loop: noLoop,
      maxTicks: 24,
    }),
    null,
  );
});

test("always advances, even with a zero window size", () => {
  const window = nextScanWindow({
    scanTick: 0,
    songEnd: 96,
    loop: noLoop,
    maxTicks: 0,
  });
  assert.ok(window && window.to > window.from, "never returns an empty window");
});
