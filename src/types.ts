import type * as THREE from 'three';

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LookDelta {
  x: number;
  y: number;
}

export type ItemId =
  | 'battery'
  | 'cloth'
  | 'wood'
  | 'wire'
  | 'bandage'
  | 'medkit'
  | 'repairkit'
  | 'fuse_part';

export interface ItemDef {
  id: ItemId;
  name: string;
  color: number;
  description: string;
  usable: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  inputs: Partial<Record<ItemId, number>>;
  output: { id: ItemId; count: number };
}

export interface Pickup {
  itemId: ItemId;
  mesh: THREE.Mesh;
  taken: boolean;
}

export interface SaveDataV1 {
  version: 1;
  player: {
    x: number;
    z: number;
    yaw: number;
    pitch: number;
    health: number;
    stamina: number;
  };
  flashlight: { battery: number; on: boolean };
  inventory: Record<string, number>;
  objective: { powerRestored: boolean };
  pickupsTaken: string[];
  savedAt: number;
}

export type QualityTier = 'low' | 'medium' | 'high';

export interface SettingsData {
  sensitivity: number;
  invertY: boolean;
  quality: QualityTier | 'auto';
  volume: number;
}
