/**
 * Tiny persisted settings store. Currently just the mute flag.
 *
 * The future audio system subscribes via `settings.onChange((muted) => ...)`
 * and reads `settings.muted` at startup. The flag persists in localStorage.
 */

const STORAGE_KEY = 'dusk-air-hockey.muted';

type MuteListener = (muted: boolean) => void;

class SettingsStore {
  private mutedFlag: boolean;
  private readonly listeners = new Set<MuteListener>();

  constructor() {
    this.mutedFlag = this.readPersisted();
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  setMuted(value: boolean): void {
    if (value === this.mutedFlag) return;
    this.mutedFlag = value;
    this.writePersisted(value);
    for (const listener of this.listeners) listener(value);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.mutedFlag);
    return this.mutedFlag;
  }

  /** Subscribe to mute changes. Returns an unsubscribe function. */
  onChange(listener: MuteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readPersisted(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false; // Private mode / blocked storage — default to sound on.
    }
  }

  private writePersisted(value: boolean): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // Non-fatal: the flag simply won't persist.
    }
  }
}

/** Singleton — UI and audio share one instance. */
export const settings = new SettingsStore();
