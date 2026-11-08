import type { ItemDef, ItemId, Recipe } from '../types';

export const ITEMS: Record<ItemId, ItemDef> = {
  battery: {
    id: 'battery',
    name: 'Battery',
    color: 0xb89a3a,
    description: 'A dull AA cell. Still holds a charge.',
    usable: true
  },
  cloth: {
    id: 'cloth',
    name: 'Cloth',
    color: 0x6e6352,
    description: 'Torn fabric, coarse and grey.',
    usable: false
  },
  wood: {
    id: 'wood',
    name: 'Wood',
    color: 0x5a4028,
    description: 'A splintering length of plank.',
    usable: false
  },
  wire: {
    id: 'wire',
    name: 'Wire',
    color: 0xa86a3c,
    description: 'Coiled copper, still supple.',
    usable: false
  },
  bandage: {
    id: 'bandage',
    name: 'Bandage',
    color: 0xd8d2c4,
    description: 'Clean gauze. Almost.',
    usable: false
  },
  medkit: {
    id: 'medkit',
    name: 'Medkit',
    color: 0xc8cfb8,
    description: 'Field dressing: cloth and gauze.',
    usable: true
  },
  repairkit: {
    id: 'repairkit',
    name: 'Repaired Battery',
    color: 0xd0b040,
    description: 'Rewired and humming faintly.',
    usable: true
  },
  fuse_part: {
    id: 'fuse_part',
    name: 'Fuse Part',
    color: 0x4affb0,
    description: 'Essential. It hums when you hold it.',
    usable: false
  }
};

export const RECIPES: Recipe[] = [
  {
    id: 'repairkit',
    name: 'Repaired Battery',
    inputs: { battery: 1, wire: 1 },
    output: { id: 'repairkit', count: 1 }
  },
  {
    id: 'medkit',
    name: 'Medkit',
    inputs: { cloth: 1, bandage: 1 },
    output: { id: 'medkit', count: 1 }
  }
];
