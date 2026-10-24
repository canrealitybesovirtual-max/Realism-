import * as THREE from 'three';
import { ROOM, WINDOW, DOOR } from '../config';
import { box, merge, roundedBox, boxProjectUVs } from '../util/geometry';
import type { Materials } from './materials';
import { type AOReceiver, setReceiverUV1 } from '../render/aoBake';

/**
 * Architectural shell: slab, walls with a real window opening and door
 * opening, recessed shadow-gap skirting, ceiling with recessed downlights,
 * floor-to-ceiling aluminium glazing and a flush door.
 *
 * All geometry is static and merged per material to keep draw calls low.
 * Returns a group plus the list of collision boxes (centre/half-extents)
 * for the physics world.
 */

export interface StaticCollider { center: THREE.Vector3; half: THREE.Vector3; rotationY?: number; }

/** A large planar surface that gets a baked AO map (see render/aoBake). */
export interface BakedSurface { receiver: AOReceiver; mesh: THREE.Mesh; }

export function buildRoom(M: Materials) {
	const group = new THREE.Group();
	group.name = 'room';
	const colliders: StaticCollider[] = [];

	const W = ROOM.width, D = ROOM.depth, H = ROOM.height, T = ROOM.wallThickness;
	const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
	const gapH = ROOM.shadowGapHeight, gapD = ROOM.shadowGapDepth;

	const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
	const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
		if (!byMat.has(m)) byMat.set(m, []);
		byMat.get(m)!.push(g);
	};
	const solid = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) =>
		colliders.push({ center: new THREE.Vector3(cx, cy, cz), half: new THREE.Vector3(hx, hy, hz) });

	// ------------------------------------------------------------------ floor slab
	// Four bays separated by 4 mm saw-cut control joints, as in a real slab.
	const joint = 0.004;
	const slabT = 0.12;
	const jx = 0.0, jz = 0.2; // joint lines
	const bays: [number, number, number, number][] = [
		[x0 - T, jx - joint / 2, z0 - T, jz - joint / 2],
		[jx + joint / 2, x1 + T, z0 - T, jz - joint / 2],
		[x0 - T, jx - joint / 2, jz + joint / 2, z1 + T],
		[jx + joint / 2, x1 + T, jz + joint / 2, z1 + T],
	];
	const floorGeos: THREE.BufferGeometry[] = [];
	for (const [ax, bx, az, bz] of bays) {
		// subdivided top so vertex colour can carry room-scale mottling
		const w = bx - ax, d = bz - az;
		const g = new THREE.PlaneGeometry(w, d, Math.ceil(w * 8), Math.ceil(d * 8));
		g.rotateX(-Math.PI / 2);
		g.translate((ax + bx) / 2, 0, (az + bz) / 2);
		floorGeos.push(g);
	}
	const floorGeo = merge(floorGeos);
	// UVs in metres (u = x, v = -z)
	{
		const p = floorGeo.getAttribute('position');
		const uv = floorGeo.getAttribute('uv');
		const col = new Float32Array(p.count * 3);
		for (let i = 0; i < p.count; i++) {
			const x = p.getX(i), z = p.getZ(i);
			uv.setXY(i, x + 0.37, -z + 0.11);
			// large-scale, non-repeating tonal drift across the slab (breaks tiling)
			const n = 0.5 + 0.5 * Math.sin(x * 1.3 + Math.sin(z * 0.9) * 1.7) * Math.cos(z * 1.1 - x * 0.4);
			const c = 0.93 + n * 0.09;
			col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c * 0.995;
		}
		floorGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	}
	const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
	const receivers: Record<string, AOReceiver> = {
		floor: { name: 'floor', origin: V(x0, 0, z1), u: V(1, 0, 0), v: V(0, 0, -1), sizeU: W, sizeV: D, res: [1024, 1164] },
		north: { name: 'north', origin: V(x0, 0, z0), u: V(1, 0, 0), v: V(0, 1, 0), sizeU: W, sizeV: H, res: [512, 326] },
		south: { name: 'south', origin: V(x1, 0, z1), u: V(-1, 0, 0), v: V(0, 1, 0), sizeU: W, sizeV: H, res: [512, 326] },
		west: { name: 'west', origin: V(x0, 0, z1), u: V(0, 0, -1), v: V(0, 1, 0), sizeU: D, sizeV: H, res: [580, 326] },
		east: { name: 'east', origin: V(x1, 0, z0), u: V(0, 0, 1), v: V(0, 1, 0), sizeU: D, sizeV: H, res: [580, 326] },
		ceiling: { name: 'ceiling', origin: V(x0, H, z0), u: V(1, 0, 0), v: V(0, 0, 1), sizeU: W, sizeV: D, res: [256, 290] },
	};
	const baked: BakedSurface[] = [];

	const floorMat = M.concrete.clone();
	floorMat.vertexColors = true;
	const floor = new THREE.Mesh(floorGeo, floorMat);
	floor.name = 'floor';
	floor.receiveShadow = true;
	group.add(floor);
	setReceiverUV1(floorGeo, receivers.floor);
	baked.push({ receiver: receivers.floor, mesh: floor });
	// joint bottoms
	add(M.jointGrout, box(W + 2 * T, 0.002, D + 2 * T, 0, -0.008, 0));
	solid(0, -slabT / 2, 0, W / 2 + T + 3, slabT / 2, D / 2 + T + 3);

	// ------------------------------------------------------------------ walls
	// Walls are boxes whose inner faces sit exactly on the room bounds.
	// They start at the top of the shadow gap; below it a recessed dark strip.
	const wallGeos: Record<string, THREE.BufferGeometry[]> = { north: [], south: [], west: [], east: [] };
	const wall = (key: string, cx: number, cz: number, sx: number, sz: number, yMin: number, yMax: number) => {
		wallGeos[key].push(box(sx, yMax - yMin, sz, cx, (yMin + yMax) / 2, cz));
		solid(cx, (yMin + yMax) / 2, cz, sx / 2, (yMax - yMin) / 2, sz / 2);
	};
	const gap = (cx: number, cz: number, sx: number, sz: number) =>
		add(M.shadowGap, box(sx, gapH, sz, cx, gapH / 2, cz));

	// North wall (z0) - solid
	wall('north', 0, z0 - T / 2, W + 2 * T, T, gapH, H);
	gap(0, z0 - T / 2 - gapD, W + 2 * gapD, T);
	// South wall (z1) - solid
	wall('south', 0, z1 + T / 2, W + 2 * T, T, gapH, H);
	gap(0, z1 + T / 2 + gapD, W + 2 * gapD, T);

	// West wall with glazing opening [WINDOW.zMin, WINDOW.zMax] x [sill, head]
	const wx = x0 - T / 2;
	// side walls run through the corners (to the outer face of the north/south
	// walls) so the two inner faces continue behind each other: no T-junction cracks
	wall('west', wx, (z0 - T + WINDOW.zMin) / 2, T, WINDOW.zMin - z0 + T, gapH, H);
	wall('west', wx, (WINDOW.zMax + z1 + T) / 2, T, z1 + T - WINDOW.zMax, gapH, H);
	wall('west', wx, (WINDOW.zMin + WINDOW.zMax) / 2, T, WINDOW.zMax - WINDOW.zMin, WINDOW.head, H);
	gap(wx - gapD, (z0 + WINDOW.zMin) / 2, T, WINDOW.zMin - z0);
	gap(wx - gapD, (WINDOW.zMax + z1) / 2, T, z1 - WINDOW.zMax);

	// East wall with door opening
	const ex = x1 + T / 2;
	const dz0 = DOOR.zCenter - DOOR.width / 2 - 0.012, dz1 = DOOR.zCenter + DOOR.width / 2 + 0.012;
	const dH = DOOR.height + 0.012;
	wall('east', ex, (z0 - T + dz0) / 2, T, dz0 - z0 + T, gapH, H);
	wall('east', ex, (dz1 + z1 + T) / 2, T, z1 + T - dz1, gapH, H);
	wall('east', ex, (dz0 + dz1) / 2, T, dz1 - dz0, dH, H);
	gap(ex + gapD, (z0 + dz0) / 2, T, dz0 - z0);
	gap(ex + gapD, (dz1 + z1) / 2, T, z1 - dz1);

	// ------------------------------------------------------------------ ceiling
	// Ceiling soffit: a plane with real cut-outs for the downlights, plus a
	// slab above it so it is opaque to the sun's shadow camera.
	const downlightXZ: [number, number][] = [[-0.9, -1.0], [0.9, -1.0], [-0.9, 1.1], [0.9, 1.1]];
	const ceilShape = new THREE.Shape();
	ceilShape.moveTo(x0 - T, z0 - T); ceilShape.lineTo(x1 + T, z0 - T);
	ceilShape.lineTo(x1 + T, z1 + T); ceilShape.lineTo(x0 - T, z1 + T); ceilShape.closePath();
	for (const [lx, lz] of downlightXZ) {
		const hole = new THREE.Path();
		hole.absarc(lx, lz, 0.031, 0, Math.PI * 2, true);
		ceilShape.holes.push(hole);
	}
	const soffit = new THREE.ShapeGeometry(ceilShape, 24);
	soffit.rotateX(Math.PI / 2); // shape (x, y) -> world (x, 0, z = y), facing down
	soffit.translate(0, H, 0);
	boxProjectUVs(soffit);
	const ceilingGeo = merge([soffit, box(W + 2 * T, 0.2, D + 2 * T, 0, H + 0.15, 0)]);
	solid(0, H + 0.1, 0, W / 2 + T, 0.1, D / 2 + T);

	// slim flush downlights (trim ring + recessed reflector + lens), off by day
	const downlights = new THREE.Group();
	downlights.name = 'downlights';
	const ringGeo = new THREE.RingGeometry(0.031, 0.042, 48).rotateX(Math.PI / 2);
	const coneGeo = new THREE.CylinderGeometry(0.031, 0.018, 0.035, 40, 1, true);
	const lensGeo = new THREE.CircleGeometry(0.018, 32).rotateX(Math.PI / 2);
	const trimMat = new THREE.MeshStandardMaterial({ name: 'downlight-trim', color: 0xf2f2f0, roughness: 0.35, side: THREE.DoubleSide });
	const reflMat = new THREE.MeshStandardMaterial({ name: 'downlight-reflector', color: 0xd8d8d8, metalness: 1, roughness: 0.25, side: THREE.BackSide });
	const lensMat = new THREE.MeshStandardMaterial({ name: 'downlight-lens', color: 0xf0eee8, roughness: 0.3, emissive: 0xfff4e6, emissiveIntensity: 0.0 });
	for (const [lx, lz] of downlightXZ) {
		const ring = new THREE.Mesh(ringGeo, trimMat);
		ring.position.set(lx, H - 0.0015, lz);
		const cone = new THREE.Mesh(coneGeo, reflMat);
		cone.position.set(lx, H + 0.0175 - 0.0015, lz);
		const lens = new THREE.Mesh(lensGeo, lensMat);
		lens.position.set(lx, H + 0.033, lz);
		downlights.add(ring, cone, lens);
	}
	group.add(downlights);

	// ------------------------------------------------------------------ glazing
	const glazing = buildGlazing(M);
	group.add(glazing);
	// glass is a wall for physics purposes
	solid(x0 - 0.05, H / 2, (WINDOW.zMin + WINDOW.zMax) / 2, 0.05, H / 2, (WINDOW.zMax - WINDOW.zMin) / 2);

	// ------------------------------------------------------------------ door
	const door = buildDoor(M);
	group.add(door);
	solid(x1 + 0.03, DOOR.height / 2, DOOR.zCenter, 0.03, DOOR.height / 2, DOOR.width / 2);

	// ------------------------------------------------------------------ exterior terrace
	// Paving outside the glazing so the view down through the glass is
	// real geometry rather than the stretched bottom of the HDRI.
	const terraceMat = M.concrete.clone();
	terraceMat.name = 'terrace-paving';
	terraceMat.color.set(0x9a958d);
	terraceMat.clearcoat = 0;
	terraceMat.roughness = 1;
	// outdoors: lit by the real sky HDRI (assigned in main), not the room probe
	terraceMat.userData.noBoxProjection = true;
	// one instanced mesh, per-slab tone variation like real cast pavers
	const slabGeo = roundedBox(0.59, 0.05, 0.89, 0.006, 1);
	const pav = new THREE.InstancedMesh(slabGeo, terraceMat, 6 * 9);
	const mtx = new THREE.Matrix4(), c = new THREE.Color();
	let k = 0;
	for (let i = 0; i < 6; i++) for (let j = 0; j < 9; j++, k++) {
		mtx.makeTranslation(x0 - T - 0.3 - i * 0.6, -0.045 - ((i * 7 + j * 3) % 5) * 0.0008, z0 - 1.0 + j * 0.9);
		pav.setMatrixAt(k, mtx);
		const t = 0.9 + (((i * 37 + j * 91) % 17) / 17) * 0.16;
		pav.setColorAt(k, c.setRGB(t, t * 0.985, t * 0.96));
	}
	pav.receiveShadow = true;
	pav.name = 'terrace';
	group.add(pav);

	// ------------------------------------------------------------------ walls & ceiling meshes (one per AO receiver)
	const planar = (key: string, geo: THREE.BufferGeometry, mat: THREE.Material) => {
		setReceiverUV1(geo, receivers[key]);
		const mesh = new THREE.Mesh(geo, mat.clone());
		mesh.name = key;
		mesh.receiveShadow = mesh.castShadow = true;
		group.add(mesh);
		baked.push({ receiver: receivers[key], mesh });
	};
	for (const key of Object.keys(wallGeos)) planar(key, merge(wallGeos[key]), M.wallPaint);
	planar('ceiling', ceilingGeo, M.ceilingPaint);

	// ------------------------------------------------------------------ merge static meshes
	for (const [mat, geos] of byMat) {
		const mesh = new THREE.Mesh(merge(geos), mat);
		mesh.receiveShadow = true;
		mesh.castShadow = mat !== M.shadowGap && mat !== M.jointGrout;
		mesh.name = 'static-' + mat.name;
		group.add(mesh);
	}

	return { group, colliders, baked };
}

function buildGlazing(M: Materials): THREE.Group {
	const g = new THREE.Group();
	g.name = 'glazing';
	const x0 = -ROOM.width / 2 - ROOM.wallThickness * 0.62; // frame sits in the outer part of the reveal
	const { zMin, zMax, sill, head, frame: f, frameDepth: fd, transom } = WINDOW;
	const geos: THREE.BufferGeometry[] = [];
	const len = zMax - zMin, ht = head - sill;
	// outer frame
	geos.push(box(fd, f, len, x0, sill + f / 2, (zMin + zMax) / 2));
	geos.push(box(fd, f, len, x0, head - f / 2, (zMin + zMax) / 2));
	geos.push(box(fd, ht, f, x0, (sill + head) / 2, zMin + f / 2));
	geos.push(box(fd, ht, f, x0, (sill + head) / 2, zMax - f / 2));
	// mullions
	const panes = WINDOW.mullions + 1;
	const paneW = (len - f * 2 - WINDOW.mullions * f) / panes;
	for (let i = 1; i < panes; i++) {
		const z = zMin + f + i * paneW + (i - 0.5) * f;
		geos.push(box(fd, ht - 2 * f, f, x0, (sill + head) / 2, z));
	}
	// transom across all panes
	geos.push(box(fd * 0.9, f * 0.8, len - 2 * f, x0, transom, (zMin + zMax) / 2));
	const frameMesh = new THREE.Mesh(merge(geos), M.blackPowder);
	frameMesh.castShadow = true;
	frameMesh.receiveShadow = true;
	frameMesh.name = 'window-frame';
	g.add(frameMesh);

	// glass panes (one plane per pane, set slightly inside the frame centre)
	const glassGeo = new THREE.PlaneGeometry(len - 2 * f, ht - 2 * f);
	glassGeo.rotateY(Math.PI / 2);
	const glass = new THREE.Mesh(glassGeo, M.glass);
	glass.position.set(x0, (sill + head) / 2, (zMin + zMax) / 2);
	glass.name = 'window-glass';
	glass.renderOrder = 10;
	g.add(glass);

	// interior reveal lining is the wall paint (wall boxes already provide it)
	return g;
}

function buildDoor(M: Materials): THREE.Group {
	const g = new THREE.Group();
	g.name = 'door';
	const xFace = ROOM.width / 2;
	// leaf set 20 mm back from the wall face, 3 mm gaps all round
	const leaf = new THREE.Mesh(roundedBox(DOOR.thickness, DOOR.height - 0.006, DOOR.width - 0.006, 0.002, 2), M.doorPaint);
	leaf.position.set(xFace + 0.02 + DOOR.thickness / 2, DOOR.height / 2 + 0.006, DOOR.zCenter);
	leaf.castShadow = leaf.receiveShadow = true;
	g.add(leaf);
	// opening reveal behind the leaf (dark) so gaps read as gaps
	const back = new THREE.Mesh(box(0.01, DOOR.height + 0.02, DOOR.width + 0.03), M.shadowGap);
	back.position.set(xFace + 0.075, DOOR.height / 2, DOOR.zCenter);
	g.add(back);
	// minimal lever handle in black: rose + lever
	const hx = xFace + 0.02 - 0.001, hy = 1.02, hz = DOOR.zCenter + DOOR.width / 2 - 0.07;
	const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 32).rotateZ(Math.PI / 2), M.blackPowder);
	rose.position.set(hx - 0.004, hy, hz);
	const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.055, 20).rotateZ(Math.PI / 2), M.blackPowder);
	neck.position.set(hx - 0.032, hy, hz);
	const lever = new THREE.Mesh(roundedBox(0.018, 0.018, 0.14, 0.008, 3), M.blackPowder);
	lever.position.set(hx - 0.058, hy, hz - 0.062);
	for (const m of [rose, neck, lever]) { m.castShadow = true; g.add(m); }
	return g;
}
