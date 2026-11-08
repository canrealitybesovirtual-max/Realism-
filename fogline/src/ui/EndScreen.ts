export interface EndScreenCallbacks {
  onRestart: () => void;
  onLoadSave: () => void;
}

export class EndScreen {
  private root: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private statsEl: HTMLElement;
  private loadBtn: HTMLButtonElement;
  private restartBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, private callbacks: EndScreenCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'end-screen';

    const wrap = document.createElement('div');
    wrap.className = 'end-inner';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'end-title';
    this.subEl = document.createElement('div');
    this.subEl.className = 'end-sub';
    this.statsEl = document.createElement('div');
    this.statsEl.className = 'end-stats';

    this.loadBtn = document.createElement('button');
    this.loadBtn.type = 'button';
    this.loadBtn.className = 'end-btn';
    this.loadBtn.textContent = 'LOAD LAST SAVE';
    this.loadBtn.addEventListener('click', () => this.callbacks.onLoadSave());

    this.restartBtn = document.createElement('button');
    this.restartBtn.type = 'button';
    this.restartBtn.className = 'end-btn primary';
    this.restartBtn.addEventListener('click', () => this.callbacks.onRestart());

    wrap.append(this.titleEl, this.subEl, this.statsEl, this.loadBtn, this.restartBtn);
    this.root.appendChild(wrap);
    parent.appendChild(this.root);
  }

  show(kind: 'win' | 'lose', hasSave: boolean, seconds: number): void {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.statsEl.textContent = `Time ${m}:${s.toString().padStart(2, '0')}`;
    if (kind === 'win') {
      this.titleEl.textContent = 'YOU ESCAPED';
      this.titleEl.className = 'end-title win';
      this.subEl.textContent = 'The street falls away behind you.';
      this.loadBtn.style.display = 'none';
      this.restartBtn.textContent = 'PLAY AGAIN';
    } else {
      this.titleEl.textContent = 'YOU DIED';
      this.titleEl.className = 'end-title lose';
      this.subEl.textContent = 'The fog takes another.';
      this.loadBtn.style.display = hasSave ? 'block' : 'none';
      this.restartBtn.textContent = 'NEW GAME';
    }
    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
  }
}
