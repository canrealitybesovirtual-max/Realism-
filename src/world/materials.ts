import * as THREE from 'three';

/**
 * Physically based material library for the room.
 *
 * Albedo values are chosen from measured ranges (e.g. white emulsion paint
 * ~0.80 reflectance, polished grey concrete ~0.35-0.45, anodised black
 * aluminium ~0.04) and authored in sRGB as is conventional.
 */

const loader = new THREE.TextureLoader();
const loading: Promise<unknown>[] = [];
/** Resolves once every texture requested so far has loaded (or failed). */
export function texturesLoaded(): Promise<unknown> { return Promise.allSettled(loading); }

let maxAniso = 8;

export function setMaxAnisotropy(a: number) { maxAniso = Math.min(16, a); }

const cache = new Map<string, THREE.Texture>();

export function tex(url: string, opts: { srgb?: boolean; repeat?: [number, number]; } = {}): THREE.Texture {
	const key = url + (opts.srgb ? ':s' : ':l');
	let base = cache.get(key);
	if (!base) {
		let done!: () => void;
		loading.push(new Promise<void>((r) => (done = r)));
		base = loader.load(url, () => done(), undefined, () => { console.error('texture failed: ' + url); done(); });
		base.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
		base.wrapS = base.wrapT = THREE.RepeatWrapping;
		base.anisotropy = maxAniso;
		cache.set(key, base);
	}
	if (!opts.repeat) return base;
	// share the image, vary the transform
	const t = base.clone(); // shares the Source, so it updates when the image arrives
	t.repeat.set(opts.repeat[0], opts.repeat[1]);
	return t;
}

/** Texture repeat for a map that represents `tileMetres` of surface in UV-metre space. */
const rep = (tileMetres: number, tileV = tileMetres): [number, number] => [1 / tileMetres, 1 / tileV];

export type Materials = ReturnType<typeof createMaterials>;

export function createMaterials() {
	const T = 'textures/'; // relative: the app may be served from a sub-path

	const concrete = new THREE.MeshPhysicalMaterial({
		name: 'polished-concrete',
		color: 0xb8b6b2, // multiplies the albedo texture (~0.6 grey)
		map: tex(T + 'concrete_diff.jpg', { srgb: true, repeat: rep(2.0) }),
		normalMap: tex(T + 'concrete_nor.jpg', { repeat: rep(2.0) }),
		normalScale: new THREE.Vector2(0.6, 0.6),
		roughnessMap: tex(T + 'concrete_orm.jpg', { repeat: rep(2.0) }),
		roughness: 1.0,
		metalness: 0.0,
		// densified + sealed slab: thin glossy coat over the cement paste
		clearcoat: 0.45,
		clearcoatRoughness: 0.08,
		specularIntensity: 0.6,
	});

	const wallPaint = new THREE.MeshStandardMaterial({
		name: 'wall-paint',
		color: 0xf1f0ec,
		normalMap: tex(T + 'plaster_nor.jpg', { repeat: rep(1.5) }),
		normalScale: new THREE.Vector2(0.35, 0.35),
		roughnessMap: tex(T + 'plaster_orm.jpg', { repeat: rep(1.5) }),
		roughness: 1.0,
	});

	const ceilingPaint = new THREE.MeshStandardMaterial({
		name: 'ceiling-paint',
		color: 0xf4f4f1,
		normalMap: tex(T + 'plaster_nor.jpg', { repeat: rep(2.0) }),
		normalScale: new THREE.Vector2(0.2, 0.2),
		roughness: 0.95,
	});

	const shadowGap = new THREE.MeshStandardMaterial({ name: 'shadow-gap', color: 0x1b1b1c, roughness: 0.55, metalness: 0.0 });
	const jointGrout = new THREE.MeshStandardMaterial({ name: 'joint', color: 0x2a2928, roughness: 0.9 });

	// Black powder-coated aluminium (window frames, desk legs)
	const blackPowder = new THREE.MeshStandardMaterial({
		name: 'black-powdercoat',
		color: 0x141516,
		roughness: 0.42,
		metalness: 0.0,
		normalMap: tex(T + 'grit_nor.jpg', { repeat: rep(0.1) }),
		normalScale: new THREE.Vector2(0.25, 0.25),
	});

	// Matte anodised aluminium (monitor stand, chair base)
	const aluminium = new THREE.MeshStandardMaterial({
		name: 'anodised-aluminium',
		color: 0xc9cbcd,
		metalness: 1.0,
		roughness: 0.32,
		normalMap: tex(T + 'grit_nor.jpg', { repeat: rep(0.05) }),
		normalScale: new THREE.Vector2(0.35, 0.35),
	});
	const darkAluminium = aluminium.clone();
	darkAluminium.name = 'space-grey-aluminium';
	darkAluminium.color.set(0x5d5f62);
	darkAluminium.roughness = 0.38;

	const chrome = new THREE.MeshStandardMaterial({ name: 'chrome', color: 0xe8e8e8, metalness: 1, roughness: 0.08 });

	// Window glass: thin, almost clear, reflective. Rendered as a transparent
	// dielectric rather than with transmission to stay cheap in VR.
	const glass = new THREE.MeshPhysicalMaterial({
		name: 'glass',
		color: 0xffffff,
		metalness: 0,
		roughness: 0.02,
		transparent: true,
		opacity: 0.06,
		specularIntensity: 1,
		ior: 1.52,
		depthWrite: false,
		side: THREE.DoubleSide,
	});

	const oak = new THREE.MeshPhysicalMaterial({
		name: 'white-oak-oiled',
		color: 0xffffff,
		map: tex(T + 'oak_diff.jpg', { srgb: true, repeat: rep(1.6, 0.4) }),
		normalMap: tex(T + 'oak_nor.jpg', { repeat: rep(1.6, 0.4) }),
		normalScale: new THREE.Vector2(0.4, 0.4),
		roughnessMap: tex(T + 'oak_orm.jpg', { repeat: rep(1.6, 0.4) }),
		roughness: 1,
		// hardwax oil leaves a faint satin sheen
		clearcoat: 0.15,
		clearcoatRoughness: 0.35,
	});

	const doorPaint = new THREE.MeshStandardMaterial({ name: 'door-satin', color: 0xf3f3f1, roughness: 0.38 });

	const blackPlastic = new THREE.MeshStandardMaterial({ name: 'black-plastic', color: 0x111112, roughness: 0.5 });
	const softTouch = new THREE.MeshStandardMaterial({ name: 'soft-touch', color: 0x1a1a1b, roughness: 0.72 });
	const glossBlack = new THREE.MeshPhysicalMaterial({ name: 'gloss-black', color: 0x0a0a0b, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 });
	const rubber = new THREE.MeshStandardMaterial({ name: 'rubber', color: 0x1c1c1c, roughness: 0.85 });

	const fabric = new THREE.MeshPhysicalMaterial({
		name: 'upholstery',
		color: 0x3d3f42,
		map: tex(T + 'fabric_var.jpg', { srgb: true, repeat: rep(0.04) }),
		normalMap: tex(T + 'fabric_nor.jpg', { repeat: rep(0.04) }),
		normalScale: new THREE.Vector2(0.8, 0.8),
		roughness: 0.92,
		sheen: 0.6,
		sheenRoughness: 0.55,
		sheenColor: new THREE.Color(0x6a6d72),
	});

	const meshFabric = new THREE.MeshStandardMaterial({
		name: 'elastomer-mesh',
		color: 0x2a2b2d,
		map: tex(T + 'mesh_rgba.png', { srgb: true, repeat: rep(0.02) }),
		normalMap: tex(T + 'mesh_nor.jpg', { repeat: rep(0.02) }),
		roughness: 0.7,
		// alpha-to-coverage keeps the open weave semi-transparent at a distance
		// (plain alpha test turns fully opaque or vanishes as mips average out)
		alphaTest: 0.08,
		alphaToCoverage: true,
		side: THREE.DoubleSide,
	});

	const ceramicWhite = new THREE.MeshPhysicalMaterial({ name: 'glazed-ceramic', color: 0xf2f0ea, roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.05 });
	const ceramicMatte = new THREE.MeshStandardMaterial({ name: 'matte-ceramic', color: 0x2e3133, roughness: 0.7 });
	const paper = new THREE.MeshStandardMaterial({ name: 'paper', color: 0xf3f1ea, roughness: 0.9 });
	const cover = new THREE.MeshStandardMaterial({ name: 'notebook-cover', color: 0x2f3a33, roughness: 0.75 });
	const deskPad = new THREE.MeshStandardMaterial({
		name: 'felt-desk-pad', color: 0x47494c, roughness: 0.95,
		normalMap: tex(T + 'fabric_nor.jpg', { repeat: rep(0.012) }), normalScale: new THREE.Vector2(0.35, 0.35),
	});
	const cable = new THREE.MeshStandardMaterial({ name: 'cable', color: 0x161617, roughness: 0.55 });
	const whiteCable = new THREE.MeshStandardMaterial({ name: 'cable-white', color: 0xe6e6e3, roughness: 0.5 });

	return {
		concrete, wallPaint, ceilingPaint, shadowGap, jointGrout, blackPowder, aluminium, darkAluminium, chrome,
		glass, oak, doorPaint, blackPlastic, softTouch, glossBlack, rubber, fabric, meshFabric, ceramicWhite,
		ceramicMatte, paper, cover, deskPad, cable, whiteCable,
	};
}
