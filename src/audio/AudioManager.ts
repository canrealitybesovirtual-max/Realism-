import { CONFIG } from '../config';

/**
 * All-procedural WebAudio atmosphere. No samples, no downloads.
 * Wind (filtered brown noise), drone (detuned low sines), presence pulse near the enemy,
 * footsteps (yours and its, panned by direction), UI and event cues.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private presenceGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private unlocked = false;
  private unlocking = false;
  private started = false;
  private muted = false;
  private userVolume: number = CONFIG.settings.defaultVolume * CONFIG.audio.masterVolume;
  private indoors = false;

  /** Call from inside a user-gesture handler. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (this.unlocked || this.unlocking) return;
    this.unlocking = true;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      if (this.ctx.state === 'suspended') await this.ctx.resume();

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.userVolume;
      this.master.connect(this.ctx.destination);

      // one shared second of white noise for every burst sound
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.createWind();
      this.createDrone();
      this.createPresence();

      this.unlocked = true;
      if (this.started) this.applyStarted();
    } catch (err) {
      console.warn('[audio] unavailable', err);
    } finally {
      this.unlocking = false;
    }
  }

  start(): void {
    this.started = true;
    if (this.unlocked) this.applyStarted();
  }

  resumeContext(): void {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  suspendContext(): void {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.userVolume, this.ctx.currentTime, 0.05);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(v: number): void {
    this.userVolume = Math.max(0, Math.min(1, v)) * CONFIG.audio.masterVolume;
    if (this.master && this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(this.userVolume, this.ctx.currentTime, 0.05);
    }
  }

  /** Wind is muffled indoors. */
  setIndoors(inside: boolean): void {
    if (inside === this.indoors || !this.ctx || !this.windFilter || !this.windGain) return;
    this.indoors = inside;
    const t = this.ctx.currentTime;
    this.windFilter.frequency.setTargetAtTime(inside ? 180 : 420, t, 0.4);
    this.windGain.gain.setTargetAtTime(this.started ? (inside ? 0.07 : 0.16) : 0, t, 0.4);
  }

  // ---------------- footsteps ----------------

  footstep(sprinting: boolean, indoors: boolean): void {
    this.noiseBurst({
      dur: indoors ? 0.07 : 0.09,
      decay: indoors ? 26 : 18,
      rate: (sprinting ? 0.9 : 0.78) + Math.random() * 0.18,
      type: 'bandpass',
      freq: (indoors ? 320 : 170) + Math.random() * 90,
      q: indoors ? 3 : 2.2,
      gain: (sprinting ? 0.34 : 0.22) * (indoors ? 0.9 : 1)
    });
  }

  /** The enemy's steps: quieter with distance, panned to where it is. */
  enemyStep(distance: number, pan: number, running: boolean): void {
    const range = CONFIG.enemy.stepHearRange;
    if (distance > range) return;
    const fall = 1 - distance / range;
    this.noiseBurst({
      dur: 0.11,
      decay: 14,
      rate: 0.55 + Math.random() * 0.12,
      type: 'lowpass',
      freq: 260 + fall * 260,
      q: 1.2,
      gain: (running ? 0.3 : 0.18) * fall * fall,
      pan: Math.max(-1, Math.min(1, pan)) * 0.85
    });
  }

  // ---------------- UI / event cues ----------------

  flashlightClick(on: boolean): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = on ? 1900 : 1300;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.025);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  itemPickup(): void {
    // cloth rustle + a soft tone
    this.noiseBurst({ dur: 0.12, decay: 16, rate: 1, type: 'highpass', freq: 1800, q: 0.7, gain: 0.08 });
    this.tone('triangle', 660, 990, 0.08, 0.12);
  }

  itemUse(): void {
    this.tone('sine', 440, 660, 0.09, 0.2);
  }

  craftDone(): void {
    if (!this.ctx || !this.master) return;
    for (let i = 0; i < 2; i++) {
      this.noiseBurst({ dur: 0.05, decay: 30, rate: 1, type: 'bandpass', freq: 900, q: 4, gain: 0.18, delay: i * 0.12 });
    }
    this.tone('triangle', 520, 780, 0.06, 0.18, 0.26);
  }

  fuseCollected(): void {
    if (!this.ctx || !this.master) return;
    for (let i = 0; i < 3; i++) this.tone('triangle', 620 + i * 260, 620 + i * 260, 0.08, 0.15, i * 0.06);
  }

  denied(): void {
    this.tone('square', 180, 140, 0.05, 0.16);
  }

  powerRestored(): void {
    if (!this.ctx || !this.master) return;
    this.noiseBurst({ dur: 0.3, decay: 6, rate: 1, type: 'highpass', freq: 1500, q: 0.7, gain: 0.3 });
    // a heavy relay clunk, then the gate motor
    this.tone('sine', 90, 40, 0.3, 0.25);
    for (let i = 0; i < 2; i++) this.tone('sine', 300 + i * 150, 700 + i * 200, 0.05, 0.55);
    const now = this.ctx.currentTime;
    const motor = this.ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(55, now + 0.4);
    motor.frequency.linearRampToValueAtTime(62, now + 3.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now + 0.4);
    g.gain.linearRampToValueAtTime(0.07, now + 0.8);
    g.gain.setValueAtTime(0.07, now + 3.0);
    g.gain.linearRampToValueAtTime(0, now + 3.6);
    motor.connect(lp).connect(g).connect(this.master);
    motor.start(now + 0.4);
    motor.stop(now + 3.7);
  }

  win(): void {
    if (!this.ctx || !this.master) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone('sine', f, f, 0.08, 0.7, i * 0.14));
  }

  died(): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 1.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 1.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 1.5);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 1.55);
  }

  // ---------------- enemy / tension ----------------

  /** 0..1 how close and visible the enemy is; drives the low pulse. */
  setEnemyPresence(level: number): void {
    if (!this.presenceGain || !this.ctx) return;
    const clamped = Math.max(0, Math.min(1, level));
    this.presenceGain.gain.setTargetAtTime(clamped * 0.22, this.ctx.currentTime, 0.25);
  }

  enemyAlert(): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.4);
    filter.connect(gain).connect(this.master);
    for (const [type, f0, f1] of [
      ['square', 160, 90],
      ['sawtooth', 167, 94]
    ] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(f1, now + 0.35);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 0.42);
    }
  }

  enemyContact(): void {
    this.tone('sine', 90, 38, 0.3, 0.25);
    this.noiseBurst({ dur: 0.16, decay: 10, rate: 1, type: 'highpass', freq: 1200, q: 0.7, gain: 0.24 });
  }

  whisper(): void {
    this.noiseBurst({
      dur: 0.9,
      decay: 0,
      envelope: 'arch',
      rate: 0.8 + Math.random() * 0.3,
      type: 'bandpass',
      freq: 900 + Math.random() * 700,
      q: 5,
      gain: 0.12,
      pan: (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5)
    });
  }

  scareSwell(): void {
    if (!this.ctx || !this.master) return;
    const dur = 1.6;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.06, now + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0003, now + dur);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    this.noiseBurst({ dur, decay: 0, envelope: 'rise', rate: 1, type: 'bandpass', freq: 700, q: 1.2, gain: 0.09 });
  }

  dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.unlocked = false;
    this.started = false;
  }

  // ---------------- internals ----------------

  private tone(type: OscillatorType, f0: number, f1: number, peak: number, dur: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const s = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, s);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, s + dur * 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(peak, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, s + dur);
    osc.connect(g).connect(this.master);
    osc.start(s);
    osc.stop(s + dur + 0.02);
  }

  private noiseBurst(o: {
    dur: number;
    decay: number;
    rate: number;
    type: BiquadFilterType;
    freq: number;
    q: number;
    gain: number;
    pan?: number;
    delay?: number;
    envelope?: 'exp' | 'arch' | 'rise';
  }): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const s = this.ctx.currentTime + (o.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.value = o.freq;
    filter.Q.value = o.q;
    const g = this.ctx.createGain();
    const env = o.envelope ?? 'exp';
    if (env === 'exp') {
      g.gain.setValueAtTime(o.gain, s);
      g.gain.setTargetAtTime(0, s, 1 / Math.max(o.decay, 1));
    } else if (env === 'arch') {
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(o.gain, s + o.dur / 2);
      g.gain.linearRampToValueAtTime(0, s + o.dur);
    } else {
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(o.gain, s + o.dur * 0.95);
      g.gain.linearRampToValueAtTime(0, s + o.dur);
    }
    let node: AudioNode = src.connect(filter).connect(g);
    if (o.pan !== undefined) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = o.pan;
      node = node.connect(p);
    }
    node.connect(this.master);
    // random start inside the shared buffer so repeats never sound identical
    src.start(s, Math.random() * 0.5);
    src.stop(s + o.dur + 0.05);
  }

  private applyStarted(): void {
    if (!this.ctx || !this.windGain || !this.droneGain) return;
    const now = this.ctx.currentTime;
    const fade = CONFIG.audio.ambientFadeIn;
    this.windGain.gain.cancelScheduledValues(now);
    this.windGain.gain.setValueAtTime(0, now);
    this.windGain.gain.linearRampToValueAtTime(this.indoors ? 0.07 : 0.16, now + fade);
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setValueAtTime(0, now);
    this.droneGain.gain.linearRampToValueAtTime(0.08, now + fade + 1.2);
  }

  private createWind(): void {
    if (!this.ctx || !this.master) return;
    const size = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < size; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    // crossfade the loop seam
    const fade = Math.floor(this.ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] = d[i] * t + d[size - fade + i] * (1 - t);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopEnd = (size - fade) / this.ctx.sampleRate;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.8;

    // slow gusts
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = this.ctx.createGain();
    lfoAmt.gain.value = 140;
    lfo.connect(lfoAmt).connect(this.windFilter.frequency);
    lfo.start();

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();
  }

  private createDrone(): void {
    if (!this.ctx || !this.master) return;
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.master);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    filter.connect(this.droneGain);
    for (const f of [42, 45.6]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(filter);
      osc.start();
    }
  }

  private createPresence(): void {
    if (!this.ctx || !this.master) return;
    // level (set by the game) → master. Silent at level 0.
    this.presenceGain = this.ctx.createGain();
    this.presenceGain.gain.value = 0;
    this.presenceGain.connect(this.master);

    // heartbeat-like pulse: its own gain swings 0..1 with an LFO, never above the level
    const pulse = this.ctx.createGain();
    pulse.gain.value = 0.5;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 1.6;
    const lfoAmt = this.ctx.createGain();
    lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(pulse.gain);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 45;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;

    osc.connect(filter).connect(pulse).connect(this.presenceGain);
    osc.start();
    lfo.start();
  }
}
