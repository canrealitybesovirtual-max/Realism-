import { CONFIG } from '../config';
import type { SaveDataV1 } from '../types';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isValidSave(data: unknown): data is SaveDataV1 {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<SaveDataV1>;
  if (d.version !== 1) return false;
  const p = d.player;
  if (!p || !finite(p.x) || !finite(p.z) || !finite(p.yaw) || !finite(p.pitch) || !finite(p.health)) return false;
  if (!d.flashlight || !finite(d.flashlight.battery)) return false;
  if (!d.inventory || typeof d.inventory !== 'object') return false;
  if (!d.objective || typeof d.objective.powerRestored !== 'boolean') return false;
  if (!Array.isArray(d.pickupsTaken)) return false;
  return true;
}

export class SaveSystem {
  static save(data: SaveDataV1): void {
    try {
      localStorage.setItem(CONFIG.save.key, JSON.stringify(data));
    } catch (err) {
      console.warn('[save] write failed', err);
    }
  }

  static load(): SaveDataV1 | null {
    try {
      const raw = localStorage.getItem(CONFIG.save.key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return isValidSave(data) ? data : null;
    } catch (err) {
      console.warn('[save] read failed', err);
      return null;
    }
  }

  static exists(): boolean {
    return this.load() !== null;
  }

  static clear(): void {
    try {
      localStorage.removeItem(CONFIG.save.key);
    } catch {
      // storage unavailable (private mode): nothing to clear
    }
  }
}
