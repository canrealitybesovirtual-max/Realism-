import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { log } from './log';

/**
 * Imported 3D assets (GLB) and prefabs.
 *
 * Imported files are untrusted. Before anything is added to the game a file
 * is checked: size limit, GLB header, a full parse by three.js's GLTFLoader
 * (glTF is data - meshes, materials, textures, animations - and carries no
 * code), triangle / texture / node budgets, and a sane size (a model
 * hundreds of metres or a few millimetres across is almost always a unit
 * mistake; it is rescaled and you are told). Accepted files are stored in
 * the browser's IndexedDB under their content hash, so saved scenes can
 * refer to them by id; a save that refers to an asset that is not stored
 * (another browser, cleared data) skips that object with a warning instead
 * of failing.
 *
 * Prefabs are reusable templates (what to spawn + its components), kept in
 * the browser's storage and placed through the same validated ops.
 */
export interface AssetInfo { id: string; name: string; bytes: number; tris: number; meshes: number; textures: number; size: [number, number, number]; scale: number; added: string }
export interface Prefab { id: string; name: string; spec: import('./entities').SpawnSpec; color: string; scale: [number, number, number]; components: { type: string; data: Record<string, number | boolean | string> }[] }

export const LIMITS = { bytes: 25 * 1024 * 1024, tris: 1_500_000, textures: 48, texSize: 8192, nodes: 5000 };

/** loaded, validated assets ready to spawn (ops.ts reads this synchronously) */
export const assetCache = new Map<string, { info: AssetInfo; scene: THREE.Object3D }>();

const DB = 'studio-assets', STORE = 'glb';

function idb(): Promise<IDBDatabase> {
	return new Promise((ok, bad) => {
		const r = indexedDB.open(DB, 1);
		r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
		r.onsuccess = () => ok(r.result);
		r.onerror = () => bad(r.error);
	});
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await idb();
	return new Promise((ok, bad) => { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
}

export async function hashBytes(buf: ArrayBuffer) {
	const d = await crypto.subtle.digest('SHA-256', buf);
	return 'a' + [...new Uint8Array(d)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** check + parse a GLB; returns the scene and facts, or throws a readable reason */
export async function validateGlb(buf: ArrayBuffer, loader: GLTFLoader): Promise<{ scene: THREE.Object3D; tris: number; meshes: number; textures: number; size: THREE.Vector3; scale: number; notes: string[] }> {
	if (buf.byteLength > LIMITS.bytes) throw new Error(`file is ${(buf.byteLength / 1048576).toFixed(1)} MB; the limit is ${LIMITS.bytes / 1048576} MB`);
	const dv = new DataView(buf);
	if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file (binary glTF); export as .glb');
	if (dv.getUint32(4, true) !== 2) throw new Error('only glTF 2.0 is supported');
	if (dv.getUint32(8, true) !== buf.byteLength) throw new Error('the file is truncated or damaged');
	let gltf;
	try { gltf = await loader.parseAsync(buf.slice(0), ''); } catch (e) { throw new Error('could not be read: ' + (e as Error).message); }
	const scene = gltf.scene;
	let tris = 0, meshes = 0, nodes = 0;
	const textures = new Set<THREE.Texture>();
	const notes: string[] = [];
	scene.traverse((o) => {
		nodes++;
		const m = o as THREE.Mesh;
		if (!m.isMesh) return;
		meshes++;
		const g = m.geometry;
		tris += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
		for (const mat of Array.isArray(m.material) ? m.material : [m.material]) for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) textures.add(v as THREE.Texture);
		m.castShadow = true; m.receiveShadow = true;
	});
	if (nodes > LIMITS.nodes) throw new Error(`${nodes} nodes; the limit is ${LIMITS.nodes}`);
	if (tris > LIMITS.tris) throw new Error(`${tris.toLocaleString('en')} triangles; the limit is ${LIMITS.tris.toLocaleString('en')} (too heavy for a headset)`);
	if (textures.size > LIMITS.textures) throw new Error(`${textures.size} textures; the limit is ${LIMITS.textures}`);
	for (const t of textures) { const im = t.image as { width?: number; height?: number }; if ((im?.width ?? 0) > LIMITS.texSize || (im?.height ?? 0) > LIMITS.texSize) throw new Error(`a texture is ${im.width}×${im.height}; the limit is ${LIMITS.texSize}`); }
	if (!meshes) throw new Error('the file has no meshes');
	const box = new THREE.Box3().setFromObject(scene);
	const size = box.getSize(new THREE.Vector3());
	const big = Math.max(size.x, size.y, size.z);
	let scale = 1;
	if (big > 50) { scale = 1 / big; notes.push(`it was ${big.toFixed(0)} units across (probably centimetres); scaled to 1 m`); }
	else if (big < 0.02) { scale = 0.5 / big; notes.push(`it was ${(big * 1000).toFixed(1)} mm across; scaled to 0.5 m`); }
	if (tris > 300_000) notes.push(`${Math.round(tris / 1000)}k triangles is heavy for a standalone headset`);
	if (gltf.animations?.length) notes.push(`${gltf.animations.length} animation(s) are kept in the file but not played`);
	// put the pivot at the bottom centre, so it stands on what it is placed on
	const centre = box.getCenter(new THREE.Vector3());
	const root = new THREE.Group();
	scene.position.set(-centre.x, -box.min.y, -centre.z);
	root.add(scene);
	root.scale.setScalar(scale);
	return { scene: root, tris, meshes, textures: textures.size, size: size.multiplyScalar(scale), scale, notes };
}

export class AssetLibrary {
	ready = false;
	prefabs: Prefab[] = [];
	constructor(private loader: GLTFLoader, private storage: Storage | null) {
		try { this.prefabs = JSON.parse(storage?.getItem('studio.prefabs') ?? '[]'); } catch { this.prefabs = []; }
	}

	get list(): AssetInfo[] { return [...assetCache.values()].map((a) => a.info); }

	/** load every stored asset into the cache (startup, before scenes are loaded) */
	async preload() {
		try {
			const all = await tx<any[]>('readonly', (s) => s.getAll());
			for (const r of all) {
				try { const v = await validateGlb(r.bytes, this.loader); assetCache.set(r.id, { info: r.info, scene: v.scene }); }
				catch (e) { log.warn(`Stored asset "${r.info?.name}" no longer passes checks: ${(e as Error).message}`); }
			}
		} catch (e) { log.warn('Asset storage unavailable: ' + (e as Error).message); }
		this.ready = true;
	}

	async import(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<{ info: AssetInfo; notes: string[] }> {
		const buf = await file.arrayBuffer();
		const v = await validateGlb(buf, this.loader);
		const id = await hashBytes(buf);
		const info: AssetInfo = { id, name: file.name.replace(/\.glb$/i, '').slice(0, 60), bytes: buf.byteLength, tris: v.tris, meshes: v.meshes, textures: v.textures, size: v.size.toArray().map((x) => +x.toFixed(3)) as [number, number, number], scale: v.scale, added: new Date().toISOString() };
		try { await tx('readwrite', (s) => s.put({ id, info, bytes: buf })); }
		catch (e) { v.notes.push('could not be stored in the browser (' + (e as Error).message + '): it works until reload but saves will skip it'); }
		assetCache.set(id, { info, scene: v.scene });
		log.info(`Imported ${info.name}: ${info.tris.toLocaleString('en')} triangles, ${(info.bytes / 1048576).toFixed(1)} MB`);
		return { info, notes: v.notes };
	}

	async remove(id: string) {
		assetCache.delete(id);
		try { await tx('readwrite', (s) => s.delete(id)); } catch { /* already gone */ }
	}

	savePrefab(p: Prefab) { this.prefabs = [...this.prefabs.filter((x) => x.id !== p.id), p]; this.persist(); }
	deletePrefab(id: string) { this.prefabs = this.prefabs.filter((x) => x.id !== id); this.persist(); }
	private persist() { try { this.storage?.setItem('studio.prefabs', JSON.stringify(this.prefabs)); } catch (e) { log.error('Could not save prefabs: ' + (e as Error).message); } }
}
