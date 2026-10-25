// Shrink a GLB's textures so it fits the artifact's per-file limit once packed:
// every image is resized to at most MAX px and re-encoded as JPEG, or PNG when
// it really has transparency.
//   node scripts/compress-glb.mjs in.glb out.glb [max=1024]
import fs from 'node:fs';
import sharp from 'sharp';
const [inp, out, maxArg] = process.argv.slice(2);
const MAX = +(maxArg || 1024);
const b = fs.readFileSync(inp);
const jl = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jl).toString());
const binStart = 20 + jl + 8, binLen = b.readUInt32LE(20 + jl);
const bin = b.slice(binStart, binStart + binLen);
const views = j.bufferViews.map((v) => bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
const imageViews = new Set((j.images || []).map((im) => im.bufferView));
for (const im of j.images || []) {
	const src = views[im.bufferView];
	let img = sharp(src);
	const meta = await img.metadata();
	let alpha = false;
	if (meta.hasAlpha) { const st = await sharp(src).stats(); alpha = st.channels[3] && st.channels[3].min < 250; }
	img = img.resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true });
	const data = alpha ? await img.png({ compressionLevel: 9, palette: false }).toBuffer() : await img.flatten({ background: '#808080' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
	views[im.bufferView] = data;
	im.mimeType = alpha ? 'image/png' : 'image/jpeg';
	console.log(`${meta.width}x${meta.height} ${meta.format}${alpha ? ' (alpha)' : ''} ${src.length} -> ${data.length}`);
}
// rebuild the binary chunk, 4-byte aligned views
const parts = []; let off = 0;
j.bufferViews.forEach((v, i) => {
	const d = views[i]; const pad = (4 - (off % 4)) % 4;
	if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
	v.byteOffset = off; v.byteLength = d.length; parts.push(d); off += d.length;
});
const newBin = Buffer.concat(parts);
const binPad = (4 - (newBin.length % 4)) % 4;
j.buffers = [{ byteLength: newBin.length + binPad }];
let json = Buffer.from(JSON.stringify(j));
const jsonPad = (4 - (json.length % 4)) % 4;
json = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
const total = 12 + 8 + json.length + 8 + newBin.length + binPad;
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length + binPad, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(out, Buffer.concat([head, jh, json, bh, newBin, Buffer.alloc(binPad)]));
console.log(`${inp}: ${b.length} -> ${total} bytes`);
