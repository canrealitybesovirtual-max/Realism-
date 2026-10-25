import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { createMaterials, setMaxAnisotropy, texturesLoaded } from './world/materials';
import { PlanarAOBaker } from './render/aoBake';
import { buildRoom } from './world/room';
import { createLights, loadExterior, RoomProbe } from './world/lighting';
import { applyBoxProjection } from './render/boxProjection';
import { ContactShadows } from './render/contactShadows';
import { VIEWS } from './views';
import { buildWorkstation, type Workstation } from './world/workstation';
import { Computer } from './computer/computer';
import { Physics, initPhysics } from './physics/physics';
import { mugDesc, notebookDesc, penDesc, pistolDesc } from './physics/propDefs';
import { Pistol } from './world/pistol';
import { PistolSystem } from './world/pistolSystem';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DesktopControls } from './interaction/desktop';
import { XRControls } from './interaction/xr';
import { Walkable, DeskMouse, PointerOwner, type InteractionTargets } from './interaction/shared';
import { DESK, ROOM } from './config';
import { KEY_INDEX } from './computer/keyLayout';

const params = new URLSearchParams(location.search);
if (params.has('emulate')) (await import('./dev/emulator')).installEmulator();
// standalone headsets (Quest browser etc.) get the lighter tier: 2K shadow map, fewer AO samples
const isStandaloneHMD = /OculusBrowser|Quest|Pico|Wolvic/i.test(navigator.userAgent);
const quality = (params.get('q') as 'high' | 'xr') ?? (isStandaloneHMD ? 'xr' : 'high');

// ---------------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = params.get('tm') === 'agx' ? THREE.AgXToneMapping : params.get('tm') === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
renderer.toneMappingExposure = Number(params.get('exp') ?? 1.05);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.5);
document.body.appendChild(renderer.domElement);
setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 200);
camera.position.set(1.75, 1.62, 1.55);
camera.lookAt(-0.6, 1.05, -1.6);
scene.add(camera);

// ---------------------------------------------------------------------- world
const M = createMaterials();
const room = buildRoom(M);
scene.add(room.group);
const lights = createLights(scene, quality);
const computer = new Computer();

let ws: Workstation;
let physics: Physics;
let desktop: DesktopControls | null = null;
let xr: XRControls | null = null;
let shadows: ContactShadows;
let shadowsDirty = true;
let gun: PistolSystem | undefined;

function setView(name: string) {
	const v = VIEWS[name];
	if (!v) throw new Error('unknown view ' + name);
	if (desktop) desktop.enabled = false; // fixed inspection view
	camera.position.fromArray(v.pos);
	camera.fov = v.fov ?? 70;
	camera.updateProjectionMatrix();
	camera.lookAt(new THREE.Vector3().fromArray(v.target));
}

async function init() {
	const [{ sky, hdr }, w, pistol] = await Promise.all([
		loadExterior(scene, 'env/spruit_sunrise_4k.hdr.jpg'),
		buildWorkstation(M, scene, computer.texture),
		Pistol.load(new GLTFLoader()),
		initPhysics(),
	]);
	ws = w;
	// the pistol lies on its side on the sideboard, muzzle toward the window
	pistol.group.position.set(ROOM.width / 2 - 0.02 - 0.2, 0.662 + 0.016, -0.32);
	pistol.group.rotation.set(0, 0.35, Math.PI / 2);
	scene.add(pistol.group);
	// exterior surfaces take their image-based light from the sky, not the room
	{
		const pm = new THREE.PMREMGenerator(renderer);
		const outdoor = pm.fromEquirectangular(hdr).texture;
		pm.dispose();
		const terrace = scene.getObjectByName('terrace') as THREE.Mesh;
		const tm = terrace.material as THREE.MeshPhysicalMaterial;
		tm.envMap = outdoor;
		tm.envMapRotation.set(0, sky.rotation.y, 0);
		tm.envMapIntensity = 0.9;
	}
	scene.traverse((o) => {
		const m = (o as THREE.Mesh).material;
		if (m) (Array.isArray(m) ? m : [m]).forEach(applyBoxProjection);
	});
	await texturesLoaded();
	// movable things must not leave baked shadows behind when moved
	const movable = [ws.mug.group, ws.notebook.group, ws.pen.group, ws.mouse.group, pistol.group];
	if (!params.has('noao')) bakeAO([sky, scene.getObjectByName('window-glass')!, ...movable]);
	const probe = new RoomProbe(renderer, 256);
	probe.capture(scene, 3, [], (i) => { lights.bounce.visible = i === 0; });
	lights.bounce.visible = false;

	// physics
	physics = new Physics();
	for (const c of [...room.colliders, ...ws.colliders]) physics.addStatic(c);
	shadows = new ContactShadows(scene, physics);
	if (physics.enabled) {
		const props = [physics.addProp(mugDesc(ws.mug.group)), physics.addProp(notebookDesc(ws.notebook.group)), physics.addProp(penDesc(ws.pen.group))];
		shadows.add(props[0], 0.05);
		shadows.add(props[1], 0.09, 0.75);
		shadows.add(props[2], 0.012, 6);
		const pistolProp = physics.addProp(pistolDesc(pistol.group));
		shadows.add(pistolProp, 0.05, 2);
		gun = new PistolSystem(pistol, pistolProp, scene, camera, physics);
	}

	// interaction
	const targets: InteractionTargets = {
		screen: ws.monitor.screen,
		keycaps: ws.keyboard.caps,
		computer,
		gun,
		mouse: new DeskMouse(ws.mouse.group, new THREE.Vector3(DESK.centerX + 0.12, DESK.height, DESK.centerZ + DESK.depth / 2 - 0.19), new THREE.Vector2(0.4, 0.16)),
	};
	computer.onKeyVisual = (i, down) => ws.keyboard.setKey(i, down);
	computer.os.stats = statsProvider;
	const walk = new Walkable([...room.colliders, ...ws.colliders]);
	const owner = new PointerOwner();
	desktop = new DesktopControls(camera, renderer.domElement, physics, targets, walk, owner);
	xr = new XRControls(renderer, scene, camera, physics, targets, walk, owner);
	// bullets ignore the pointer dots and the comfort vignette
	if (gun) scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.name && (o.parent === scene || o.parent === camera)) gun!.effects.ignore.add(o); });
	if (params.get('view')) setView(params.get('view')!);
	if (params.has('handpreview')) {
		if (desktop) desktop.enabled = false;
		(await import('./dev/handPreview')).addHandPreview(scene, camera, params.get('handpreview') || 'all');
	}

	// only offer VR when a headset runtime can actually start a session
	const vrOk = 'xr' in navigator && await navigator.xr!.isSessionSupported('immersive-vr').catch(() => false);
	if (vrOk) {
		document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));
	} else if ('xr' in navigator && window.self !== window.top) {
		// Embedded pages (e.g. a Claude artifact) only get the headset if the
		// host frame grants xr-spatial-tracking. Offer the same page on its own.
		const a = document.createElement('a');
		a.id = 'vr-elsewhere';
		a.href = location.href;
		a.target = '_blank';
		a.rel = 'noopener';
		a.textContent = 'VR is blocked in this embedded view. Open the room in its own tab';
		document.body.appendChild(a);
	}
	document.getElementById('loading')!.remove();
	(window as any).__studio.ready = true;
	// handles for the automated browser checks (scripts/e2e.mjs) and debugging
	Object.assign((window as any).__studio, { physics, computer, ws, desktop, xr, targets, gun, THREE, KEY_INDEX });
}

/** Bake contact/ambient occlusion for the big planar surfaces. */
function bakeAO(hide: THREE.Object3D[]) {
	const t0 = performance.now();
	const baker = new PlanarAOBaker(renderer, quality === 'high' ? 1024 : 768);
	hide.forEach((o) => (o.visible = false));
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
	hide.forEach((o) => (o.visible = true));
	baker.dispose();
	console.log(`AO bake ${(performance.now() - t0).toFixed(0)} ms`);
}

// ---------------------------------------------------------------------- stats
let fps = 0, frames = 0, fpsT = performance.now();
const glInfo = (() => {
	const gl = renderer.getContext();
	const ext = gl.getExtension('WEBGL_debug_renderer_info');
	return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'WebGL2';
})();
function statsProvider(): Record<string, string> {
	const s = renderer.xr.getSession?.();
	return {
		'Display': renderer.xr.isPresenting ? 'Headset (WebXR)' : 'Desktop browser',
		'Frame rate': `${fps.toFixed(0)} fps`,
		'Draw calls': String(renderer.info.render.calls),
		'Triangles': renderer.info.render.triangles.toLocaleString(),
		'GPU': glInfo.length > 40 ? glInfo.slice(0, 40) + '…' : glInfo,
		'Physics bodies': physics?.enabled === false ? 'unavailable (WebAssembly blocked)' : String(physics?.props.length ?? 0) + ' dynamic',
		'XR session': s ? (s.visibilityState ?? 'active') : 'none',
		'Clock': new Date().toLocaleTimeString(),
	};
}

(window as any).__studio = { ready: false, setView, renderer, scene, camera };

addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------- frame loop
renderer.shadowMap.autoUpdate = false;
const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
	timer.update();
	const dt = Math.min(timer.getDelta(), 0.05);
	const now = t ?? performance.now();
	frames++;
	if (now - fpsT > 1000) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
	if (ws && physics) {
		if (renderer.xr.isPresenting) xr?.update(dt, now); else desktop?.update(dt);
		physics.step(dt);
		gun?.update(dt);
		shadows.update();
		ws.updateClock();
		ws.keyboard.update(dt);
		computer.update(now);
		// the sun's shadow map only needs re-rendering when something moves
		const awake = physics.props.some((p) => !p.body.isSleeping()) || !!gun?.effects.active; // empty when physics is unavailable
		if (awake || shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = awake; }
	} else {
		renderer.shadowMap.needsUpdate = true;
	}
	renderer.render(scene, camera);
});

init().catch((e) => { console.error(e); document.getElementById('loading')!.textContent = 'Error: ' + e.message; });
