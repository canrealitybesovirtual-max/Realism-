export interface HUDCallbacks {
  onToggleMute: (muted: boolean) => void;
  onOpenInventory: () => void;
  onOpenCrafting: () => void;
  onOpenPause: () => void;
}

export class HUD {
  private staminaFill: HTMLElement;
  private staminaBar: HTMLElement;
  private batteryFill: HTMLElement;
  private healthFill: HTMLElement;
  private fpsEl: HTMLElement;
  private promptEl: HTMLElement;
  private promptLabelEl: HTMLElement;
  private promptKeyEl: HTMLElement;
  private objectiveEl: HTMLElement;
  private damageVignette: HTMLElement;
  private crosshair: HTMLElement;
  private root: HTMLElement;
  private last = { stamina: -1, battery: -1, health: -1, fps: -1, objective: '', prompt: '' as string | null };

  constructor(parent: HTMLElement, callbacks: HUDCallbacks) {
    const hud = document.createElement('div');
    hud.className = 'hud';
    this.root = hud;

    const bars = document.createElement('div');
    bars.className = 'hud-bars';

    const makeBar = (label: string, cls: string): [HTMLElement, HTMLElement] => {
      const labelEl = document.createElement('div');
      labelEl.className = 'bar-label';
      labelEl.textContent = label;
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('div');
      fill.className = `bar-fill ${cls}`;
      bar.appendChild(fill);
      bars.appendChild(labelEl);
      bars.appendChild(bar);
      return [fill, bar];
    };

    this.healthFill = makeBar('HEALTH', 'health')[0];
    this.batteryFill = makeBar('BATTERY', 'battery')[0];
    [this.staminaFill, this.staminaBar] = makeBar('STAMINA', 'stamina');

    this.objectiveEl = document.createElement('div');
    this.objectiveEl.className = 'objective-line';
    bars.appendChild(this.objectiveEl);

    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps';
    bars.appendChild(this.fpsEl);

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';

    this.promptEl = document.createElement('div');
    this.promptEl.className = 'interact-prompt';
    this.promptKeyEl = document.createElement('span');
    this.promptKeyEl.className = 'interact-key';
    this.promptKeyEl.textContent = 'E';
    this.promptLabelEl = document.createElement('span');
    this.promptLabelEl.className = 'interact-label';
    this.promptEl.appendChild(this.promptKeyEl);
    this.promptEl.appendChild(this.promptLabelEl);

    const makeTopRight = (label: string, aria: string, rightPx: number, onClick: () => void): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-topright';
      btn.style.right = `calc(${rightPx}px + var(--safe-r))`;
      btn.textContent = label;
      btn.setAttribute('aria-label', aria);
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      return btn;
    };

    let muted = false;
    const muteBtn = makeTopRight('🔊', 'Mute', 14, () => {
      muted = !muted;
      muteBtn.textContent = muted ? '🔇' : '🔊';
      callbacks.onToggleMute(muted);
    });
    const pauseBtn = makeTopRight('II', 'Pause', 62, () => callbacks.onOpenPause());
    pauseBtn.classList.add('btn-pause');
    const craftBtn = makeTopRight('CRAFT', 'Crafting', 110, () => callbacks.onOpenCrafting());
    const bagBtn = makeTopRight('BAG', 'Inventory', 158, () => callbacks.onOpenInventory());

    this.damageVignette = document.createElement('div');
    this.damageVignette.className = 'damage-vignette';

    hud.append(bars, this.crosshair, this.promptEl, muteBtn, pauseBtn, craftBtn, bagBtn, this.damageVignette);
    parent.appendChild(hud);
  }

  /** Show the key hint on desktop, hide it for touch players. */
  setTouchMode(touch: boolean): void {
    this.root.classList.toggle('touch', touch);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setStamina(ratio: number): void {
    const r = Math.round(Math.max(0, Math.min(1, ratio)) * 200) / 200;
    if (r === this.last.stamina) return;
    this.last.stamina = r;
    this.staminaFill.style.transform = `scaleX(${r})`;
    this.staminaBar.classList.toggle('full', r >= 1);
    this.staminaFill.classList.toggle('low', r < 0.25);
  }

  setBattery(ratio: number): void {
    const r = Math.round(Math.max(0, Math.min(1, ratio)) * 200) / 200;
    if (r === this.last.battery) return;
    this.last.battery = r;
    this.batteryFill.style.transform = `scaleX(${r})`;
    this.batteryFill.classList.toggle('low', r < 0.3);
  }

  setHealth(health: number, max: number): void {
    const r = Math.max(0, Math.min(1, health / max));
    if (r === this.last.health) return;
    this.last.health = r;
    this.healthFill.style.transform = `scaleX(${r})`;
    this.healthFill.classList.toggle('low', r < 0.4);
  }

  setFps(value: number): void {
    if (value === this.last.fps) return;
    this.last.fps = value;
    this.fpsEl.textContent = `${value} FPS`;
  }

  setObjective(text: string): void {
    if (text === this.last.objective) return;
    this.last.objective = text;
    this.objectiveEl.textContent = text;
    this.objectiveEl.classList.remove('updated');
    void this.objectiveEl.offsetWidth;
    this.objectiveEl.classList.add('updated');
  }

  setInteractPrompt(label: string | null): void {
    if (label === this.last.prompt) return;
    this.last.prompt = label;
    if (label) this.promptLabelEl.textContent = label;
    this.promptEl.classList.toggle('visible', !!label);
    this.crosshair.classList.toggle('focus', !!label);
  }

  flashDamage(): void {
    this.damageVignette.classList.remove('flash');
    void this.damageVignette.offsetWidth;
    this.damageVignette.classList.add('flash');
  }
}
