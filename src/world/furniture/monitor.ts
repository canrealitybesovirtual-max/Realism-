import * as THREE from 'three';
import { beveledPanel, roundedBox, merge } from '../../util/geometry';
import type { Materials } from '../materials';

/**
 * 27" 16:9 IPS monitor (active area 596.7 x 335.7 mm) with 7 mm bezels,
 * 16 mm chin, slim rear housing, and a machined aluminium stand.
 *
 * Local frame: origin at the bottom centre of the stand base, screen facing +Z.
 */
export const MONITOR = {
	activeW: 0.5967,
	activeH: 0.3357,
	bezel: 0.007,
	chin: 0.016,
	panelDepth: 0.011,
	tiltDeg: 6,
	// screen centre height above the desk surface
	centerY: 0.318,
};

export function buildMonitor(M: Materials, screenTexture: THREE.Texture) {
	const g = new THREE.Group();
	g.name = 'monitor';
	const { activeW, activeH, bezel, chin, panelDepth, tiltDeg, centerY } = MONITOR;
	const outerW = activeW + bezel * 2, outerH = activeH + bezel + chin;

	// ---------------------------------------------------------------- stand
	const base = beveledPanel(0.24, 0.175, 0.008, 0.024, 0.0018);
	base.rotateX(-Math.PI / 2);
	base.translate(0, 0.004, -0.02);
	const neckH = 0.29;
	const neck = roundedBox(0.05, neckH, 0.016, 0.006, 3);
	neck.rotateX(THREE.MathUtils.degToRad(-4));
	neck.translate(0, 0.008 + neckH / 2, -0.075);
	const standMesh = new THREE.Mesh(merge([base, neck]), M.aluminium);
	standMesh.name = 'monitor-stand';
	standMesh.castShadow = standMesh.receiveShadow = true;
	g.add(standMesh);
	// rubber foot ring under the base
	const footGeo = beveledPanel(0.22, 0.155, 0.0015, 0.02, 0.0004);
	footGeo.rotateX(-Math.PI / 2);
	footGeo.translate(0, 0.00075, -0.02);
	g.add(new THREE.Mesh(footGeo, M.rubber));

	// ---------------------------------------------------------------- head (tilting)
	const head = new THREE.Group();
	head.name = 'monitor-head';
	head.position.set(0, centerY, -0.035);
	head.rotation.x = THREE.MathUtils.degToRad(-tiltDeg);
	g.add(head);

	// panel shell: thin slab with softened edges; the visible face is a gloss
	// black bezel, sides/back are dark anodised aluminium.
	const yOff = (chin - bezel) / 2; // active area centre sits above the outer centre
	const shell = beveledPanel(outerW, outerH, panelDepth, 0.004, 0.0012, 6);
	shell.translate(0, -yOff, 0);
	const shellMesh = new THREE.Mesh(shell, M.darkAluminium);
	shellMesh.castShadow = shellMesh.receiveShadow = true;
	head.add(shellMesh);

	// front bezel: matte black frame inset 0.4 mm into the shell face
	const bezelGeo = new THREE.PlaneGeometry(outerW - 0.0024, outerH - 0.0024);
	bezelGeo.translate(0, -yOff, panelDepth / 2 + 0.0002);
	const bezelMesh = new THREE.Mesh(bezelGeo, M.softTouch);
	head.add(bezelMesh);

	// rear housing bulge (electronics + VESA), rounded
	const housing = roundedBox(0.42, 0.25, 0.03, 0.012, 4);
	housing.translate(0, -0.02, -panelDepth / 2 - 0.013);
	const housingMesh = new THREE.Mesh(housing, M.darkAluminium);
	housingMesh.castShadow = true;
	head.add(housingMesh);
	// hinge block joining the neck
	const hinge = roundedBox(0.06, 0.05, 0.03, 0.008, 3);
	hinge.translate(0, -0.03, -panelDepth / 2 - 0.035);
	head.add(new THREE.Mesh(hinge, M.aluminium));

	// ---------------------------------------------------------------- screen
	// Emissive LCD behind a matte anti-glare coating: the canvas drives the
	// emission, the coating gives soft reflections of the room.
	const screenMat = new THREE.MeshStandardMaterial({
		name: 'lcd',
		color: 0x050506,
		roughness: 0.28,
		metalness: 0,
		emissive: 0xffffff,
		emissiveMap: screenTexture,
		emissiveIntensity: 1.25,
	});
	const screenGeo = new THREE.PlaneGeometry(activeW, activeH);
	screenGeo.translate(0, 0, panelDepth / 2 + 0.0004);
	const screen = new THREE.Mesh(screenGeo, screenMat);
	screen.name = 'monitor-screen';
	head.add(screen);

	// power LED in the chin
	const led = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
	led.position.set(activeW / 2 - 0.02, -activeH / 2 - chin / 2, panelDepth / 2 + 0.0004);
	head.add(led);

	return { group: g, screen, head };
}

/** physical screen sizes offered in Settings (diagonal, inches) */
export const MONITOR_SIZES = [24, 27, 32, 43] as const;

/**
 * Resize the monitor head (panel + screen) to a diagonal in inches. The stand
 * stays; the head grows about its mount, raised so its lower edge keeps its
 * height above the desk.
 */
export function setMonitorSize(head: THREE.Object3D, inches: number) {
	const k = inches / 27;
	head.scale.setScalar(k);
	head.position.y = MONITOR.centerY + 0.18 * (k - 1);
	head.updateMatrixWorld(true);
}
