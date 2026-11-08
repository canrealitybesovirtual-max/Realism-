import type { ItemId, Recipe } from '../types';
import { RECIPES } from './items';
import type { Inventory } from './Inventory';

export class Crafting {
  constructor(public readonly inventory: Inventory) {}

  list(): Recipe[] {
    return RECIPES;
  }

  canCraft(recipe: Recipe): boolean {
    for (const [id, n] of Object.entries(recipe.inputs)) {
      if (n && !this.inventory.has(id as ItemId, n)) return false;
    }
    return true;
  }

  craft(recipe: Recipe): boolean {
    if (!this.canCraft(recipe)) return false;
    for (const [id, n] of Object.entries(recipe.inputs)) {
      if (n) this.inventory.remove(id as ItemId, n);
    }
    this.inventory.add(recipe.output.id, recipe.output.count);
    return true;
  }
}
