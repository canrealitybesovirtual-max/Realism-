import { CONFIG } from '../config';
import type { SettingsData } from '../types';

const DEFAULTS: SettingsData = {
  sensitivity: CONFIG.settings.defaultSensitivity,
  invertY: false,
  quality: 'auto',
  volume: CONFIG.settings.defaultVolume
};

export class SettingsStore {
  static load(): SettingsData {
    try {
      const raw = localStorage.getItem(CONFIG.settings.key);
      if (!raw) return { ...DEFAULTS };
      const p = JSON.parse(raw) as Partial<SettingsData>;
      const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
      return {
        sensitivity: num(p.sensitivity)
          ? Math.max(CONFIG.settings.sensitivityMin, Math.min(CONFIG.settings.sensitivityMax, p.sensitivity))
          : DEFAULTS.sensitivity,
        invertY: typeof p.invertY === 'boolean' ? p.invertY : DEFAULTS.invertY,
        quality:
          p.quality === 'low' || p.quality === 'medium' || p.quality === 'high' || p.quality === 'auto'
            ? p.quality
            : DEFAULTS.quality,
        volume: num(p.volume) ? Math.max(0, Math.min(1, p.volume)) : DEFAULTS.volume
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  static save(s: SettingsData): void {
    try {
      localStorage.setItem(CONFIG.settings.key, JSON.stringify(s));
    } catch {
      // storage unavailable: settings last for this session only
    }
  }
}
