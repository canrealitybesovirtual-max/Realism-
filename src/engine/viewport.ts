import * as THREE from 'three';

/**
 * The editor's viewport on the in-world monitor.
 *
 * The desktop OS draws into a 2D canvas that becomes the monitor's emissive
 * texture. Where the Studio app wants a viewport it clears its canvas to
 * transparent; the monitor's shader shows this render target wherever the
 * OS canvas is transparent. Windows and the cursor drawn over the hole are
 * opaque, so they cover it exactly as on a real desktop. Everything stays on
 * the GPU: no pixel readback, which matters on a standalone headset.
 */
export class EditorViewport {
	readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.03, 4000);
	private rt: THREE.WebGLRenderTarget;
	/** hole in OS canvas pixels (x, y from the top-left) */
	rect = { x: 0, y: 0, w: 1, h: 1 };
	/** performance.now() of the last frame the Studio drew the hole */
	shownAt = -1e9;
	// orbit camera
	target = new THREE.Vector3(0, 0.8, 0);
	yaw = 0.7; pitch = 0.45; dist = 2.4;
	private uniforms = { tViewport: { value: null as THREE.Texture | null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uOn: { value: 0 } };
	private lastRender = 0;
	/** objects never shown in the editor viewport */
	hidden = new Set<THREE.Object3D>();

	constructor(screenMaterial: THREE.MeshStandardMaterial, osW: number, osH: number, size = { w: 960, h: 540 }) {
		this.rt = new THREE.WebGLRenderTarget(size.w, size.h, { samples: 2, type: THREE.HalfFloatType });
		this.uniforms.tViewport.value = this.rt.texture;
		const u = this.uniforms;
		const prev = screenMaterial.onBeforeCompile;
		screenMaterial.onBeforeCompile = (sh, r) => {
			prev?.call(screenMaterial, sh, r);
			Object.assign(sh.uniforms, u);
			sh.fragmentShader = sh.fragmentShader
				.replace('#include <common>', '#include <common>\nuniform sampler2D tViewport; uniform vec4 uRect; uniform float uOn;')
				.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
				#ifdef USE_EMISSIVEMAP
				{
					vec4 osPx = texture2D(emissiveMap, vEmissiveMapUv);
					vec2 vp = (vEmissiveMapUv - uRect.xy) / uRect.zw;
					if (uOn > 0.5 && osPx.a < 0.5 && vp.x >= 0.0 && vp.x <= 1.0 && vp.y >= 0.0 && vp.y <= 1.0)
						totalEmissiveRadiance = emissive * texture2D(tViewport, vp).rgb;
				}
				#endif`);
		};
		const prevKey = screenMaterial.customProgramCacheKey.bind(screenMaterial);
		screenMaterial.customProgramCacheKey = () => prevKey() + '|editor-viewport';
		screenMaterial.needsUpdate = true;
		this.osW = osW; this.osH = osH;
	}
	private osW: number; private osH: number;

	get visible() { return performance.now() - this.shownAt < 400; }

	/** frame the camera on a box */
	frame(box: THREE.Box3) {
		if (box.isEmpty()) return;
		box.getCenter(this.target);
		const r = box.getSize(new THREE.Vector3()).length() / 2;
		this.dist = THREE.MathUtils.clamp(r * 2.6, 0.4, 60);
	}

	orbit(dx: number, dy: number) { this.yaw -= dx * 0.008; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.006, -1.4, 1.4); }
	zoom(f: number) { this.dist = THREE.MathUtils.clamp(this.dist * f, 0.2, 200); }

	private place() {
		const c = this.camera;
		c.position.set(
			this.target.x + this.dist * Math.cos(this.pitch) * Math.sin(this.yaw),
			this.target.y + this.dist * Math.sin(this.pitch),
			this.target.z + this.dist * Math.cos(this.pitch) * Math.cos(this.yaw),
		);
		c.lookAt(this.target);
		c.aspect = this.rect.w / Math.max(1, this.rect.h);
		c.updateProjectionMatrix();
		c.updateMatrixWorld(true);
	}

	/** a ray from a point in the hole (OS pixels relative to the hole) */
	ray(x: number, y: number) {
		this.place();
		const rc = new THREE.Raycaster();
		rc.setFromCamera(new THREE.Vector2((x / this.rect.w) * 2 - 1, -(y / this.rect.h) * 2 + 1), this.camera);
		return rc;
	}

	/** project a world point to hole pixels */
	project(p: THREE.Vector3) {
		this.place();
		const v = p.clone().project(this.camera);
		return { x: (v.x + 1) / 2 * this.rect.w, y: (1 - v.y) / 2 * this.rect.h, behind: v.z > 1 };
	}

	render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, maxHz = 30) {
		const on = this.visible;
		this.uniforms.uOn.value = on ? 1 : 0;
		if (!on) return;
		const now = performance.now();
		if (now - this.lastRender < 1000 / maxHz) return;
		this.lastRender = now;
		const r = this.rect;
		this.uniforms.uRect.value.set(r.x / this.osW, 1 - (r.y + r.h) / this.osH, r.w / this.osW, r.h / this.osH);
		this.place();
		const xr = renderer.xr.enabled, target = renderer.getRenderTarget(), auto = renderer.shadowMap.autoUpdate;
		const hiddenNow: THREE.Object3D[] = [];
		for (const o of this.hidden) if (o.visible) { o.visible = false; hiddenNow.push(o); }
		renderer.xr.enabled = false;
		renderer.shadowMap.autoUpdate = false;
		renderer.setRenderTarget(this.rt);
		renderer.render(scene, this.camera);
		renderer.setRenderTarget(target);
		renderer.xr.enabled = xr;
		renderer.shadowMap.autoUpdate = auto;
		for (const o of hiddenNow) o.visible = true;
	}
}
