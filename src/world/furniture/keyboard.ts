import * as THREE from 'three';
import { KEYS, UNIT, LAYOUT_WIDTH_U, LAYOUT_HEIGHT_U } from '../../computer/keyLayout';
import { beveledPanel, roundedRectShape } from '../../util/geometry';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Materials } from '../materials';

/**
 * Tenkeyless mechanical keyboard: CNC aluminium case with a 6 degree typing
 * angle, individually modelled sculpted keycaps (one merged mesh, one draw
 * call) with printed legends, and per-key press animation driven from a
 * small data texture.
 *
 * Local frame: origin at the centre of the footprint on the desk, +Z toward
 * the user, +X to the right.
 */

export const KB = {
	marginX: 0.009,
	marginTop: 0.011,
	marginBottom: 0.011,
	tiltDeg: 5.5,
	frontHeight: 0.0135, // height of the case floor (plate level) at the front edge
	bezelHeight: 0.0055, // raised frame around the plate
	capHeight: 0.0078,
	travel: 0.0035,
};

const keyW = LAYOUT_WIDTH_U * UNIT, keyD = LAYOUT_HEIGHT_U * UNIT;
export const KB_SIZE = { w: keyW + 2 * KB.marginX, d: keyD + KB.marginTop + KB.marginBottom };

function capGeometry(wU: number): THREE.BufferGeometry {
	const gap = 0.0011;
	const w = wU * UNIT - gap, d = UNIT - gap, h = KB.capHeight;
	const g = new RoundedBoxGeometry(w, h, d, 3, 0.0016);
	g.translate(0, h / 2, 0);
	// sculpt: taper the top, cylindrical dish, slight rearward lean
	const pos = g.getAttribute('position');
	const topInset = 0.0028;
	for (let i = 0; i < pos.count; i++) {
		let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
		const t = y / h; // 0 bottom .. 1 top
		const sx = (w / 2 - topInset * t) / (w / 2), sz = (d / 2 - topInset * t) / (d / 2);
		x *= sx; z = z * sz - 0.0008 * t;
		if (t > 0.95) {
			const nx = x / (w / 2 - topInset);
			y -= 0.0005 * (1 - Math.min(1, nx * nx));
		}
		pos.setXYZ(i, x, y, z);
	}
	g.computeVertexNormals();
	return g.toNonIndexed();
}

function legendTexture(): THREE.CanvasTexture {
	const pxPerU = 112;
	const c = document.createElement('canvas');
	c.width = Math.round(LAYOUT_WIDTH_U * pxPerU);
	c.height = Math.round(LAYOUT_HEIGHT_U * pxPerU);
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#2b2c2f';
	ctx.fillRect(0, 0, c.width, c.height);
	const font = '"Helvetica Neue", Helvetica, Arial, sans-serif';
	for (const k of KEYS) {
		const x = k.x * pxPerU, y = k.y * pxPerU, w = k.w * pxPerU;
		// modifier keys a touch lighter, like a two-tone set
		const mod = !k.char || k.code === 'Space' ? (k.code === 'Space' ? false : true) : false;
		ctx.fillStyle = mod ? '#3a3b3f' : '#2b2c2f';
		ctx.fillRect(x + 2, y + 2, w - 4, pxPerU - 4);
		if (k.code === 'Escape') { ctx.fillStyle = '#c9c1b3'; ctx.fillRect(x + 2, y + 2, w - 4, pxPerU - 4); }
		ctx.fillStyle = k.code === 'Escape' ? '#2b2c2f' : '#dcdcdc';
		ctx.textBaseline = 'top';
		const pad = 26; // keep legends on the flat top (sides sample the border)
		if (k.shift) {
			ctx.font = `500 22px ${font}`;
			ctx.fillText(k.shift, x + pad, y + pad - 2);
			ctx.font = `500 22px ${font}`;
			ctx.fillText(k.label, x + pad, y + pad + 30);
		} else if (k.label.length <= 1) {
			ctx.font = `500 26px ${font}`;
			ctx.fillText(k.label, x + pad, y + pad);
		} else {
			ctx.font = `500 15px ${font}`;
			ctx.fillText(k.label, x + pad, y + pxPerU - pad - 14);
		}
	}
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;
}

export function buildKeyboard(M: Materials) {
	const g = new THREE.Group();
	g.name = 'keyboard';
	const { w: W, d: D } = KB_SIZE;
	const tilt = THREE.MathUtils.degToRad(KB.tiltDeg);
	const backHeight = KB.frontHeight + Math.tan(tilt) * D;

	// ---------------------------------------------------------------- case (wedge)
	const prof = new THREE.Shape();
	// side profile in (z, y): front at +D/2
	prof.moveTo(D / 2, 0);
	prof.lineTo(D / 2, KB.frontHeight - 0.002);
	prof.quadraticCurveTo(D / 2, KB.frontHeight, D / 2 - 0.002, KB.frontHeight);
	prof.lineTo(-D / 2 + 0.002, backHeight);
	prof.quadraticCurveTo(-D / 2, backHeight, -D / 2, backHeight - 0.002);
	prof.lineTo(-D / 2, 0);
	prof.closePath();
	const caseGeo = new THREE.ExtrudeGeometry(prof, { depth: W - 0.004, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.002, bevelSegments: 3, curveSegments: 6 });
	// extruded along +Z in shape space; rotateY(-90deg) maps shape-x -> +Z and
	// the extrusion -> -X (a rotation, so winding stays correct)
	caseGeo.rotateY(-Math.PI / 2);
	caseGeo.translate((W - 0.004) / 2, 0.0015, 0); // bevel grows 1.5 mm below y = 0
	caseGeo.computeVertexNormals();
	const caseMesh = new THREE.Mesh(caseGeo, M.darkAluminium);
	caseMesh.name = 'keyboard-case';
	caseMesh.castShadow = caseMesh.receiveShadow = true;
	g.add(caseMesh);
	// rubber feet
	for (const [fx, fz] of [[-W / 2 + 0.02, D / 2 - 0.015], [W / 2 - 0.02, D / 2 - 0.015], [-W / 2 + 0.02, -D / 2 + 0.015], [W / 2 - 0.02, -D / 2 + 0.015]]) {
		const f = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0015, 16), M.rubber);
		f.position.set(fx, -0.0007, fz);
		g.add(f);
	}

	// ---------------------------------------------------------------- deck (tilted plate)
	// The wedge's sloped top is the plate level; a raised frame surrounds the
	// plate so the switches sit in a shallow tray, as in a real CNC case.
	const deck = new THREE.Group();
	deck.name = 'keyboard-deck';
	deck.position.set(0, (KB.frontHeight + backHeight) / 2, 0);
	deck.rotation.x = tilt;
	g.add(deck);
	const outer = roundedRectShape(W - 0.0001, D / Math.cos(tilt), 0.006);
	const hole = roundedRectShape(keyW + 0.0032, keyD + 0.0032, 0.0022);
	outer.holes.push(new THREE.Path(hole.getPoints(6)));
	const bezelGeo = new THREE.ExtrudeGeometry(outer, { depth: KB.bezelHeight - 0.001, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.001, bevelSegments: 2, curveSegments: 6 });
	bezelGeo.rotateX(-Math.PI / 2);
	bezelGeo.computeVertexNormals();
	const bezel = new THREE.Mesh(bezelGeo, M.darkAluminium);
	bezel.castShadow = bezel.receiveShadow = true;
	deck.add(bezel);
	const plate = new THREE.Mesh(beveledPanel(keyW + 0.004, keyD + 0.004, 0.002, 0.002, 0.0003), M.blackPlastic);
	plate.rotation.x = -Math.PI / 2;
	deck.add(plate);

	// ---------------------------------------------------------------- keycaps
	const shapes = new Map<number, THREE.BufferGeometry>();
	const parts: THREE.BufferGeometry[] = [];
	const left = -keyW / 2, topZ = -keyD / 2;
	KEYS.forEach((k, idx) => {
		if (!shapes.has(k.w)) shapes.set(k.w, capGeometry(k.w));
		const cap = shapes.get(k.w)!.clone();
		const kx = left + (k.x + k.w / 2) * UNIT;
		const kz = topZ + (k.y + 0.5) * UNIT;
		cap.translate(kx, 0.001, kz);
		// planar top-down UVs into the legend atlas
		const pos = cap.getAttribute('position');
		const uv = new Float32Array(pos.count * 2);
		const ki = new Float32Array(pos.count);
		for (let i = 0; i < pos.count; i++) {
			uv[i * 2] = (pos.getX(i) - left) / keyW;
			uv[i * 2 + 1] = 1 - (pos.getZ(i) - topZ) / keyD;
			ki[i] = idx;
		}
		cap.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
		cap.setAttribute('keyIndex', new THREE.BufferAttribute(ki, 1));
		parts.push(cap);
	});
	const capsGeo = mergeWithAttr(parts);

	// key press state: 1 texel per key, 0 = up, 1 = fully pressed
	const pressData = new Uint8Array(128 * 4);
	const pressTex = new THREE.DataTexture(pressData, 128, 1, THREE.RGBAFormat);
	pressTex.needsUpdate = true;
	const capsMat = new THREE.MeshPhysicalMaterial({
		name: 'pbt-keycaps',
		map: legendTexture(),
		roughness: 0.62,
		// PBT has a fine grain; reuse the grit normal at a small scale
		normalMap: M.blackPowder.normalMap,
		normalScale: new THREE.Vector2(0.3, 0.3),
	});
	capsMat.onBeforeCompile = (sh) => {
		sh.uniforms.uPress = { value: pressTex };
		sh.vertexShader = sh.vertexShader
			.replace('#include <common>', '#include <common>\nattribute float keyIndex;\nuniform sampler2D uPress;')
			.replace('#include <begin_vertex>', `#include <begin_vertex>
				float press = texture2D( uPress, vec2( ( keyIndex + 0.5 ) / 128.0, 0.5 ) ).r;
				transformed.y -= press * ${KB.travel.toFixed(4)};`);
	};
	capsMat.customProgramCacheKey = () => 'keycaps';
	const caps = new THREE.Mesh(capsGeo, capsMat);
	caps.name = 'keycaps';
	caps.castShadow = caps.receiveShadow = true;
	deck.add(caps);

	const pressed = new Float32Array(KEYS.length);
	const target = new Float32Array(KEYS.length);
	return {
		group: g,
		deck,
		caps,
		/** set a key's target state; animated in update() */
		setKey(index: number, down: boolean) { target[index] = down ? 1 : 0; },
		tapKey(index: number) { target[index] = 1; setTimeout(() => (target[index] = 0), 90); },
		update(dt: number) {
			let dirty = false;
			for (let i = 0; i < pressed.length; i++) {
				const t = target[i];
				if (pressed[i] !== t) {
					const speed = t > pressed[i] ? 40 : 18; // fast down, springy up
					pressed[i] = t > pressed[i] ? Math.min(t, pressed[i] + speed * dt) : Math.max(t, pressed[i] - speed * dt);
					pressData[i * 4] = Math.round(pressed[i] * 255);
					dirty = true;
				}
			}
			if (dirty) pressTex.needsUpdate = true;
		},
		/** world-space top centre of a key (for VR poke detection) */
		keyLocal(index: number, out = new THREE.Vector3()) {
			const k = KEYS[index];
			return out.set(left + (k.x + k.w / 2) * UNIT, KB.capHeight, topZ + (k.y + 0.5) * UNIT);
		},
		size: { w: W, d: D, backHeight },
	};
}

function mergeWithAttr(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
	let n = 0;
	for (const p of parts) n += p.getAttribute('position').count;
	const out = new THREE.BufferGeometry();
	for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['keyIndex', 1]] as const) {
		const arr = new Float32Array(n * size);
		let o = 0;
		for (const p of parts) { const a = p.getAttribute(name).array as Float32Array; arr.set(a, o); o += a.length; }
		out.setAttribute(name, new THREE.BufferAttribute(arr, size));
	}
	return out;
}
