/**
 * Procedural spatial audio. All sounds are synthesized with the Web Audio API
 * (filtered noise bursts + tuned resonators) so the project has zero binary
 * sound assets yet still produces convincing felt thuds, wood-rail knocks,
 * die-to-die clicks and a hand-rattle. Volume & pitch are driven by collision
 * impulse strength; stereo position is driven by world X via StereoPanner.
 */

export type ImpactKind = 'felt' | 'wood' | 'die';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastSound = 0;
  muted = false;
  volume = 0.8;

  /** Must be called from a user gesture (we hook the first pointerdown). */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      // 300 ms of white noise, reused by every impact
      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGain();
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyGain();
  }

  private applyGain(): void {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Collision impact. strength 0..1, pan -1..1.
   * Material pairs get different spectra:
   *  felt = low muffled thud, wood = mid knock with body, die = bright click.
   */
  impact(kind: ImpactKind, strength: number, pan = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const now = this.ctx.currentTime;
    // rate limit: avoid >1 sound per 18ms (12 dice can spam contacts)
    if (now - this.lastSound < 0.018) return;
    this.lastSound = now;

    const s = Math.min(1, Math.max(0.05, strength));
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.master);

    // --- noise component ---
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const g = this.ctx.createGain();
    let dur: number;
    if (kind === 'felt') {
      bp.frequency.value = 280 + s * 220 + Math.random() * 80;
      bp.Q.value = 0.8;
      dur = 0.08 + s * 0.05;
      g.gain.value = 0.35 * s;
    } else if (kind === 'wood') {
      bp.frequency.value = 900 + s * 500 + Math.random() * 200;
      bp.Q.value = 2.2;
      dur = 0.07 + s * 0.04;
      g.gain.value = 0.5 * s;
    } else {
      bp.frequency.value = 3200 + s * 1800 + Math.random() * 600;
      bp.Q.value = 3.5;
      dur = 0.035 + s * 0.02;
      g.gain.value = 0.45 * s;
    }
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    src.connect(bp).connect(g).connect(panner);
    src.start(now);
    src.stop(now + dur + 0.02);

    // --- tonal body (thump / knock) ---
    if (kind !== 'die') {
      const osc = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      osc.type = 'sine';
      const f = kind === 'felt' ? 70 + s * 50 : 180 + s * 120;
      osc.frequency.setValueAtTime(f * 1.4, now);
      osc.frequency.exponentialRampToValueAtTime(f, now + 0.05);
      og.gain.setValueAtTime(0.4 * s, now);
      og.gain.exponentialRampToValueAtTime(0.0005, now + 0.1 + s * 0.06);
      osc.connect(og).connect(panner);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }

  /** Dice rattling in the hand right before the throw. */
  rattle(duration = 0.45): void {
    if (!this.ctx || !this.master || this.muted) return;
    const n = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * duration * (0.7 + Math.random() * 0.3);
      setTimeout(() => this.impact('die', 0.25 + Math.random() * 0.35, Math.random() * 0.6 - 0.3), t * 1000);
    }
  }

  /** Soft confirmation chime when the result is read. */
  settle(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    for (const [freq, delay, vol] of [[523.25, 0, 0.1], [783.99, 0.07, 0.07]] as const) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.exponentialRampToValueAtTime(vol, now + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.5);
      osc.connect(g).connect(this.master);
      osc.start(now + delay);
      osc.stop(now + delay + 0.55);
    }
  }

  /** Tiny pop when a die is added/removed. */
  pop(): void {
    this.impact('die', 0.3, 0);
  }
}

export const audio = new AudioManager();
