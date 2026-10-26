import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Finish } from './materials';

/**
 * Furniture you can have in the home, built procedurally at real size
 * (metres, origin at the centre of the footprint on the floor, front +Z).
 *
 * Every piece is split into named finish slots (a sofa's fabric and legs,
 * a table's top and frame...) so "make the sofa velvet" changes one slot's
 * material and nothing else. Geometry gets UVs in metres so a texture's
 * tile size means the same on everything.
 */

export type Kind =
	| 'sofa' | 'armchair' | 'coffee table' | 'side table' | 'rug' | 'floor lamp' | 'table lamp' | 'plant' | 'bookshelf'
	| 'tv stand' | 'dining table' | 'dining chair' | 'kitchen counter' | 'fridge' | 'bar stool' | 'bed' | 'nightstand'
	| 'wardrobe' | 'desk' | 'artwork' | 'pendant light';

export interface Piece {
	group: THREE.Group;
	/** meshes per finish slot */
	slots: Record<string, THREE.Mesh[]>;
	defaults: Record<string, Finish>;
	/** lamps: the bulb */
	light?: THREE.PointLight;
	/** hangs on a wall / from the ceiling / lies flat (moves differ) */
	mount: 'floor' | 'wall' | 'ceiling' | 'flat';
}

/** what each kind is called, how people say it, and its finish slots */
export const KINDS: Record<Kind, { words: string[]; slots: string[] }> = {
	sofa: { words: ['sofa', 'couch', 'settee'], slots: ['fabric', 'legs'] },
	armchair: { words: ['armchair', 'arm chair', 'lounge chair', 'reading chair', 'chair'], slots: ['fabric', 'legs'] },
	'coffee table': { words: ['coffee table'], slots: ['top', 'frame'] },
	'side table': { words: ['side table', 'end table'], slots: ['top', 'frame'] },
	rug: { words: ['rug', 'carpet', 'mat'], slots: ['fabric'] },
	'floor lamp': { words: ['floor lamp', 'standing lamp', 'lamp'], slots: ['shade', 'frame'] },
	'table lamp': { words: ['table lamp', 'bedside lamp', 'lamp'], slots: ['shade', 'frame'] },
	plant: { words: ['plant', 'house plant', 'tree', 'pot'], slots: ['pot', 'leaves'] },
	bookshelf: { words: ['bookshelf', 'bookcase', 'shelf', 'shelves'], slots: ['frame', 'books'] },
	'tv stand': { words: ['tv stand', 'tv', 'television', 'media unit', 'tv unit'], slots: ['frame', 'screen'] },
	'dining table': { words: ['dining table', 'table'], slots: ['top', 'frame'] },
	'dining chair': { words: ['dining chair', 'chair'], slots: ['seat', 'frame'] },
	'kitchen counter': { words: ['kitchen counter', 'counter', 'kitchen', 'cabinets', 'worktop'], slots: ['cabinets', 'worktop'] },
	fridge: { words: ['fridge', 'refrigerator'], slots: ['body'] },
	'bar stool': { words: ['bar stool', 'stool'], slots: ['seat', 'frame'] },
	bed: { words: ['bed'], slots: ['bedding', 'frame'] },
	nightstand: { words: ['nightstand', 'bedside table', 'night stand'], slots: ['frame'] },
	wardrobe: { words: ['wardrobe', 'closet', 'cupboard'], slots: ['frame'] },
	desk: { words: ['desk', 'work desk'], slots: ['top', 'frame'] },
	artwork: { words: ['artwork', 'painting', 'picture', 'art', 'print', 'poster'], slots: ['frame', 'art'] },
	'pendant light': { words: ['pendant', 'pendant light', 'ceiling light', 'chandelier'], slots: ['shade'] },
};
export const KIND_LIST = Object.keys(KINDS) as Kind[];

/** recompute UVs as metres, projected along each face's dominant axis */
export function metreUV(g: THREE.BufferGeometry) {
	const p = g.getAttribute('position'), n = g.getAttribute('normal');
	const uv = new Float32Array(p.count * 2);
	for (let i = 0; i < p.count; i++) {
		const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
		const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
		if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
	}
	g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	return g;
}

const F = (preset: Finish['preset'], color?: string): Finish => ({ preset, color });

class Builder {
	group = new THREE.Group();
	slots: Record<string, THREE.Mesh[]> = {};
	add(slot: string, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
		g.translate(0, 0, 0);
		const m = new THREE.Mesh(metreUV(g), undefined);
		m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
		m.castShadow = true; m.receiveShadow = true;
		this.group.add(m);
		(this.slots[slot] ??= []).push(m);
		return m;
	}
	box(slot: string, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.01, ry = 0) {
		const g = r > 0.002 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)) : new THREE.BoxGeometry(w, h, d);
		return this.add(slot, g, x, y + h / 2, z, ry);
	}
	cyl(slot: string, r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 16) {
		return this.add(slot, new THREE.CylinderGeometry(r1, r0, h, seg), x, y + h / 2, z);
	}
	legs(slot: string, w: number, d: number, h: number, t = 0.035, inset = 0.05) {
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(slot, t, h, t, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), 0.004);
	}
}

export function build(kind: Kind): Piece {
	const b = new Builder();
	let defaults: Record<string, Finish> = {};
	let light: THREE.PointLight | undefined;
	let mount: Piece['mount'] = 'floor';
	switch (kind) {
		case 'sofa': {
			const W = 2.2, D = 0.92;
			b.legs('legs', W - 0.1, D - 0.1, 0.12, 0.04);
			b.box('fabric', W, 0.2, D, 0, 0.12, 0, 0.05);
			for (const sx of [-1, 1]) b.box('fabric', 0.18, 0.42, D, sx * (W / 2 - 0.09), 0.12, 0, 0.06);
			b.box('fabric', W - 0.36, 0.18, D - 0.25, 0, 0.32, 0.08, 0.07);
			b.box('fabric', W, 0.48, 0.2, 0, 0.32, -D / 2 + 0.1, 0.07);
			for (const sx of [-0.45, 0.45]) b.box('fabric', 0.85, 0.36, 0.14, sx, 0.5, -D / 2 + 0.25, 0.07);
			defaults = { fabric: F('linen', '#b9b2a6'), legs: F('walnut') };
			break;
		}
		case 'armchair': {
			const W = 0.86, D = 0.84;
			b.legs('legs', W - 0.08, D - 0.08, 0.14, 0.035);
			b.box('fabric', W, 0.24, D, 0, 0.14, 0, 0.05);
			for (const sx of [-1, 1]) b.box('fabric', 0.14, 0.32, D, sx * (W / 2 - 0.07), 0.38, 0, 0.05);
			b.box('fabric', W, 0.46, 0.16, 0, 0.38, -D / 2 + 0.08, 0.06);
			defaults = { fabric: F('wool', '#8f8a7f'), legs: F('oak') };
			break;
		}
		case 'coffee table': b.box('top', 1.2, 0.05, 0.65, 0, 0.36, 0, 0.012); b.legs('frame', 1.15, 0.6, 0.36, 0.035, 0.04); defaults = { top: F('oak'), frame: F('black metal') }; break;
		case 'side table': b.cyl('top', 0.25, 0.25, 0.03, 0, 0.52, 0, 28); b.cyl('frame', 0.02, 0.02, 0.52, 0, 0, 0, 10); b.cyl('frame', 0.18, 0.16, 0.02, 0, 0, 0, 20); defaults = { top: F('marble'), frame: F('brass') }; break;
		case 'rug': b.box('fabric', 2.4, 0.012, 1.7, 0, 0, 0, 0.004); mount = 'flat'; defaults = { fabric: F('wool', '#cbbfae') }; break;
		case 'floor lamp': {
			b.cyl('frame', 0.15, 0.15, 0.025, 0, 0, 0, 20); b.cyl('frame', 0.012, 0.012, 1.45, 0, 0.02, 0, 8);
			b.add('shade', new THREE.CylinderGeometry(0.16, 0.22, 0.3, 24, 1, true), 0, 1.55, 0);
			light = new THREE.PointLight(0xffd8a8, 1.8, 6, 2); light.position.set(0, 1.5, 0); b.group.add(light);
			defaults = { shade: F('linen', '#efe6d6'), frame: F('brass') };
			break;
		}
		case 'table lamp': {
			b.cyl('frame', 0.07, 0.08, 0.3, 0, 0, 0, 20);
			b.add('shade', new THREE.CylinderGeometry(0.11, 0.15, 0.2, 24, 1, true), 0, 0.38, 0);
			light = new THREE.PointLight(0xffd8a8, 0.8, 4, 2); light.position.set(0, 0.36, 0); b.group.add(light);
			defaults = { shade: F('linen', '#efe6d6'), frame: F('lacquer', '#d9d2c6') };
			break;
		}
		case 'plant': {
			b.cyl('pot', 0.16, 0.2, 0.36, 0, 0, 0, 24);
			const lg = new THREE.IcosahedronGeometry(0.42, 1); lg.scale(1, 1.35, 1);
			const leaves = b.add('leaves', lg, 0, 0.9, 0); leaves.scale.set(0.9, 1, 0.9);
			for (const [x, z, s] of [[0.18, 0.1, 0.55], [-0.15, -0.12, 0.6], [0.05, -0.2, 0.5]] as const) b.add('leaves', new THREE.IcosahedronGeometry(0.25 * s * 2, 1), x, 0.65 + s * 0.4, z);
			defaults = { pot: F('lacquer', '#d6cfc4'), leaves: F('paint', '#3d6b3a') };
			break;
		}
		case 'bookshelf': {
			const W = 0.9, H = 1.9, D = 0.32;
			for (const sx of [-1, 1]) b.box('frame', 0.025, H, D, sx * (W / 2 - 0.0125), 0, 0, 0.004);
			for (let i = 0; i < 6; i++) b.box('frame', W, 0.025, D, 0, i * 0.37, 0, 0.004);
			b.box('frame', W, H, 0.012, 0, 0, -D / 2 + 0.006, 0);
			for (let i = 0; i < 5; i++) for (let k = 0; k < 7; k++) if ((i * 7 + k) % 5 !== 3) b.box('books', 0.06 + 0.03 * ((i + k) % 3) / 2, 0.22 + 0.06 * ((i * 3 + k) % 3) / 2, 0.22, -W / 2 + 0.09 + k * 0.105, 0.025 + i * 0.37, 0.02, 0.003);
			defaults = { frame: F('walnut'), books: F('linen', '#8a6f5a') };
			break;
		}
		case 'tv stand': {
			b.box('frame', 1.8, 0.45, 0.42, 0, 0.08, 0, 0.01); b.legs('frame', 1.7, 0.36, 0.08, 0.03);
			b.box('screen', 1.45, 0.84, 0.04, 0, 0.62, -0.05, 0.006); b.box('screen', 0.3, 0.09, 0.2, 0, 0.53, -0.05, 0.004);
			defaults = { frame: F('walnut'), screen: F('lacquer', '#141518') };
			break;
		}
		case 'dining table': b.box('top', 1.9, 0.045, 0.95, 0, 0.71, 0, 0.012); b.legs('frame', 1.8, 0.85, 0.71, 0.06, 0.08); defaults = { top: F('oak'), frame: F('oak') }; break;
		case 'dining chair': {
			b.legs('frame', 0.44, 0.46, 0.45, 0.03, 0.03);
			b.box('seat', 0.46, 0.05, 0.46, 0, 0.45, 0, 0.015);
			for (const sx of [-1, 1]) b.box('frame', 0.03, 0.45, 0.03, sx * 0.2, 0.5, -0.2, 0.004);
			b.box('seat', 0.44, 0.2, 0.03, 0, 0.72, -0.21, 0.01);
			defaults = { seat: F('oak'), frame: F('oak') };
			break;
		}
		case 'kitchen counter': {
			const W = 3.0, D = 0.62;
			b.box('cabinets', W, 0.86, D - 0.02, 0, 0.1, 0, 0.004); b.box('cabinets', W - 0.02, 0.1, D - 0.1, 0, 0, -0.04, 0);
			b.box('worktop', W + 0.02, 0.04, D, 0, 0.96, 0, 0.006);
			for (let i = 0; i < 5; i++) b.box('cabinets', 0.005, 0.8, 0.005, -W / 2 + 0.6 * (i + 0.5) + 0.3 - 0.3, 0.12, D / 2 - 0.01, 0); // door gaps
			b.box('worktop', 0.6, 0.6, 0.35, W / 2 - 0.9, 1.6, -D / 2 + 0.17, 0.006); // wall cabinet hint
			defaults = { cabinets: F('lacquer', '#e9e5de'), worktop: F('marble') };
			break;
		}
		case 'fridge': b.box('body', 0.7, 1.95, 0.68, 0, 0, 0, 0.02); b.box('body', 0.02, 0.6, 0.02, -0.28, 1.1, 0.35, 0.004); defaults = { body: F('brushed steel') }; break;
		case 'bar stool': b.cyl('seat', 0.19, 0.19, 0.05, 0, 0.72, 0, 24); b.cyl('frame', 0.022, 0.022, 0.72, 0, 0, 0, 10); b.cyl('frame', 0.2, 0.2, 0.02, 0, 0, 0, 20); defaults = { seat: F('leather'), frame: F('black metal') }; break;
		case 'bed': {
			const W = 1.65, L = 2.1;
			b.box('frame', W + 0.08, 0.3, L, 0, 0.06, 0, 0.02); b.legs('frame', W, L, 0.06, 0.06);
			b.box('bedding', W, 0.22, L - 0.08, 0, 0.36, 0.02, 0.06);
			for (const sx of [-0.4, 0.4]) b.box('bedding', 0.6, 0.14, 0.38, sx, 0.58, -L / 2 + 0.3, 0.06);
			b.box('frame', W + 0.08, 0.95, 0.08, 0, 0.06, -L / 2 - 0.02, 0.02);
			b.box('bedding', W + 0.02, 0.24, 1.1, 0, 0.36, L / 2 - 0.55, 0.05);
			defaults = { bedding: F('linen', '#e8e3da'), frame: F('oak') };
			break;
		}
		case 'nightstand': b.box('frame', 0.48, 0.5, 0.4, 0, 0.06, 0, 0.012); b.legs('frame', 0.44, 0.36, 0.06, 0.025); b.box('frame', 0.42, 0.005, 0.005, 0, 0.32, 0.2, 0); defaults = { frame: F('walnut') }; break;
		case 'wardrobe': b.box('frame', 1.6, 2.2, 0.6, 0, 0, 0, 0.01); for (const x of [-0.4, 0, 0.4]) b.box('frame', 0.006, 2.1, 0.006, x, 0.05, 0.3, 0); defaults = { frame: F('whitewashed oak') }; break;
		case 'desk': b.box('top', 1.4, 0.035, 0.7, 0, 0.73, 0, 0.008); b.legs('frame', 1.35, 0.65, 0.73, 0.04, 0.04); defaults = { top: F('oak'), frame: F('black metal') }; break;
		case 'artwork': {
			mount = 'wall';
			b.box('frame', 0.9, 0.65, 0.035, 0, 1.25, 0, 0.004);
			const art = b.box('art', 0.8, 0.55, 0.01, 0, 1.3, 0.02, 0);
			art.userData.art = true;
			defaults = { frame: F('black metal'), art: F('paint', '#c4a882') };
			break;
		}
		case 'pendant light': {
			mount = 'ceiling';
			b.cyl('shade', 0.008, 0.008, 0.9, 0, -0.9, 0, 6);
			b.add('shade', new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0, -0.9, 0, 0, Math.PI);
			light = new THREE.PointLight(0xffd8a8, 1.6, 7, 2); light.position.set(0, -1.0, 0); b.group.add(light);
			defaults = { shade: F('brass') };
			break;
		}
	}
	return { group: b.group, slots: b.slots, defaults, light, mount };
}
