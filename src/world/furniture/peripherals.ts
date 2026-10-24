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
	// Plan: a squarish superellipse (straight flanks, rounded ends), slightly
	// narrower at the buttons. Elevation: hump toward the palm, flat base.
	const halfWAt = (zn: number) => 0.0305 + 0.0025 * zn - 0.002 * zn * zn;
	const humpAt = (zn: number) => H * (0.52 + 0.48 * (1 - Math.pow((zn - 0.32) / 1.32, 2))) - 0.004;
	const body = new THREE.SphereGeometry(1, 72, 48);
	const p = body.getAttribute('position');
	const col = new Float32Array(p.count * 3);
	const sp = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
		const zn = sp(z, 0.8);
		const xx = sp(x, 0.6) * halfWAt(zn);
		const yy = y > 0 ? 0.004 + y * humpAt(zn) - xx * 0.06 * y : 0.004 + y * 0.004;
		p.setXYZ(i, xx, yy, zn * L);
		// two-tone: a darker skirt below the waist line
		const c = yy < 0.013 ? 0.55 : 1.0;
		col.set([c, c, c], i * 3);
	}
	body.setAttribute('color', new THREE.BufferAttribute(col, 3));
	body.computeVertexNormals();
	const shellMat = M.softTouch.clone();
	shellMat.name = 'mouse-graphite';
	shellMat.color.set(0x45484d);
	shellMat.roughness = 0.55;
	shellMat.vertexColors = true;
	const top = new THREE.Mesh(body, shellMat);
	top.name = 'mouse-body';
	top.castShadow = top.receiveShadow = true;
	g.add(top);

	// seams: centre split between the buttons, and the buttons' back edge
	const surfY = (xn: number, zn: number) => {
		const yn = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(xn), 2 / 0.6) - Math.pow(Math.abs(zn), 2 / 0.8)));
		return 0.004 + yn * humpAt(zn) + 0.0003;
	};
	const seamA: THREE.Vector3[] = [], seamB: THREE.Vector3[] = [];
	for (let k = 0; k <= 16; k++) { const zn = -0.97 + k * 0.035; seamA.push(new THREE.Vector3(0, surfY(0, zn), zn * L)); }
	for (let k = 0; k <= 16; k++) {
		const xn = -0.75 + k * (1.5 / 16), zn = -0.42 + 0.06 * xn * xn;
		seamB.push(new THREE.Vector3(sp(xn, 0.6) * halfWAt(zn) * 0.98, surfY(xn * 0.98, zn), zn * L));
	}
	for (const pts of [seamA, seamB]) {
		const seam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0005, 5), M.shadowGap);
		g.add(seam);
	}
	// scroll wheel peeking through the top
	const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.0065, 28).rotateZ(Math.PI / 2), M.rubber);
	wheel.position.set(0, surfY(0, -0.55) - 0.0062, -0.55 * L);
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
