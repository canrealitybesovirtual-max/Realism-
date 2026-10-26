// Pack the highway traffic cars: one small GLB per car (into one JSON), from the downloaded
// Sketchfab files (all CC-BY-4.0, credits in public/models/traffic/CREDITS.md).
//
//   node scripts/pack-cars.mjs <car_pack_1.glb> <traffic_car_pack.glb> <celica/scene.gltf>
//
// Per car: only its own nodes are kept, meshes are welded and simplified
// (wheels much harder than bodies: they are small on screen), textures are
// shrunk and re-encoded, and geometry is meshopt-compressed. Wheels stay
// separate nodes named "wheel*" so they can turn. Orientation and size are
// fixed at load time (src/maps/trafficCars.ts).
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [carPack, trafficPack, celica] = process.argv.slice(2);
if (!celica) { console.error('usage: node scripts/pack-cars.mjs <car_pack_1.glb> <traffic_car_pack.glb> <celica/scene.gltf>'); process.exit(1); }
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const quiet = { debug() {}, info() {}, warn: console.warn, error: console.error };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const OUT = 'public/models/traffic/cars.json';
// one JSON file of base64 GLBs: the artifact host serves .json but not .glb
const pack = { credits: 'public/models/traffic/CREDITS.md', models: {} };

/** cars to make: source file, the node that is the car, which of its nodes are wheels */
const CARS = [
	{ id: 'bmw-e30', src: carPack, node: 'D 30 low', wheel: /^car wheel/, body: 0.6, tex: 1024 },
	{ id: 'renault-12', src: carPack, node: 'R 12', wheel: /^car wheel/, body: 0.6, tex: 1024 },
	{ id: 'mercedes-w123', src: carPack, node: 'm123', wheel: /^car wheel/, body: 0.6, tex: 1024 },
	...[1, 2, 3, 4, 5].map((i) => ({ id: `traffic-${i}`, src: trafficPack, node: `Car_${i}`, wheel: /teker/, body: 1, tex: 512 })),
	{ id: 'toyota-celica', src: celica, node: null, wheel: null, body: 0.25, tex: 0 },
];

for (const car of CARS) {
	const doc = await io.read(car.src);
	doc.setLogger(quiet);
	const root = doc.getRoot(), scene = root.getDefaultScene() ?? root.listScenes()[0];
	// keep only this car's subtree
	if (car.node) {
		const keep = root.listNodes().find((n) => n.getName() === car.node);
		if (!keep) throw new Error(`${car.id}: no node "${car.node}"`);
		const world = keep.getWorldMatrix();
		for (const c of scene.listChildren()) scene.removeChild(c);
		for (const p of root.listNodes()) if (p.listChildren().includes(keep)) p.removeChild(keep);
		keep.setMatrix(world); // bake the parents' transforms (Sketchfab wraps everything in a rotated root)
		scene.addChild(keep);
		for (const n of root.listNodes()) if (!isUnder(n, keep)) n.dispose();
		// wheels: rename for the loader
		const wheels = root.listNodes().filter((n) => car.wheel.test(n.getName()) && !car.wheel.test(parentOf(root, n)?.getName() ?? ''));
		wheels.forEach((n, k) => n.setName(`wheel${k}`));
	} else {
		// one mesh (the Celica): bake the root transform into a single node
		const nodes = root.listNodes().filter((n) => n.getMesh());
		const m = nodes[0], world = m.getWorldMatrix();
		for (const c of scene.listChildren()) scene.removeChild(c);
		for (const p of root.listNodes()) if (p.listChildren().includes(m)) p.removeChild(m);
		m.setMatrix(world).setName('body'); scene.addChild(m);
		for (const n of root.listNodes()) if (n !== m) n.dispose();
	}
	await doc.transform(prune(), dedup(), weld({ tolerance: 0.0001 }));
	// simplify: wheels to ~600 triangles each, bodies by the car's own ratio
	for (const n of root.listNodes()) {
		const mesh = n.getMesh(); if (!mesh) continue;
		const isWheel = /^wheel/.test(n.getName()) || /^wheel/.test(parentOf(root, n)?.getName() ?? '');
		const tris = mesh.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
		const ratio = isWheel ? Math.min(1, 600 / tris) : car.body;
		if (ratio < 0.98) n.setExtras({ ...(n.getExtras() ?? {}), simplify: ratio });
	}
	await simplifyPerNode(doc);
	// textures: smaller, JPEG unless they need alpha
	if (car.tex) {
		for (const t of root.listTextures()) {
			const img = t.getImage(); if (!img) continue;
			const meta = await sharp(img).metadata();
			let alpha = false;
			if (meta.hasAlpha) { const st = await sharp(img).stats(); alpha = st.channels[3] && st.channels[3].min < 250; }
			const r = sharp(img).resize({ width: car.tex, height: car.tex, fit: 'inside', withoutEnlargement: true });
			const out = alpha ? await r.png({ compressionLevel: 9 }).toBuffer() : await r.flatten({ background: '#808080' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
			t.setImage(out).setMimeType(alpha ? 'image/png' : 'image/jpeg');
		}
	}
	await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
	const tris = root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
	const glb = await io.writeBinary(doc);
	pack.models[car.id] = Buffer.from(glb).toString('base64');
	console.log(car.id.padEnd(16), String(Math.round(tris)).padStart(6), 'tris', String(glb.byteLength).padStart(8), 'bytes', root.listNodes().filter((n) => /^wheel/.test(n.getName())).length, 'wheels');
}
fs.writeFileSync(OUT, JSON.stringify(pack));
console.log(OUT, fs.statSync(OUT).size, 'bytes');

function isUnder(n, top) { for (let q = n; q; q = q.getParentNode?.() ?? null) if (q === top) return true; return false; }
function parentOf(root, n) { return root.listNodes().find((p) => p.listChildren().includes(n)) ?? null; }
/** meshopt simplification with a ratio per node (a mesh shared by several nodes is simplified once) */
async function simplifyPerNode(doc) {
	const root = doc.getRoot();
	for (const n of root.listNodes()) {
		const ratio = n.getExtras()?.simplify; const mesh = n.getMesh();
		if (!ratio || !mesh || mesh.getExtras()?.done) continue;
		for (const prim of mesh.listPrimitives()) await simplifyPrimitive(prim, ratio);
		mesh.setExtras({ done: true });
		const ex = { ...n.getExtras() }; delete ex.simplify; n.setExtras(ex);
	}
	for (const m of root.listMeshes()) m.setExtras({});
}
async function simplifyPrimitive(prim, ratio) {
	const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
	if (!pos || !idx) return;
	const positions = new Float32Array(pos.getArray()), indices = new Uint32Array(idx.getArray());
	const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
	const [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.02, ['LockBorder']);
	const Ctor = positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
	idx.setArray(new Ctor(out));
}
