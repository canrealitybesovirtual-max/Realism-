import * as THREE from 'three';
import { DesktopOS, type KeyInput } from './os';
import { KEYS, KEY_INDEX } from './keyLayout';

/**
 * Hosts the desktop OS for the 3D monitor: owns the canvas texture, throttles
 * uploads, persists notes, and converts key presses from any source (real
 * keyboard, VR poke on the 3D keyboard) into OS key events.
 */
export class Computer {
	readonly os = new DesktopOS({
		get: (k) => { try { return localStorage.getItem('studio.' + k); } catch { return null; } },
		set: (k, v) => { try { localStorage.setItem('studio.' + k, v); } catch { /* storage unavailable */ } },
	});
	readonly texture: THREE.CanvasTexture;
	private lastUpload = 0;
	/** sticky modifiers for the virtual (VR) keyboard */
	readonly sticky = { shift: false, ctrl: false, alt: false, caps: false };
	onKeyVisual: (index: number, down: boolean) => void = () => {};

	constructor() {
		this.texture = new THREE.CanvasTexture(this.os.canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.texture.anisotropy = 8;
		this.texture.generateMipmaps = true;
		this.texture.minFilter = THREE.LinearMipmapLinearFilter;
	}

	/** Call every frame. Uploads at most ~45 times a second, only when changed. */
	update(now: number) {
		this.os.update(now);
		if (now - this.lastUpload < 22) return;
		if (this.os.render(now)) {
			this.texture.needsUpdate = true;
			this.lastUpload = now;
		}
	}

	/** Screen UV (0..1, origin bottom-left) -> OS pixel coordinates. */
	uvToPixel(uv: THREE.Vector2) { return { x: uv.x * this.os.W, y: (1 - uv.y) * this.os.H }; }

	/** Physical keyboard event (desktop). */
	physicalKey(e: KeyboardEvent): boolean {
		const i = KEY_INDEX.get(e.code);
		if (i !== undefined) this.onKeyVisual(i, true);
		return this.os.key({ code: e.code, key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
	}
	physicalKeyUp(e: KeyboardEvent) {
		const i = KEY_INDEX.get(e.code);
		if (i !== undefined) this.onKeyVisual(i, false);
	}

	/**
	 * A key on the 3D keyboard was pressed (VR poke or ray). Modifiers are
	 * sticky: tap Shift then a letter for a capital, like accessibility
	 * "sticky keys", because you cannot hold two keys with one controller.
	 */
	virtualKey(index: number) {
		const k = KEYS[index];
		const s = this.sticky;
		switch (k.code) {
			case 'ShiftLeft': case 'ShiftRight': s.shift = !s.shift; return;
			case 'ControlLeft': case 'ControlRight': case 'MetaLeft': s.ctrl = !s.ctrl; return;
			case 'AltLeft': case 'AltRight': s.alt = !s.alt; return;
			case 'CapsLock': s.caps = !s.caps; return;
			case 'Fn': case 'ContextMenu': case 'PrintScreen': case 'ScrollLock': case 'Pause': case 'Insert': return;
		}
		let key: string;
		if (k.char) {
			const isLetter = /^[a-z]$/.test(k.char[0]);
			const upper = isLetter ? s.shift !== s.caps : s.shift;
			key = upper ? k.char[1] : k.char[0];
		} else {
			key = k.code.startsWith('Arrow') || ['Backspace', 'Enter', 'Tab', 'Escape', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'].includes(k.code)
				? k.code : /^F\d+$/.test(k.code) ? k.code : k.label;
		}
		const ev: KeyInput = { code: k.code, key, shift: s.shift, ctrl: s.ctrl, alt: s.alt, meta: false };
		this.os.key(ev);
		s.shift = false; s.ctrl = false; s.alt = false;
		this.os.invalidate();
	}
}
