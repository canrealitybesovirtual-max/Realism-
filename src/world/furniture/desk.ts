import * as THREE from 'three';
import { DESK } from '../../config';
import { roundedBox, merge, box } from '../../util/geometry';
import type { Materials } from '../materials';
import type { StaticCollider, BakedSurface } from '../room';
import { setReceiverUV1, type AOReceiver } from '../../render/aoBake';

/**
 * Solid white-oak desk top (28 mm, softened 4 mm arrises) on a black
 * powder-coated steel "sled" frame: two rectangular-tube legs joined by a
 * back rail, with a cable tray hung under the rear edge and adjustable glides.
 */
export function buildDesk(M: Materials) {
	const g = new THREE.Group();
	g.name = 'desk';
	const colliders: StaticCollider[] = [];
	const { width: W, depth: D, height: H, topThickness: T, centerX: cx } = DESK;
	const cz = DESK.centerZ;
	g.position.set(cx, 0, cz);

	// ---------------------------------------------------------------- top
	const topGeo = roundedBox(W, T, D, 0.004, 3);
	topGeo.translate(0, H - T / 2, 0);
	// grain runs along the length; offset UVs so the board does not start at a ring
	const uv = topGeo.getAttribute('uv');
	for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.31, uv.getY(i) + 0.07);
	const topMat = M.oak.clone();
	const top = new THREE.Mesh(topGeo, topMat);
	top.name = 'desk-top';
	top.castShadow = top.receiveShadow = true;
	g.add(top);
	colliders.push({ center: new THREE.Vector3(cx, H - T / 2, cz), half: new THREE.Vector3(W / 2, T / 2, D / 2) });

	// AO receiver for the top surface, in world space
	const receiver: AOReceiver = {
		name: 'desk-top',
		origin: new THREE.Vector3(cx - W / 2, H, cz + D / 2),
		u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1),
		sizeU: W, sizeV: D, res: [1024, 480],
	};
	setReceiverUV1(topGeo, receiver, new THREE.Matrix4().makeTranslation(cx, 0, cz));
	const baked: BakedSurface = { receiver, mesh: top };

	// ---------------------------------------------------------------- frame
	const tubeW = 0.05, tubeT = 0.02; // 50 x 20 mm rectangular steel
	const r = 0.0025;
	const legInset = 0.075;
	const frame: THREE.BufferGeometry[] = [];
	const underTop = H - T;
	for (const s of [-1, 1]) {
		const x = s * (W / 2 - legInset);
		const zF = D / 2 - 0.07, zB = -D / 2 + 0.07;
		// posts
		for (const z of [zF, zB]) {
			const post = roundedBox(tubeT, underTop - 0.05 - 0.012, tubeW, r, 2);
			post.translate(x, 0.012 + 0.05 + (underTop - 0.05 - 0.012) / 2, z);
			frame.push(post);
		}
		// top support beam (front-to-back) directly under the top
		const beam = roundedBox(tubeT, tubeW, D - 0.06, r, 2);
		beam.translate(x, underTop - tubeW / 2, 0);
		frame.push(beam);
		// foot
		const foot = roundedBox(tubeT, 0.05, D - 0.04, r, 2);
		foot.translate(x, 0.012 + 0.025, 0);
		frame.push(foot);
		colliders.push({ center: new THREE.Vector3(cx + x, underTop / 2, cz), half: new THREE.Vector3(tubeT / 2, underTop / 2, D / 2 - 0.02) });
	}
	// rear stretcher between the legs
	const rail = roundedBox(W - 2 * legInset, 0.06, tubeT, r, 2);
	rail.translate(0, underTop - 0.08, -D / 2 + 0.07);
	frame.push(rail);
	// cable tray: folded sheet U-channel hanging under the back edge
	const trayL = 1.0, trayW = 0.12, trayH = 0.07, sheet = 0.0015;
	const trayZ = -D / 2 + 0.07 + 0.08;
	frame.push(box(trayL, sheet, trayW, 0, underTop - 0.012 - trayH, trayZ));
	frame.push(box(trayL, trayH, sheet, 0, underTop - 0.012 - trayH / 2, trayZ - trayW / 2));
	frame.push(box(trayL, trayH * 0.6, sheet, 0, underTop - 0.012 - trayH * 0.7, trayZ + trayW / 2));
	for (const s of [-1, 1]) frame.push(box(0.02, 0.012, 0.01, s * 0.4, underTop - 0.006, trayZ - trayW / 2 + 0.01)); // hangers

	const frameMesh = new THREE.Mesh(merge(frame), M.blackPowder);
	frameMesh.name = 'desk-frame';
	frameMesh.castShadow = frameMesh.receiveShadow = true;
	g.add(frameMesh);

	// glides: small black nylon pads under each foot end
	const glideGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.012, 24);
	const glides: THREE.BufferGeometry[] = [];
	for (const s of [-1, 1]) for (const z of [D / 2 - 0.05, -D / 2 + 0.05]) {
		const gg = glideGeo.clone(); gg.translate(s * (W / 2 - legInset), 0.006, z); glides.push(gg);
	}
	const glideMesh = new THREE.Mesh(merge(glides), M.rubber);
	glideMesh.castShadow = true;
	g.add(glideMesh);

	return { group: g, colliders, baked, trayZ: cz + trayZ, trayY: underTop - 0.012 - trayH };
}
