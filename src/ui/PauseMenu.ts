import { CONFIG } from '../config';
import type { QualityTier, SettingsData } from '../types';
import { makePanel } from './Panel';

export interface PauseMenuCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onSettingsChange: (s: SettingsData) => void;
  getSettings: () => SettingsData;
}

export class PauseMenu {
  private root: HTMLElement;
  private settingsRoot: HTMLElement;
  private restartBtn: HTMLButtonElement;
  private confirmTimer = 0;
  private _open = false;
  private syncSettings: () => void;

  constructor(parent: HTMLElement, private callbacks: PauseMenuCallbacks) {
    const { root, panel } = makePanel(parent, 'PAUSED', 'pause-panel', () => this.callbacks.onResume());
    this.root = root;

    const body = document.createElement('div');
    body.className = 'pause-body';
    const makeBtn = (label: string, onClick: () => void, cls = ''): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pause-btn ${cls}`;
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    };
    body.appendChild(makeBtn('RESUME', () => this.callbacks.onResume(), 'primary'));
    body.appendChild(makeBtn('SETTINGS', () => this.showSettings()));
    // restart wipes the save: ask twice
    this.restartBtn = makeBtn('RESTART', () => {
      if (this.confirmTimer > 0) {
        this.confirmTimer = 0;
        this.restartBtn.textContent = 'RESTART';
        this.callbacks.onRestart();
      } else {
        this.confirmTimer = 3;
        this.restartBtn.textContent = 'TAP AGAIN TO RESTART';
        window.setTimeout(() => {
          if (this.confirmTimer > 0) {
            this.confirmTimer = 0;
            this.restartBtn.textContent = 'RESTART';
          }
        }, 3000);
      }
    });
    body.appendChild(this.restartBtn);

    const controls = document.createElement('div');
    controls.className = 'controls-help';
    controls.innerHTML =
      '<div><b>WASD</b> move</div><div><b>Shift</b> run</div><div><b>Mouse</b> look</div>' +
      '<div><b>E</b> take / use</div><div><b>F</b> flashlight</div><div><b>I</b> bag · <b>C</b> craft</div>' +
      '<div><b>Esc</b> pause</div><div><b>`</b> stats</div>';
    body.appendChild(controls);
    panel.appendChild(body);

    // ----- settings sub-panel -----
    const s = makePanel(parent, 'SETTINGS', 'settings-panel', () => this.hideSettings());
    this.settingsRoot = s.root;
    const sBody = document.createElement('div');
    sBody.className = 'settings-body';
    s.panel.appendChild(sBody);

    const row = (label: string, ...els: HTMLElement[]) => {
      const r = document.createElement('div');
      r.className = 'settings-row';
      const l = document.createElement('label');
      l.textContent = label;
      r.append(l, ...els);
      sBody.appendChild(r);
    };
    const range = (min: number, max: number, step: number) => {
      const i = document.createElement('input');
      i.type = 'range';
      i.min = String(min);
      i.max = String(max);
      i.step = String(step);
      return i;
    };

    const sensInput = range(CONFIG.settings.sensitivityMin, CONFIG.settings.sensitivityMax, 0.05);
    const sensValue = document.createElement('span');
    sensValue.className = 'settings-value';
    row('Look sensitivity', sensInput, sensValue);

    const invertToggle = document.createElement('button');
    invertToggle.type = 'button';
    invertToggle.className = 'toggle';
    row('Invert Y', invertToggle);

    const qualitySelect = document.createElement('select');
    qualitySelect.className = 'settings-select';
    for (const q of ['auto', 'low', 'medium', 'high'] as const) {
      const opt = document.createElement('option');
      opt.value = q;
      opt.textContent = q.toUpperCase();
      qualitySelect.appendChild(opt);
    }
    row('Quality', qualitySelect);

    const volInput = range(0, 1, 0.05);
    const volValue = document.createElement('span');
    volValue.className = 'settings-value';
    row('Volume', volInput, volValue);

    // edit a copy, then hand the copy back: the game owns its settings object
    const edit = (fn: (s: SettingsData) => void) => {
      const next = { ...this.callbacks.getSettings() };
      fn(next);
      this.callbacks.onSettingsChange(next);
      this.syncSettings();
    };

    this.syncSettings = () => {
      const cur = this.callbacks.getSettings();
      sensInput.value = String(cur.sensitivity);
      sensValue.textContent = cur.sensitivity.toFixed(2) + '×';
      invertToggle.textContent = cur.invertY ? 'ON' : 'OFF';
      invertToggle.classList.toggle('on', cur.invertY);
      qualitySelect.value = cur.quality;
      volInput.value = String(cur.volume);
      volValue.textContent = Math.round(cur.volume * 100) + '%';
    };

    sensInput.addEventListener('input', () => edit((x) => (x.sensitivity = parseFloat(sensInput.value))));
    invertToggle.addEventListener('click', () => edit((x) => (x.invertY = !x.invertY)));
    qualitySelect.addEventListener('change', () => edit((x) => (x.quality = qualitySelect.value as QualityTier | 'auto')));
    volInput.addEventListener('input', () => edit((x) => (x.volume = parseFloat(volInput.value))));
  }

  isOpen(): boolean {
    return this._open;
  }

  open(): void {
    this._open = true;
    this.root.style.display = 'flex';
    this.syncSettings();
  }

  close(): void {
    this._open = false;
    this.root.style.display = 'none';
    this.settingsRoot.style.display = 'none';
    this.confirmTimer = 0;
    this.restartBtn.textContent = 'RESTART';
  }

  get settingsOpen(): boolean {
    return this.settingsRoot.style.display !== 'none';
  }

  showSettings(): void {
    this.syncSettings();
    this.settingsRoot.style.display = 'flex';
  }

  hideSettings(): void {
    this.settingsRoot.style.display = 'none';
  }
}
