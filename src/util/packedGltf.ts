import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Load a model packed by scripts/pack-models.mjs (glTF JSON whose binary
 * buffer is a base64 data: URI). Strict hosts (Claude artifacts) refuse to
 * fetch data: URIs, so the buffer is decoded here and GLTFLoader is given an
 * in-memory GLB instead. Textures stay as separate files next to the JSON.
 */
export async function loadPackedGltf(loader: GLTFLoader, name: string): Promise<GLTF> {
	const json = await (await fetch(`models/${name}/${name}.json`)).json();
	return loader.parseAsync(gltfJsonToGlb(json), `models/${name}/`);
}

/** Build a binary glTF (GLB) from glTF JSON whose buffers are base64 data URIs. */
export function gltfJsonToGlb(json: any): ArrayBuffer {
	const decoded: Uint8Array[] = json.buffers.map((b: { uri: string }) => {
		const bin = atob(b.uri.slice(b.uri.indexOf(',') + 1));
		const u = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
		return u;
	});
	// GLB holds one BIN chunk: concatenate buffers (4-byte aligned) and remap views
	const offsets: number[] = [];
	let total = 0;
	for (const d of decoded) { offsets.push(total); total += Math.ceil(d.length / 4) * 4; }
	for (const v of json.bufferViews) { v.byteOffset = (v.byteOffset ?? 0) + offsets[v.buffer]; v.buffer = 0; }
	json.buffers = [{ byteLength: total }];
	const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
	const jsonLen = Math.ceil(jsonBytes.length / 4) * 4;
	const out = new ArrayBuffer(12 + 8 + jsonLen + 8 + total);
	const dv = new DataView(out), u8 = new Uint8Array(out);
	dv.setUint32(0, 0x46546c67, true); // 'glTF'
	dv.setUint32(4, 2, true);
	dv.setUint32(8, out.byteLength, true);
	dv.setUint32(12, jsonLen, true);
	dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
	u8.fill(0x20, 20, 20 + jsonLen);
	u8.set(jsonBytes, 20);
	const binStart = 20 + jsonLen;
	dv.setUint32(binStart, total, true);
	dv.setUint32(binStart + 4, 0x004e4942, true); // 'BIN'
	decoded.forEach((d, i) => u8.set(d, binStart + 8 + offsets[i]));
	return out;
}

