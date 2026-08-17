@AGENTS.md

# Sequencer

Browser MIDI sequencer: piano roll over a timeline with looping, a built-in Web
Audio synth, Web MIDI output, and Standard MIDI File import/export. Client-only —
no server, database, or auth. `README.md` holds the architecture notes, keyboard
map, and file layout; keep it current when behaviour changes.

## Invariants that are easy to break

- **Note timing never depends on React.** `lib/audio/engine.ts` writes notes onto
  the AudioContext clock ~200 ms ahead (2.5 s while the tab is hidden, since
  browsers throttle timers to ~1 s and would starve the queue). Don't move note
  firing into an effect, `requestAnimationFrame`, or `setTimeout`.
- **The playhead is derived, not counted.** Each scheduling pass records the tick
  span it covered and the audio-time span it occupies; `getPositionTick()` maps
  the current audio time back through those spans. That is what keeps it honest
  across loop wraps — don't replace it with an incrementing tick counter.
- **Loop rules live in `lib/audio/transportMath.ts`** as a pure, unit-tested
  function (clamp to loop end, wrap to start, cut held notes at the boundary,
  let playback starting *after* the region run to the song end). Change loop
  behaviour there, not inline in the scheduler.
- **Mute/solo runs through the per-track mixer gain**, not the scheduler; routing
  it through scheduling would delay it by the whole lookahead window.
- **`engine.setProject()` runs on every keystroke and every drag frame.** Keep it
  cheap, and never write an AudioParam with an unchanged value — each
  `setTargetAtTime` appends an automation event that lives on the param timeline.
- **Store actions do not push undo history; the caller calls `beginEdit()` once
  at the start of a gesture.** An action that pushes history itself will
  double-count drags. Continuous controls (volume, pan, tempo, rename) are
  deliberately outside undo.

## Toolchain decisions — don't "fix" these

- `package.json` sets `"type": "module"` so Node's type-stripping test runner
  doesn't warn; verified against `next build`.
- Tests run `node --import tsx/esm --test test/*.test.ts`, and `tsconfig.json`
  excludes `test/` — so tests are **not** covered by `tsc --noEmit`.
- `devIndicators: false` in `next.config.ts`: the floating dev badge sits on top
  of the status bar in a full-viewport app.
- No `next/font/google` — system font stacks instead, so builds need no network.
- Web MIDI types come from lib.dom; don't hand-roll shims. Only
  `MIDIOutput.clear()` is missing, and it is cast at its single call site.
- `next` is pinned to stable 16.3.0 because the internal npm proxy's `latest`
  tag resolves to a canary. Don't add a project `.npmrc`: the proxy URL is
  internal and this is an OSS repo (the global `~/.npmrc` already routes there).

## Verifying changes

`pnpm test && pnpm lint && pnpm build`. For UI work, the embedded browser tool
refuses loopback hosts — screenshot with headless Chrome against
`localhost:3000` instead, and kill it once the PNG lands, as it does not exit on
its own. **Audio output and Web MIDI to hardware cannot be verified headlessly**;
say so plainly rather than implying they were tested.
