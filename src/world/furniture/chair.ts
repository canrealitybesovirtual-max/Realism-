import * as THREE from 'three';
import { loft, roundedRectPoints, merge, roundedBox, tube } from '../../util/geometry';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Materials } from '../materials';

/**
 * Ergonomic task chair: polished-aluminium five-star base on twin-wheel
 * casters, gas lift, synchro mechanism, contoured upholstered seat, curved
 * elastomer-mesh backrest with lumbar curve, and T-armrests.
 *
 * Local frame: origin on the floor below the gas lift, the occupant faces -Z.
 * Dimensions follow BIFMA/EN 1335 type-A ranges (seat height 470 mm).
 */
export const CHAIR = { seatHeight: 0.47, seatW: 0.5, seatD: 0.47 };

export function buildChair(M: Materials) {
	const g = new THREE.Group();
	g.name = 'chair';

	// ---------------------------------------------------------------- base
	const armProfile = roundedRectPoints(1, 1, 0.3, 4);
	const baseParts: THREE.BufferGeometry[] = [];
	const hubY = 0.085;
	const casterGeos: THREE.BufferGeometry[] = [];
	const wheelGeos: THREE.BufferGeometry[] = [];
	for (let i = 0; i < 5; i++) {
		const a = (i / 5) * Math.PI * 2 + Math.PI / 10;
		const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
		const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
		const st = (t: number) => {
			const r = 0.03 + t * 0.3;
			// gentle downward sweep, slimmer and lower at the tip
			const y = hubY - t * 0.022 - Math.sin(t * Math.PI) * -0.004;
			const w = THREE.MathUtils.lerp(0.052, 0.034, t);
			const h = THREE.MathUtils.lerp(0.046, 0.024, Math.pow(t, 0.8));
			return { pos: dir.clone().multiplyScalar(r).setY(y), side, up: new THREE.Vector3(0, 1, 0), scale: [w, h] as [number, number] };
		};
		baseParts.push(loft(armProfile, Array.from({ length: 10 }, (_, k) => st(k / 9))));
		// caster at the tip: stem + housing + twin wheels
		const tip = dir.clone().multiplyScalar(0.315);
		const housing = new RoundedBoxGeometry(0.03, 0.035, 0.045, 2, 0.008);
		housing.rotateY(a);
		housing.translate(tip.x + dir.x * 0.012, 0.043, tip.z + dir.z * 0.012);
		casterGeos.push(housing);
		for (const s of [-1, 1]) {
			const wgeo = new THREE.CylinderGeometry(0.025, 0.025, 0.012, 28);
			wgeo.rotateZ(Math.PI / 2);
			wgeo.rotateY(a + Math.PI / 2);
			const off = side.clone().multiplyScalar(s * 0.0135);
			wgeo.translate(tip.x + dir.x * 0.02 + off.x, 0.025, tip.z + dir.z * 0.02 + off.z);
			wheelGeos.push(wgeo);
		}
	}
	// hub
	const hub = new THREE.CylinderGeometry(0.038, 0.045, 0.06, 40);
	hub.translate(0, hubY, 0);
	baseParts.push(hub);
	const baseMesh = new THREE.Mesh(merge(baseParts), M.chrome.clone());
	(baseMesh.material as THREE.MeshStandardMaterial).roughness = 0.18;
	baseMesh.name = 'chair-base';
	baseMesh.castShadow = baseMesh.receiveShadow = true;
	g.add(baseMesh);
	const casterMesh = new THREE.Mesh(merge(casterGeos), M.blackPlastic);
	casterMesh.castShadow = true;
	g.add(casterMesh);
	const wheelMesh = new THREE.Mesh(merge(wheelGeos), M.rubber);
	wheelMesh.castShadow = true;
	g.add(wheelMesh);

	// ---------------------------------------------------------------- gas lift
	const sleeve = new THREE.CylinderGeometry(0.026, 0.026, 0.2, 36);
	sleeve.translate(0, hubY + 0.1, 0);
	const sleeveMesh = new THREE.Mesh(sleeve, M.glossBlack);
	sleeveMesh.castShadow = true;
	g.add(sleeveMesh);
	const piston = new THREE.CylinderGeometry(0.014, 0.014, 0.12, 24);
	piston.translate(0, hubY + 0.2 + 0.05, 0);
	const pistonMesh = new THREE.Mesh(piston, M.chrome);
	g.add(pistonMesh);

	// ---------------------------------------------------------------- mechanism
	const seatTop = CHAIR.seatHeight;
	const mech = roundedBox(0.2, 0.055, 0.26, 0.012, 3);
	mech.translate(0, seatTop - 0.085 - 0.0275, 0.01);
	const knob = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 32);
	knob.rotateX(Math.PI / 2);
	knob.translate(0, seatTop - 0.12, -0.13);
	const lever = roundedBox(0.012, 0.012, 0.11, 0.005, 2);
	lever.rotateY(-0.5);
	lever.translate(0.12, seatTop - 0.1, -0.05);
	const mechMesh = new THREE.Mesh(merge([mech, knob, lever]), M.blackPlastic);
	mechMesh.castShadow = true;
	g.add(mechMesh);

	// ---------------------------------------------------------------- seat
	const { seatW, seatD } = CHAIR;
	const cushionT = 0.07;
	const cushion = new RoundedBoxGeometry(seatW, cushionT, seatD, 6, 0.028);
	{
		// contour: shallow dish, raised side bolsters, waterfall front edge
		const p = cushion.getAttribute('position');
		for (let i = 0; i < p.count; i++) {
			const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
			if (y > 0) {
				const nx = x / (seatW / 2), nz = z / (seatD / 2); // z>0 is the back of the seat
				let dy = -0.010 * (1 - nx * nx) * (1 - Math.max(0, nz) * 0.5);
				dy += -0.012 * Math.pow(Math.max(0, -nz - 0.55) / 0.45, 2); // waterfall
				p.setY(i, y + dy * (y / (cushionT / 2)));
			}
		}
		cushion.computeVertexNormals();
	}
	cushion.translate(0, seatTop - cushionT / 2, 0.02);
	const cushionMesh = new THREE.Mesh(cushion, M.fabric);
	cushionMesh.name = 'chair-seat';
	cushionMesh.castShadow = cushionMesh.receiveShadow = true;
	g.add(cushionMesh);
	const pan = roundedBox(seatW - 0.02, 0.016, seatD - 0.02, 0.007, 3);
	pan.translate(0, seatTop - cushionT - 0.006, 0.02);
	const panMesh = new THREE.Mesh(pan, M.blackPlastic);
	panMesh.castShadow = true;
	g.add(panMesh);

	// ---------------------------------------------------------------- backrest
	const backBottom = seatTop + 0.08, backTop = seatTop + 0.66;
	const halfW = (y: number) => THREE.MathUtils.lerp(0.235, 0.22, (y - backBottom) / (backTop - backBottom));
	// surface: wraps forward at the sides, lumbar bump, reclined ~12 degrees
	const backZ = (x: number, y: number) => {
		const t = (y - backBottom) / (backTop - backBottom);
		const wrap = -0.055 * Math.pow(x / 0.235, 2);
		const lumbar = -0.022 * Math.exp(-Math.pow((t - 0.22) / 0.16, 2));
		return 0.235 + t * 0.13 + wrap + lumbar;
	};
	const mesh = new THREE.BufferGeometry();
	{
		const nu = 24, nv = 32;
		const pos: number[] = [], uv: number[] = [], idx: number[] = [];
		for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
			const y = THREE.MathUtils.lerp(backBottom + 0.012, backTop - 0.012, j / nv);
			const hw = halfW(y) - 0.012;
			const x = THREE.MathUtils.lerp(-hw, hw, i / nu);
			pos.push(x, y, backZ(x, y));
			uv.push(x, y);
		}
		for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
			const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
			idx.push(a, b, c, b, d, c);
		}
		mesh.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		mesh.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		mesh.setIndex(idx);
		mesh.computeVertexNormals();
	}
	const meshBack = new THREE.Mesh(mesh, M.meshFabric);
	meshBack.name = 'chair-mesh-back';
	meshBack.castShadow = true;
	g.add(meshBack);
	// frame: tube around the mesh perimeter
	const loop: THREE.Vector3[] = [];
	const N = 40;
	const perim = (s: number) => {
		// s in [0,4): bottom, right, top, left edges with rounded corners via easing
		const e = s % 1, side = Math.floor(s) % 4;
		let x = 0, y = 0;
		const yb = backBottom, yt = backTop;
		if (side === 0) { x = THREE.MathUtils.lerp(-1, 1, e); y = yb; }
		if (side === 1) { x = 1; y = THREE.MathUtils.lerp(yb, yt, e); }
		if (side === 2) { x = THREE.MathUtils.lerp(1, -1, e); y = yt; }
		if (side === 3) { x = -1; y = THREE.MathUtils.lerp(yt, yb, e); }
		x *= halfW(y);
		return new THREE.Vector3(x, y, backZ(x, y) + 0.004);
	};
	for (let k = 0; k < N; k++) loop.push(perim((k / N) * 4 + 0.5 / N * 4));
	const frameCurve = new THREE.CatmullRomCurve3(loop, true, 'catmullrom', 0.2);
	const frameGeo = new THREE.TubeGeometry(frameCurve, 160, 0.011, 10, true);
	frameGeo.scale(1, 1, 1);
	// spine from mechanism to the lower back frame
	const spine = loft(roundedRectPoints(1, 1, 0.35, 3), [0, 0.25, 0.5, 0.75, 1].map((t) => {
		const p = new THREE.Vector3(0,
			THREE.MathUtils.lerp(seatTop - 0.1, backBottom + 0.02, t),
			THREE.MathUtils.lerp(0.12, backZ(0, backBottom) + 0.03, Math.pow(t, 0.7)) + Math.sin(t * Math.PI) * 0.035);
		return { pos: p, side: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1), scale: [THREE.MathUtils.lerp(0.07, 0.09, t), 0.022] as [number, number] };
	}));
	const frameMesh = new THREE.Mesh(merge([frameGeo, spine]), M.blackPlastic);
	frameMesh.name = 'chair-back-frame';
	frameMesh.castShadow = true;
	g.add(frameMesh);

	// ---------------------------------------------------------------- armrests
	const armParts: THREE.BufferGeometry[] = [];
	const padParts: THREE.BufferGeometry[] = [];
	for (const s of [-1, 1]) {
		const x = s * (seatW / 2 + 0.025);
		// bracket from under the seat, then a vertical post
		armParts.push(tube([
			new THREE.Vector3(s * 0.08, seatTop - 0.095, 0.06),
			new THREE.Vector3(s * 0.2, seatTop - 0.1, 0.07),
			new THREE.Vector3(x, seatTop - 0.07, 0.07),
		], 0.012, 24, 10));
		const post = roundedBox(0.022, 0.24, 0.045, 0.008, 3);
		post.translate(x, seatTop - 0.07 + 0.12, 0.07);
		armParts.push(post);
		const pad = roundedBox(0.075, 0.025, 0.25, 0.011, 4);
		pad.translate(x, seatTop + 0.19 + 0.0125, 0.03);
		padParts.push(pad);
	}
	const armMesh = new THREE.Mesh(merge(armParts), M.blackPlastic);
	armMesh.castShadow = true;
	g.add(armMesh);
	const padMesh = new THREE.Mesh(merge(padParts), M.softTouch);
	padMesh.castShadow = true;
	g.add(padMesh);

	return { group: g };
}
