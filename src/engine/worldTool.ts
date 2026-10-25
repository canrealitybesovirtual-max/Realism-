import * as THREE from 'three';
import type { Editor } from './editor';
import { log } from './log';

/**
 * Editing in the world itself, while the World tool is on (it switches on in
 * edit mode, or from the Studio toolbar).
 *
 * Desktop (pointer locked, walking): click selects what the crosshair is on
 * (the monitor still opens the computer); G picks the selection up and carries
 * it in front of you (wheel: nearer / further, [ and ]: turn 15 degrees,
 * G or click: put down, Esc: cancel); Delete deletes (press twice for objects
 * that were part of the original scene); Ctrl+Z / Ctrl+Y undo / redo; Ctrl+D
 * duplicates.
 *
 * VR: trigger on an object selects it; squeeze while pointing at the selected
 * object (or touching it) carries it with the hand, snapped; the thumbstick
 * pushes it away / pulls it in (up / down) and turns it (left / right).
 */
export class WorldTool {
	private yaw = 0;
	private deleteArmed = 0;
	private hand: { index: number; push: number } | null = null;
	private rc = new THREE.Raycaster();

	constructor(private ed: Editor, private scene: THREE.Scene, private screen: THREE.Object3D, camera: THREE.Camera) {
		this.rc.camera = camera; // Sprite.raycast needs one
	}

	active() { return this.ed.worldTool; }
	carrying(index: number) { return this.hand?.index === index && !!this.ed.moving; }

	/** first entity hit along a ray (any visible mesh, not the monitor) */
	pick(origin: THREE.Vector3, dir: THREE.Vector3, far = 40) {
		this.rc.set(origin, dir); this.rc.far = far;
		for (const h of this.rc.intersectObjects(this.scene.children, true)) {
			if (!(h.object as THREE.Mesh).isMesh || h.object.userData.noBullet || h.object.name === 'editor-highlight') continue;
			let vis = true; for (let p: THREE.Object3D | null = h.object; p; p = p.parent) if (!p.visible) vis = false;
			if (!vis) continue;
			if (h.object === this.screen) return { entity: null, screen: true, distance: h.distance };
			const e = this.ed.world.of(h.object);
			if (e) return { entity: e, screen: false, distance: h.distance };
		}
		return null;
	}

	// ------------------------------------------------------------------ desktop
	/** a click while walking; true if the editor used it */
	desktopClick(camera: THREE.Camera): boolean {
		if (this.ed.moving?.source === 'desktop') { this.ed.endMove(true); return true; }
		const o = camera.getWorldPosition(new THREE.Vector3()), d = camera.getWorldDirection(new THREE.Vector3());
		const hit = this.pick(o, d);
		if (!hit || hit.screen) return false;
		this.ed.select(hit.entity);
		return true;
	}

	desktopKey(code: string, ctrl: boolean, shift: boolean, camera: THREE.Camera): boolean {
		const ed = this.ed;
		if (ctrl && code === 'KeyZ') { if (shift) ed.redo(); else ed.undo(); return true; }
		if (ctrl && code === 'KeyY') { ed.redo(); return true; }
		if (ctrl && code === 'KeyD') { ed.duplicate(); return true; }
		if (code === 'Escape' && ed.moving?.source === 'desktop') { ed.endMove(false); return true; }
		if (code === 'KeyG') {
			if (ed.moving) ed.endMove(true);
			else if (ed.selection.length) { this.yaw = 0; ed.beginMove('desktop', camera.matrixWorld.clone()); }
			return true;
		}
		if (ed.moving && (code === 'BracketLeft' || code === 'BracketRight')) { this.yaw += code === 'BracketLeft' ? 15 : -15; return true; }
		if (code === 'Delete') {
			const now = performance.now();
			const r = ed.delete(now - this.deleteArmed < 2000);
			if (r === 'confirm') { this.deleteArmed = now; log.warn('Press Delete again to delete original scene content'); }
			return true;
		}
		return false;
	}

	desktopWheel(dy: number) {
		const m = this.ed.moving;
		if (!m || m.source !== 'desktop') return false;
		m.offset.premultiply(new THREE.Matrix4().makeTranslation(0, 0, dy * 0.001));
		return true;
	}

	desktopUpdate(camera: THREE.Camera) {
		const m = this.ed.moving;
		if (m?.source === 'desktop') this.ed.updateMove(camera.matrixWorld, this.yaw);
	}

	// ------------------------------------------------------------------ VR
	/**
	 * One controller's frame while the tool is on. Returns the ray length to
	 * draw, or null if the editor did not use this hand (normal interaction).
	 */
	xr(index: number, ray: THREE.Matrix4, grip: THREE.Matrix4, gripPos: THREE.Vector3, b: { triggerDown: boolean; squeezeDown: boolean; squeezeUp: boolean; squeeze: boolean; stickX: number; stickY: number }, dt: number): number | null {
		const ed = this.ed;
		const origin = new THREE.Vector3().setFromMatrixPosition(ray);
		const dir = new THREE.Vector3(0, 0, -1).transformDirection(ray);
		// carrying
		if (this.hand?.index === index && ed.moving) {
			if (b.squeezeUp || !b.squeeze) { ed.endMove(true); this.hand = null; return 0.3; }
			if (Math.abs(b.stickY) > 0.2) this.hand.push -= b.stickY * dt * 1.5;
			if (Math.abs(b.stickX) > 0.75 && !(this as any).turned) { this.yaw -= Math.sign(b.stickX) * 15; (this as any).turned = true; }
			if (Math.abs(b.stickX) < 0.3) (this as any).turned = false;
			const holder = grip.clone().premultiply(new THREE.Matrix4().makeTranslation(dir.x * this.hand.push, dir.y * this.hand.push, dir.z * this.hand.push));
			ed.updateMove(holder, this.yaw);
			return 0.2;
		}
		const hit = this.pick(origin, dir);
		if (hit?.screen) return null; // the computer keeps working normally
		const sel = ed.selection[0];
		const touching = sel && new THREE.Box3().setFromObject(sel.object).expandByScalar(0.04).containsPoint(gripPos);
		if (b.squeezeDown && sel && (touching || hit?.entity === sel)) {
			this.yaw = 0;
			if (ed.beginMove(index, grip.clone())) { this.hand = { index, push: 0 }; return 0.2; }
		}
		if (b.triggerDown) { ed.select(hit?.entity ?? null); return hit ? hit.distance : 3; }
		return hit ? hit.distance : null;
	}
}
