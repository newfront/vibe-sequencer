/** Thin wrapper over the Web MIDI API for sending notes to external gear. */

export type MidiPortInfo = { id: string; name: string };

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CONTROL_CHANGE = 0xb0;
const ALL_NOTES_OFF = 123;

export function isMidiSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.requestMIDIAccess === "function"
  );
}

export class MidiOut {
  private access: MIDIAccess | null = null;
  private port: MIDIOutput | null = null;
  private listeners = new Set<() => void>();

  /** Channels we have sent a note-on to, so panic only touches those. */
  private touchedChannels = new Set<number>();

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  get enabled(): boolean {
    return this.access !== null;
  }

  get selectedId(): string | null {
    return this.port?.id ?? null;
  }

  /** Prompts for MIDI permission. Must be called from a user gesture. */
  async enable(): Promise<MidiPortInfo[]> {
    if (!isMidiSupported()) {
      throw new Error("This browser does not support the Web MIDI API.");
    }
    if (!this.access) {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      access.onstatechange = () => this.emit();
      this.access = access;
    }
    this.emit();
    return this.listPorts();
  }

  listPorts(): MidiPortInfo[] {
    if (!this.access) return [];
    return Array.from(this.access.outputs.values()).map((port) => ({
      id: port.id,
      name: port.name ?? port.id,
    }));
  }

  select(id: string | null) {
    if (this.port && this.port.id !== id) this.panic();
    if (!id || !this.access) {
      this.port = null;
      this.emit();
      return;
    }
    this.port =
      Array.from(this.access.outputs.values()).find((port) => port.id === id) ??
      null;
    void this.port?.open?.().catch(() => undefined);
    this.emit();
  }

  /**
   * Queue a note on/off pair. Both messages carry an absolute
   * `performance.now()`-based timestamp, so the browser delivers them with far
   * better timing than a `setTimeout` chain ever could.
   */
  sendNote(
    channel: number,
    pitch: number,
    velocity: number,
    onTime: number,
    offTime: number,
  ) {
    const port = this.port;
    if (!port) return;
    const ch = Math.max(0, Math.min(15, Math.round(channel) - 1));
    const note = Math.max(0, Math.min(127, Math.round(pitch)));
    const vel = Math.max(1, Math.min(127, Math.round(velocity)));
    this.touchedChannels.add(ch);
    try {
      port.send([NOTE_ON | ch, note, vel], Math.max(0, onTime));
      port.send([NOTE_OFF | ch, note, 0x40], Math.max(0, offTime));
    } catch {
      // A port can disappear between selection and send.
    }
  }

  /** Drop anything still queued and silence every channel we have used. */
  panic() {
    const port = this.port;
    if (!port) return;
    try {
      // `clear()` is in the Web MIDI spec but missing from the DOM lib types.
      (port as MIDIOutput & { clear?: () => void }).clear?.();
      for (const ch of this.touchedChannels) {
        port.send([CONTROL_CHANGE | ch, ALL_NOTES_OFF, 0]);
      }
    } catch {
      // Panic is best-effort.
    }
    this.touchedChannels.clear();
  }
}
