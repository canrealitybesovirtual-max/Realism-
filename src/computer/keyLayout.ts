/**
 * ANSI tenkeyless layout. Positions are in key units (1u = 19.05 mm) from
 * the top-left of the Esc key. `code` matches KeyboardEvent.code so physical
 * typing, the 3D key animation and VR "poke" typing share one table.
 */
export interface KeyDef {
	code: string;
	label: string;
	shift?: string; // label shown above (secondary legend)
	x: number; // u, left edge
	y: number; // u, top edge (rows go down)
	w: number; // width in u
	/** text produced (unshifted, shifted); undefined for modifiers etc. */
	char?: [string, string];
}

export const UNIT = 0.01905;

const keys: KeyDef[] = [];
let cx = 0;
const row = (y: number, items: (Omit<KeyDef, 'x' | 'y' | 'w'> & { w?: number; gap?: number })[], startX = 0) => {
	cx = startX;
	for (const it of items) {
		cx += it.gap ?? 0;
		const w = it.w ?? 1;
		keys.push({ code: it.code, label: it.label, shift: it.shift, char: it.char, x: cx, y, w });
		cx += w;
	}
};
const ch = (code: string, lo: string, hi: string, label = hi.length === 1 && /[A-Z]/.test(hi) ? hi : lo) =>
	({ code, label, shift: /[A-Z]/.test(hi) ? undefined : hi, char: [lo, hi] as [string, string] });

// Function row
row(0, [
	{ code: 'Escape', label: 'esc' },
	{ code: 'F1', label: 'F1', gap: 1 }, { code: 'F2', label: 'F2' }, { code: 'F3', label: 'F3' }, { code: 'F4', label: 'F4' },
	{ code: 'F5', label: 'F5', gap: 0.5 }, { code: 'F6', label: 'F6' }, { code: 'F7', label: 'F7' }, { code: 'F8', label: 'F8' },
	{ code: 'F9', label: 'F9', gap: 0.5 }, { code: 'F10', label: 'F10' }, { code: 'F11', label: 'F11' }, { code: 'F12', label: 'F12' },
	{ code: 'PrintScreen', label: 'prt', gap: 0.25 }, { code: 'ScrollLock', label: 'scr' }, { code: 'Pause', label: 'pse' },
]);
// Number row
row(1.25, [
	ch('Backquote', '`', '~'), ch('Digit1', '1', '!'), ch('Digit2', '2', '@'), ch('Digit3', '3', '#'), ch('Digit4', '4', '$'),
	ch('Digit5', '5', '%'), ch('Digit6', '6', '^'), ch('Digit7', '7', '&'), ch('Digit8', '8', '*'), ch('Digit9', '9', '('),
	ch('Digit0', '0', ')'), ch('Minus', '-', '_'), ch('Equal', '=', '+'), { code: 'Backspace', label: 'backspace', w: 2 },
	{ code: 'Insert', label: 'ins', gap: 0.25 }, { code: 'Home', label: 'home' }, { code: 'PageUp', label: 'pg up' },
]);
row(2.25, [
	{ code: 'Tab', label: 'tab', w: 1.5 },
	...'QWERTYUIOP'.split('').map((c) => ch('Key' + c, c.toLowerCase(), c)),
	ch('BracketLeft', '[', '{'), ch('BracketRight', ']', '}'), { ...ch('Backslash', '\\', '|'), w: 1.5 },
	{ code: 'Delete', label: 'del', gap: 0.25 }, { code: 'End', label: 'end' }, { code: 'PageDown', label: 'pg dn' },
]);
row(3.25, [
	{ code: 'CapsLock', label: 'caps lock', w: 1.75 },
	...'ASDFGHJKL'.split('').map((c) => ch('Key' + c, c.toLowerCase(), c)),
	ch('Semicolon', ';', ':'), ch('Quote', "'", '"'), { code: 'Enter', label: 'enter', w: 2.25 },
]);
row(4.25, [
	{ code: 'ShiftLeft', label: 'shift', w: 2.25 },
	...'ZXCVBNM'.split('').map((c) => ch('Key' + c, c.toLowerCase(), c)),
	ch('Comma', ',', '<'), ch('Period', '.', '>'), ch('Slash', '/', '?'), { code: 'ShiftRight', label: 'shift', w: 2.75 },
	{ code: 'ArrowUp', label: '↑', gap: 1.25 },
]);
row(5.25, [
	{ code: 'ControlLeft', label: 'ctrl', w: 1.25 }, { code: 'MetaLeft', label: '◆', w: 1.25 }, { code: 'AltLeft', label: 'alt', w: 1.25 },
	{ code: 'Space', label: '', w: 6.25, char: [' ', ' '] },
	{ code: 'AltRight', label: 'alt', w: 1.25 }, { code: 'Fn', label: 'fn', w: 1.25 }, { code: 'ContextMenu', label: '☰', w: 1.25 },
	{ code: 'ControlRight', label: 'ctrl', w: 1.25 },
	{ code: 'ArrowLeft', label: '←', gap: 0.25 }, { code: 'ArrowDown', label: '↓' }, { code: 'ArrowRight', label: '→' },
]);

export const KEYS: readonly KeyDef[] = keys;
export const LAYOUT_WIDTH_U = 18.25;
export const LAYOUT_HEIGHT_U = 6.25;
export const KEY_INDEX = new Map(KEYS.map((k, i) => [k.code, i]));
