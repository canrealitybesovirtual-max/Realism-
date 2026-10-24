import { describe, it, expect } from 'vitest';
import { TextBuffer } from '../../src/computer/textBuffer';
import { Calculator } from '../../src/computer/calculator';
import { WindowManager, TITLE_H } from '../../src/computer/windowManager';
import { KEYS, KEY_INDEX, UNIT, LAYOUT_WIDTH_U } from '../../src/computer/keyLayout';

describe('TextBuffer', () => {
	it('types, inserts newlines and backspaces across lines', () => {
		const b = new TextBuffer();
		for (const c of 'hello') b.insert(c);
		b.newline();
		b.insert('world');
		expect(b.text).toBe('hello\nworld');
		b.move('home');
		b.backspace();
		expect(b.text).toBe('helloworld');
		expect(b.caret).toEqual({ line: 0, col: 5 });
	});

	it('selects with shift and replaces the selection on type', () => {
		const b = new TextBuffer('one two three');
		b.setCaret({ line: 0, col: 4 });
		b.move('right', true, true); // select "two"
		expect(b.selectedText()).toBe('two');
		b.insert('2');
		expect(b.text).toBe('one 2 three');
	});

	it('copies multi-line selections and pastes them', () => {
		const b = new TextBuffer('ab\ncd\nef');
		b.setCaret({ line: 0, col: 1 });
		b.setCaret({ line: 2, col: 1 }, true);
		expect(b.copy()).toBe('b\ncd\ne');
		b.move('docEnd');
		b.paste();
		expect(b.text).toBe('ab\ncd\nefb\ncd\ne');
	});

	it('undo restores a coalesced typing burst in one step', () => {
		const b = new TextBuffer('x');
		b.move('docEnd');
		for (const c of 'yz') b.insert(c);
		expect(b.text).toBe('xyz');
		b.undo();
		expect(b.text).toBe('x');
	});

	it('keeps the goal column when moving vertically through short lines', () => {
		const b = new TextBuffer('abcdef\nab\nabcdef');
		b.setCaret({ line: 0, col: 5 });
		b.move('down');
		expect(b.caret).toEqual({ line: 1, col: 2 });
		b.move('down');
		expect(b.caret).toEqual({ line: 2, col: 5 });
	});

	it('word-deletes with ctrl+backspace semantics', () => {
		const b = new TextBuffer('alpha beta');
		b.move('docEnd');
		b.backspace(true);
		expect(b.text).toBe('alpha ');
	});
});

describe('Calculator', () => {
	const run = (keys: string) => { const c = new Calculator(); for (const k of keys.split(' ')) c.key(k); return c.display; };
	it('evaluates chained operations left to right', () => {
		expect(run('1 2 + 3 * 2 =')).toBe('30');
	});
	it('repeats the last operation on repeated equals', () => {
		expect(run('2 + 3 = =')).toBe('8');
	});
	it('handles decimals without float noise', () => {
		expect(run('0 . 1 + 0 . 2 =')).toBe('0.3');
	});
	it('reports division by zero as an error and recovers on clear', () => {
		const c = new Calculator();
		for (const k of '5 / 0 ='.split(' ')) c.key(k);
		expect(c.display).toBe('Error');
		c.key('Escape');
		c.key('7');
		expect(c.display).toBe('7');
	});
	it('computes percentages of the accumulator for + and -', () => {
		expect(run('2 0 0 + 1 0 % =')).toBe('220');
	});
});

describe('WindowManager', () => {
	const desk = { x: 0, y: 0, w: 1920, h: 1016 };
	it('focus brings a window to the front and hit-tests the topmost', () => {
		const wm = new WindowManager(desk);
		const a = wm.open('a', 'A', { x: 100, y: 100, w: 400, h: 300 });
		const b = wm.open('b', 'B', { x: 200, y: 150, w: 400, h: 300 });
		expect(wm.hit(250, 250)?.win.id).toBe(b.id);
		wm.focus(a.id);
		expect(wm.hit(250, 250)?.win.id).toBe(a.id);
		expect(wm.focused?.id).toBe(a.id);
	});
	it('identifies title-bar buttons and drags windows by the title', () => {
		const wm = new WindowManager(desk);
		const w = wm.open('a', 'A', { x: 100, y: 100, w: 400, h: 300 });
		expect(wm.hit(124, 100 + TITLE_H / 2)?.region).toBe('close');
		expect(wm.hit(300, 110)?.region).toBe('title');
		wm.beginDrag(w, 300, 110, 'move');
		wm.dragTo(500, 210);
		wm.endDrag();
		expect([w.x, w.y]).toEqual([300, 200]);
	});
	it('never lets a window title bar leave the desktop', () => {
		const wm = new WindowManager(desk);
		const w = wm.open('a', 'A', { x: 100, y: 100, w: 400, h: 300 });
		wm.beginDrag(w, 150, 110, 'move');
		wm.dragTo(5000, -400);
		expect(w.y).toBe(0);
		expect(w.x).toBeLessThanOrEqual(1920 - 120);
	});
	it('ignores minimised windows when hit testing', () => {
		const wm = new WindowManager(desk);
		const w = wm.open('a', 'A', { x: 100, y: 100, w: 400, h: 300 });
		wm.minimize(w.id);
		expect(wm.hit(200, 200)).toBeNull();
	});
});

describe('keyboard layout', () => {
	it('has 87 keys, unique codes, and rows that fit the TKL width', () => {
		expect(KEYS.length).toBe(87);
		expect(KEY_INDEX.size).toBe(87);
		for (const k of KEYS) expect(k.x + k.w).toBeLessThanOrEqual(LAYOUT_WIDTH_U + 1e-9);
		expect(LAYOUT_WIDTH_U * UNIT).toBeCloseTo(0.3477, 3);
	});
	it('maps character keys to unshifted/shifted text', () => {
		const k = KEYS[KEY_INDEX.get('Digit2')!];
		expect(k.char).toEqual(['2', '@']);
		expect(KEYS[KEY_INDEX.get('KeyQ')!].char).toEqual(['q', 'Q']);
	});
});
