export interface TitleCallbacks {
  onContinue: () => void;
  onNewGame: () => void;
}

/** First screen: also the user gesture that unlocks audio and pointer lock. */
export class TitleScreen {
  private root: HTMLElement;
  private continueBtn: HTMLButtonElement;
  private newBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, callbacks: TitleCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'title-screen visible';
    const inner = document.createElement('div');
    inner.className = 'title-inner';

    const title = document.createElement('div');
    title.className = 'title-name';
    title.textContent = 'FOGLINE';
    const tag = document.createElement('div');
    tag.className = 'title-tag';
    tag.textContent = 'Find three fuse parts. Restore the power. Get out.';

    this.continueBtn = document.createElement('button');
    this.continueBtn.type = 'button';
    this.continueBtn.className = 'end-btn primary';
    this.continueBtn.textContent = 'CONTINUE';
    this.continueBtn.addEventListener('click', () => callbacks.onContinue());

    this.newBtn = document.createElement('button');
    this.newBtn.type = 'button';
    this.newBtn.className = 'end-btn';
    this.newBtn.textContent = 'NEW GAME';
    this.newBtn.addEventListener('click', () => callbacks.onNewGame());

    const hint = document.createElement('div');
    hint.className = 'title-hint';
    hint.textContent = 'Headphones recommended';

    inner.append(title, tag, this.continueBtn, this.newBtn, hint);
    this.root.appendChild(inner);
    parent.appendChild(this.root);
  }

  show(hasSave: boolean): void {
    this.continueBtn.style.display = hasSave ? 'block' : 'none';
    this.newBtn.classList.toggle('primary', !hasSave);
    this.newBtn.textContent = hasSave ? 'NEW GAME' : 'BEGIN';
    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
  }
}
