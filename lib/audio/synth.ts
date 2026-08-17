import type { Instrument } from "../instruments";
import { clamp, midiToFreq } from "../music";

/** A voice that has already been fully scheduled on the audio clock. */
export type ActiveVoice = {
  /** Audio-clock time at which this voice frees itself. */
  endTime: number;
  /** Cut the voice short with a tiny fade so stopping never clicks. */
  stop(at: number): void;
};

const SILENCE = 0.00008;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

function cancelFrom(param: AudioParam, time: number) {
  const holdable = param as AudioParam & {
    cancelAndHoldAtTime?: (t: number) => AudioParam;
  };
  if (typeof holdable.cancelAndHoldAtTime === "function") {
    holdable.cancelAndHoldAtTime(time);
  } else {
    const current = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(current, time);
  }
}

/**
 * Schedule one note, start to finish, ahead of time.
 *
 * Everything — attack, decay, sustain, release, filter sweep, pitch drop — is
 * written onto the AudioParam timeline up front, so the note lands with
 * sample accuracy regardless of what the main thread is doing when it sounds.
 *
 * `gateSeconds` is how long the "key" is held; the release tail extends past it.
 */
export function scheduleVoice(
  ctx: AudioContext,
  destination: AudioNode,
  inst: Instrument,
  when: number,
  pitch: number,
  velocity: number,
  gateSeconds: number,
  onEnded?: () => void,
): ActiveVoice {
  const freq = midiToFreq(pitch);
  const vel = clamp(velocity / 127, 0, 1);
  // Square the velocity: linear velocity feels top-heavy on a synth.
  const peak = Math.max(0.0005, (vel * vel * inst.gain) / Math.sqrt(inst.voices));
  const sustainLevel = Math.max(SILENCE, peak * inst.sustain);

  const attack = Math.max(0.001, inst.attack);
  const decay = Math.max(0.001, inst.decay);
  const release = Math.max(0.01, inst.release);

  const attackEnd = when + attack;
  const decayEnd = attackEnd + decay;
  const gateOff = Math.max(when + Math.max(gateSeconds, 0.005), attackEnd);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(SILENCE, when);
  amp.gain.linearRampToValueAtTime(peak, attackEnd);

  let releaseStart: number;
  if (inst.sustain <= 0) {
    // Percussive patch: the envelope decays to silence on its own, and the
    // gate can only cut it short, never extend it.
    releaseStart = Math.min(decayEnd, gateOff);
    const progress = clamp((releaseStart - attackEnd) / decay, 0, 1);
    amp.gain.linearRampToValueAtTime(
      Math.max(SILENCE, peak * (1 - progress)),
      releaseStart,
    );
  } else if (gateOff >= decayEnd) {
    amp.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
    amp.gain.setValueAtTime(sustainLevel, gateOff);
    releaseStart = gateOff;
  } else {
    // Gate released mid-decay: ramp to wherever the decay had got to.
    const progress = clamp((gateOff - attackEnd) / decay, 0, 1);
    const level = peak + (sustainLevel - peak) * progress;
    amp.gain.linearRampToValueAtTime(Math.max(SILENCE, level), gateOff);
    releaseStart = gateOff;
  }

  const releaseEnd = releaseStart + release;
  amp.gain.exponentialRampToValueAtTime(SILENCE, releaseEnd);

  const filter = ctx.createBiquadFilter();
  filter.type = inst.filterType;
  filter.Q.value = inst.q;
  const baseCutoff = clamp(
    inst.cutoffTracksPitch ? freq * inst.cutoff : inst.cutoff,
    30,
    18000,
  );
  if (inst.filterEnv > 0) {
    filter.frequency.setValueAtTime(
      clamp(baseCutoff + inst.filterEnv, 30, 20000),
      when,
    );
    filter.frequency.exponentialRampToValueAtTime(
      baseCutoff,
      Math.max(when + 0.01, decayEnd),
    );
  } else {
    filter.frequency.setValueAtTime(baseCutoff, when);
  }

  const sources: AudioScheduledSourceNode[] = [];
  if (inst.wave === "noise") {
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);
    source.loop = true;
    source.playbackRate.value = 1;
    sources.push(source);
  } else {
    for (let i = 0; i < inst.voices; i += 1) {
      const osc = ctx.createOscillator();
      osc.type = inst.wave;
      osc.detune.value =
        inst.voices === 1 ? 0 : i === 0 ? -inst.detune / 2 : inst.detune / 2;
      if (inst.pitchDrop > 0) {
        const from = Math.min(freq * 2 ** (inst.pitchDrop / 12), 20000);
        osc.frequency.setValueAtTime(from, when);
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(freq, 20),
          when + Math.max(0.005, inst.pitchDropTime),
        );
      } else {
        osc.frequency.setValueAtTime(freq, when);
      }
      sources.push(osc);
    }
  }

  const hardStop = releaseEnd + 0.02;
  filter.connect(amp);
  amp.connect(destination);
  for (const source of sources) {
    source.connect(filter);
    source.start(when);
    source.stop(hardStop);
  }

  let released = false;
  const teardown = () => {
    try {
      amp.disconnect();
      filter.disconnect();
      for (const source of sources) source.disconnect();
    } catch {
      // Already torn down by the graph.
    }
    onEnded?.();
  };
  sources[sources.length - 1].addEventListener("ended", teardown, { once: true });

  return {
    endTime: hardStop,
    stop(at: number) {
      if (released) return;
      released = true;
      const t = Math.max(at, ctx.currentTime);
      try {
        cancelFrom(amp.gain, t);
        amp.gain.linearRampToValueAtTime(0, t + 0.012);
        for (const source of sources) source.stop(t + 0.03);
      } catch {
        // A source that already ended throws; nothing to do.
      }
    },
  };
}
