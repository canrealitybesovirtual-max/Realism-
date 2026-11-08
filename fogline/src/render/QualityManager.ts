import type { QualityTier } from '../types';

export interface TierSettings {
  dprScale: number;
  postfx: boolean;
  beam: boolean;
  fogScale: number;
}

const TIERS: Record<QualityTier, TierSettings> = {
  low: { dprScale: 0.7, postfx: false, beam: false, fogScale: 1.15 },
  medium: { dprScale: 0.9, postfx: true, beam: true, fogScale: 1.0 },
  high: { dprScale: 1.0, postfx: true, beam: true, fogScale: 0.95 }
};

/** Picks a tier; in auto mode steps down (once per tier) if the frame rate stays low. */
export class QualityManager {
  tier: QualityTier = 'high';
  settings: TierSettings = TIERS.high;
  onApply: ((tier: QualityTier, s: TierSettings) => void) | null = null;

  private lowFpsTimer = 0;
  private auto = true;
  private warmup = 3;

  setMode(mode: QualityTier | 'auto'): void {
    if (mode === 'auto') {
      if (!this.auto) {
        this.auto = true;
        this.warmup = 3;
        this.apply('high');
      }
    } else {
      this.auto = false;
      this.apply(mode);
    }
  }

  update(dt: number, fps: number): void {
    if (!this.auto || this.tier === 'low') return;
    if (this.warmup > 0) {
      this.warmup -= dt; // ignore shader-compile hitches right after start / a change
      return;
    }
    if (fps > 0 && fps < 40) {
      this.lowFpsTimer += dt;
      if (this.lowFpsTimer > 5) {
        this.apply(this.tier === 'high' ? 'medium' : 'low');
        this.warmup = 3;
      }
    } else {
      this.lowFpsTimer = Math.max(0, this.lowFpsTimer - dt * 0.6);
    }
  }

  private apply(tier: QualityTier): void {
    this.tier = tier;
    this.settings = TIERS[tier];
    this.lowFpsTimer = 0;
    this.onApply?.(tier, this.settings);
  }
}
