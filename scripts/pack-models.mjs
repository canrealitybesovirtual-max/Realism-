// Pack each glTF in public/models into one self-contained JSON file (binary
// buffer embedded as a data URI; textures stay as separate JPEGs). The .json
// name lets static hosts that only serve common web types (such as Claude
// artifacts) deliver the models. Run with `npm run models`.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const root = new URL('../public/models/', import.meta.url).pathname;
for (const name of readdirSync(root)) {
	const dir = root + name + '/';
	const gltfFile = readdirSync(dir).find((f) => f.endsWith('.gltf'));
	if (!gltfFile) continue;
	const g = JSON.parse(readFileSync(dir + gltfFile, 'utf8'));
	for (const b of g.buffers) {
		if (b.uri && !b.uri.startsWith('data:')) b.uri = 'data:application/octet-stream;base64,' + readFileSync(dir + b.uri).toString('base64');
	}
	writeFileSync(dir + name + '.json', JSON.stringify(g));
	console.log('packed', name);
}
