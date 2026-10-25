import * as THREE from 'three';

/**
 * Rifle scope that really magnifies: a camera at the objective renders the
 * view along the bore into a render target, shown on a disc at the eyepiece.
 *
 * - Magnification M: the eyepiece shows the scene at fov = APPARENT / M,
 *   where APPARENT is the angle the lens disc covers at the right eye
 *   relief, so things look M times larger than to the naked eye.
 * - Reticle (first focal plane): mil-dots drawn in true angle, so the dots
 *   are 1 milliradian apart at every zoom and work for holdover / ranging.
 * - Eye box: the clear picture shrinks and slides away (a dark crescent, the
 *   "scope shadow") when the eye is off the axis or too close / far.
 * The view is only rendered while an eye is near the eyepiece.
 */
export class Scope {
	readonly camera: THREE.PerspectiveCamera;
	readonly lens: THREE.Mesh;
	private rt: THREE.WebGLRenderTarget;
	private uniforms: Record<string, THREE.IUniform>;
	magnification: number;
	/** angle the eyepiece disc covers at the design eye relief */
	private apparent: number;
	private eyeRelief = 0.085;
	active = false;

	constructor(readonly gun: THREE.Object3D, eyepiece: THREE.Vector3, objective: THREE.Vector3, readonly radius: number, readonly minMag: number, readonly maxMag: number) {
		this.magnification = Math.min(maxMag, Math.max(minMag, 10));
		this.apparent = 2 * Math.atan(radius / this.eyeRelief);
		this.rt = new THREE.WebGLRenderTarget(512, 512, { samples: 2, type: THREE.HalfFloatType });
		this.camera = new THREE.PerspectiveCamera(this.fovDeg(), 1, 0.2, 4000);
		this.camera.position.copy(objective);
		gun.add(this.camera);
		this.uniforms = {
			tScene: { value: this.rt.texture },
			uEye: { value: new THREE.Vector3(0, 0, this.eyeRelief) },
			uRelief: { value: this.eyeRelief },
			uMil: { value: 0 },
			uLive: { value: 0 },
		};
		const mat = new THREE.ShaderMaterial({
			uniforms: this.uniforms,
			vertexShader: /* glsl */`
				varying vec2 vUv;
				void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: /* glsl */`
				uniform sampler2D tScene; uniform vec3 uEye; uniform float uRelief, uMil, uLive;
				varying vec2 vUv;
				float line(float d, float w) { return 1.0 - smoothstep(w * 0.6, w, abs(d)); }
				void main() {
					vec2 p = vUv * 2.0 - 1.0;
					float r = length(p);
					vec3 col = uLive > 0.5 ? texture2D(tScene, vUv).rgb : vec3(0.015, 0.02, 0.03);
					// eye box: lateral offset (per unit of eye distance) slides the exit
					// pupil, wrong eye relief shrinks it
					vec2 off = uEye.xy / max(uEye.z, 0.02) * 3.2;
					float rel = clamp(abs(uEye.z - uRelief) / uRelief, 0.0, 1.0);
					float clearR = mix(1.0, 0.25, rel);
					float clear = 1.0 - smoothstep(clearR * 0.82, clearR, length(p - off));
					// mil-dot reticle (first focal plane: uMil = one milliradian in lens units)
					float w = 0.0035;
					float thick = (abs(p.x) > 10.0 * uMil || abs(p.y) > 10.0 * uMil) ? 3.5 : 1.0;
					float ret = max(line(p.y, w * (abs(p.x) > 10.0 * uMil ? 3.5 : 1.0)), line(p.x, w * (abs(p.y) > 10.0 * uMil ? 3.5 : 1.0)));
					ret *= 1.0 - step(0.0, -1.0) * thick * 0.0;
					// gap in the centre so the target shows
					ret *= smoothstep(0.35 * uMil, 0.5 * uMil, max(abs(p.x), abs(p.y)));
					for (int i = 1; i <= 10; i++) {
						float m = float(i) * uMil;
						ret = max(ret, 1.0 - smoothstep(w * 1.6, w * 2.4, length(vec2(abs(p.x) - m, p.y))));
						ret = max(ret, 1.0 - smoothstep(w * 1.6, w * 2.4, length(vec2(p.x, abs(p.y) - m))));
					}
					col = mix(col, vec3(0.005), ret);
					col *= clear;
					col *= 1.0 - smoothstep(0.93, 1.0, r);
					if (r > 1.0) col = vec3(0.0);
					gl_FragColor = vec4(col, 1.0);
					#include <tonemapping_fragment>
					#include <colorspace_fragment>
				}`,
		});
		this.lens = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat);
		this.lens.name = 'scope-lens';
		this.lens.userData.noBullet = true;
		// a hair behind the eyepiece glass, facing the shooter (+Z)
		this.lens.position.copy(eyepiece).add(new THREE.Vector3(0, 0, 0.0015));
		gun.add(this.lens);
		this.setMagnification(this.magnification);
	}

	private fovDeg() { return THREE.MathUtils.radToDeg(this.apparent / this.magnification); }

	setMagnification(m: number) {
		this.magnification = THREE.MathUtils.clamp(m, this.minMag, this.maxMag);
		this.camera.fov = this.fovDeg();
		this.camera.updateProjectionMatrix();
		// lens radius (1.0) spans half the field of view
		this.uniforms.uMil.value = 0.001 / (THREE.MathUtils.degToRad(this.camera.fov) / 2);
	}

	/**
	 * Render the scope picture if an eye is close behind the eyepiece. Call
	 * before the main render. `hide` is kept out of the scope view (the gun).
	 */
	render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, eyeWorld: THREE.Vector3) {
		this.lens.updateMatrixWorld(true);
		const eye = this.lens.worldToLocal(eyeWorld.clone());
		(this.uniforms.uEye.value as THREE.Vector3).copy(eye);
		this.active = eye.z > 0.005 && eye.z < 0.45 && Math.hypot(eye.x, eye.y) < 0.06;
		this.uniforms.uLive.value = this.active ? 1 : 0;
		if (!this.active) return;
		const xr = renderer.xr.enabled, target = renderer.getRenderTarget(), shadow = renderer.shadowMap.autoUpdate;
		renderer.xr.enabled = false; // an ordinary camera, not the headset's
		renderer.shadowMap.autoUpdate = false;
		this.lens.visible = false;
		renderer.setRenderTarget(this.rt);
		renderer.render(scene, this.camera);
		renderer.setRenderTarget(target);
		this.lens.visible = true;
		renderer.xr.enabled = xr;
		renderer.shadowMap.autoUpdate = shadow;
	}
}
