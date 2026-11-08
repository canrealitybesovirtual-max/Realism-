/** Shared modal shell: dim overlay + panel with a title and close button. */
export function makePanel(
  parent: HTMLElement,
  title: string,
  extraClass: string,
  onClose: (() => void) | null
): { root: HTMLElement; panel: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'panel-overlay';
  root.style.display = 'none';
  root.addEventListener('pointerdown', (e) => {
    // click on the dim background closes, click inside the panel doesn't
    if (e.target === root && onClose) onClose();
  });

  const panel = document.createElement('div');
  panel.className = `panel ${extraClass}`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', title);

  const header = document.createElement('div');
  header.className = 'panel-header';
  const t = document.createElement('div');
  t.className = 'panel-title';
  t.textContent = title;
  header.appendChild(t);
  if (onClose) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'panel-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', onClose);
    header.appendChild(close);
  }
  panel.appendChild(header);
  root.appendChild(panel);
  parent.appendChild(root);
  return { root, panel };
}
