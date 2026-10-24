import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Replace a geometry's UVs with a box projection in metres, so a texture with
 * `repeat = 1 / tileSizeMetres` has the same physical scale on every object.
 * Each vertex is projected along its dominant normal axis.
 */
export function boxProjectUVs(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4): THREE.BufferGeometry {
	const pos = geo.getAttribute('position') as THREE.BufferAttribute;
	const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
	const uv = new Float32Array(pos.count * 2);
	const p = new THREE.Vector3(), n = new THREE.Vector3();
	const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
	for (let i = 0; i < pos.count; i++) {
		p.fromBufferAttribute(pos, i);
		n.fromBufferAttribute(nor, i);
		if (matrix) { p.applyMatrix4(matrix); n.applyMatrix3(nm!).normalize(); }
		const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
		let u: number, v: number;
		if (ay >= ax && ay >= az) { u = p.x; v = n.y > 0 ? -p.z : p.z; }
		else if (ax >= az) { u = n.x > 0 ? -p.z : p.z; v = p.y; }
		else { u = n.z > 0 ? p.x : -p.x; v = p.y; }
		uv[i * 2] = u; uv[i * 2 + 1] = v;
	}
	geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	return geo;
}

/** Rounded box whose UVs are box-projected in metres. */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 3): THREE.BufferGeometry {
	r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
	const g = new RoundedBoxGeometry(w, h, d, seg, Math.max(r, 1e-4));
	return boxProjectUVs(g);
}

/** Plain box with metre-scaled UVs, optionally positioned. */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
	const g = new THREE.BoxGeometry(w, h, d);
	g.translate(x, y, z);
	return boxProjectUVs(g);
}

/**
 * Extrude a 2D rounded rectangle along Z with a small bevel: the workhorse
 * for panels with softened edges (monitor shell, desk top, door leaf...).
 */
export function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
	const s = new THREE.Shape();
	const x = -w / 2, y = -h / 2;
	r = Math.min(r, w / 2, h / 2);
	s.moveTo(x + r, y);
	s.lineTo(x + w - r, y);
	s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
	s.lineTo(x + w, y + h - r);
	s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
	s.lineTo(x + r, y + h);
	s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
	s.lineTo(x, y + r);
	s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
	return s;
}

export function beveledPanel(w: number, h: number, depth: number, cornerR: number, bevel: number, curveSeg = 8): THREE.BufferGeometry {
	const shape = roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.0005, cornerR - bevel));
	const g = new THREE.ExtrudeGeometry(shape, {
		depth: Math.max(1e-4, depth - bevel * 2),
		bevelEnabled: bevel > 0,
		bevelThickness: bevel,
		bevelSize: bevel,
		bevelSegments: 3,
		curveSegments: curveSeg,
	});
	g.translate(0, 0, -(depth - bevel * 2) / 2);
	g.computeVertexNormals();
	return boxProjectUVs(smoothNormals(g, 0.6));
}

/** Weld coincident vertices and recompute normals with a crease angle. */
export function smoothNormals(g: THREE.BufferGeometry, creaseAngle = 0.6): THREE.BufferGeometry {
	// toCreasedNormals keeps hard edges above the crease angle
	return toCreasedNormals(g.index ? g.toNonIndexed() : g, creaseAngle);
}

/** Lathe a profile (x = radius, y = height) with metre UVs along the profile. */
export function lathe(points: [number, number][], segments = 48): THREE.BufferGeometry {
	const g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
	return g;
}

/** Tube following a smooth path through points. */
export function tube(points: THREE.Vector3[], radius: number, tubularSeg = 64, radialSeg = 8): THREE.BufferGeometry {
	const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
	return new THREE.TubeGeometry(curve, tubularSeg, radius, radialSeg, false);
}

export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
	const prepared = geos.map((g) => {
		let ng = g.index ? g.toNonIndexed() : g;
		// make attribute sets uniform
		if (!ng.getAttribute('uv')) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.getAttribute('position').count * 2), 2));
		for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
		return ng;
	});
	const m = mergeGeometries(prepared, false)!;
	return m;
}

export { mergeVertices };

/** Closed rounded-rectangle outline as 2D points (counter-clockwise). */
export function roundedRectPoints(w: number, h: number, r: number, seg = 4): THREE.Vector2[] {
	r = Math.min(r, w / 2, h / 2);
	const pts: THREE.Vector2[] = [];
	const corners: [number, number, number][] = [
		[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2],
		[-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5],
	];
	for (const [cx, cy, a0] of corners) for (let i = 0; i <= seg; i++) {
		const a = a0 + (i / seg) * Math.PI / 2;
		pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
	}
	return pts;
}

export interface LoftStation {
	/** centre of the cross-section */
	pos: THREE.Vector3;
	/** local cross-section axes (profile x -> side, profile y -> up) */
	side: THREE.Vector3;
	up: THREE.Vector3;
	scale: [number, number];
}

/**
 * Loft a closed 2D profile through a list of stations, with end caps.
 * Used for tapered parts such as chair base arms and the backrest spine.
 */
export function loft(profile: THREE.Vector2[], stations: LoftStation[], caps = true): THREE.BufferGeometry {
	const n = profile.length, m = stations.length;
	const pos: number[] = [];
	const idx: number[] = [];
	for (const st of stations) for (const p of profile) {
		const v = st.pos.clone().addScaledVector(st.side, p.x * st.scale[0]).addScaledVector(st.up, p.y * st.scale[1]);
		pos.push(v.x, v.y, v.z);
	}
	for (let j = 0; j < m - 1; j++) for (let i = 0; i < n; i++) {
		const a = j * n + i, b = j * n + ((i + 1) % n), c = (j + 1) * n + i, d = (j + 1) * n + ((i + 1) % n);
		idx.push(a, c, b, b, c, d);
	}
	if (caps) {
		for (const [j, flip] of [[0, true], [m - 1, false]] as const) {
			const c = stations[j].pos;
			const ci = pos.length / 3;
			pos.push(c.x, c.y, c.z);
			for (let i = 0; i < n; i++) {
				const a = j * n + i, b = j * n + ((i + 1) % n);
				if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
			}
		}
	}
	// make the winding outward-facing regardless of station frame handedness
	let vol = 0;
	for (let t = 0; t < idx.length; t += 3) {
		const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
		vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
			- pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
			+ pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
	}
	if (vol < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	const ng = toCreasedNormals(g, 0.9);
	return boxProjectUVs(ng);
}
