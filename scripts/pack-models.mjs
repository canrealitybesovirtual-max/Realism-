// Pack each glTF in public/models into one self-contained JSON file (binary
// buffer embedded as a data URI; textures stay as separate JPEGs). The .json
// name lets static hosts that only serve common web types (such as Claude
// artifacts) deliver the models. Run with `npm run models`.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const root = new URL('../public/models/', import.meta.url).pathname;
for (const name of readdirSync(root)) {
	const dir = root + name + '/';
	const gltfFile = readdirSync(dir).find((f) => f.endsWith('.gltf'));
	const glbFile = readdirSync(dir).find((f) => f.endsWith('.glb'));
	if (!gltfFile && !glbFile) continue;
	let g;
	if (gltfFile) g = JSON.parse(readFileSync(dir + gltfFile, 'utf8'));
	else {
		// GLB: JSON chunk + one BIN chunk (embedded images stay in buffer views)
		const b = readFileSync(dir + glbFile);
		const jsonLen = b.readUInt32LE(12);
		g = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
		const binStart = 20 + jsonLen;
		const binLen = b.readUInt32LE(binStart);
		g.buffers[0].uri = 'data:application/octet-stream;base64,' + b.subarray(binStart + 8, binStart + 8 + binLen).toString('base64');
	}
	for (const b of g.buffers) {
		if (b.uri && !b.uri.startsWith('data:')) b.uri = 'data:application/octet-stream;base64,' + readFileSync(dir + b.uri).toString('base64');
	}
	writeFileSync(dir + name + '.json', JSON.stringify(g));
	console.log('packed', name);
}
