import type { LookDelta } from '../types';

export class InputManager {
  /** Movement axis, x = strafe (right +), y = forward (up +). */
  readonly move = { x: 0, y: 0 };
  sprint = false;
  enabled = true;

  private lookAcc: LookDelta = { x: 0, y: 0 };

  private joyId: number | null = null;
  private joyBase = { x: 0, y: 0 };
  private joyRadius = 48;
  private knobEl: HTMLElement | null = null;

  private lookId: number | null = null;
  private lookPrev = { x: 0, y: 0 };
  private lookEl: HTMLElement | null = null;

  private keys = new Set<string>();
  private keySprint = false;
  private touchSprint = false;
  private disposers: Array<() => void> = [];

  constructor() {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keySprint = true;
      this.sprint = this.keySprint || this.touchSprint;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keySprint = false;
      this.sprint = this.keySprint || this.touchSprint;
    };
    // a key held while the window loses focus never gets its keyup: drop everything
    const onBlur = () => this.releaseAll();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });
  }

  setTouchSprint(on: boolean): void {
    this.touchSprint = on;
    this.sprint = this.keySprint || this.touchSprint;
  }

  releaseAll(): void {
    this.keys.clear();
    this.keySprint = false;
    this.touchSprint = false;
    this.sprint = false;
    this.move.x = 0;
    this.move.y = 0;
    this.joyId = null;
    this.lookId = null;
    if (this.knobEl) this.knobEl.style.transform = 'translate(-50%, -50%)';
  }

  get pointerLocked(): boolean {
    return this.lookEl !== null && document.pointerLockElement === this.lookEl;
  }

  requestPointerLock(): void {
    if (this.lookEl && !this.pointerLocked) {
      try {
        const r = this.lookEl.requestPointerLock() as unknown;
        if (r instanceof Promise) r.catch(() => {});
      } catch {
        // ignored: not allowed outside a user gesture
      }
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  bindJoystick(el: HTMLElement, knob: HTMLElement): void {
    this.knobEl = knob;

    const down = (e: PointerEvent) => {
      if (this.joyId !== null) return;
      e.preventDefault();
      this.joyId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      this.joyBase = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.joyRadius = r.width * 0.36;
      this.applyJoystick(e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      e.preventDefault();
      this.applyJoystick(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.move.x = 0;
      this.move.y = 0;
      if (this.knobEl) this.knobEl.style.transform = 'translate(-50%, -50%)';
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    });
  }

  bindLookArea(el: HTMLElement): void {
    this.lookEl = el;

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        if (this.enabled) this.requestPointerLock();
        return;
      }
      if (this.lookId !== null) return;
      e.preventDefault();
      this.lookId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      this.lookPrev = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.lookId) return;
      e.preventDefault();
      this.lookAcc.x += e.clientX - this.lookPrev.x;
      this.lookAcc.y += e.clientY - this.lookPrev.y;
      this.lookPrev = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.lookId) return;
      this.lookId = null;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!this.pointerLocked) return;
      // some browsers report a huge spike on the first event after locking
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.lookAcc.x += e.movementX;
      this.lookAcc.y += e.movementY;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    document.addEventListener('mousemove', onMouseMove);
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.removeEventListener('mousemove', onMouseMove);
    });
  }

  bindHold(el: HTMLElement, onDown: () => void, onUp: () => void): void {
    let held = false;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      held = true;
      onDown();
    };
    const up = (e: PointerEvent) => {
      e.preventDefault();
      if (!held) return;
      held = false;
      onUp();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    });
  }

  /** Called once per frame; returns and resets the accumulated look delta. */
  consumeLook(): LookDelta {
    const out = { x: this.lookAcc.x, y: this.lookAcc.y };
    this.lookAcc.x = 0;
    this.lookAcc.y = 0;
    return out;
  }

  /** Keyboard movement (WASD / arrows) when the joystick is not in use. */
  sampleKeyboard(): void {
    if (this.joyId !== null) return;
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    this.move.x = x;
    this.move.y = y;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }

  private applyJoystick(cx: number, cy: number): void {
    let dx = cx - this.joyBase.x;
    let dy = cy - this.joyBase.y;
    const d = Math.hypot(dx, dy);
    const max = this.joyRadius;
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    // small dead zone so a resting thumb doesn't drift the player
    const n = Math.min(d, max) / max;
    const k = n < 0.12 ? 0 : (n - 0.12) / 0.88 / Math.max(n, 1e-6);
    this.move.x = (dx / max) * k;
    this.move.y = (-dy / max) * k;
    if (this.knobEl) {
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }
}
