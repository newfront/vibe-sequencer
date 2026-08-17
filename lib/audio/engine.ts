import { getInstrument } from "../instruments";
import { MidiOut } from "../midi/output";
import { clamp, secondsPerTick, songEndTick } from "../music";
import type { Note, Project, Track } from "../types";
import { scheduleVoice, type ActiveVoice } from "./synth";
import { nextScanWindow } from "./transportMath";

/** Seconds of audio scheduled ahead of the playhead while the tab is visible. */
const LOOKAHEAD = 0.2;
/**
 * Background tabs throttle timers to ~1s, which would starve the scheduler, so
 * we buy a much bigger buffer when the page is hidden.
 */
const LOOKAHEAD_HIDDEN = 2.5;
/** How often the scheduler wakes up to top up the queue, in ms. */
const SCHEDULER_INTERVAL = 40;
/** Largest chunk of musical time examined per scheduling pass, in ticks. */
const SCAN_TICKS = 24;
/** Small offset so the very first note isn't already late when play is hit. */
const START_DELAY = 0.06;

/**
 * A scheduled span of musical time. The scheduler emits one per window, which
 * lets `getPositionTick` map an audio-clock time back onto a musical position
 * even across loop wraps, without the UI ever polling the scheduler.
 */
type Segment = {
  startTime: number;
  endTime: number;
  startTick: number;
  endTick: number;
  secPerTick: number;
};

type TrackChain = {
  input: GainNode;
  panner: StereoPannerNode;
  /**
   * Last values written to the params. `setProject` runs on every keystroke and
   * every drag frame, and each `setTargetAtTime` appends an automation event
   * that lives on the param timeline, so unchanged values must not be rewritten.
   */
  gain: number;
  pan: number;
};

function lowerBound(notes: Note[], tick: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].tick < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The transport. Owns the AudioContext, schedules notes ahead of the audio
 * clock, and reports position back to the UI.
 *
 * Nothing here touches React: the UI pushes the project in and polls position
 * on an animation frame, which keeps note timing independent of render work.
 */
export class SequencerEngine {
  readonly midi = new MidiOut();

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private chains = new Map<string, TrackChain>();

  private project: Project | null = null;
  /** Per-track note lists kept sorted by tick, rebuilt only when notes change. */
  private sortedCache = new Map<string, { source: Note[]; sorted: Note[] }>();

  private playing = false;
  /** Next tick to be scheduled. */
  private scanTick = 0;
  /** Audio-clock time at which `scanTick` sounds. */
  private scanTime = 0;
  /** Where playback began, returned to on stop. */
  private originTick = 0;
  /** Position used while stopped. */
  private pausedTick = 0;
  private segments: Segment[] = [];
  private stopAtTime: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private voices = new Set<ActiveVoice>();
  private masterGain = 0.9;
  private listeners = new Set<() => void>();

  // -- lifecycle -----------------------------------------------------------

  /** Listen for transport start/stop. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  /**
   * Create or resume the AudioContext. Browsers require this to happen inside
   * a user gesture, so every play path goes through here.
   */
  async ready(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio is not available in this browser.");
      const ctx = new Ctor({ latencyHint: "interactive" });

      const master = ctx.createGain();
      master.gain.value = this.masterGain;
      // A gentle limiter keeps dense arrangements from clipping.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      master.connect(limiter);
      limiter.connect(ctx.destination);

      this.ctx = ctx;
      this.master = master;
      this.syncChains();
    }
    if (this.ctx.state !== "running") {
      await this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  dispose() {
    this.stop();
    this.listeners.clear();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
    this.chains.clear();
  }

  // -- project state -------------------------------------------------------

  /**
   * Push the current document in. Called on every edit, so it must stay cheap
   * and must never disturb playback position.
   */
  setProject(project: Project) {
    this.project = project;
    const live = new Set(project.tracks.map((track) => track.id));
    for (const id of this.sortedCache.keys()) {
      if (!live.has(id)) this.sortedCache.delete(id);
    }
    this.syncChains();
  }

  private sortedNotes(track: Track): Note[] {
    const cached = this.sortedCache.get(track.id);
    if (cached && cached.source === track.notes) return cached.sorted;
    const sorted = [...track.notes].sort((a, b) => a.tick - b.tick);
    this.sortedCache.set(track.id, { source: track.notes, sorted });
    return sorted;
  }

  private syncChains() {
    const ctx = this.ctx;
    const master = this.master;
    const project = this.project;
    if (!ctx || !master || !project) return;

    const anySolo = project.tracks.some((track) => track.soloed);
    const now = ctx.currentTime;
    const live = new Set<string>();

    for (const track of project.tracks) {
      live.add(track.id);
      let chain = this.chains.get(track.id);
      if (!chain) {
        const input = ctx.createGain();
        const panner = ctx.createStereoPanner();
        input.gain.value = 0;
        input.connect(panner);
        panner.connect(master);
        chain = { input, panner, gain: 0, pan: 0 };
        this.chains.set(track.id, chain);
      }
      // Mute/solo runs through the mixer rather than the scheduler so it takes
      // effect immediately instead of after the lookahead window.
      const audible = !track.muted && (!anySolo || track.soloed);
      const gain = audible ? track.gain : 0;
      if (gain !== chain.gain) {
        chain.gain = gain;
        chain.input.gain.setTargetAtTime(gain, now, 0.01);
      }
      if (track.pan !== chain.pan) {
        chain.pan = track.pan;
        chain.panner.pan.setTargetAtTime(track.pan, now, 0.01);
      }
    }

    for (const [id, chain] of this.chains) {
      if (live.has(id)) continue;
      chain.input.disconnect();
      chain.panner.disconnect();
      this.chains.delete(id);
    }
  }

  setMasterGain(value: number) {
    this.masterGain = clamp(value, 0, 1);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.masterGain, this.ctx.currentTime, 0.01);
    }
  }

  getMasterGain(): number {
    return this.masterGain;
  }

  // -- transport -----------------------------------------------------------

  isPlaying(): boolean {
    return this.playing;
  }

  play(fromTick?: number) {
    void this.startPlayback(fromTick);
  }

  private async startPlayback(fromTick?: number) {
    const project = this.project;
    if (!project || this.playing) return;
    const ctx = await this.ready();
    if (this.playing) return;

    const end = songEndTick(project);
    const origin = clamp(fromTick ?? this.pausedTick, 0, Math.max(0, end - 1));

    this.originTick = origin;
    this.scanTick = origin;
    this.scanTime = ctx.currentTime + START_DELAY;
    this.segments = [];
    this.stopAtTime = null;
    this.playing = true;

    this.runScheduler();
    this.timer = setInterval(() => this.runScheduler(), SCHEDULER_INTERVAL);
    this.emit();
  }

  /** Halt and hold the current position, rounded to a whole tick. */
  pause() {
    if (!this.playing) return;
    this.pausedTick = Math.round(this.getPositionTick());
    this.halt();
  }

  /** Halt and rewind to wherever playback last started. */
  stop() {
    if (!this.playing) {
      this.pausedTick = this.originTick;
      this.emit();
      return;
    }
    this.pausedTick = this.originTick;
    this.halt();
  }

  private halt() {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const now = this.ctx?.currentTime ?? 0;
    for (const voice of this.voices) voice.stop(now);
    this.voices.clear();
    this.midi.panic();
    this.segments = [];
    this.stopAtTime = null;
    this.emit();
  }

  /** Reached the end of the song with looping off: let tails ring out. */
  private finish() {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.pausedTick = this.originTick;
    this.segments = [];
    this.stopAtTime = null;
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(tick: number) {
    const project = this.project;
    const end = project ? songEndTick(project) : 0;
    const target = clamp(Math.round(tick), 0, Math.max(0, end - 1));
    if (this.playing) {
      // Restart the queue at the new position; already-queued voices are cut.
      const ctx = this.ctx;
      const now = ctx?.currentTime ?? 0;
      for (const voice of this.voices) voice.stop(now);
      this.voices.clear();
      this.midi.panic();
      this.originTick = target;
      this.scanTick = target;
      this.scanTime = now + START_DELAY;
      this.segments = [];
      this.stopAtTime = null;
      this.runScheduler();
    } else {
      this.pausedTick = target;
      this.originTick = target;
      this.emit();
    }
  }

  /** Musical position right now, in (possibly fractional) ticks. */
  getPositionTick(): number {
    if (!this.playing || !this.ctx) return this.pausedTick;
    const segments = this.segments;
    if (segments.length === 0) return this.originTick;
    const now = this.ctx.currentTime;
    if (now <= segments[0].startTime) return segments[0].startTick;
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = segments[i];
      if (now >= segment.startTime) {
        if (now < segment.endTime) {
          return segment.startTick + (now - segment.startTime) / segment.secPerTick;
        }
        return segment.endTick;
      }
    }
    return segments[0].startTick;
  }

  // -- scheduling ----------------------------------------------------------

  private runScheduler() {
    const ctx = this.ctx;
    const project = this.project;
    if (!ctx || !project || !this.playing) return;

    if (this.stopAtTime !== null && ctx.currentTime >= this.stopAtTime) {
      this.finish();
      return;
    }

    const lookahead =
      typeof document !== "undefined" && document.hidden
        ? LOOKAHEAD_HIDDEN
        : LOOKAHEAD;
    const horizon = ctx.currentTime + lookahead;
    const secPerTick = secondsPerTick(project);
    const end = songEndTick(project);

    let guard = 0;
    while (this.scanTime < horizon && guard < 600) {
      guard += 1;
      const window = nextScanWindow({
        scanTick: this.scanTick,
        songEnd: end,
        loop: project.loop,
        maxTicks: SCAN_TICKS,
      });
      if (!window) {
        // End of the song with no loop to fall back to: let tails ring out.
        this.stopAtTime = this.scanTime;
        break;
      }

      this.scheduleWindow(
        window.from,
        window.to,
        this.scanTime,
        secPerTick,
        window.limit,
      );

      const span = (window.to - window.from) * secPerTick;
      this.segments.push({
        startTime: this.scanTime,
        endTime: this.scanTime + span,
        startTick: window.from,
        endTick: window.to,
        secPerTick,
      });
      this.scanTime += span;
      this.scanTick = window.next;
    }

    // Drop segments and voices that are safely in the past.
    const cutoff = ctx.currentTime - 0.5;
    while (this.segments.length > 1 && this.segments[0].endTime < cutoff) {
      this.segments.shift();
    }
    for (const voice of this.voices) {
      if (voice.endTime < cutoff) this.voices.delete(voice);
    }
  }

  /**
   * Schedule every note starting in `[fromTick, toTick)`. Notes are cut off at
   * `hardEndTick` (the loop end or song end) so a held note never bleeds over
   * the retrigger on the next pass.
   */
  private scheduleWindow(
    fromTick: number,
    toTick: number,
    atTime: number,
    secPerTick: number,
    hardEndTick: number,
  ) {
    const ctx = this.ctx;
    const project = this.project;
    if (!ctx || !project) return;

    const anySolo = project.tracks.some((track) => track.soloed);

    for (const track of project.tracks) {
      const notes = this.sortedNotes(track);
      if (notes.length === 0) continue;
      const audible = !track.muted && (!anySolo || track.soloed);
      const chain = this.chains.get(track.id);
      const instrument = getInstrument(track.instrumentId);

      for (let i = lowerBound(notes, fromTick); i < notes.length; i += 1) {
        const note = notes[i];
        if (note.tick >= toTick) break;
        const noteEnd = Math.min(note.tick + note.duration, hardEndTick);
        const gate = (noteEnd - note.tick) * secPerTick;
        if (gate <= 0) continue;
        const when = atTime + (note.tick - fromTick) * secPerTick;

        if (track.output !== "midi" && chain) {
          const voice = scheduleVoice(
            ctx,
            chain.input,
            instrument,
            when,
            note.pitch,
            note.velocity,
            gate,
            () => this.voices.delete(voice),
          );
          this.voices.add(voice);
        }

        if (track.output !== "synth" && audible) {
          this.midi.sendNote(
            track.midiChannel,
            note.pitch,
            note.velocity,
            this.toDomTime(when),
            this.toDomTime(when + gate),
          );
        }
      }
    }
  }

  /** Convert an audio-clock time to the `performance.now()` base Web MIDI uses. */
  private toDomTime(audioTime: number): number {
    const ctx = this.ctx;
    if (!ctx) return performance.now();
    const stamp = ctx.getOutputTimestamp?.();
    if (
      stamp &&
      typeof stamp.contextTime === "number" &&
      typeof stamp.performanceTime === "number" &&
      stamp.contextTime > 0
    ) {
      return stamp.performanceTime + (audioTime - stamp.contextTime) * 1000;
    }
    return performance.now() + (audioTime - ctx.currentTime) * 1000;
  }

  // -- auditioning ---------------------------------------------------------

  /** Play a single note immediately, for click-to-hear feedback while editing. */
  preview(track: Track, pitch: number, velocity = 100, seconds = 0.4) {
    void this.ready().then((ctx) => {
      const chain = this.chains.get(track.id);
      const when = ctx.currentTime + 0.005;
      if (track.output !== "midi" && chain) {
        const voice = scheduleVoice(
          ctx,
          chain.input,
          getInstrument(track.instrumentId),
          when,
          pitch,
          velocity,
          seconds,
          () => this.voices.delete(voice),
        );
        this.voices.add(voice);
      }
      if (track.output !== "synth") {
        this.midi.sendNote(
          track.midiChannel,
          pitch,
          velocity,
          this.toDomTime(when),
          this.toDomTime(when + seconds),
        );
      }
    });
  }
}

/** Single shared transport for the app. */
export const engine = new SequencerEngine();
