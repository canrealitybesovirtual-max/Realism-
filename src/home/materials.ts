import * as THREE from 'three';

/**
 * The material library for the home: named presets (woods, stones, plaster,
 * fabrics, metals, glass, plain paint) built from procedural textures that
 * are generated once and cached, so switching a floor to "natural stone" is a
 * material update, never a rebuild.
 *
 * Geometry in the home carries UVs in metres; each preset knows how many
 * metres one tile of its texture covers.
 */

export type PresetName =
	| 'paint' | 'plaster' | 'concrete' | 'oak' | 'walnut' | 'whitewashed oak' | 'herringbone'
	| 'natural stone' | 'marble' | 'slate' | 'travertine' | 'terrazzo' | 'brick' | 'white tile'
	| 'linen' | 'velvet' | 'leather' | 'wool' | 'brushed steel' | 'brass' | 'chrome' | 'black metal' | 'glass' | 'lacquer'
	/** AR only: no overlay, your real surface shows through the passthrough */
	| 'original';

interface Preset {
	/** default colour (multiplies the texture) */
	color: string;
	roughness: number;
	metalness: number;
	/** metres covered by one texture tile */
	tile: number;
	tex?: (c: Ctx) => void;
	/** normal strength (0 = flat) */
	bump?: number;
	sheen?: number;
	clearcoat?: number;
	transparent?: boolean;
	/** colour can be changed (paint, fabric, lacquer) or is the material's own (stone, wood) */
	tintable: boolean;
	category: 'wall' | 'floor' | 'wood' | 'stone' | 'fabric' | 'metal' | 'other';
}

type Ctx = { g: CanvasRenderingContext2D; h: Float32Array; S: number };

// ------------------------------------------------------------------ noise
function hash(i: number, j: number) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vn(x: number, y: number, p: number) {
	const i = Math.floor(x), j = Math.floor(y); let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
	const w = (a: number) => ((a % p) + p) % p;
	const a = hash(w(i), w(j)), b = hash(w(i + 1), w(j)), c = hash(w(i), w(j + 1)), d = hash(w(i + 1), w(j + 1));
	return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x: number, y: number, p: number, oct = 4) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < oct; k++) { s += a * vn(x * f, y * f, p * f); f *= 2; a *= 0.5; } return s; }

/** per-pixel painter: f(u, v) -> [grey 0..1 or rgb, height] over a tileable square */
function paint(c: Ctx, f: (u: number, v: number, x: number, y: number) => [number, number, number, number]) {
	const { g, h, S } = c, img = g.createImageData(S, S), d = img.data;
	for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
		const [r, gg, b, hh] = f(x / S, y / S, x, y), o = (y * S + x) * 4;
		d[o] = r * 255; d[o + 1] = gg * 255; d[o + 2] = b * 255; d[o + 3] = 255; h[y * S + x] = hh;
	}
	g.putImageData(img, 0, 0);
}
const grey = (v: number, hgt = v): [number, number, number, number] => [v, v, v, hgt];

// ------------------------------------------------------------------ textures
const T = {
	plaster: (c: Ctx) => paint(c, (u, v) => { const n = fbm(u * 8, v * 8, 8) * 0.7 + fbm(u * 64, v * 64, 64, 2) * 0.3; return grey(0.9 + 0.1 * n, n); }),
	concrete: (c: Ctx) => paint(c, (u, v) => { const n = fbm(u * 6, v * 6, 6, 5), pit = vn(u * 180, v * 180, 180) > 0.93 ? -0.25 : 0; return grey(0.72 + 0.28 * n + pit, n + pit); }),
	wood: (dark: number) => (c: Ctx) => paint(c, (u, v) => {
		// planks 20 cm wide (5 per 1 m tile), staggered ends, grain along v
		const plank = Math.floor(u * 5), off = hash(plank, 7) * 1.0, pv = (v + off) % 1;
		const seam = Math.min(u * 5 - plank, 1 - (u * 5 - plank)) < 0.012 || Math.abs(pv - 0.5) < 0.003 ? 0.55 : 1;
		const grain = 0.5 + 0.5 * Math.sin((u * 5 - plank) * 60 + fbm(u * 5, v * 2, 5) * 9 + plank * 3);
		const tone = 0.75 + 0.25 * hash(plank, Math.floor((v + off) * 2)) - dark * 0.1;
		const k = tone * (0.85 + 0.15 * grain) * seam;
		return [k, k * 0.86, k * 0.7, k];
	}),
	herringbone: (c: Ctx) => paint(c, (u, v) => {
		const x = u * 8, y = v * 8, cell = Math.floor(x) + Math.floor(y), dir = cell % 2 === 0;
		const along = dir ? x + y * 0.5 : y + x * 0.5, plank = Math.floor(along * 2);
		const fr = along * 2 - plank, seam = fr < 0.04 || (dir ? (x % 1) : (y % 1)) < 0.02 ? 0.6 : 1;
		const k = (0.78 + 0.22 * hash(plank, cell)) * (0.88 + 0.12 * Math.sin(along * 90)) * seam;
		return [k, k * 0.84, k * 0.66, k];
	}),
	stone: (c: Ctx) => {
		// irregular flagstones: nearest of jittered cell centres; mortar where two are close
		const N = 4, pts: number[][] = [];
		for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + 0.15 + hash(i, j) * 0.7) / N, (j + 0.15 + hash(j + 9, i) * 0.7) / N, hash(i * 3, j * 5)]);
		paint(c, (u, v) => {
			let d1 = 9, d2 = 9, tone = 0;
			for (const p of pts) for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
				const d = Math.hypot(u - p[0] - ox, v - p[1] - oy);
				if (d < d1) { d2 = d1; d1 = d; tone = p[2]; } else if (d < d2) d2 = d;
			}
			const mortar = d2 - d1 < 0.012 ? 1 : 0, n = fbm(u * 16, v * 16, 16);
			if (mortar) return [0.5, 0.48, 0.45, 0];
			const k = 0.62 + 0.25 * tone + 0.18 * n;
			return [k, k * 0.95, k * 0.86, 0.6 + 0.4 * n];
		});
	},
	marble: (c: Ctx) => paint(c, (u, v) => { const t = fbm(u * 4, v * 4, 4, 6); const vein = Math.pow(1 - Math.abs(Math.sin((u + v + t * 2.2) * Math.PI * 3)), 14); const k = 0.95 - vein * 0.45 - (1 - t) * 0.04; return [k, k, k * 1.01, k]; }),
	slate: (c: Ctx) => paint(c, (u, v) => { const tile = Math.floor(u * 2) + Math.floor(v * 2) * 2, gap = (u * 2) % 1 < 0.01 || (v * 2) % 1 < 0.01; const n = fbm(u * 10, v * 10, 10, 5); const k = gap ? 0.2 : 0.3 + 0.12 * n + 0.05 * hash(tile, 1); return [k * 0.95, k, k * 1.08, gap ? 0 : n]; }),
	travertine: (c: Ctx) => paint(c, (u, v) => { const gap = (u * 2) % 1 < 0.006 || (v * 2) % 1 < 0.006; const n = fbm(u * 3, v * 12, 3, 5), pore = vn(u * 120, v * 60, 120) > 0.9 ? -0.15 : 0; const k = gap ? 0.7 : 0.85 + 0.12 * n + pore; return [k, k * 0.93, k * 0.8, gap ? 0 : n + pore]; }),
	terrazzo: (c: Ctx) => paint(c, (u, v) => { const chip = vn(u * 70, v * 70, 70); const col = chip > 0.78 ? [0.55, 0.5, 0.45] : chip < 0.15 ? [0.3, 0.32, 0.34] : [0.92, 0.91, 0.89]; return [col[0], col[1], col[2], chip > 0.78 || chip < 0.15 ? 0.6 : 0.5]; }),
	brick: (c: Ctx) => paint(c, (u, v) => { const row = Math.floor(v * 16), x = u * 4 + (row % 2) * 0.5, bx = Math.floor(x); const mortar = (v * 16) % 1 < 0.1 || x % 1 < 0.035; if (mortar) return [0.78, 0.76, 0.72, 0]; const k = 0.75 + 0.25 * hash(bx, row) + 0.1 * fbm(u * 30, v * 30, 30, 2); return [k * 0.72, k * 0.36, k * 0.27, 0.7]; }),
	tile: (c: Ctx) => paint(c, (u, v) => { const g = (u * 5) % 1 < 0.02 || (v * 5) % 1 < 0.02; return g ? [0.72, 0.72, 0.7, 0] : grey(0.97 - 0.02 * hash(Math.floor(u * 5), Math.floor(v * 5)), 0.6); }),
	weave: (scale: number) => (c: Ctx) => paint(c, (u, v) => { const a = Math.sin(u * scale * Math.PI * 2), b = Math.sin(v * scale * Math.PI * 2); const w = 0.5 + 0.5 * (a * b > 0 ? a : b); const n = fbm(u * 12, v * 12, 12, 3); return grey(0.82 + 0.12 * w + 0.06 * n, w); }),
	leather: (c: Ctx) => paint(c, (u, v) => { const n = fbm(u * 40, v * 40, 40, 3); const crack = Math.abs(vn(u * 25, v * 25, 25) - 0.5) < 0.03 ? -0.12 : 0; return grey(0.85 + 0.12 * n + crack, n + crack); }),
	brushed: (c: Ctx) => paint(c, (u, v) => { const s = vn(u * 2, v * 400, 400); return grey(0.85 + 0.15 * s, s); }),
};

export const PRESETS: Record<PresetName, Preset> = {
	paint: { color: '#e9e5dc', roughness: 0.85, metalness: 0, tile: 2, tex: T.plaster, bump: 0.6, tintable: true, category: 'wall' },
	plaster: { color: '#ece6da', roughness: 0.92, metalness: 0, tile: 1.5, tex: T.plaster, bump: 1.6, tintable: true, category: 'wall' },
	concrete: { color: '#b9b6b0', roughness: 0.8, metalness: 0, tile: 2, tex: T.concrete, bump: 1.4, tintable: true, category: 'floor' },
	oak: { color: '#d8b48a', roughness: 0.55, metalness: 0, tile: 1, tex: T.wood(0), bump: 1.2, clearcoat: 0.2, tintable: false, category: 'wood' },
	walnut: { color: '#7a5236', roughness: 0.5, metalness: 0, tile: 1, tex: T.wood(1), bump: 1.2, clearcoat: 0.25, tintable: false, category: 'wood' },
	'whitewashed oak': { color: '#e9dfd0', roughness: 0.6, metalness: 0, tile: 1, tex: T.wood(0), bump: 1.1, tintable: false, category: 'wood' },
	herringbone: { color: '#c79a6b', roughness: 0.5, metalness: 0, tile: 1, tex: T.herringbone, bump: 1.3, clearcoat: 0.25, tintable: false, category: 'floor' },
	'natural stone': { color: '#d9cfc0', roughness: 0.78, metalness: 0, tile: 1.6, tex: T.stone, bump: 2.6, tintable: false, category: 'stone' },
	marble: { color: '#f2f0ec', roughness: 0.18, metalness: 0, tile: 1.2, tex: T.marble, bump: 0.2, clearcoat: 0.6, tintable: false, category: 'stone' },
	slate: { color: '#9aa1a8', roughness: 0.7, metalness: 0, tile: 1.2, tex: T.slate, bump: 1.8, tintable: false, category: 'stone' },
	travertine: { color: '#e6d7bd', roughness: 0.6, metalness: 0, tile: 1.2, tex: T.travertine, bump: 1.2, tintable: false, category: 'stone' },
	terrazzo: { color: '#f0eeea', roughness: 0.35, metalness: 0, tile: 0.8, tex: T.terrazzo, bump: 0.4, clearcoat: 0.3, tintable: false, category: 'floor' },
	brick: { color: '#d9d2ca', roughness: 0.88, metalness: 0, tile: 1, tex: T.brick, bump: 2.4, tintable: false, category: 'wall' },
	'white tile': { color: '#ffffff', roughness: 0.25, metalness: 0, tile: 1, tex: T.tile, bump: 1, clearcoat: 0.4, tintable: true, category: 'floor' },
	linen: { color: '#cfc6b8', roughness: 0.95, metalness: 0, tile: 0.25, tex: T.weave(40), bump: 0.8, sheen: 0.4, tintable: true, category: 'fabric' },
	velvet: { color: '#3c4a6b', roughness: 0.9, metalness: 0, tile: 0.3, tex: T.weave(90), bump: 0.3, sheen: 1, tintable: true, category: 'fabric' },
	leather: { color: '#6b4430', roughness: 0.45, metalness: 0, tile: 0.4, tex: T.leather, bump: 0.8, clearcoat: 0.3, tintable: true, category: 'fabric' },
	wool: { color: '#cfc8bd', roughness: 1, metalness: 0, tile: 0.5, tex: T.weave(24), bump: 1.4, sheen: 0.6, tintable: true, category: 'fabric' },
	'brushed steel': { color: '#c9ccd0', roughness: 0.35, metalness: 1, tile: 0.5, tex: T.brushed, bump: 0.2, tintable: false, category: 'metal' },
	brass: { color: '#d4a85a', roughness: 0.3, metalness: 1, tile: 0.5, tex: T.brushed, bump: 0.1, tintable: false, category: 'metal' },
	chrome: { color: '#f0f2f4', roughness: 0.06, metalness: 1, tile: 1, tintable: false, category: 'metal' },
	'black metal': { color: '#26272a', roughness: 0.45, metalness: 0.8, tile: 0.5, tex: T.brushed, bump: 0.1, tintable: true, category: 'metal' },
	glass: { color: '#dfe8ee', roughness: 0.05, metalness: 0, tile: 1, transparent: true, tintable: true, category: 'other' },
	lacquer: { color: '#f4f2ee', roughness: 0.25, metalness: 0, tile: 1, clearcoat: 0.8, tintable: true, category: 'other' },
	original: { color: '#d9d6d0', roughness: 0.9, metalness: 0, tile: 1, tintable: false, category: 'other' },
};
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

// ------------------------------------------------------------------ cache
const S = 256;
const cache = new Map<string, { map: THREE.Texture; normal?: THREE.Texture }>();
let aniso = 4;
let passthrough = false;
/** AR on: "original" surfaces are not drawn (call before re-dressing) */
export function setPassthroughMode(on: boolean) { passthrough = on; }
export function setAnisotropy(a: number) { aniso = a; }

function textures(name: PresetName) {
	const p = PRESETS[name];
	if (!p.tex || typeof document === 'undefined') return null; // no canvas (unit tests): flat colours
	let t = cache.get(name);
	if (!t) {
		const cv = document.createElement('canvas'); cv.width = cv.height = S;
		const h = new Float32Array(S * S);
		p.tex({ g: cv.getContext('2d')!, h, S });
		const map = new THREE.CanvasTexture(cv);
		map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = aniso;
		let normal: THREE.Texture | undefined;
		if (p.bump) {
			const nc = document.createElement('canvas'); nc.width = nc.height = S;
			const g = nc.getContext('2d')!, img = g.createImageData(S, S), d = img.data, k = p.bump * 2.5;
			for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
				const dx = (h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)]) * k, dy = (h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x]) * k;
				const l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
				d[o] = (-dx / l * 0.5 + 0.5) * 255; d[o + 1] = (dy / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
			}
			g.putImageData(img, 0, 0);
			normal = new THREE.CanvasTexture(nc); normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.anisotropy = aniso;
		}
		t = { map, normal };
		cache.set(name, t);
	}
	return t;
}

/** What a surface currently wears: the preset plus an optional colour */
export interface Finish { preset: PresetName; color?: string }

/**
 * Make (or update in place) a material for a finish. Passing an existing
 * material re-dresses it, so every mesh that uses it changes at once and
 * nothing is rebuilt.
 */
export function dress(finish: Finish, mat?: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial {
	const p = PRESETS[finish.preset];
	const m = mat ?? new THREE.MeshPhysicalMaterial();
	const t = textures(finish.preset);
	m.color.set(finish.color && p.tintable ? finish.color : p.color);
	if (finish.color && !p.tintable) m.color.set(p.color).lerp(new THREE.Color(finish.color), 0.35); // stone / wood: a tint, not a repaint
	m.roughness = p.roughness; m.metalness = p.metalness;
	m.sheen = p.sheen ?? 0; m.sheenRoughness = 0.6; m.sheenColor.set(m.color).multiplyScalar(0.6);
	m.clearcoat = p.clearcoat ?? 0; m.clearcoatRoughness = 0.15;
	m.transparent = !!p.transparent; m.opacity = p.transparent ? 0.28 : 1; m.depthWrite = !p.transparent;
	const repeat = 1 / p.tile;
	const tex = (x: THREE.Texture | undefined) => { if (!x) return null; const c = x.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c; };
	// textures are clones of the cached ones (sharing the image) so each tile size can differ
	m.map?.dispose(); m.normalMap?.dispose();
	m.map = t ? tex(t.map) : null;
	m.normalMap = t?.normal ? tex(t.normal) : null;
	m.normalScale.set(0.8, 0.8);
	m.needsUpdate = true;
	// "original": in AR nothing is drawn (the passthrough shows the real surface); elsewhere a plain surface as scanned
	m.visible = finish.preset !== 'original' || !passthrough;
	m.userData.finish = { ...finish };
	return m;
}

export function finishOf(m: THREE.Material | undefined): Finish | null {
	return (m?.userData?.finish as Finish | undefined) ?? null;
}

// ------------------------------------------------------------------ words
/** colour words people say -> hex (plus anything CSS knows) */
export const COLOR_WORDS: Record<string, string> = {
	white: '#f2f0eb', 'off white': '#ece6da', 'warm white': '#efe6d6', cream: '#ede0c4', ivory: '#f1ead9', beige: '#d9c8ad', sand: '#d6c19c', taupe: '#a8998a',
	grey: '#9a9a98', gray: '#9a9a98', 'light grey': '#c9c9c6', 'light gray': '#c9c9c6', 'dark grey': '#4c4d4f', 'dark gray': '#4c4d4f', charcoal: '#36383b', black: '#1c1c1e',
	red: '#b8322d', burgundy: '#6e1f2a', terracotta: '#c0643f', rust: '#a4492a', orange: '#d9772b', peach: '#f0b893', coral: '#e57a62', pink: '#e8a3b4', blush: '#e9c2c0',
	yellow: '#e8c547', mustard: '#c99a2e', gold: '#c9a24a', ochre: '#c28b2c',
	green: '#4f8a4c', 'sage': '#9caf8f', 'sage green': '#9caf8f', olive: '#6f7340', 'forest green': '#2f5233', emerald: '#1f7a53', mint: '#a8d8c0', teal: '#2f7d7f',
	blue: '#3d6fb6', 'light blue': '#a9c7e3', 'sky blue': '#8fc1e3', navy: '#22314f', 'navy blue': '#22314f', cobalt: '#2448a5', 'dusty blue': '#7d95ad', turquoise: '#3fb6b0',
	purple: '#6d4b8d', lavender: '#b8a6d6', lilac: '#c6a9d1', plum: '#5e3150', violet: '#7b4fb0',
	brown: '#6f4a33', chocolate: '#4a2f22', tan: '#c6a27a', caramel: '#b7783e', walnut: '#5d3d29',
};
