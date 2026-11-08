import type { Crafting } from '../game/Crafting';
import { ITEMS } from '../game/items';
import type { ItemId, Recipe } from '../types';
import { makePanel } from './Panel';

export interface CraftingPanelCallbacks {
  onClose: () => void;
  onCraft: (recipe: Recipe) => void;
}

export class CraftingPanel {
  private root: HTMLElement;
  private list: HTMLElement;
  private _open = false;

  constructor(parent: HTMLElement, private crafting: Crafting, private callbacks: CraftingPanelCallbacks) {
    const { root, panel } = makePanel(parent, 'CRAFTING', 'crafting-panel', () => this.callbacks.onClose());
    this.root = root;
    this.list = document.createElement('div');
    this.list.className = 'recipe-list';
    panel.appendChild(this.list);
    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.textContent = 'C to close';
    panel.appendChild(hint);
  }

  isOpen(): boolean {
    return this._open;
  }

  open(): void {
    this._open = true;
    this.root.style.display = 'flex';
    this.refresh();
  }

  close(): void {
    this._open = false;
    this.root.style.display = 'none';
  }

  refresh(): void {
    this.list.innerHTML = '';
    for (const recipe of this.crafting.list()) {
      const can = this.crafting.canCraft(recipe);
      const card = document.createElement('div');
      card.className = 'recipe-card' + (can ? '' : ' disabled');

      const info = document.createElement('div');
      info.className = 'recipe-info';
      const out = document.createElement('div');
      out.className = 'recipe-output';
      out.textContent = ITEMS[recipe.output.id].name;
      const desc = document.createElement('div');
      desc.className = 'recipe-desc';
      desc.textContent = ITEMS[recipe.output.id].description;
      const inputs = document.createElement('div');
      inputs.className = 'recipe-inputs';
      for (const [id, n] of Object.entries(recipe.inputs)) {
        if (!n) continue;
        const have = this.crafting.inventory.count(id as ItemId);
        const chip = document.createElement('span');
        chip.className = 'recipe-chip' + (have >= n ? ' ok' : '');
        chip.textContent = `${ITEMS[id as ItemId].name} ${Math.min(have, n)}/${n}`;
        inputs.appendChild(chip);
      }
      info.append(out, desc, inputs);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recipe-craft';
      btn.textContent = can ? 'CRAFT' : 'MISSING';
      btn.disabled = !can;
      btn.addEventListener('click', () => this.callbacks.onCraft(recipe));

      card.append(info, btn);
      this.list.appendChild(card);
    }
  }
}
