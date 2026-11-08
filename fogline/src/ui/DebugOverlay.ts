export class DebugOverlay {
  private el: HTMLElement;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  update(fps: number, calls: number, tris: number, tier: string, enemy: string): void {
    if (!this.visible) return;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const heap = mem ? (mem.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : '—';
    this.el.textContent = `FPS ${fps}\nDraw ${calls}\nTris ${tris}\nHeap ${heap}\nQuality ${tier}\nEnemy ${enemy}`;
  }
}
