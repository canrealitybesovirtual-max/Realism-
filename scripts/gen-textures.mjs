// Offline generator for the procedural PBR texture sets used by the room.
// Run with `npm run textures`. Output goes to public/textures/*.jpg|png.
//
// CC0 texture CDNs (Poly Haven, ambientCG) are not reachable from the build
// environment, so the large architectural surfaces are synthesised here from
// tileable noise. Every map is periodic, so it tiles without seams.

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../public/textures/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- noise

function mulberry32(seed) {
	return () => {
		seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Periodic 2D gradient noise. `period` is in lattice cells.
function makeNoise(seed) {
	const rand = mulberry32(seed);
	const perm = new Uint16Array(512);
	const p = [...Array(256).keys()];
	for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
	for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
	const gx = new Float32Array(256), gy = new Float32Array(256);
	for (let i = 0; i < 256; i++) { const a = rand() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
	const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
	return (x, y, period, periodY = period) => {
		const xi = Math.floor(x), yi = Math.floor(y);
		const xf = x - xi, yf = y - yi;
		const x0 = ((xi % period) + period) % period, y0 = ((yi % periodY) + periodY) % periodY;
		const x1 = (x0 + 1) % period, y1 = (y0 + 1) % periodY;
		const h = (a, b) => perm[perm[a & 255] + (b & 255)];
		const d = (hh, dx, dy) => gx[hh] * dx + gy[hh] * dy;
		const u = fade(xf), v = fade(yf);
		const n00 = d(h(x0, y0), xf, yf), n10 = d(h(x1, y0), xf - 1, yf);
		const n01 = d(h(x0, y1), xf, yf - 1), n11 = d(h(x1, y1), xf - 1, yf - 1);
		return (n00 + u * (n10 - n00)) + v * ((n01 + u * (n11 - n01)) - (n00 + u * (n10 - n00)));
	};
}

// Fractal sum, sampled in normalised [0,1) texture space so it tiles.
function fbm(noise, u, v, baseFreq, octaves, gain = 0.5, lac = 2) {
	let sum = 0, amp = 1, f = baseFreq, norm = 0;
	for (let o = 0; o < octaves; o++) {
		sum += amp * noise(u * f, v * f, f);
		norm += amp; amp *= gain; f *= lac;
	}
	return sum / norm;
}

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

async function save(name, w, h, channels, data, opts = {}) {
	const img = sharp(Buffer.from(data.buffer), { raw: { width: w, height: h, channels } });
	const file = OUT + name;
	if (name.endsWith('.png')) await img.png({ compressionLevel: 9 }).toFile(file);
	else await img.jpeg({ quality: opts.quality ?? 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toFile(file);
	console.log('wrote', name);
}

// Height field -> tangent-space normal map (OpenGL convention, +Y up).
function heightToNormal(H, size, strength) {
	const out = new Uint8Array(size * size * 3);
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
		const l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)];
		const u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
		let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
		const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
		const i = (y * size + x) * 3;
		out[i] = Math.round((nx * 0.5 + 0.5) * 255);
		out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
		out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
	}
	return out;
}

// Scatter of small round "aggregate" specks, wrapped so it tiles.
function specks(size, count, rMin, rMax, seed) {
	const rand = mulberry32(seed);
	const field = new Float32Array(size * size);
	for (let i = 0; i < count; i++) {
		const cx = rand() * size, cy = rand() * size;
		const r = rMin + (rMax - rMin) * Math.pow(rand(), 2.5);
		const val = rand() < 0.62 ? -1 : 1; // mostly darker stone, some lighter
		const mag = 0.35 + rand() * 0.65;
		const ext = Math.ceil(r + 1);
		const sx = 0.7 + rand() * 0.6; // elongation
		for (let dy = -ext; dy <= ext; dy++) for (let dx = -ext; dx <= ext; dx++) {
			const d = Math.hypot(dx * sx, dy / sx) - r;
			if (d > 1) continue;
			const a = clamp(0.5 - d) * mag * val;
			const px = ((Math.floor(cx) + dx) % size + size) % size;
			const py = ((Math.floor(cy) + dy) % size + size) % size;
			const k = py * size + px;
			if (Math.abs(a) > Math.abs(field[k])) field[k] = a;
		}
	}
	return field;
}

// ---------------------------------------------------------------- polished concrete
// One tile covers 2.0 m x 2.0 m of floor (~1 mm / texel at 2048).
async function concrete() {
	const S = 2048;
	const n1 = makeNoise(11), n2 = makeNoise(23), n3 = makeNoise(37), n4 = makeNoise(51);
	const fine = specks(S, 26000, 0.4, 2.2, 7);
	const pores = specks(S, 9000, 0.3, 1.1, 8);
	const col = new Uint8Array(S * S * 3);
	const rough = new Uint8Array(S * S * 3); // packed ORM: R=AO(1) G=roughness B=metal(0)
	const H = new Float32Array(S * S);
	for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
		const u = x / S, v = y / S, k = y * S + x;
		const cloud = fbm(n1, u, v, 3, 5, 0.55);          // large mottling
		const mid = fbm(n2, u, v, 14, 4, 0.5);            // cement paste variation
		const grain = fbm(n3, u, v, 220, 2, 0.5);         // sand grain
		// trowel/polish swirls: stretched ridged noise
		const sw = 1 - Math.abs(fbm(n4, u * 1.0, v * 2.2, 6, 4, 0.6));
		const swirl = smooth(0.78, 0.98, sw);
		const s = fine[k], p = pores[k];

		let L = 0.60 + cloud * 0.16 + mid * 0.045 + grain * 0.02 + s * 0.06 + swirl * 0.02;
		if (p < 0) L += p * 0.12;
		L = clamp(L, 0, 1);
		// slightly warm grey; darker specks are cooler
		const warm = 0.012 + cloud * 0.01;
		col[k * 3] = Math.round(clamp(L + warm) * 255);
		col[k * 3 + 1] = Math.round(clamp(L + warm * 0.4) * 255);
		col[k * 3 + 2] = Math.round(clamp(L - warm * 0.6 + (s < 0 ? 0.01 : 0)) * 255);

		// polished slab: low base roughness with cloudy variation, pores & swirls rougher
		let r = 0.30 + cloud * 0.08 + mid * 0.05 + swirl * 0.10 + Math.abs(s) * 0.12 + (p < 0 ? -p * 0.45 : 0);
		r = clamp(r, 0.14, 0.85);
		rough[k * 3] = 255;
		rough[k * 3 + 1] = Math.round(r * 255);
		rough[k * 3 + 2] = 0;

		H[k] = grain * 0.15 + (p < 0 ? p * 1.2 : 0) + s * 0.08;
	}
	await save('concrete_diff.jpg', S, S, 3, col, { quality: 88 });
	await save('concrete_orm.jpg', S, S, 3, rough, { quality: 90 });
	await save('concrete_nor.jpg', S, S, 3, heightToNormal(H, S, 1.6), { quality: 92 });
}

// ---------------------------------------------------------------- painted plaster
// Smooth skim-coat plaster with fine roller stipple. Tile = 1.5 m.
async function plaster() {
	const S = 1024;
	const n1 = makeNoise(101), n2 = makeNoise(102), n3 = makeNoise(103);
	const H = new Float32Array(S * S);
	const rough = new Uint8Array(S * S * 3);
	const col = new Uint8Array(S * S * 3);
	for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
		const u = x / S, v = y / S, k = y * S + x;
		const broad = fbm(n1, u, v, 4, 4, 0.5);
		const stipple = fbm(n2, u, v, 180, 3, 0.55);
		const micro = n3(u * 512, v * 512, 512);
		H[k] = broad * 0.4 + stipple * 0.55 + micro * 0.15;
		rough[k * 3] = 255;
		rough[k * 3 + 1] = Math.round(clamp(0.82 + stipple * 0.06 - broad * 0.04) * 255);
		rough[k * 3 + 2] = 0;
		const L = clamp(0.5 + broad * 0.06 + stipple * 0.02);
		col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = Math.round(L * 255);
	}
	await save('plaster_nor.jpg', S, S, 3, heightToNormal(H, S, 0.9), { quality: 90 });
	await save('plaster_orm.jpg', S, S, 3, rough, { quality: 90 });
	await save('plaster_var.jpg', S, S, 3, col, { quality: 90 }); // multiplied into wall colour
}

// ---------------------------------------------------------------- white oak veneer
// Flat-sawn/rift oak: long straight grain along U, medullary ray flecks,
// subtle cathedral figure. Tile = 1.6 m (U) x 0.4 m (V) -> 4096 x 1024.
async function oak() {
	const W = 4096, Hh = 1024;
	const n1 = makeNoise(201), n2 = makeNoise(202), n3 = makeNoise(203), n4 = makeNoise(204);
	const col = new Uint8Array(W * Hh * 3);
	const orm = new Uint8Array(W * Hh * 3);
	const H = new Float32Array(W * Hh);
	for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
		const u = x / W, v = y / Hh, k = y * W + x;
		// warp the across-grain coordinate with low-frequency noise for figure
		const warp = fbm(n1, u, v, 2, 3, 0.5) * 0.16 + n2(u * 6, v * 3, 6, 3) * 0.02;
		// irregular ring spacing: integrate a varying density across the board
		const t = (v + warp) * 46 + n4(u * 2, v * 9, 2, 9) * 2.2;
		const ring = t - Math.floor(t);
		// latewood: soft darker band, contrast varies ring to ring
		const ringId = Math.floor(t);
		const ringContrast = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(ringId * 12.9898) * Math.cos(ringId * 4.1414));
		const late = smooth(0.55, 0.92, ring) * (1 - smooth(0.92, 1.0, ring)) * ringContrast;
		// longitudinal colour streaks (mineral / sap variation), long along U
		const streak = n3(u * 3, v * 60, 3, 60) * 0.6 + n3(u * 7, v * 140, 7, 140) * 0.4;
		// open pores: short dark dashes, strongly elongated along grain
		const pore = n4(u * 260, v * 2600, 260, 2600);
		const poreDark = smooth(0.32, 0.62, pore) * (0.35 + late * 0.8);
		// medullary ray flecks: small satin patches
		const ray = smooth(0.62, 0.85, n2(u * 220, v * 700, 220, 700)) * 0.35;
		const tone = fbm(n1, u, v, 2, 3, 0.5);
		let L = 0.74 + tone * 0.05 + streak * 0.035 - late * 0.075 - poreDark * 0.09 + ray * 0.03;
		L = clamp(L);
		// white oak, hardwax-oiled: warm pale straw
		const sat = 1 + late * 0.25;
		const r = L * 0.985, g = L * (1 - 0.15 * sat), b = L * (1 - 0.34 * sat);
		col[k * 3] = Math.round(clamp(r) * 255);
		col[k * 3 + 1] = Math.round(clamp(g) * 255);
		col[k * 3 + 2] = Math.round(clamp(b) * 255);
		orm[k * 3] = 255;
		orm[k * 3 + 1] = Math.round(clamp(0.46 + poreDark * 0.3 + late * 0.05 - ray * 0.15) * 255);
		orm[k * 3 + 2] = 0;
		H[k] = -poreDark * 0.8 - late * 0.15;
	}
	await save('oak_diff.jpg', W, Hh, 3, col, { quality: 90 });
	await save('oak_orm.jpg', W, Hh, 3, orm, { quality: 90 });
	// normal map needs square-agnostic sampling; do it inline for W x H
	const nor = new Uint8Array(W * Hh * 3);
	for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
		const l = H[y * W + ((x - 1 + W) % W)], r = H[y * W + ((x + 1) % W)];
		const u = H[((y - 1 + Hh) % Hh) * W + x], d = H[((y + 1) % Hh) * W + x];
		let nx = (l - r) * 1.2, ny = (d - u) * 1.2, nz = 1; const len = Math.hypot(nx, ny, nz);
		const i = (y * W + x) * 3;
		nor[i] = Math.round((nx / len * 0.5 + 0.5) * 255);
		nor[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
		nor[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
	}
	await save('oak_nor.jpg', W, Hh, 3, nor, { quality: 90 });
}

// ---------------------------------------------------------------- woven fabric / mesh
// Chair seat upholstery: fine basket weave, tile = 4 cm.
async function fabric() {
	const S = 512;
	const n = makeNoise(301);
	const H = new Float32Array(S * S);
	const col = new Uint8Array(S * S * 3);
	const threads = 32; // threads per tile per direction
	for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
		const u = x / S, v = y / S, k = y * S + x;
		const tu = u * threads, tv = v * threads;
		const cu = Math.floor(tu), cv = Math.floor(tv);
		const over = (cu + cv) % 2 === 0;
		const fu = tu - cu, fv = tv - cv;
		const hU = Math.sin(fu * Math.PI), hV = Math.sin(fv * Math.PI);
		const h = over ? hV * 0.9 + hU * 0.1 : hU * 0.9 + hV * 0.1;
		const fuzz = n(u * 128, v * 128, 128) * 0.15;
		H[k] = h + fuzz;
		const L = clamp(0.55 + (h - 0.5) * 0.35 + fuzz);
		col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = Math.round(L * 255);
	}
	await save('fabric_nor.jpg', S, S, 3, heightToNormal(H, S, 3.0), { quality: 90 });
	await save('fabric_var.jpg', S, S, 3, col, { quality: 90 });
}

// Open-weave elastomeric mesh for the chair back: alpha + normal. Tile = 2 cm.
async function mesh() {
	const S = 256;
	const rgba = new Uint8Array(S * S * 4);
	const H = new Float32Array(S * S);
	const cells = 8;
	for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
		const u = (x / S) * cells, v = (y / S) * cells;
		const fu = u - Math.floor(u), fv = v - Math.floor(v);
		// diamond lattice of strands
		const a = Math.abs(fu - 0.5) + Math.abs(fv - 0.5);
		const strand = smooth(0.30, 0.42, a); // 1 on strands
		const k = y * S + x;
		H[k] = strand;
		const L = Math.round((0.10 + strand * 0.06) * 255);
		rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = L;
		rgba[k * 4 + 3] = Math.round(clamp(0.18 + strand * 0.9) * 255);
	}
	await save('mesh_rgba.png', S, S, 4, rgba);
	await save('mesh_nor.jpg', S, S, 3, heightToNormal(H, S, 2.0), { quality: 92 });
}

// Fine bead-blasted aluminium / powder-coat micro-roughness normal. Tile = 10 cm.
async function grit() {
	const S = 512;
	const n = makeNoise(401), n2 = makeNoise(402);
	const H = new Float32Array(S * S);
	for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
		const u = x / S, v = y / S;
		H[y * S + x] = n(u * 256, v * 256, 256) * 0.6 + fbm(n2, u, v, 32, 3) * 0.4;
	}
	await save('grit_nor.jpg', S, S, 3, heightToNormal(H, S, 0.35), { quality: 92 });
}

const which = process.argv.slice(2);
const all = { concrete, plaster, oak, fabric, mesh, grit };
for (const [k, fn] of Object.entries(all)) if (!which.length || which.includes(k)) await fn();
