import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * GPU ambient-occlusion bake for large planar receivers (floor, walls,
 * ceiling, desk top).
 *
 * For each of N cosine-distributed directions over the receiver's hemisphere
 * we render an orthographic depth map of the scene looking *away* from the
 * receiver, with a clip plane that removes everything behind the receiver.
 * Every texel of the receiver then knows the distance to the first surface
 * along that direction; anything closer than `radius` occludes it. Averaging
 * gives an ambient-occlusion texture with real contact shadows under chair
 * legs, desk, PC and in room corners, at zero per-frame cost - essential for
 * VR where screen-space AO is not affordable.
 */

export interface AOReceiver {
	name: string;
	origin: THREE.Vector3; // corner of the rect (uv 0,0)
	u: THREE.Vector3; // unit vector along uv.x
	v: THREE.Vector3; // unit vector along uv.y
	sizeU: number;
	sizeV: number;
	res: [number, number];
}

export function receiverNormal(r: AOReceiver): THREE.Vector3 {
	return new THREE.Vector3().crossVectors(r.u, r.v).normalize();
}

/** uv1 for a geometry so that it samples the receiver's AO map. */
export function setReceiverUV1(geo: THREE.BufferGeometry, r: AOReceiver, matrixWorld?: THREE.Matrix4) {
	const pos = geo.getAttribute('position');
	const uv1 = new Float32Array(pos.count * 2);
	const p = new THREE.Vector3();
	const halfU = 0.5 / r.res[0], halfV = 0.5 / r.res[1];
	for (let i = 0; i < pos.count; i++) {
		p.fromBufferAttribute(pos, i);
		if (matrixWorld) p.applyMatrix4(matrixWorld);
		p.sub(r.origin);
		uv1[i * 2] = THREE.MathUtils.clamp(p.dot(r.u) / r.sizeU, halfU, 1 - halfU);
		uv1[i * 2 + 1] = THREE.MathUtils.clamp(p.dot(r.v) / r.sizeV, halfV, 1 - halfV);
	}
	geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
}

const accumShader = {
	uniforms: {
		uDepth: { value: null as THREE.Texture | null },
		uViewProj: { value: new THREE.Matrix4() },
		uOrigin: { value: new THREE.Vector3() },
		uU: { value: new THREE.Vector3() },
		uV: { value: new THREE.Vector3() },
		uN: { value: new THREE.Vector3() },
		uSize: { value: new THREE.Vector2() },
		uNear: { value: 0 },
		uFar: { value: 1 },
		uRadius: { value: 1 },
		uWeight: { value: 1 },
	},
	vertexShader: /* glsl */`
		varying vec2 vUv;
		void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
	`,
	fragmentShader: /* glsl */`
		uniform sampler2D uDepth;
		uniform mat4 uViewProj;
		uniform vec3 uOrigin, uU, uV, uN;
		uniform vec2 uSize;
		uniform float uNear, uFar, uRadius, uWeight;
		varying vec2 vUv;
		void main() {
			vec3 P = uOrigin + uU * ( vUv.x * uSize.x ) + uV * ( vUv.y * uSize.y ) + uN * 0.002;
			vec4 c = uViewProj * vec4( P, 1.0 );
			vec3 ndc = c.xyz / c.w;
			vec2 suv = ndc.xy * 0.5 + 0.5;
			float dRec = ( ndc.z * 0.5 + 0.5 ) * ( uFar - uNear ) + uNear;
			float s = texture2D( uDepth, suv ).x;
			float dHit = s * ( uFar - uNear ) + uNear;
			float t = dHit - dRec;
			// distance-weighted occlusion: near occluders count fully, far ones fade out
			float occ = ( s < 0.99999 && t > 0.0 ) ? 1.0 - smoothstep( uRadius * 0.25, uRadius, t ) : 0.0;
			gl_FragColor = vec4( vec3( ( 1.0 - occ ) * uWeight ), 1.0 );
		}
	`,
};

export class PlanarAOBaker {
	private depthRT: THREE.WebGLRenderTarget;
	private cam = new THREE.OrthographicCamera();
	private depthMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false });
	private quad: FullScreenQuad;
	private accumMat: THREE.ShaderMaterial;

	constructor(private renderer: THREE.WebGLRenderer, depthRes = 1024) {
		this.depthRT = new THREE.WebGLRenderTarget(depthRes, depthRes, {
			depthTexture: new THREE.DepthTexture(depthRes, depthRes, THREE.FloatType),
			depthBuffer: true,
		});
		this.depthRT.depthTexture!.minFilter = this.depthRT.depthTexture!.magFilter = THREE.NearestFilter;
		this.accumMat = new THREE.ShaderMaterial({
			...accumShader,
			uniforms: THREE.UniformsUtils.clone(accumShader.uniforms),
			blending: THREE.AdditiveBlending,
			depthTest: false,
			depthWrite: false,
		});
		this.quad = new FullScreenQuad(this.accumMat);
	}

	/**
	 * Bake one receiver. `occluders` is rendered as-is (callers hide the sky,
	 * glass etc. beforehand). Returns a texture usable as an aoMap on uv1.
	 */
	bake(r: AOReceiver, occluders: THREE.Object3D, samples = 64, radius = 0.9): THREE.Texture {
		const R = this.renderer;
		const N = receiverNormal(r);
		const out = new THREE.WebGLRenderTarget(r.res[0], r.res[1], { type: THREE.HalfFloatType, depthBuffer: false });
		out.texture.name = 'ao-' + r.name;
		const prev = {
			rt: R.getRenderTarget(), clip: R.clippingPlanes, xr: R.xr.enabled, auto: R.autoClear,
			override: (occluders as THREE.Scene).overrideMaterial, clearColor: R.getClearColor(new THREE.Color()), clearAlpha: R.getClearAlpha(),
			shadow: R.shadowMap.autoUpdate,
		};
		R.xr.enabled = false;
		R.autoClear = false; // we accumulate across passes
		R.shadowMap.autoUpdate = false;
		R.setClearColor(0x000000, 0);
		R.setRenderTarget(out);
		R.clear(true, false, false);

		const corners = [0, 1].flatMap((a) => [0, 1].map((b) =>
			r.origin.clone().addScaledVector(r.u, a * r.sizeU).addScaledVector(r.v, b * r.sizeV)));
		// keep only geometry in front of the receiver
		const clip = new THREE.Plane().setFromNormalAndCoplanarPoint(N, r.origin.clone().addScaledVector(N, 0.001));
		const isScene = (occluders as THREE.Scene).isScene;

		const u = this.accumMat.uniforms;
		u.uOrigin.value.copy(r.origin); u.uU.value.copy(r.u); u.uV.value.copy(r.v); u.uN.value.copy(N);
		u.uSize.value.set(r.sizeU, r.sizeV);
		u.uRadius.value = radius;
		u.uWeight.value = 1 / samples;
		u.uDepth.value = this.depthRT.depthTexture;

		const dir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
		for (let i = 0; i < samples; i++) {
			// Hammersley point -> cosine-weighted hemisphere direction
			const e1 = (i + 0.5) / samples;
			const e2 = radicalInverse(i);
			const rr = Math.sqrt(e1), phi = 2 * Math.PI * e2;
			dir.copy(r.u).multiplyScalar(rr * Math.cos(phi))
				.addScaledVector(r.v, rr * Math.sin(phi))
				.addScaledVector(N, Math.sqrt(Math.max(0, 1 - e1))).normalize();
			// camera basis
			const helper = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
			right.crossVectors(dir, helper).normalize();
			up.crossVectors(right, dir).normalize();
			let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity, cMin = Infinity, cMax = -Infinity;
			for (const c of corners) {
				const a = c.dot(right), b = c.dot(up), cc = c.dot(dir);
				aMin = Math.min(aMin, a); aMax = Math.max(aMax, a);
				bMin = Math.min(bMin, b); bMax = Math.max(bMax, b);
				cMin = Math.min(cMin, cc); cMax = Math.max(cMax, cc);
			}
			const m = 0.02;
			const cam = this.cam;
			cam.left = -(aMax - aMin) / 2 - m; cam.right = (aMax - aMin) / 2 + m;
			cam.bottom = -(bMax - bMin) / 2 - m; cam.top = (bMax - bMin) / 2 + m;
			cam.near = 0; cam.far = cMax - cMin + 0.02 + radius;
			cam.position.copy(right).multiplyScalar((aMin + aMax) / 2)
				.addScaledVector(up, (bMin + bMax) / 2)
				.addScaledVector(dir, cMin - 0.01);
			cam.up.copy(up);
			cam.lookAt(cam.position.clone().add(dir));
			cam.updateProjectionMatrix();
			cam.updateMatrixWorld(true);

			// depth pass
			R.setRenderTarget(this.depthRT);
			R.clippingPlanes = [clip];
			if (isScene) (occluders as THREE.Scene).overrideMaterial = this.depthMat;
			R.clear(true, true, false);
			R.render(occluders, cam);
			if (isScene) (occluders as THREE.Scene).overrideMaterial = prev.override;
			R.clippingPlanes = [];

			// accumulate
			u.uViewProj.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
			u.uNear.value = cam.near; u.uFar.value = cam.far;
			R.setRenderTarget(out);
			this.quad.render(R);
		}

		R.setRenderTarget(prev.rt);
		R.clippingPlanes = prev.clip;
		R.xr.enabled = prev.xr;
		R.autoClear = prev.auto;
		R.shadowMap.autoUpdate = prev.shadow;
		R.setClearColor(prev.clearColor, prev.clearAlpha);
		out.texture.generateMipmaps = false;
		out.texture.minFilter = THREE.LinearFilter;
		return out.texture;
	}

	dispose() { this.depthRT.dispose(); this.quad.dispose(); this.accumMat.dispose(); this.depthMat.dispose(); }
}

function radicalInverse(i: number): number {
	let bits = i >>> 0;
	bits = ((bits << 16) | (bits >>> 16)) >>> 0;
	bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
	bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
	bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
	bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
	return bits / 4294967296;
}
