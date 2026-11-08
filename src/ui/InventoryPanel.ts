import type { Inventory } from '../game/Inventory';
import { ITEMS } from '../game/items';
import type { ItemId } from '../types';
import { makePanel } from './Panel';

export interface InventoryPanelCallbacks {
  onClose: () => void;
  onUse: (id: ItemId) => void;
}

const ORDER: ItemId[] = ['medkit', 'repairkit', 'battery', 'bandage', 'cloth', 'wire', 'wood', 'fuse_part'];

export class InventoryPanel {
  private root: HTMLElement;
  private grid: HTMLElement;
  private emptyEl: HTMLElement;
  private _open = false;

  constructor(parent: HTMLElement, private inventory: Inventory, private callbacks: InventoryPanelCallbacks) {
    const { root, panel } = makePanel(parent, 'INVENTORY', 'inventory-panel', () => this.callbacks.onClose());
    this.root = root;

    this.grid = document.createElement('div');
    this.grid.className = 'inventory-grid';
    panel.appendChild(this.grid);

    this.emptyEl = document.createElement('div');
    this.emptyEl.className = 'panel-empty';
    this.emptyEl.textContent = 'Nothing yet. Look around.';
    panel.appendChild(this.emptyEl);

    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.textContent = 'I / Tab to close';
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
    this.grid.innerHTML = '';
    const entries = this.inventory
      .entries()
      .sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
    this.emptyEl.style.display = entries.length === 0 ? 'block' : 'none';

    for (const [id, count] of entries) {
      const def = ITEMS[id];
      const card = document.createElement('div');
      card.className = 'inv-card';

      const head = document.createElement('div');
      head.className = 'inv-head';
      const icon = document.createElement('div');
      icon.className = 'inv-icon';
      icon.style.background = '#' + def.color.toString(16).padStart(6, '0');
      const name = document.createElement('div');
      name.className = 'inv-name';
      name.textContent = def.name;
      const countEl = document.createElement('div');
      countEl.className = 'inv-count';
      countEl.textContent = `×${count}`;
      head.append(icon, name, countEl);
      card.appendChild(head);

      const desc = document.createElement('div');
      desc.className = 'inv-desc';
      desc.textContent = def.description;
      card.appendChild(desc);

      if (def.usable) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inv-use';
        btn.textContent = id === 'medkit' ? 'USE · HEAL' : 'USE · RECHARGE';
        btn.addEventListener('click', () => this.callbacks.onUse(id));
        card.appendChild(btn);
      }
      this.grid.appendChild(card);
    }
  }
}
