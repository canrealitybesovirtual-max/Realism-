import * as THREE from 'three';
import { roundedBox, merge, box } from '../../util/geometry';
import type { Materials } from '../materials';

/**
 * Low sideboard: matte white lacquered carcass with three flush push-open
 * doors (3 mm shadow gaps), a 22 mm solid oak top, on slim black steel legs.
 * 1600 x 420 x 520 mm + 140 mm legs. Origin on the floor at the centre of
 * the back edge; the front faces +Z.
 */
export function buildCredenza(M: Materials) {
	const g = new THREE.Group();
	g.name = 'credenza';
	const W = 1.6, D = 0.42, legH = 0.14, bodyH = 0.5, topT = 0.022;
	const lacquer = new THREE.MeshStandardMaterial({ name: 'white-lacquer', color: 0xf0efeb, roughness: 0.32 });

	// carcass (slightly inset behind the doors)
	const carcass = roundedBox(W - 0.004, bodyH, D - 0.022, 0.002, 2);
	carcass.translate(0, legH + bodyH / 2, (D - 0.022) / 2);
	const body = new THREE.Mesh(carcass, lacquer);
	body.castShadow = body.receiveShadow = true;
	g.add(body);
	// three doors with 3 mm gaps, 19 mm thick
	const doorW = (W - 0.004 - 4 * 0.003) / 3;
	const doors: THREE.BufferGeometry[] = [];
	for (let i = 0; i < 3; i++) {
		const d = roundedBox(doorW, bodyH - 0.006, 0.019, 0.0015, 2);
		d.translate(-W / 2 + 0.002 + 0.003 + doorW / 2 + i * (doorW + 0.003), legH + bodyH / 2, D - 0.0095);
		doors.push(d);
	}
	const doorMesh = new THREE.Mesh(merge(doors), lacquer);
	doorMesh.castShadow = doorMesh.receiveShadow = true;
	g.add(doorMesh);
	// shadow-gap backing between the doors (reads as dark joints)
	const gaps = new THREE.Mesh(box(W - 0.006, bodyH - 0.008, 0.002, 0, legH + bodyH / 2, D - 0.02), M.shadowGap);
	g.add(gaps);
	// oak top, overhanging the doors by 3 mm
	const topGeo = roundedBox(W, topT, D + 0.003, 0.003, 3);
	topGeo.translate(0, legH + bodyH + topT / 2, (D + 0.003) / 2);
	const top = new THREE.Mesh(topGeo, M.oak);
	top.castShadow = top.receiveShadow = true;
	g.add(top);
	// legs: 20 mm square steel, set in 60 mm from each end
	const legs: THREE.BufferGeometry[] = [];
	for (const sx of [-1, 1]) for (const z of [0.05, D - 0.06]) {
		const l = roundedBox(0.02, legH, 0.02, 0.002, 1);
		l.translate(sx * (W / 2 - 0.08), legH / 2, z);
		legs.push(l);
	}
	const legMesh = new THREE.Mesh(merge(legs), M.blackPowder);
	legMesh.castShadow = true;
	g.add(legMesh);

	// a few restrained objects on top: three books and a stoneware vase
	const topY = legH + bodyH + topT;
	const bookCols = [0x8c8577, 0x2f3a40, 0xd8d2c4];
	const books: THREE.Mesh[] = [];
	let y = topY;
	[[0.24, 0.032, 0.17], [0.22, 0.026, 0.155], [0.2, 0.02, 0.14]].forEach(([w, h, d], i) => {
		const b = new THREE.Mesh(roundedBox(w, h, d, 0.002, 2), new THREE.MeshStandardMaterial({ color: bookCols[i], roughness: 0.75 }));
		b.position.set(-0.42 + (i - 1) * 0.008, y + h / 2, D / 2 + (i % 2 ? 0.006 : -0.004));
		b.rotation.y = (i - 1) * 0.06 + 0.12;
		b.castShadow = b.receiveShadow = true;
		g.add(b);
		books.push(b);
		y += h;
	});
	const vaseProf: [number, number][] = [[0, 0], [0.045, 0], [0.058, 0.03], [0.062, 0.08], [0.05, 0.15], [0.03, 0.19], [0.026, 0.215], [0.03, 0.225], [0.026, 0.226], [0.022, 0.2]];
	const vase = new THREE.Mesh(new THREE.LatheGeometry(vaseProf.map(([a, b]) => new THREE.Vector2(a, b)), 48), M.ceramicMatte);
	vase.position.set(0.48, topY, D / 2 + 0.02);
	vase.castShadow = vase.receiveShadow = true;
	g.add(vase);

	return { group: g, size: new THREE.Vector3(W, legH + bodyH + topT, D) };
}
