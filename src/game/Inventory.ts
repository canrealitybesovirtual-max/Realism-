import type { ItemId } from '../types';
import { ITEMS } from './items';

export class Inventory {
  private counts = new Map<ItemId, number>();
  onChange: (() => void) | null = null;

  add(id: ItemId, n = 1): void {
    this.counts.set(id, (this.counts.get(id) ?? 0) + n);
    this.onChange?.();
  }

  remove(id: ItemId, n = 1): boolean {
    const cur = this.counts.get(id) ?? 0;
    if (cur < n) return false;
    const next = cur - n;
    if (next === 0) this.counts.delete(id);
    else this.counts.set(id, next);
    this.onChange?.();
    return true;
  }

  count(id: ItemId): number {
    return this.counts.get(id) ?? 0;
  }

  has(id: ItemId, n = 1): boolean {
    return this.count(id) >= n;
  }

  entries(): Array<[ItemId, number]> {
    return Array.from(this.counts.entries());
  }

  toJSON(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.counts) out[k] = v;
    return out;
  }

  loadFrom(data: Record<string, number>): void {
    this.counts.clear();
    for (const k of Object.keys(data)) {
      const v = data[k];
      // ignore unknown ids from older or tampered saves
      if (k in ITEMS && typeof v === 'number' && v > 0) this.counts.set(k as ItemId, Math.floor(v));
    }
    this.onChange?.();
  }

  clear(): void {
    this.counts.clear();
    this.onChange?.();
  }
}
