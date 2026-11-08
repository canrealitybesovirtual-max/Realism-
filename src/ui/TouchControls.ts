import type { InputManager } from '../game/InputManager';

export class TouchControls {
  onFlashlightTap: (() => void) | null = null;
  onInteractTap: (() => void) | null = null;

  private readonly root: HTMLElement;
  private flashBtn: HTMLButtonElement;
  private interactBtn: HTMLButtonElement;
  private interactEnabled = false;
  private flashState = '';

  constructor(parent: HTMLElement, input: InputManager) {
    // look drag area sits under everything else and also catches desktop clicks for pointer lock
    const look = document.createElement('div');
    look.className = 'look-layer';
    parent.appendChild(look);
    input.bindLookArea(look);

    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    parent.appendChild(this.root);

    const joy = document.createElement('div');
    joy.className = 'joystick';
    const knob = document.createElement('div');
    knob.className = 'joystick-knob';
    joy.appendChild(knob);
    this.root.appendChild(joy);
    input.bindJoystick(joy, knob);

    const sprint = document.createElement('button');
    sprint.type = 'button';
    sprint.className = 'btn btn-sprint';
    sprint.textContent = 'RUN';
    this.root.appendChild(sprint);
    input.bindHold(
      sprint,
      () => {
        input.setTouchSprint(true);
        sprint.classList.add('active');
      },
      () => {
        input.setTouchSprint(false);
        sprint.classList.remove('active');
      }
    );

    const interact = document.createElement('button');
    interact.type = 'button';
    interact.className = 'btn btn-interact';
    interact.textContent = 'TAKE';
    interact.disabled = true;
    interact.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.interactEnabled) this.onInteractTap?.();
    });
    this.root.appendChild(interact);
    this.interactBtn = interact;

    const flash = document.createElement('button');
    flash.type = 'button';
    flash.className = 'btn btn-flashlight';
    flash.textContent = 'LIGHT';
    flash.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onFlashlightTap?.();
    });
    this.root.appendChild(flash);
    this.flashBtn = flash;

    const rotate = document.createElement('div');
    rotate.className = 'rotate-hint';
    rotate.innerHTML = '<div class="rotate-card">Rotate your device<br><span>landscape recommended</span></div>';
    parent.appendChild(rotate);
  }

  /** Touch buttons only appear once a touch is seen (desktop players never see them). */
  setVisible(v: boolean): void {
    this.root.classList.toggle('shown', v);
  }

  setFlashlightState(on: boolean, dead: boolean): void {
    const key = `${on}${dead}`;
    if (key === this.flashState) return;
    this.flashState = key;
    this.flashBtn.classList.toggle('off', !on && !dead);
    this.flashBtn.classList.toggle('dead', dead);
    this.flashBtn.textContent = dead ? 'DEAD' : 'LIGHT';
  }

  setInteract(enabled: boolean, label = 'TAKE'): void {
    if (this.interactBtn.textContent !== label) this.interactBtn.textContent = label;
    if (enabled === this.interactEnabled) return;
    this.interactEnabled = enabled;
    this.interactBtn.disabled = !enabled;
    this.interactBtn.classList.toggle('active', enabled);
  }
}
