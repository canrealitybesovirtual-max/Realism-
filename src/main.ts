import * as THREE from 'three';
import { createMaterials, setMaxAnisotropy, texturesLoaded } from './world/materials';
import { PlanarAOBaker } from './render/aoBake';
import { buildRoom } from './world/room';
import { createLights, loadExterior, RoomProbe } from './world/lighting';
import { applyBoxProjection } from './render/boxProjection';
import { VIEWS } from './views';
import { buildWorkstation, type Workstation } from './world/workstation';

const params = new URLSearchParams(location.search);
const quality = (params.get('q') as 'high' | 'xr') ?? 'high';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = params.get('tm') === 'agx' ? THREE.AgXToneMapping : params.get('tm') === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
renderer.toneMappingExposure = Number(params.get('exp') ?? 1.05);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 200);
camera.position.set(1.4, 1.62, 1.9);
camera.lookAt(-0.3, 1.0, -1.8);

const M = createMaterials();
const room = buildRoom(M);
scene.add(room.group);
const lights = createLights(scene, quality);

function setView(name: string) {
	const v = VIEWS[name];
	if (!v) throw new Error('unknown view ' + name);
	camera.position.fromArray(v.pos);
	camera.fov = v.fov ?? 70;
	camera.updateProjectionMatrix();
	camera.lookAt(new THREE.Vector3().fromArray(v.target));
}

// Placeholder until the computer module drives the screen
const screenCanvas = document.createElement('canvas');
screenCanvas.width = 1920; screenCanvas.height = 1080;
{
	const c = screenCanvas.getContext('2d')!;
	const gr = c.createLinearGradient(0, 0, 1920, 1080);
	gr.addColorStop(0, '#1d2b3a'); gr.addColorStop(1, '#5d6f7e');
	c.fillStyle = gr; c.fillRect(0, 0, 1920, 1080);
}
const screenTexture = new THREE.CanvasTexture(screenCanvas);
screenTexture.colorSpace = THREE.SRGBColorSpace;

let ws: Workstation;

async function init() {
	const [{ sky }, w] = await Promise.all([
		loadExterior(scene, '/env/spruit_sunrise_4k.hdr.jpg'),
		buildWorkstation(M, scene, screenTexture),
	]);
	ws = w;
	scene.traverse((o) => {
		const m = (o as THREE.Mesh).material;
		if (m) (Array.isArray(m) ? m : [m]).forEach(applyBoxProjection);
	});
	await texturesLoaded();
	if (!params.has('noao')) bakeAO(sky);
	const probe = new RoomProbe(renderer, 256);
	probe.capture(scene, 3, [], (i) => { lights.bounce.visible = i === 0; });
	lights.bounce.visible = false;
	document.getElementById('loading')!.remove();
	(window as any).__studio.ready = true;
}

/** Bake contact/ambient occlusion for the big planar surfaces. */
function bakeAO(sky: THREE.Object3D) {
	const t0 = performance.now();
	const baker = new PlanarAOBaker(renderer, quality === 'high' ? 1024 : 768);
	const hidden = [sky, scene.getObjectByName('glazing')!.getObjectByName('window-glass')!];
	hidden.forEach((o) => (o.visible = false));
	for (const { receiver, mesh } of [...room.baked, ...ws.baked]) {
		// floor: large radius so the desk and chair darken what is beneath them
		const radius = receiver.name === 'floor' ? 1.4 : receiver.name === 'desk-top' ? 0.45 : 1.0;
		const ao = baker.bake(receiver, scene, quality === 'high' ? 96 : 48, radius);
		ao.channel = 1;
		const mat = mesh.material as THREE.MeshStandardMaterial;
		mat.aoMap = ao;
		mat.aoMapIntensity = 1;
		mat.needsUpdate = true;
	}
	hidden.forEach((o) => (o.visible = true));
	baker.dispose();
	console.log(`AO bake ${(performance.now() - t0).toFixed(0)} ms`);
}

(window as any).__studio = { ready: false, setView, renderer, scene, camera };
if (params.get('view')) setView(params.get('view')!);

addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
});

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
	timer.update();
	const dt = Math.min(timer.getDelta(), 0.05);
	if (ws) { ws.updateClock(); ws.keyboard.update(dt); }
	renderer.render(scene, camera);
});

init().catch((e) => { console.error(e); document.getElementById('loading')!.textContent = 'Error: ' + e.message; });
