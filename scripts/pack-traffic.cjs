// Usage: npm pack @netforge/asset-library-files@0.2.0, extract it, then
//   node scripts/pack-traffic.cjs <extracted>/package/library/lowpoly
// Pack Kenney GLBs into one JSON. Images are pulled out of each GLB (deduped)
// so the page decodes them with createImageBitmap instead of blob/data URLs.
const fs = require('fs'), crypto = require('crypto');
const D = process.argv[2];
const cars = ["sedan","suv","taxi","police_car","van","truck","delivery_van","ambulance","hatchback_sports","sedan_sports","suv_luxury","truck_flat","garbage_truck","firetruck","race_car"];
const scen = ["tree_pine_tall","tree_pine","tree_oak","tree_fat","bush_large","rock_large"];
const out = { license: "Kenney Car Kit and Nature Kit (kenney.nl), CC0 1.0, via the @netforge/asset-library-files package", images: {}, models: {} };
for (const n of [...cars, ...scen]) {
  const b = fs.readFileSync(D + '/' + n + '.glb');
  const jl = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + jl)), bin = b.slice(20 + jl + 8);
  const texImg = (j.textures || []).map((t) => {
    const im = j.images[t.source], bv = j.bufferViews[im.bufferView];
    const bytes = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const id = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 10);
    out.images[id] = out.images[id] || bytes.toString('base64');
    return id;
  });
  for (const m of j.materials || []) {
    const bt = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture;
    if (bt) { m.extras = Object.assign(m.extras || {}, { map: texImg[bt.index] }); delete m.pbrMetallicRoughness.baseColorTexture; }
  }
  delete j.textures; delete j.images; delete j.samplers;
  if (j.extensionsUsed) j.extensionsUsed = j.extensionsUsed.filter((e) => e !== 'KHR_texture_transform');
  let js = Buffer.from(JSON.stringify(j)); const pad = (4 - js.length % 4) % 4; js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  const binChunk = b.slice(20 + jl);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + binChunk.length, 8); head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  out.models[n] = Buffer.concat([head, js, binChunk]).toString('base64');
}
fs.writeFileSync('public/models/traffic/traffic.json', JSON.stringify(out));
console.log(Object.keys(out.images), fs.statSync('public/models/traffic/traffic.json').size);
