/**
 * Procedural Web Audio for Fireside Faceoff. No external assets — every sound
 * is synthesized (oscillators, noise buffers, filters, envelopes) to match the
 * warm, toy-like diorama aesthetic.
 *
 * Lifecycle: the AudioContext is created lazily on the first user gesture
 * (pointerdown / keydown) to satisfy autoplay policies, and resumed on
 * visibilitychange when the tab returns. Mute follows the shared Settings
 * store with a short gain ramp so toggling never clicks.
 *
 * Graph:  voices -> sfxBus ┐
 *         ambience -> ambienceBus ┘-> masterGain -> compressor -> destination
 */
import type { EventBus, Side } from '../core/Events';
import type { GameState } from '../game/Game';
import { settings } from './Settings';

export interface AudioDiagnostics {
  unlocked: boolean;
  contextState: AudioContextState | 'none';
  activeVoices: number;
  voicesFired: number;
  ambienceOn: boolean;
  muted: boolean;
}

/** Max mallet/wall hit sounds per second — physics jitter can't machine-gun. */
const MAX_HITS_PER_SECOND = 12;
/** Mute/unmute gain ramp (seconds) — long enough to avoid clicks. */
const MUTE_RAMP = 0.05;
/** Ambience bed level. Roughly -30 dB below typical SFX peaks. */
const AMBIENCE_LEVEL = 0.022;

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private sfxBus!: GainNode;
  private ambienceBus!: GainNode;

  private noiseBuffer: AudioBuffer | null = null;
  private brownBuffer: AudioBuffer | null = null;

  private unlocked = false;
  private activeVoices = 0;
  private voicesFired = 0;

  // Ambience state (nodes reused; start/stop are idempotent).
  private ambienceOn = false;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private crackleTimer: number | undefined;
  private duckUntil = 0;

  // Game-state mirror (updated by Game.update; cheap diffing only).
  private lastState: GameState = 'title';
  private lastPaused = false;

  private readonly hitTimestamps: number[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private readonly onGesture = (): void => this.unlock();
  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible' && this.ctx?.state === 'suspended') {
      void this.ctx.resume();
    }
  };

  constructor(events: EventBus) {
    // Unlock on the very first gesture anywhere (capture so overlays count).
    window.addEventListener('pointerdown', this.onGesture, { capture: true });
    window.addEventListener('keydown', this.onGesture, { capture: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    this.unsubscribers.push(
      events.on('puckHitMallet', ({ speed, side }) => this.playMalletHit(speed, side)),
      events.on('puckHitWall', ({ speed }) => this.playWallBounce(speed)),
      events.on('goalScored', ({ side }) => this.playGoal(side)),
      events.on('gameWon', ({ side }) => this.playWin(side)),
      events.on('serve', () => this.playServe()),
      events.on('uiClick', () => this.playUiClick()),
      settings.onChange((muted) => this.applyMute(muted)),
    );
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onGesture, { capture: true });
    window.removeEventListener('keydown', this.onGesture, { capture: true });
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.stopAmbience();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.unlocked = false;
  }

  /**
   * Called once per frame from Game.update. Only cheap comparisons happen
   * here; real work runs on actual transitions (pause blips, ambience).
   */
  sync(state: GameState, paused: boolean): void {
    if (state === this.lastState && paused === this.lastPaused) return;

    // Pause open/close blips (only meaningful mid-match).
    if (paused !== this.lastPaused && state !== 'title' && state !== 'gameover') {
      this.playPauseBlip(paused);
    }

    this.lastState = state;
    this.lastPaused = paused;

    const wantAmbience =
      !paused && (state === 'playing' || state === 'serving' || state === 'goal');
    if (wantAmbience) this.startAmbience();
    else this.stopAmbience();
  }

  diagnostics(): AudioDiagnostics {
    return {
      unlocked: this.unlocked,
      contextState: this.ctx ? this.ctx.state : 'none',
      activeVoices: this.activeVoices,
      voicesFired: this.voicesFired,
      ambienceOn: this.ambienceOn,
      muted: settings.muted,
    };
  }

  // ------------------------------------------------------------- lifecycle

  private unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return; // No Web Audio — game stays silent, never crashes.
      this.ctx = new Ctor();

      // Gentle limiter so confetti-goal moments (jingle + hits) never clip.
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 24;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.24;
      this.compressor.connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.master.gain.value = settings.muted ? 0 : 1;
      this.master.connect(this.compressor);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.ambienceBus = this.ctx.createGain();
      this.ambienceBus.gain.value = AMBIENCE_LEVEL;
      this.ambienceBus.connect(this.master);

      this.noiseBuffer = this.createNoiseBuffer('white');
      this.brownBuffer = this.createNoiseBuffer('brown');
    }
    if (this.ctx.state === 'suspended') {
      // Resume may complete asynchronously — re-check ambience afterwards.
      void this.ctx.resume().then(() => this.catchUpAmbience());
    }
    this.unlocked = true;
    this.catchUpAmbience();
  }

  /** If the game is already mid-play when audio becomes ready, catch up. */
  private catchUpAmbience(): void {
    const wantAmbience =
      !this.lastPaused &&
      (this.lastState === 'playing' || this.lastState === 'serving' || this.lastState === 'goal');
    if (wantAmbience) this.startAmbience();
  }

  private applyMute(muted: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(muted ? 0 : 1, now + MUTE_RAMP);
  }

  private get ready(): boolean {
    return this.unlocked && this.ctx !== null && this.ctx.state === 'running';
  }

  // ------------------------------------------------------------- utilities

  private createNoiseBuffer(kind: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } else {
      // Brown noise: integrated white noise, normalized. Warm rumbly bed.
      let last = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    return buffer;
  }

  /** Envelope gain feeding a bus; auto-disconnects when the voice ends. */
  private voiceGain(bus: AudioNode, stopAt: number, nodes: AudioScheduledSourceNode[]): GainNode {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.connect(bus);
    this.activeVoices += 1;
    this.voicesFired += 1;
    let remaining = nodes.length;
    for (const node of nodes) {
      node.addEventListener('ended', () => {
        remaining -= 1;
        if (remaining === 0) {
          gain.disconnect();
          this.activeVoices -= 1;
        }
      });
    }
    // Callers start() their sources synchronously right after building the
    // voice; stop() must come after start(), so schedule it in a microtask.
    queueMicrotask(() => {
      for (const node of nodes) {
        try {
          node.stop(stopAt);
        } catch {
          // Source never started (context torn down mid-voice) — ignore.
        }
      }
    });
    return gain;
  }

  private noiseSource(buffer: AudioBuffer, playbackRate = 1): AudioBufferSourceNode {
    const source = this.ctx!.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    // Random offset so repeated bursts never sound identical.
    return source;
  }

  private bandpass(frequency: number, q: number): BiquadFilterNode {
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    return filter;
  }

  private panner(pan: number): StereoPannerNode | GainNode {
    const ctx = this.ctx!;
    if (typeof ctx.createStereoPanner === 'function') {
      const node = ctx.createStereoPanner();
      node.pan.value = pan;
      return node;
    }
    return ctx.createGain(); // Fallback: no panning (old Safari).
  }

  /**
   * One warm bell/music-box note: sine fundamental + quiet triangle partial,
   * fast attack, exponential decay. Optional vibrato LFO for the win jingle.
   */
  private bellNote(
    freq: number,
    at: number,
    peak: number,
    decay: number,
    vibrato = false,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const partial = ctx.createOscillator();
    partial.type = 'triangle';
    partial.frequency.value = freq * 3;

    const nodes: AudioScheduledSourceNode[] = [osc, partial];
    let lfo: OscillatorNode | null = null;
    if (vibrato) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = freq * 0.004; // subtle
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      nodes.push(lfo);
    }

    const stopAt = at + decay + 0.05;
    const gain = this.voiceGain(this.sfxBus, stopAt, nodes);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);

    const partialGain = ctx.createGain();
    partialGain.gain.setValueAtTime(0.12, at);
    partialGain.gain.exponentialRampToValueAtTime(0.0001, at + decay * 0.4);

    osc.connect(gain);
    partial.connect(partialGain);
    partialGain.connect(gain);
    osc.start(at);
    partial.start(at);
    lfo?.start(at);
  }

  /** Rate limiter for hit-type sounds. Quiet hits are dropped first. */
  private allowHit(loudness: number): boolean {
    const now = performance.now();
    while (this.hitTimestamps.length > 0 && now - this.hitTimestamps[0] > 1000) {
      this.hitTimestamps.shift();
    }
    if (this.hitTimestamps.length >= MAX_HITS_PER_SECOND) return false;
    // Above half the budget, start skipping the quietest impacts.
    if (this.hitTimestamps.length >= MAX_HITS_PER_SECOND / 2 && loudness < 0.25) return false;
    this.hitTimestamps.push(now);
    return true;
  }

  // ------------------------------------------------------------------ sfx

  /** Woody "tock": filtered noise burst + sine thump; scales with speed. */
  private playMalletHit(speed: number, side: Side): void {
    if (!this.ready) return;
    const loudness = Math.min(1, speed / 5);
    if (!this.allowHit(loudness)) return;

    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const detune = 1 + (Math.random() * 2 - 1) * 0.06; // rallies never robotic
    const volume = 0.18 + 0.5 * loudness;

    // Subtle L/R: player mallet sits nearer, pan a touch right; AI a touch left.
    const pan = this.panner(side === 'player' ? 0.16 : -0.16);
    pan.connect(this.sfxBus);

    const noise = this.noiseSource(this.noiseBuffer!, 1);
    const bp = this.bandpass(1400 + 900 * loudness, 1.1);
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime((175 + 70 * loudness) * detune, at);
    thump.frequency.exponentialRampToValueAtTime(90 * detune, at + 0.09);

    const stopAt = at + 0.14;
    const gain = this.voiceGain(pan, stopAt, [noise, thump]);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, at);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);

    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(gain);
    thump.connect(gain);
    noise.start(at, Math.random() * 1.5);
    thump.start(at);
  }

  /** Softer "tick" for wall bounces; volume tracks impact speed. */
  private playWallBounce(speed: number): void {
    if (!this.ready) return;
    const loudness = Math.min(1, speed / 5);
    if (!this.allowHit(loudness * 0.8)) return;

    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const detune = 1 + (Math.random() * 2 - 1) * 0.08;
    const volume = 0.05 + 0.22 * loudness;

    const noise = this.noiseSource(this.noiseBuffer!, 1);
    const bp = this.bandpass(2300 * detune, 2.2);
    const tick = ctx.createOscillator();
    tick.type = 'sine';
    tick.frequency.setValueAtTime(420 * detune, at);
    tick.frequency.exponentialRampToValueAtTime(240 * detune, at + 0.05);

    const stopAt = at + 0.09;
    const gain = this.voiceGain(this.sfxBus, stopAt, [noise, tick]);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, at);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.02);

    const tickGain = ctx.createGain();
    tickGain.gain.setValueAtTime(0.35, at);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);

    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(gain);
    tick.connect(tickGain);
    tickGain.connect(gain);
    noise.start(at, Math.random() * 1.5);
    tick.start(at);
  }

  /** Player goal: warm 3-note major chime. Conceded: soft descending pair. */
  private playGoal(scorer: Side): void {
    if (!this.ready) return;
    const at = this.ctx!.currentTime;
    this.duckAmbience(1.6);
    if (scorer === 'player') {
      // Toy glockenspiel: C5 - E5 - G5.
      this.bellNote(523.25, at, 0.3, 0.9);
      this.bellNote(659.25, at + 0.13, 0.28, 0.9);
      this.bellNote(783.99, at + 0.26, 0.32, 1.1);
    } else {
      // Gentle "aww": E4 down to C4, still warm.
      this.bellNote(329.63, at, 0.22, 0.7);
      this.bellNote(261.63, at + 0.22, 0.2, 0.9);
    }
  }

  /** Win: music-box lullaby jingle. Lose: consoling 3-note phrase. */
  private playWin(winner: Side): void {
    if (!this.ready) return;
    const at = this.ctx!.currentTime;
    this.duckAmbience(3);
    if (winner === 'player') {
      // 7-note music box phrase (C major, lullaby contour) with soft vibrato.
      const phrase: Array<[number, number]> = [
        [523.25, 0], // C5
        [659.25, 0.18], // E5
        [783.99, 0.36], // G5
        [880.0, 0.54], // A5
        [783.99, 0.76], // G5
        [659.25, 0.94], // E5
        [1046.5, 1.16], // C6
      ];
      for (const [freq, offset] of phrase) {
        this.bellNote(freq, at + offset, 0.26, 1.3, true);
      }
    } else {
      // Consoling: G4 - E4 - C4, slow and soft.
      this.bellNote(392.0, at, 0.2, 1.0, true);
      this.bellNote(329.63, at + 0.28, 0.18, 1.0, true);
      this.bellNote(261.63, at + 0.58, 0.16, 1.4, true);
    }
  }

  /** Serve: a little breathy whoosh (filtered noise swell). */
  private playServe(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const at = ctx.currentTime;

    const noise = this.noiseSource(this.noiseBuffer!, 0.8);
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(400, at);
    lp.frequency.exponentialRampToValueAtTime(1400, at + 0.16);
    lp.frequency.exponentialRampToValueAtTime(500, at + 0.34);

    const stopAt = at + 0.4;
    const gain = this.voiceGain(this.sfxBus, stopAt, [noise]);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.14, at + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.36);

    noise.connect(lp);
    lp.connect(gain);
    noise.start(at, Math.random());
  }

  /** UI click: tiny felt-piano tap (muted sine knock + brush of noise). */
  private playUiClick(): void {
    this.feltTap(392, 330);
  }

  /** Pause open = downward tap, close/resume = upward tap. */
  private playPauseBlip(opening: boolean): void {
    if (opening) this.feltTap(392, 294);
    else this.feltTap(294, 392);
  }

  private feltTap(fromHz: number, toHz: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const at = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(fromHz, at);
    osc.frequency.exponentialRampToValueAtTime(toHz, at + 0.07);

    const noise = this.noiseSource(this.noiseBuffer!, 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;

    const stopAt = at + 0.12;
    const gain = this.voiceGain(this.sfxBus, stopAt, [osc, noise]);
    gain.gain.setValueAtTime(0.16, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, at);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);

    osc.connect(gain);
    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(gain);
    osc.start(at);
    noise.start(at, Math.random() * 1.5);
  }

  // ------------------------------------------------------------- ambience

  /** Idempotent: at most one bed + one crackle scheduler ever run. */
  private startAmbience(): void {
    if (!this.ready || this.ambienceOn) return;
    const ctx = this.ctx!;
    this.ambienceOn = true;

    const source = ctx.createBufferSource();
    source.buffer = this.brownBuffer;
    source.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    source.connect(lp);
    lp.connect(this.ambienceBus);
    source.start();
    this.ambienceSource = source;
    this.ambienceFilter = lp;

    // Fade the bed in gently.
    const now = ctx.currentTime;
    this.ambienceBus.gain.cancelScheduledValues(now);
    this.ambienceBus.gain.setValueAtTime(0.0001, now);
    this.ambienceBus.gain.linearRampToValueAtTime(AMBIENCE_LEVEL, now + 0.8);

    this.scheduleCrackle();
  }

  private stopAmbience(): void {
    if (!this.ambienceOn) return;
    this.ambienceOn = false;
    window.clearTimeout(this.crackleTimer);
    this.crackleTimer = undefined;
    if (this.ambienceSource && this.ctx) {
      const source = this.ambienceSource;
      const filter = this.ambienceFilter;
      const now = this.ctx.currentTime;
      this.ambienceBus.gain.cancelScheduledValues(now);
      this.ambienceBus.gain.setValueAtTime(this.ambienceBus.gain.value, now);
      this.ambienceBus.gain.linearRampToValueAtTime(0.0001, now + 0.15);
      source.stop(now + 0.2);
      source.addEventListener('ended', () => {
        source.disconnect();
        filter?.disconnect();
      });
    }
    this.ambienceSource = null;
    this.ambienceFilter = null;
  }

  /** Sparse fireplace/vinyl pops: tiny bandpassed noise blips on a timer. */
  private scheduleCrackle(): void {
    if (!this.ambienceOn) return;
    const delay = 350 + Math.random() * 2200;
    this.crackleTimer = window.setTimeout(() => {
      if (this.ambienceOn && this.ready) this.playCrackle();
      this.scheduleCrackle();
    }, delay);
  }

  private playCrackle(): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const noise = this.noiseSource(this.noiseBuffer!, 0.9 + Math.random() * 0.5);
    const bp = this.bandpass(1800 + Math.random() * 2400, 4);

    const stopAt = at + 0.05;
    const gain = this.voiceGain(this.ambienceBus, stopAt, [noise]);
    gain.gain.setValueAtTime(0.25 + Math.random() * 0.5, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);

    noise.connect(bp);
    bp.connect(gain);
    noise.start(at, Math.random() * 1.8);
  }

  /** Duck the room tone under goal/win jingles, then recover. */
  private duckAmbience(seconds: number): void {
    if (!this.ctx || !this.ambienceOn) return;
    const now = this.ctx.currentTime;
    this.duckUntil = now + seconds;
    this.ambienceBus.gain.cancelScheduledValues(now);
    this.ambienceBus.gain.setValueAtTime(this.ambienceBus.gain.value, now);
    this.ambienceBus.gain.linearRampToValueAtTime(AMBIENCE_LEVEL * 0.35, now + 0.1);
    this.ambienceBus.gain.linearRampToValueAtTime(AMBIENCE_LEVEL, this.duckUntil);
  }
}
