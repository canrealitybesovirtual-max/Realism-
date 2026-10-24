import * as THREE from 'three';
import { roundedBox, merge, beveledPanel, box } from '../../util/geometry';
import type { Materials } from '../materials';

/**
 * Ergonomic wireless mouse (118 x 64 x 40 mm). The body is a sphere
 * re-shaped in plan (narrower at the front) and elevation (hump toward the
 * palm, flat base with a rounded skirt). Local frame: origin on the desk
 * under the mouse centre, front toward -Z.
 */
export const MOUSE = { length: 0.118, width: 0.064, height: 0.039 };

export function buildMouse(M: Materials) {
	const g = new THREE.Group();
	g.name = 'mouse';
	const L = MOUSE.length / 2, H = MOUSE.height;
	const body = new THREE.SphereGeometry(1, 64, 40);
	const p = body.getAttribute('position');
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
		const zn = z; // -1 front .. +1 back
		const halfW = 0.029 + 0.004 * zn - 0.0045 * zn * zn;
		const hump = H * (0.5 + 0.5 * (1 - Math.pow((zn - 0.35) / 1.35, 2))) - 0.004;
		const yy = y > 0 ? 0.004 + y * hump : 0.004 + y * 0.004;
		// slight right-hand tilt of the top (ergonomic)
		const xx = x * halfW;
		p.setXYZ(i, xx, yy + (y > 0 ? -xx * 0.08 * y : 0), z * L);
	}
	body.computeVertexNormals();
	const shellMat = M.softTouch.clone();
	shellMat.name = 'mouse-graphite';
	shellMat.color.set(0x34363a);
	shellMat.roughness = 0.58;
	const top = new THREE.Mesh(body, shellMat);
	top.name = 'mouse-body';
	top.castShadow = top.receiveShadow = true;
	g.add(top);

	// button seam: a thin dark groove along the centre line at the front
	const seamPts: THREE.Vector3[] = [];
	for (let k = 0; k <= 20; k++) {
		const zn = -1 + k * 0.035;
		const hump = H * (0.5 + 0.5 * (1 - Math.pow((zn - 0.35) / 1.35, 2))) - 0.004;
		const y = 0.004 + Math.sqrt(Math.max(0, 1 - zn * zn)) * hump;
		seamPts.push(new THREE.Vector3(0, y + 0.0002, zn * L));
	}
	const seam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPts), 40, 0.0006, 5), M.shadowGap);
	g.add(seam);
	// scroll wheel peeking through the top
	const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.007, 28).rotateZ(Math.PI / 2), M.rubber);
	wheel.position.set(0, 0.0275, -0.033);
	g.add(wheel);
	// PTFE skates
	const skate = new THREE.Mesh(beveledPanel(0.03, 0.012, 0.0008, 0.005, 0.0002).rotateX(-Math.PI / 2), M.paper);
	skate.position.set(0, 0.0004, -0.04);
	g.add(skate);

	return { group: g };
}

/**
 * Compact mid-tower PC (210 x 460 x 420 mm): matte black steel shell with a
 * bead-blasted aluminium front panel, side intake slots, power button + LED.
 * Local frame: origin on the floor under the case centre, front facing +Z.
 */
export function buildPC(M: Materials) {
	const g = new THREE.Group();
	g.name = 'pc';
	const W = 0.21, H = 0.46, D = 0.42;
	const feetH = 0.012;
	const shell = roundedBox(W, H, D - 0.012, 0.004, 3);
	shell.translate(0, feetH + H / 2, -0.006);
	const shellMesh = new THREE.Mesh(shell, M.blackPowder);
	shellMesh.castShadow = shellMesh.receiveShadow = true;
	g.add(shellMesh);
	// front panel, slightly proud with a 3 mm shadow line to the shell
	const front = beveledPanel(W - 0.006, H - 0.006, 0.012, 0.004, 0.0012);
	front.translate(0, feetH + H / 2, D / 2 - 0.006);
	const frontMesh = new THREE.Mesh(front, M.aluminium);
	frontMesh.castShadow = true;
	g.add(frontMesh);
	// intake slots on the side (dark recesses)
	const slots: THREE.BufferGeometry[] = [];
	for (let i = 0; i < 18; i++) slots.push(box(0.001, 0.004, 0.3, W / 2 + 0.0002, feetH + 0.12 + i * 0.016, 0.0));
	for (let i = 0; i < 18; i++) slots.push(box(0.001, 0.004, 0.3, -W / 2 - 0.0002, feetH + 0.12 + i * 0.016, 0.0));
	g.add(new THREE.Mesh(merge(slots), M.shadowGap));
	// power button and LED on the front top
	const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.003, 32).rotateX(Math.PI / 2), M.aluminium);
	btn.position.set(0, feetH + H - 0.03, D / 2 + 0.0015);
	g.add(btn);
	const ring = new THREE.Mesh(new THREE.RingGeometry(0.0082, 0.0092, 32), new THREE.MeshBasicMaterial({ color: 0xbfe6ff }));
	ring.position.set(0, feetH + H - 0.03, D / 2 + 0.0003);
	g.add(ring);
	// two USB-C + one USB-A port slots
	const ports: THREE.BufferGeometry[] = [];
	for (const [x, w] of [[-0.03, 0.009], [-0.015, 0.009], [0.02, 0.013]] as const) ports.push(box(w, 0.0035, 0.002, x, feetH + H - 0.03, D / 2 + 0.0005));
	g.add(new THREE.Mesh(merge(ports), M.shadowGap));
	// feet
	const feet: THREE.BufferGeometry[] = [];
	for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
		const f = new THREE.CylinderGeometry(0.014, 0.016, feetH, 20);
		f.translate(sx * (W / 2 - 0.03), feetH / 2, sz * (D / 2 - 0.04));
		feet.push(f);
	}
	g.add(new THREE.Mesh(merge(feet), M.rubber));
	return { group: g, size: new THREE.Vector3(W, H + feetH, D) };
}
