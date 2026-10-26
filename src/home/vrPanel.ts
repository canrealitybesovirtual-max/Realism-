import * as THREE from 'three';
import type { Home, Deps } from './home';

/**
 * The control center in VR: a tablet held in the left hand, used with the
 * right controller's laser (trigger clicks). Hold X (left controller) or
 * press the big microphone to talk.
 *
 * Drawn on a canvas texture that is only repainted when something changed.
 * The right controller's ray also picks what you point at in the house
 * (rightRay), so "make this blue" works by pointing.
 */
const W = 1024, H = 720;
interface Btn { x: number; y: number; w: number; h: number; label: string; run: () => void; on?: boolean; big?: boolean; off?: boolean }

export class VRPanel {
	private canvas = document.createElement('canvas');
	private ctx: CanvasRenderingContext2D;
	private tex: THREE.CanvasTexture;
	private mesh: THREE.Mesh;
	private btns: Btn[] = [];
	private hover = -1;
	private dirty = true;
	private shown = false;
	private prev = new Map<number, boolean[]>();
	private dot: THREE.Mesh;
	private _ray = { origin: new THREE.Vector3(), dir: new THREE.Vector3() };
	private rc = new THREE.Raycaster();

	constructor(private home: Home, private d: Deps) {
		this.canvas.width = W; this.canvas.height = H;
		this.ctx = this.canvas.getContext('2d')!;
		this.tex = new THREE.CanvasTexture(this.canvas);
		this.tex.colorSpace = THREE.SRGBColorSpace;
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32 * H / W), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent: true }));
		this.mesh.name = 'home-vr-panel'; this.mesh.userData.keepInHome = true; this.mesh.visible = false; this.mesh.renderOrder = 5;
		this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false }));
		this.dot.visible = false; this.dot.renderOrder = 11; this.dot.userData.keepInHome = true;
		d.scene.add(this.mesh, this.dot);
	}

	show(on: boolean) { this.shown = on; if (!on) { this.mesh.visible = false; this.dot.visible = false; } this.invalidate(); }
	invalidate() { this.dirty = true; }

	private hand(side: 'left' | 'right') { return (this.d.xr?.hands ?? []).find((h: any) => h.source?.handedness === side) ?? null; }
	private presenting() { return !!this.d.renderer.xr.isPresenting; }

	/** the right controller's pointing ray in world space (null outside VR) */
	rightRay() {
		if (!this.shown || !this.presenting()) return null;
		const h = this.hand('right'); if (!h?.source) return null;
		const m: THREE.Matrix4 = h.ray.matrixWorld;
		this._ray.origin.setFromMatrixPosition(m);
		this._ray.dir.set(0, 0, -1).transformDirection(m);
		return this._ray;
	}

	private edges(h: any) {
		const b: boolean[] = (h?.source?.gamepad?.buttons ?? []).map((x: GamepadButton) => x.pressed);
		if (h?.source?.hand) b[0] = !!h.pinching;
		const was = this.prev.get(h?.index ?? -1) ?? [];
		this.prev.set(h?.index ?? -1, b);
		return { down: (i: number) => !!b[i] && !was[i], up: (i: number) => !b[i] && !!was[i] };
	}

	update(_dt: number) {
		if (!this.shown) return;
		const vr = this.presenting();
		const left = vr ? this.hand('left') : null;
		this.mesh.visible = !!left?.source;
		if (!this.mesh.visible) { this.dot.visible = false; return; }
		// tablet above the left wrist, tilted towards the eyes
		const g: THREE.Object3D = left.grip;
		g.updateMatrixWorld();
		this.mesh.position.set(0.02, 0.07, -0.12).applyMatrix4(g.matrixWorld);
		this.mesh.quaternion.copy(g.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0, 0)));
		// left X: hold to talk
		const le = this.edges(left);
		if (le.down(4)) this.home.voice.start();
		if (le.up(4)) this.home.voice.stop();
		// right laser on the tablet
		const right = this.hand('right'), r = this.rightRay();
		let hover = -1;
		if (r) {
			this.rc.set(r.origin, r.dir);
			const hit = this.rc.intersectObject(this.mesh, false)[0];
			if (hit?.uv) {
				const x = hit.uv.x * W, y = (1 - hit.uv.y) * H;
				hover = this.btns.findIndex((b) => !b.off && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
				this.dot.position.copy(hit.point); this.dot.visible = true;
			} else this.dot.visible = false;
			const re = this.edges(right);
			if (hover >= 0 && re.down(0)) { right.source?.gamepad?.hapticActuators?.[0]?.pulse?.(0.4, 20); this.btns[hover].run(); this.dirty = true; }
		}
		if (hover !== this.hover) { this.hover = hover; this.dirty = true; }
		if (this.dirty) this.paint();
	}

	private paint() {
		this.dirty = false;
		const c = this.ctx, h = this.home, v = h.voice;
		c.clearRect(0, 0, W, H);
		c.fillStyle = 'rgba(18,20,24,0.92)'; round(c, 0, 0, W, H, 36); c.fill();
		this.btns = [];
		const btn = (x: number, y: number, w: number, hh: number, label: string, run: () => void, o: Partial<Btn> = {}) => this.btns.push({ x, y, w, h: hh, label, run, ...o });
		const listening = v.state !== 'off';
		btn(28, 28, 150, 150, !v.supported ? 'no mic' : listening ? 'listening' : 'talk', () => (listening ? v.stop() : v.start()), { big: true, on: listening, off: !v.supported });
		btn(W - 196, 28, 168, 60, 'Leave home', () => h.leave());
		const row = 470;
		btn(28, row, 150, 64, 'Undo', () => h.submit('undo', 'button'), { off: !h.designer.canUndo });
		btn(190, row, 150, 64, 'Redo', () => h.submit('redo', 'button'), { off: !h.designer.canRedo });
		btn(352, row, 150, 64, 'Save', () => h.submit(`save as VR ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'button'));
		btn(514, row, 150, 64, 'Cancel', () => h.submit('cancel', 'button'), { off: !h.status.busy && !h.question });
		btn(676, row, 320, 64, '3 alternatives', () => h.submit('show me three alternatives', 'button'));
		const styles: [string, string][] = [['modern', 'Modern'], ['warm', 'Cosy'], ['scandinavian', 'Scandi'], ['luxury', 'Luxury'], ['industrial', 'Industrial'], ['japandi', 'Japandi']];
		styles.forEach(([s, l], i) => btn(28 + i * 162, 552, 150, 60, l, () => h.submit(`make this room ${s}`, 'button')));
		const light: [string, string][] = [['warmer', 'make the light warmer'], ['cooler', 'make the light cooler'], ['brighter', 'make the light brighter'], ['dimmer', 'make the light dimmer']];
		light.forEach(([l, say], i) => btn(28 + i * 162, 626, 150, 60, l, () => h.submit(say, 'button')));
		btn(676, 626, 320, 60, h.aimed && !h.aimed.fixed ? `Remove ${short(h.aimed.name, 14)}` : 'Point at something', () => { if (h.aimed && !h.aimed.fixed) h.submit(`remove the ${h.aimed.name.toLowerCase()}`, 'button'); }, { off: !h.aimed || h.aimed.fixed });
		const choices = h.question?.choices.map((x) => x.label) ?? h.alts?.options.map((o) => o.label) ?? [];
		choices.slice(0, 3).forEach((l, i) => btn(28 + i * 328, 380, 316, 70, `${i + 1}. ${short(l, 20)}`, () => h.choose(i), { on: h.alts?.applied === i }));

		this.btns.forEach((b, i) => {
			c.fillStyle = b.big ? (b.on ? '#e0484b' : b.off ? '#555b63' : '#2d6cdf') : b.on ? '#2d6cdf' : i === this.hover ? '#3d4552' : '#2b3038';
			if (b.big) { c.beginPath(); c.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2); c.fill(); } else { round(c, b.x, b.y, b.w, b.h, 14); c.fill(); }
			if (i === this.hover) { c.strokeStyle = '#ffd166'; c.lineWidth = 4; if (b.big) { c.beginPath(); c.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2); } else round(c, b.x, b.y, b.w, b.h, 14); c.stroke(); }
			c.globalAlpha = b.off && !b.big ? 0.4 : 1;
			c.fillStyle = '#fff'; c.font = `600 ${b.big ? 30 : 28}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
			c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + (b.big ? 44 : 0));
			if (b.big) mic(c, b.x + b.w / 2, b.y + b.h / 2 - 12);
			c.globalAlpha = 1;
		});
		c.textAlign = 'left'; c.textBaseline = 'alphabetic';
		c.fillStyle = '#aab4bf'; c.font = '500 26px system-ui,sans-serif';
		c.fillText(`${h.house.rooms[h.room].name}${h.aimed ? ` · ${h.aimed.name}` : ''}`, 206, 60);
		c.fillStyle = '#fff'; c.font = '500 30px system-ui,sans-serif';
		let y = 112;
		const said = v.interim || h.transcript;
		if (said) y = wrap(c, `“${said}”`, 206, y, W - 240, 36, 2);
		c.fillStyle = '#9fc3ff'; if (h.understood) y = wrap(c, h.understood, 206, y + 4, W - 240, 34, 2);
		c.fillStyle = v.error ? '#f08080' : '#eef1f4'; c.font = '500 28px system-ui,sans-serif';
		wrap(c, v.error || h.status.text, 28, 236, W - 56, 34, 3);
		if (h.status.busy) {
			c.fillStyle = '#333a44'; round(c, 28, 350, W - 56, 12, 6); c.fill();
			const p = h.status.progress ?? ((performance.now() / 900) % 1);
			c.fillStyle = '#4f8ff7'; round(c, 28, 350, Math.max(12, (W - 56) * p), 12, 6); c.fill();
			this.dirty = h.status.progress === null; // animate the indeterminate bar
		}
		if (!v.supported) { c.fillStyle = '#8e99a5'; c.font = '500 22px system-ui'; c.fillText('Voice is not available in this headset browser: use the buttons.', 28, 205); }
		this.tex.needsUpdate = true;
	}
}

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number, max: number) {
	const words = text.split(/\s+/); let line = '', n = 0;
	for (const word of words) {
		const t = line ? line + ' ' + word : word;
		if (c.measureText(t).width > w && line) { if (++n >= max) { c.fillText(line + '…', x, y); return y + lh; } c.fillText(line, x, y); y += lh; line = word; } else line = t;
	}
	if (line) { c.fillText(line, x, y); y += lh; }
	return y;
}
function mic(c: CanvasRenderingContext2D, x: number, y: number) {
	c.fillStyle = '#fff'; round(c, x - 14, y - 34, 28, 48, 14); c.fill();
	c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.arc(x, y - 6, 24, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
	c.beginPath(); c.moveTo(x, y + 18); c.lineTo(x, y + 30); c.stroke();
}
