import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { validateGlb, assetCache } from '../../src/engine/assets';
import { EntityWorld } from '../../src/engine/entities';
import { opToCommand, validateOp, readEnv } from '../../src/engine/ops';

/** a minimal GLB: one triangle, positions scaled by `s` */
function glb(s = 1, tris = 1) {
	const pos = new Float32Array(tris * 9);
	for (let t = 0; t < tris; t++) pos.set([0, 0, 0, s, 0, 0, 0, s, 0], t * 9);
	const bin = new Uint8Array(pos.buffer);
	const json = JSON.stringify({
		asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
		accessors: [{ bufferView: 0, componentType: 5126, count: tris * 3, type: 'VEC3', min: [0, 0, 0], max: [s, s, 0] }],
		bufferViews: [{ buffer: 0, byteLength: bin.byteLength }], buffers: [{ byteLength: bin.byteLength }],
	});
	let jb = new TextEncoder().encode(json);
	const jpad = (4 - (jb.length % 4)) % 4;
	const j2 = new Uint8Array(jb.length + jpad); j2.set(jb); j2.fill(0x20, jb.length); jb = j2;
	const total = 12 + 8 + jb.length + 8 + bin.byteLength;
	const out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
	dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
	dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true); u8.set(jb, 20);
	dv.setUint32(20 + jb.length, bin.byteLength, true); dv.setUint32(24 + jb.length, 0x004e4942, true); u8.set(bin, 28 + jb.length);
	return out;
}

describe('imported model checks', () => {
	const loader = new GLTFLoader();
	it('accepts a valid GLB and reports its facts', async () => {
		const v = await validateGlb(glb(1), loader);
		expect(v.tris).toBe(1);
		expect(v.scale).toBe(1);
		expect(v.size.x).toBeCloseTo(1);
	});
	it('refuses non-GLB, wrong version and truncated files', async () => {
		await expect(validateGlb(new TextEncoder().encode('<html>not a model</html>').buffer as ArrayBuffer, loader)).rejects.toThrow(/not a GLB/);
		const b = glb(); new DataView(b).setUint32(4, 1, true);
		await expect(validateGlb(b, loader)).rejects.toThrow(/2\.0/);
		await expect(validateGlb(glb().slice(0, 60), loader)).rejects.toThrow(/truncated/);
	});
	it('rescales models that are obviously in the wrong unit', async () => {
		const v = await validateGlb(glb(400), loader);
		expect(v.scale).toBeCloseTo(1 / 400);
		expect(v.notes[0]).toMatch(/scaled to 1 m/);
	});
});

describe('asset spawn + environment ops', () => {
	it('an asset spawn is refused until the asset is available, then builds the object', async () => {
		const scene = new THREE.Scene(), w = new EntityWorld(scene, null);
		const op = { op: 'spawn', id: 'm1', spec: { kind: 'asset', asset: 'aabc', dynamic: false, size: [1, 1, 0.01] }, to: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }, color: '#ffffff' } as const;
		expect(validateOp(op, w)).toMatch(/not available/);
		const v = await validateGlb(glb(1), new GLTFLoader());
		assetCache.set('aabc', { info: { id: 'aabc', name: 'Tri', bytes: 1, tris: 1, meshes: 1, textures: 0, size: [1, 1, 0], scale: 1, added: '' }, scene: v.scene });
		expect(validateOp(op, w)).toBeNull();
		opToCommand(op as any, { world: w, physics: null, scene }).do();
		expect(w.get('m1')?.name).toBe('Tri');
		assetCache.delete('aabc');
	});
	it('environment settings are validated, applied and undone', () => {
		const scene = new THREE.Scene(), w = new EntityWorld(scene, null);
		const ctx = { world: w, physics: null, scene };
		expect(validateOp({ op: 'env', id: 'environment', key: 'envIntensity', value: 9 }, w)).toMatch(/bad/);
		expect(validateOp({ op: 'env', id: 'environment', key: 'nope', value: 1 }, w)).toMatch(/bad/);
		const c = opToCommand({ op: 'env', id: 'environment', key: 'envIntensity', value: 0.4 }, ctx);
		c.do();
		expect(readEnv(ctx, 'envIntensity')).toBeCloseTo(0.4);
		c.undo();
		expect(readEnv(ctx, 'envIntensity')).toBeCloseTo(1);
	});
});
