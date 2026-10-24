import * as THREE from 'three';
import { roundedBox, merge, beveledPanel, box } from '../../util/geometry';
import type { Materials } from '../materials';

/** Glazed stoneware mug, 82 mm diameter x 95 mm. Origin at the base centre. */
export function buildMug(M: Materials) {
	const g = new THREE.Group();
	g.name = 'mug';
	// outer wall, rim, inner wall and floor as one lathe profile (x = radius)
	const prof: [number, number][] = [
		[0.0, 0.0], [0.034, 0.0], [0.037, 0.003], [0.0385, 0.012], [0.0405, 0.06], [0.041, 0.092],
		[0.0405, 0.0948], [0.0392, 0.095], [0.0372, 0.0935], [0.0368, 0.09], [0.0362, 0.012], [0.033, 0.0075], [0.0, 0.007],
	];
	const body = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 64);
	const handleCurve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(0.039, 0.078, 0), new THREE.Vector3(0.062, 0.076, 0), new THREE.Vector3(0.068, 0.05, 0),
		new THREE.Vector3(0.06, 0.026, 0), new THREE.Vector3(0.0395, 0.022, 0),
	]);
	const handle = new THREE.TubeGeometry(handleCurve, 40, 0.0058, 14, false);
	handle.scale(1, 1, 1.25); // oval section
	const mesh = new THREE.Mesh(merge([body, handle]), M.ceramicWhite);
	mesh.castShadow = mesh.receiveShadow = true;
	g.add(mesh);
	// unglazed foot ring
	const foot = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.035, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcbc2b4, roughness: 0.9 }));
	foot.position.y = 0.0002;
	g.add(foot);
	return { group: g, radius: 0.041, height: 0.095 };
}

/** A5 hardback notebook (148 x 210 x 15 mm) with elastic closure band. */
export function buildNotebook(M: Materials) {
	const g = new THREE.Group();
	g.name = 'notebook';
	const W = 0.148, D = 0.21, T = 0.015, board = 0.0022;
	const covers = merge([
		(() => { const b = roundedBox(W, board, D, 0.002, 2); b.translate(0, board / 2, 0); return b; })(),
		(() => { const b = roundedBox(W, board, D, 0.002, 2); b.translate(0, T - board / 2, 0); return b; })(),
		// spine
		(() => { const b = roundedBox(0.004, T, D, 0.0018, 2); b.translate(-W / 2 + 0.002, T / 2, 0); return b; })(),
	]);
	const c = new THREE.Mesh(covers, M.cover);
	c.castShadow = c.receiveShadow = true;
	g.add(c);
	const pages = new THREE.Mesh(box(W - 0.006, T - 2 * board, D - 0.006, 0.001, T / 2, 0), M.paper);
	pages.castShadow = true;
	g.add(pages);
	const band = new THREE.Mesh(box(0.008, T + 0.0012, D + 0.0012, W / 2 - 0.022, T / 2, 0), M.blackPlastic);
	g.add(band);
	return { group: g, size: new THREE.Vector3(W, T, D) };
}

/** Matte black aluminium rollerball pen, 140 mm. Origin at its centre, axis along X. */
export function buildPen(M: Materials) {
	const g = new THREE.Group();
	g.name = 'pen';
	const body = new THREE.CylinderGeometry(0.0048, 0.0048, 0.11, 24);
	const tipCone = new THREE.CylinderGeometry(0.0048, 0.0016, 0.022, 24);
	tipCone.translate(0, -0.066, 0);
	const cap = new THREE.CylinderGeometry(0.0049, 0.0049, 0.008, 24);
	cap.translate(0, 0.059, 0);
	const m = new THREE.Mesh(merge([body, tipCone, cap]), M.blackPowder);
	m.rotation.z = Math.PI / 2;
	m.castShadow = true;
	g.add(m);
	const nib = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.004, 8), M.chrome);
	nib.rotation.z = Math.PI / 2;
	nib.position.x = 0.079;
	g.add(nib);
	const clip = new THREE.Mesh(roundedBox(0.045, 0.002, 0.0035, 0.0009, 2), M.chrome);
	clip.position.set(-0.035, 0.0055, 0);
	g.add(clip);
	return { group: g, radius: 0.0049, length: 0.142 };
}

/** Wool felt desk pad 800 x 320 x 3 mm. */
export function buildDeskPad(M: Materials) {
	const geo = beveledPanel(0.8, 0.32, 0.003, 0.012, 0.0008);
	geo.rotateX(-Math.PI / 2);
	geo.translate(0, 0.0015, 0);
	const m = new THREE.Mesh(geo, M.deskPad);
	m.name = 'desk-pad';
	m.receiveShadow = true;
	return m;
}

/** Double wall socket plate (white, 146 x 86 mm). Origin at plate back centre, facing +Z. */
export function buildSocket(M: Materials) {
	const g = new THREE.Group();
	g.name = 'socket';
	const plate = new THREE.Mesh(beveledPanel(0.146, 0.086, 0.009, 0.006, 0.002), M.doorPaint);
	plate.position.z = 0.0045;
	plate.castShadow = true;
	g.add(plate);
	const holes: THREE.BufferGeometry[] = [];
	for (const sx of [-0.036, 0.036]) {
		for (const [hx, hy, w, h] of [[0, 0.012, 0.004, 0.007], [-0.009, -0.006, 0.006, 0.004], [0.009, -0.006, 0.006, 0.004]] as const) {
			holes.push(box(w, h, 0.0006, sx + hx, hy, 0.0093));
		}
	}
	g.add(new THREE.Mesh(merge(holes), M.shadowGap));
	return g;
}

/**
 * Framed art print: an abstract composition painted to a canvas (soft-edged
 * arcs in muted sand/terracotta/charcoal on warm paper), behind glass in a
 * slim black aluminium frame with a white mount. Origin at the back centre,
 * facing +Z. Size 700 x 1000 mm.
 */
export function buildArtPrint(M: Materials) {
	const g = new THREE.Group();
	g.name = 'art-print';
	const W = 0.7, H = 1.0, frame = 0.018, depth = 0.025, mount = 0.08;
	const canvas = document.createElement('canvas');
	canvas.width = 1024; canvas.height = 1463;
	const ctx = canvas.getContext('2d')!;
	// warm paper with subtle grain
	ctx.fillStyle = '#efe9df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
	let seed = 7;
	const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	for (let i = 0; i < img.data.length; i += 4) {
		const n = (rnd() - 0.5) * 10;
		img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
	}
	ctx.putImageData(img, 0, 0);
	const cx = canvas.width / 2;
	ctx.globalAlpha = 0.95;
	ctx.fillStyle = '#c4703f'; // terracotta sun
	ctx.beginPath(); ctx.arc(cx + 120, 520, 210, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = '#d9c3a0'; // sand hill
	ctx.beginPath(); ctx.ellipse(cx - 60, 1180, 520, 340, 0, Math.PI, 0); ctx.fill();
	ctx.fillStyle = '#2f3134'; // charcoal hill
	ctx.beginPath(); ctx.ellipse(cx + 260, 1260, 420, 300, 0, Math.PI, 0); ctx.fill();
	ctx.fillStyle = '#efe9df';
	ctx.fillRect(0, 1180, canvas.width, 400);
	ctx.strokeStyle = '#2f3134'; ctx.lineWidth = 3;
	ctx.beginPath(); ctx.moveTo(140, 1180); ctx.lineTo(canvas.width - 140, 1180); ctx.stroke();
	ctx.globalAlpha = 1;
	ctx.fillStyle = '#5b5752';
	ctx.font = '500 26px "Helvetica Neue", Helvetica, Arial, sans-serif';
	ctx.fillText('Morning, low sun', 140, 1270);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 8;

	// frame: four mitred bars approximated by boxes
	const bars = merge([
		box(W, frame, depth, 0, H / 2 - frame / 2, depth / 2),
		box(W, frame, depth, 0, -H / 2 + frame / 2, depth / 2),
		box(frame, H - 2 * frame, depth, W / 2 - frame / 2, 0, depth / 2),
		box(frame, H - 2 * frame, depth, -W / 2 + frame / 2, 0, depth / 2),
	]);
	const frameMesh = new THREE.Mesh(bars, M.blackPowder);
	frameMesh.castShadow = true;
	g.add(frameMesh);
	const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * frame, H - 2 * frame), new THREE.MeshStandardMaterial({ color: 0xf5f4f0, roughness: 0.9 }));
	back.position.z = 0.006;
	g.add(back);
	const artW = W - 2 * frame - 2 * mount, artH = artW * (canvas.height / canvas.width);
	const print = new THREE.Mesh(new THREE.PlaneGeometry(artW, artH), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
	print.position.set(0, 0.01, 0.0062);
	g.add(print);
	const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * frame, H - 2 * frame), M.glass.clone());
	(glass.material as THREE.MeshPhysicalMaterial).opacity = 0.04;
	glass.position.z = depth - 0.004;
	g.add(glass);
	return g;
}
