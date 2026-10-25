import * as THREE from 'three';
import type { EntityWorld, Entity } from './entities';
import type { Physics } from '../physics/physics';

/**
 * Engine diagnostics: real measurements from the running frame loop.
 *
 * - Timings: CPU milliseconds per frame section (input, simulation, editor,
 *   render submission) measured with performance.now() around the actual
 *   calls. GPU time is not measurable here without timer queries, and in VR
 *   the frame rate is paced by the headset; both are said in the UI.
 * - Renderer: draw calls and triangles of ALL passes in the frame (shadow
 *   maps, Studio viewport, scopes, eyes), plus live geometry / texture /
 *   shader counts from three.js.
 * - Baseline + regression: "Capture baseline" averages the next 3 s; later
 *   averages are compared and anything >25 % worse (frame time, sections,
 *   draw calls, triangles) is flagged.
 * - Scene costs: triangles, meshes, shadow casters and estimated texture
 *   memory per entity, sorted - the expensive objects.
 * - Overlays: physics colliders (Rapier's own debug geometry), entity bounds,
 *   and the Studio viewport camera's frustum, drawn into the world.
 */
export type Section = 'input' | 'sim' | 'editor' | 'render' | 'frame';
const SECTIONS: Section[] = ['input', 'sim', 'editor', 'render', 'frame'];
const N = 240;

export interface Sample { ms: Record<Section, number>; calls: number; tris: number; dt: number }
export interface Averages { ms: Record<Section, number>; calls: number; tris: number; fps: number; worst: number }
export interface Regression { what: string; base: number; now: number; pct: number }
export interface EntityCost { e: Entity; tris: number; meshes: number; casters: number; texBytes: number }

export class Diagnostics {
	readonly history: Sample[] = [];
	private t0 = 0;
	private marks: Partial<Record<Section, number>> = {};
	private cur: Record<Section, number> = { input: 0, sim: 0, editor: 0, render: 0, frame: 0 };
	baseline: Averages | null = null;
	private capturing: { until: number; samples: Sample[] } | null = null;
	overlays = { colliders: false, bounds: false, frustum: false };
	private colliderLines: THREE.LineSegments | null = null;
	private boundsGroup = new THREE.Group();
	private frustum: THREE.CameraHelper | null = null;
	/** off by default; costs nothing while off */
	enabled = true;

	constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private world: EntityWorld | null, private physics: Physics | null, private viewCamera: THREE.Camera | null) {
		renderer.info.autoReset = false;
		this.boundsGroup.name = 'diag-bounds';
		this.boundsGroup.userData.noBullet = true;
	}

	// ------------------------------------------------------------------ frame loop hooks
	begin() { this.renderer.info.reset(); this.t0 = performance.now(); this.marks = {}; this.last = this.t0; }
	private last = 0;
	/** close the current section */
	mark(s: Section) { const t = performance.now(); this.cur[s] = t - this.last; this.last = t; this.marks[s] = t; }
	end(dt: number) {
		this.cur.frame = performance.now() - this.t0;
		const info = this.renderer.info.render;
		const s: Sample = { ms: { ...this.cur }, calls: info.calls, tris: info.triangles, dt };
		this.history.push(s);
		if (this.history.length > N) this.history.shift();
		for (const k of SECTIONS) this.cur[k] = 0;
		if (this.capturing) {
			this.capturing.samples.push(s);
			if (performance.now() > this.capturing.until) { this.baseline = average(this.capturing.samples); this.capturing = null; }
		}
		this.updateOverlays();
	}

	// ------------------------------------------------------------------ analysis
	averages(n = 120): Averages | null { return this.history.length ? average(this.history.slice(-n)) : null; }
	get capturingBaseline() { return !!this.capturing; }
	captureBaseline(seconds = 3) { this.capturing = { until: performance.now() + seconds * 1000, samples: [] }; }

	regressions(): Regression[] {
		const b = this.baseline, a = this.averages();
		if (!b || !a) return [];
		const out: Regression[] = [];
		const cmp = (what: string, base: number, now: number, floor: number) => { if (now > base * 1.25 && now - base > floor) out.push({ what, base, now, pct: (now / Math.max(1e-6, base) - 1) * 100 }); };
		cmp('frame CPU ms', b.ms.frame, a.ms.frame, 0.5);
		for (const k of ['input', 'sim', 'editor', 'render'] as const) cmp(`${k} ms`, b.ms[k], a.ms[k], 0.3);
		cmp('draw calls', b.calls, a.calls, 10);
		cmp('triangles', b.tris, a.tris, 5000);
		if (a.fps < b.fps * 0.8) out.push({ what: 'frames per second', base: b.fps, now: a.fps, pct: (a.fps / b.fps - 1) * 100 });
		return out;
	}

	memory() {
		const m = this.renderer.info.memory, p = this.renderer.info.programs?.length ?? 0;
		let texBytes = 0;
		const seen = new Set<THREE.Texture>();
		this.scene.traverse((o) => { const mats = (o as THREE.Mesh).material; if (!mats) return; for (const mat of Array.isArray(mats) ? mats : [mats]) for (const v of Object.values(mat as any)) if ((v as THREE.Texture)?.isTexture && !seen.has(v as THREE.Texture)) { seen.add(v as THREE.Texture); texBytes += textureBytes(v as THREE.Texture); } });
		return { geometries: m.geometries, textures: m.textures, programs: p, sceneTextures: seen.size, texBytes };
	}

	/** per entity: what it costs to draw */
	costs(): EntityCost[] {
		if (!this.world) return [];
		const out: EntityCost[] = [];
		for (const e of this.world.list) {
			if (e.deleted || !e.object.visible) continue;
			let tris = 0, meshes = 0, casters = 0, texBytes = 0;
			const seen = new Set<THREE.Texture>();
			e.object.traverseVisible((o) => {
				const m = o as THREE.Mesh;
				if (!m.isMesh || !m.geometry) return;
				meshes++;
				if (m.castShadow) casters++;
				const g = m.geometry, n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
				tris += Math.floor(n / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
				for (const mat of Array.isArray(m.material) ? m.material : [m.material]) for (const v of Object.values(mat as any)) if ((v as THREE.Texture)?.isTexture && !seen.has(v as THREE.Texture)) { seen.add(v as THREE.Texture); texBytes += textureBytes(v as THREE.Texture); }
			});
			if (meshes) out.push({ e, tris, meshes, casters, texBytes });
		}
		return out.sort((a, b) => b.tris - a.tris);
	}

	// ------------------------------------------------------------------ overlays
	setOverlay(k: keyof Diagnostics['overlays'], on: boolean) {
		this.overlays[k] = on;
		if (k === 'colliders' && !on && this.colliderLines) { this.scene.remove(this.colliderLines); this.colliderLines.geometry.dispose(); this.colliderLines = null; }
		if (k === 'bounds') { if (on) this.scene.add(this.boundsGroup); else { this.scene.remove(this.boundsGroup); this.clearBounds(); } }
		if (k === 'frustum') {
			if (on && this.viewCamera && !this.frustum) { this.frustum = new THREE.CameraHelper(this.viewCamera); this.frustum.userData.noBullet = true; this.scene.add(this.frustum); }
			if (!on && this.frustum) { this.scene.remove(this.frustum); this.frustum.dispose(); this.frustum = null; }
		}
	}

	private clearBounds() { for (const c of [...this.boundsGroup.children]) { this.boundsGroup.remove(c); (c as THREE.Box3Helper).geometry.dispose(); } }

	private boundsTick = 0;
	private updateOverlays() {
		if (this.overlays.colliders && this.physics?.enabled) {
			const { vertices, colors } = this.physics.world.debugRender();
			if (!this.colliderLines) {
				this.colliderLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 }));
				this.colliderLines.renderOrder = 999; this.colliderLines.frustumCulled = false; this.colliderLines.name = 'diag-colliders'; this.colliderLines.userData.noBullet = true;
				this.scene.add(this.colliderLines);
			}
			const g = this.colliderLines.geometry;
			g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
			g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
		}
		if (this.overlays.bounds && this.world && ++this.boundsTick % 15 === 1) {
			this.clearBounds();
			for (const e of this.world.list) {
				if (e.deleted || !e.object.visible) continue;
				const box = new THREE.Box3().setFromObject(e.object);
				if (box.isEmpty() || box.getSize(new THREE.Vector3()).length() > 60) continue;
				const h = new THREE.Box3Helper(box, e.prop ? 0x5ad08a : e.locked ? 0x8a8f96 : 0x3d8bfd);
				h.userData.noBullet = true;
				this.boundsGroup.add(h);
			}
		}
		this.frustum?.update();
	}
}

function average(s: Sample[]): Averages {
	const ms = { input: 0, sim: 0, editor: 0, render: 0, frame: 0 } as Record<Section, number>;
	let calls = 0, tris = 0, dt = 0, worst = 0;
	for (const x of s) { for (const k of SECTIONS) ms[k] += x.ms[k]; calls += x.calls; tris += x.tris; dt += x.dt; worst = Math.max(worst, x.ms.frame); }
	const n = Math.max(1, s.length);
	for (const k of SECTIONS) ms[k] /= n;
	return { ms, calls: calls / n, tris: tris / n, fps: dt > 0 ? s.length / dt : 0, worst };
}

/** rough GPU bytes for a texture (RGBA8 + mips), from its image size */
export function textureBytes(t: THREE.Texture) {
	const img = t.image as { width?: number; height?: number } | undefined;
	if (!img?.width || !img?.height) return 0;
	return Math.round(img.width * img.height * 4 * (t.generateMipmaps !== false ? 4 / 3 : 1));
}
