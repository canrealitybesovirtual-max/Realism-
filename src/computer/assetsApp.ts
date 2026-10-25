import * as THREE from 'three';
import type { App, DesktopOS, Rect, CursorStyle } from './os';
import type { Editor } from '../engine/editor';
import type { AssetLibrary, Prefab } from '../engine/assets';
import { ENV, readEnv, type EnvKey, type Op, type OpContext } from '../engine/ops';
import { readTRS } from '../engine/entities';
import { log } from '../engine/log';

/**
 * "Assets": imported models (GLB), prefabs and environment settings.
 * Importing uses the browser's file picker, which cannot open inside an
 * immersive VR session - import on the desktop, then place things in VR.
 * Everything placed or changed here is an ordinary undoable op.
 */
type Hit = { x: number; y: number; w: number; h: number; up: () => void };
const C = { bg: '#1b1d22', panel: '#23262c', line: '#383d46', text: '#e3e6ea', dim: '#8e97a3', ok: '#5ad08a', warn: '#ffb648', err: '#ff6b6b', blue: '#3d8bfd' };
const mb = (b: number) => (b / 1048576).toFixed(1) + ' MB';

export class AssetsApp implements App {
	id = 'assets';
	title = 'Assets';
	defaultRect = { x: 200, y: 90, w: 1500, h: 840 };
	minSize: [number, number] = [1100, 600];
	private hits: Hit[] = [];
	status = '';
	private busy = false;
	private confirm: { msg: string; yes: () => void } | null = null;
	private input: HTMLInputElement | null = null;
	private sig = '';
	private lastDraw = 0;

	constructor(private os: DesktopOS, private ed: Editor, private lib: AssetLibrary, private ctx: OpContext, private player: () => { pos: THREE.Vector3; fwd: THREE.Vector3 }, private inXR: () => boolean) {}

	drawIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
		c.save();
		c.beginPath(); c.roundRect(x, y, s, s, s * 0.23); c.fillStyle = '#2d3a2f'; c.fill(); c.clip();
		const box = (bx: number, by: number, col: string) => { c.fillStyle = col; c.fillRect(x + s * bx, y + s * by, s * 0.3, s * 0.3); };
		box(0.15, 0.5, '#8bc48a'); box(0.52, 0.5, '#c8a052'); box(0.34, 0.16, '#6fa8dc');
		c.restore();
	}
	animating(_f: boolean, now: number) { const s = `${this.lib.list.length}|${this.lib.prefabs.length}|${this.status}|${this.ed.world.version}|${this.ed.selectionVersion}`; if (s !== this.sig) { this.sig = s; return true; } return now - this.lastDraw > 1000; }
	cursor(x: number, y: number): CursorStyle { return this.hitAt(x, y) ? 'pointer' : 'arrow'; }
	pointerUp(x: number, y: number) { const h = this.hitAt(x, y); h?.up(); this.os.invalidate(); }

	// ------------------------------------------------------------------ actions
	pickFile() {
		if (this.inXR()) { this.status = 'The file picker cannot open inside VR. Import on the desktop (take the headset off or use the page), then place it here.'; return; }
		if (!this.input) {
			this.input = document.createElement('input');
			this.input.type = 'file'; this.input.accept = '.glb,model/gltf-binary';
			this.input.onchange = () => { const f = this.input!.files?.[0]; this.input!.value = ''; if (f) void this.importFile(f); };
		}
		this.input.click();
	}

	async importFile(f: { name: string; arrayBuffer(): Promise<ArrayBuffer> }) {
		this.busy = true; this.status = `Checking ${f.name}…`; this.os.invalidate();
		try {
			const r = await this.lib.import(f);
			this.status = `Imported ${r.info.name}${r.notes.length ? ' - ' + r.notes.join('; ') : ''}. Press Place to put it in the world.`;
		} catch (e) {
			this.status = `Refused ${f.name}: ${(e as Error).message}`;
			log.warn(this.status);
		}
		this.busy = false; this.os.invalidate();
	}

	private placeAt() {
		const { pos, fwd } = this.player();
		const f = fwd.clone().setY(0);
		if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
		const at = pos.clone().addScaledVector(f.normalize(), 1.2);
		return [this.ed.snapV(at.x), 0.002, this.ed.snapV(at.z)] as [number, number, number];
	}

	placeAsset(id: string) {
		const a = this.lib.list.find((x) => x.id === id);
		if (!a) return;
		const nid = this.ed.world.spawnId('asset');
		if (this.ed.apply({ op: 'spawn', id: nid, spec: { kind: 'asset', asset: id, dynamic: false, size: a.size }, to: { p: this.placeAt(), r: [0, 0, 0], s: [1, 1, 1] }, color: '#ffffff' })) this.status = `Placed ${a.name} in front of you (static; switch to dynamic in Studio → Physics).`;
	}

	saveSelectionAsPrefab() {
		const e = this.ed.selection[0];
		if (!e) { this.status = 'Select an object first (Studio or the world tool).'; return; }
		if (e.locked || e.layer === 'Weapons') { this.status = `${e.name} cannot be a prefab.`; return; }
		let color = '#ffffff';
		e.object.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.color && color === '#ffffff') color = '#' + m.color.getHexString(); });
		const t = readTRS(e.object);
		const p: Prefab = { id: 'pf-' + Date.now().toString(36), name: e.name.slice(0, 40), spec: e.spawn ?? { kind: 'clone', source: e.id, dynamic: !!e.prop, size: [1, 1, 1] }, color, scale: t.s, components: e.components.map((c) => ({ type: c.type, data: { ...c.data } })) };
		this.lib.savePrefab(p);
		this.status = `Saved prefab "${p.name}" (${p.components.length} component(s)).`;
	}

	placePrefab(p: Prefab) {
		const id = this.ed.world.spawnId('prefab');
		const ops: Op[] = [{ op: 'spawn', id, spec: p.spec, to: { p: this.placeAt().map((v, i) => (i === 1 ? Math.max(v, p.spec.kind === 'asset' || p.spec.kind === 'clone' ? 0.002 : p.spec.size[1] / 2) : v)) as [number, number, number], r: [0, 0, 0], s: p.scale }, color: p.color }];
		for (const c of p.components) ops.push({ op: 'comp', id, ctype: c.type, data: c.data });
		const r = this.ed.applyBatch(ops, `Place prefab ${p.name}`);
		this.status = r.ok ? `Placed prefab ${p.name}.` : `Could not place ${p.name}: ${r.why}`;
	}

	private env(key: EnvKey, delta: number) {
		const r = ENV[key];
		const v = Math.round(THREE.MathUtils.clamp(readEnv(this.ctx, key) + delta, r.min, r.max) * 100) / 100;
		this.ed.apply({ op: 'env', id: 'environment', key, value: v });
	}

	// ------------------------------------------------------------------ draw
	draw(c: CanvasRenderingContext2D, r: Rect, _f: boolean, now: number) {
		this.lastDraw = now;
		this.hits = [];
		const W = r.w, H = r.h, ui = this.os.fonts.ui;
		c.save(); c.translate(r.x, r.y);
		c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
		c.textBaseline = 'middle';
		const col = (x: number, title: string, w: number) => { c.fillStyle = C.panel; c.fillRect(x, 0, w, H - 40); c.fillStyle = C.text; c.font = `600 18px ${ui}`; c.fillText(title, x + 18, 28); };
		const cw = (W - 2) / 3;
		// models
		col(0, 'Imported models', cw);
		this.button(c, this.busy ? 'Checking…' : 'Import .glb…', 18, 52, cw - 36, 40, () => this.pickFile(), !this.busy, true);
		c.fillStyle = C.dim; c.font = `400 13px ${ui}`;
		c.fillText('Checked before use: ≤25 MB, ≤1.5 M triangles, ≤48 textures.', 18, 108);
		let y = 132;
		if (!this.lib.list.length) { c.fillStyle = C.dim; c.font = `400 15px ${ui}`; c.fillText(this.lib.ready ? 'None yet.' : 'Loading stored models…', 18, y); }
		for (const a of this.lib.list) {
			if (y > H - 90) break;
			c.fillStyle = C.text; c.font = `500 16px ${ui}`; c.fillText(a.name.slice(0, 30), 18, y);
			c.fillStyle = C.dim; c.font = `400 13px ${ui}`; c.fillText(`${Math.round(a.tris / 1000)}k tris · ${mb(a.bytes)} · ${a.size.map((v) => v.toFixed(2)).join('×')} m`, 18, y + 22);
			this.button(c, 'Place', cw - 190, y - 6, 80, 32, () => this.placeAsset(a.id));
			const used = this.ed.world.list.some((e) => !e.deleted && e.spawn?.asset === a.id);
			this.button(c, 'Delete', cw - 102, y - 6, 84, 32, () => { this.confirm = { msg: `Delete the stored model "${a.name}"? Saved scenes that use it will skip it.`, yes: () => void this.lib.remove(a.id).then(() => { this.status = `Deleted ${a.name}.`; this.os.invalidate(); }) }; }, !used);
			y += 56;
		}
		// prefabs
		const px = cw + 1;
		col(px, 'Prefabs', cw);
		const sel = this.ed.selection[0];
		this.button(c, sel ? `Save "${sel.name.slice(0, 22)}" as prefab` : 'Select an object to save a prefab', px + 18, 52, cw - 36, 40, () => this.saveSelectionAsPrefab(), !!sel, !!sel);
		y = 132;
		if (!this.lib.prefabs.length) { c.fillStyle = C.dim; c.font = `400 15px ${ui}`; c.fillText('A prefab remembers what to spawn and its components.', px + 18, y); }
		for (const p of this.lib.prefabs) {
			if (y > H - 90) break;
			c.fillStyle = C.text; c.font = `500 16px ${ui}`; c.fillText(p.name, px + 18, y);
			c.fillStyle = C.dim; c.font = `400 13px ${ui}`; c.fillText(`${p.spec.kind}${p.components.length ? ' · ' + p.components.map((x) => x.type).join(', ') : ''}`.slice(0, 44), px + 18, y + 22);
			this.button(c, 'Place', px + cw - 190, y - 6, 80, 32, () => this.placePrefab(p));
			this.button(c, 'Delete', px + cw - 102, y - 6, 84, 32, () => { this.confirm = { msg: `Delete prefab "${p.name}"? Objects already placed stay.`, yes: () => this.lib.deletePrefab(p.id) }; });
			y += 56;
		}
		// environment
		const ex = 2 * cw + 2;
		col(ex, 'Environment', cw - 2);
		y = 76;
		for (const [key, r] of Object.entries(ENV) as [EnvKey, typeof ENV[EnvKey]][]) {
			const v = readEnv(this.ctx, key);
			c.fillStyle = C.text; c.font = `500 16px ${ui}`; c.fillText(r.label, ex + 18, y);
			c.fillStyle = C.dim; c.font = `400 13px ${ui}`; c.fillText(`${r.min} – ${r.max}`, ex + 18, y + 22);
			const step = key === 'shadowSoftness' ? 0.5 : 0.1;
			this.button(c, '−', ex + cw - 200, y - 6, 44, 34, () => this.env(key, -step));
			c.fillStyle = C.text; c.font = `600 16px ${this.os.fonts.mono}`; c.textAlign = 'center'; c.fillText(v.toFixed(2), ex + cw - 120, y + 11); c.textAlign = 'left';
			this.button(c, '+', ex + cw - 80, y - 6, 44, 34, () => this.env(key, step));
			y += 66;
		}
		c.fillStyle = C.dim; c.font = `400 13px ${ui}`;
		['Each change is an undoable op saved with the scene.', 'Sun and window light: select them in Studio (Lights).', 'The reflection probe is captured at load; it does', 'not re-capture when lights change.'].forEach((t, i) => c.fillText(t, ex + 18, y + 10 + i * 20));
		// status
		c.fillStyle = C.panel; c.fillRect(0, H - 40, W, 40);
		c.fillStyle = /Refused|cannot|Could not/.test(this.status) ? C.err : C.dim; c.font = `500 15px ${ui}`;
		c.fillText(this.status.slice(0, 170), 18, H - 20);
		if (this.confirm) this.dialog(c, W, H);
		c.restore();
	}

	private dialog(c: CanvasRenderingContext2D, W: number, H: number) {
		const d = this.confirm!;
		c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
		this.hits.push({ x: 0, y: 0, w: W, h: H, up: () => {} });
		const w = 640, h = 170, x = (W - w) / 2, y = (H - h) / 2;
		c.beginPath(); c.roundRect(x, y, w, h, 14); c.fillStyle = '#2a2e35'; c.fill();
		c.fillStyle = C.text; c.font = `500 17px ${this.os.fonts.ui}`; c.fillText(d.msg.slice(0, 66), x + 24, y + 40); c.fillText(d.msg.slice(66, 132), x + 24, y + 66);
		this.button(c, 'Delete', x + w - 290, y + h - 58, 130, 40, () => { this.confirm = null; d.yes(); }, true, true);
		this.button(c, 'Cancel', x + w - 150, y + h - 58, 130, 40, () => { this.confirm = null; });
	}

	private button(c: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, fn: () => void, enabled = true, primary = false) {
		c.beginPath(); c.roundRect(x, y, w, h, 7);
		c.fillStyle = !enabled ? '#25282d' : primary ? C.blue : '#2f343c'; c.fill();
		c.fillStyle = enabled ? '#fff' : '#5d636b'; c.font = `500 15px ${this.os.fonts.ui}`; c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 1); c.textAlign = 'left';
		if (enabled) this.hits.push({ x, y, w, h, up: fn });
	}
	private hitAt(x: number, y: number) { for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; } return null; }
}
