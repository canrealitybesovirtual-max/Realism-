export class Toast {
  private el: HTMLElement;
  private timer = 0;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'toast';
    this.el.setAttribute('role', 'status');
    parent.appendChild(this.el);
  }

  show(message: string, duration = 2.2): void {
    this.el.textContent = message;
    this.el.classList.add('visible');
    this.visible = true;
    this.timer = duration;
  }

  clear(): void {
    this.visible = false;
    this.el.classList.remove('visible');
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.visible = false;
      this.el.classList.remove('visible');
    }
  }
}
