import * as THREE from 'three';
import { UltraHDRLoader } from 'three/examples/jsm/loaders/UltraHDRLoader.js';
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { ROOM, WINDOW, SUN } from '../config';
import { setProbeBox, setSunPortal } from '../render/boxProjection';

export function sunDirection(): THREE.Vector3 {
	const az = THREE.MathUtils.degToRad(SUN.azimuthDeg);
	const el = THREE.MathUtils.degToRad(SUN.elevationDeg);
	return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
}

/**
 * Exterior: the CC0 Poly Haven "Spruit Sunrise" HDRI projected onto a
 * grounded sky dome, rotated so its sun lines up with our sun light.
 */
export async function loadExterior(scene: THREE.Scene, url: string): Promise<{ sky: THREE.Mesh; hdr: THREE.Texture }> {
	const loader = new UltraHDRLoader();
	loader.setDataType(THREE.HalfFloatType);
	const hdr = await loader.loadAsync(url);
	hdr.mapping = THREE.EquirectangularReflectionMapping;
	hdr.colorSpace = THREE.LinearSRGBColorSpace;
	hdr.minFilter = THREE.LinearFilter;
	hdr.generateMipmaps = false;

	// find the sun in the image (brightest texel) to align the dome
	const sunU = findSunU(hdr);
	const height = 1.5; // camera height of the HDRI capture, roughly
	const sky = new GroundedSkybox(hdr, height, 80, 64);
	sky.name = 'sky';
	// SphereGeometry maps u -> direction (-cos 2πu, ., +sin 2πu), then z is flipped by the
	// GroundedSkybox (scale z = -1): (-cos, ., -sin).
	const phi = sunU * Math.PI * 2;
	const src = Math.atan2(-Math.sin(phi), -Math.cos(phi));
	const d = sunDirection();
	const dst = Math.atan2(d.z, d.x);
	sky.rotation.y = src - dst;
	// centre under the glazing, ground plane at y = -0.05 (top of terrace minus a little)
	sky.position.set(-ROOM.width / 2 - 2, height - 0.07, 0);
	(sky.material as THREE.MeshBasicMaterial).toneMapped = true;
	sky.renderOrder = -1;
	scene.add(sky);
	return { sky, hdr };
}

function findSunU(tex: THREE.Texture): number {
	const img = tex.image as { data: Uint16Array; width: number; height: number };
	const { data, width, height } = img;
	let best = -1, bu = 0.5;
	// sample the upper half only, coarse stride
	for (let y = 0; y < height / 2; y += 2) for (let x = 0; x < width; x += 2) {
		const i = (y * width + x) * 4;
		const l = THREE.DataUtils.fromHalfFloat(data[i]) + THREE.DataUtils.fromHalfFloat(data[i + 1]);
		if (l > best) { best = l; bu = x / width; }
	}
	return bu;
}

export interface Lights {
	sun: THREE.DirectionalLight;
	skyWindow: THREE.RectAreaLight;
	bounce: THREE.HemisphereLight;
}

export function createLights(scene: THREE.Scene, quality: 'high' | 'xr'): Lights {
	RectAreaLightUniformsLib.init();

	// Sun: crisp shadow with a small penumbra (sun disc ~0.5 deg)
	const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity);
	sun.name = 'sun';
	const dir = sunDirection();
	const focus = new THREE.Vector3(0, 0.8, 0);
	sun.position.copy(focus).addScaledVector(dir, 12);
	sun.target.position.copy(focus);
	sun.castShadow = true;
	const s = quality === 'high' ? 4096 : 2048; // one static-ish map, re-rendered only when props move
	sun.shadow.mapSize.set(s, s);
	const cam = sun.shadow.camera as THREE.OrthographicCamera;
	cam.left = -4.2; cam.right = 4.2; cam.top = 4.2; cam.bottom = -4.2;
	cam.near = 4; cam.far = 22;
	sun.shadow.bias = -0.0001;
	sun.shadow.normalBias = 0.01;
	sun.shadow.radius = 2.5;
	scene.add(sun, sun.target);
	setSunPortal(dir, -ROOM.width / 2, -ROOM.width / 2 - ROOM.wallThickness, WINDOW.zMin, WINDOW.zMax, WINDOW.sill, WINDOW.head);

	// Skylight entering through the glazing: an area light filling the opening.
	const zMid = (WINDOW.zMin + WINDOW.zMax) / 2;
	const w = WINDOW.zMax - WINDOW.zMin, h = WINDOW.head - WINDOW.sill;
	const skyWindow = new THREE.RectAreaLight(0xdfe9ff, 3.2, w, h);
	skyWindow.name = 'window-sky';
	skyWindow.position.set(-ROOM.width / 2 - 0.02, WINDOW.sill + h / 2, zMid);
	skyWindow.lookAt(skyWindow.position.x + 1, skyWindow.position.y, zMid);
	scene.add(skyWindow);

	// A very weak hemisphere fill only used while the probe has not been
	// captured yet (first bounce). Disabled after probe capture.
	const bounce = new THREE.HemisphereLight(0xffffff, 0x9a958f, 0.6);
	bounce.name = 'pre-probe-fill';
	scene.add(bounce);

	return { sun, skyWindow, bounce };
}

/**
 * Interior reflection probe with multi-bounce approximation.
 *
 * Renders a cube map of the lit room from the middle of the room, convolves
 * it with PMREM and assigns it as scene.environment. Repeating the capture
 * with the previous result as the environment approximates additional
 * bounces of indirect light from the white walls and pale floor.
 */
export class RoomProbe {
	readonly position = new THREE.Vector3(0.0, 1.25, 0.0);
	private cubeRT: THREE.WebGLCubeRenderTarget;
	private cubeCam: THREE.CubeCamera;
	private pmrem: THREE.PMREMGenerator;
	private envRT: THREE.WebGLRenderTarget | null = null;

	constructor(private renderer: THREE.WebGLRenderer, size = 256) {
		this.cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
		this.cubeCam = new THREE.CubeCamera(0.03, 60, this.cubeRT);
		this.cubeCam.position.copy(this.position);
		this.pmrem = new THREE.PMREMGenerator(renderer);
		const min = new THREE.Vector3(-ROOM.width / 2, 0, -ROOM.depth / 2);
		const max = new THREE.Vector3(ROOM.width / 2, ROOM.height, ROOM.depth / 2);
		setProbeBox(min, max, this.position);
	}

	capture(scene: THREE.Scene, bounces: number, hide: THREE.Object3D[] = [], onBeforeBounce?: (i: number) => void) {
		const prevVis = hide.map((o) => o.visible);
		hide.forEach((o) => (o.visible = false));
		const tm = this.renderer.toneMapping;
		this.renderer.toneMapping = THREE.NoToneMapping; // capture linear radiance
		const xr = this.renderer.xr.enabled;
		this.renderer.xr.enabled = false;
		for (let i = 0; i < bounces; i++) {
			onBeforeBounce?.(i);
			this.cubeCam.update(this.renderer, scene);
			const next = this.pmrem.fromCubemap(this.cubeRT.texture);
			scene.environment = next.texture;
			this.envRT?.dispose();
			this.envRT = next;
		}
		this.renderer.xr.enabled = xr;
		this.renderer.toneMapping = tm;
		hide.forEach((o, i) => (o.visible = prevVis[i]));
	}
}
