import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DESK, ROOM } from '../config';
import type { Materials } from './materials';
import type { StaticCollider, BakedSurface } from './room';
import { buildDesk } from './furniture/desk';
import { buildMonitor, MONITOR } from './furniture/monitor';
import { buildKeyboard, KB_SIZE } from './furniture/keyboard';
import { buildChair } from './furniture/chair';
import { buildMouse, buildPC } from './furniture/peripherals';
import { buildCredenza } from './furniture/credenza';
import { buildMug, buildNotebook, buildPen, buildDeskPad, buildSocket, buildArtPrint } from './furniture/props';
import { tube, merge } from '../util/geometry';

/**
 * Places every object of the workstation at its real-world position and
 * returns handles needed by the interactive systems (screen, keyboard, mouse,
 * dynamic props) plus static colliders and AO receivers.
 */
export async function buildWorkstation(M: Materials, scene: THREE.Scene, screenTexture: THREE.Texture) {
	const colliders: StaticCollider[] = [];
	const baked: BakedSurface[] = [];
	const deskY = DESK.height;
	const cx = DESK.centerX, cz = DESK.centerZ;
	const deskFront = cz + DESK.depth / 2, deskBack = cz - DESK.depth / 2;

	const desk = buildDesk(M);
	scene.add(desk.group);
	colliders.push(...desk.colliders);
	baked.push(desk.baked);

	// ---------------------------------------------------------------- monitor
	const monitor = buildMonitor(M, screenTexture);
	monitor.group.position.set(cx, deskY, deskBack + 0.255);
	scene.add(monitor.group);
	colliders.push({ center: new THREE.Vector3(cx, deskY + 0.004, deskBack + 0.235), half: new THREE.Vector3(0.12, 0.004, 0.0875) });
	colliders.push({ center: new THREE.Vector3(cx, deskY + 0.15, deskBack + 0.18), half: new THREE.Vector3(0.025, 0.15, 0.01) });
	{
		const h = MONITOR.activeH / 2 + 0.02;
		colliders.push({ center: new THREE.Vector3(cx, deskY + MONITOR.centerY, deskBack + 0.21), half: new THREE.Vector3(MONITOR.activeW / 2 + 0.008, h, 0.03) });
	}

	// ---------------------------------------------------------------- input devices
	const pad = buildDeskPad(M);
	pad.position.set(cx + 0.12, deskY, deskFront - 0.19);
	scene.add(pad);
	const keyboard = buildKeyboard(M);
	keyboard.group.position.set(cx - 0.02, deskY + 0.003, deskFront - 0.17);
	keyboard.group.rotation.y = THREE.MathUtils.degToRad(1.2);
	scene.add(keyboard.group);
	colliders.push({
		center: new THREE.Vector3(cx - 0.02, deskY + 0.003 + 0.016, deskFront - 0.17),
		half: new THREE.Vector3(KB_SIZE.w / 2, 0.016, KB_SIZE.d / 2),
	});

	const mouse = buildMouse(M);
	mouse.group.position.set(cx + 0.28, deskY + 0.003, deskFront - 0.165);
	mouse.group.rotation.y = THREE.MathUtils.degToRad(-6);
	scene.add(mouse.group);

	// ---------------------------------------------------------------- PC under the desk, right side
	const pc = buildPC(M);
	pc.group.position.set(cx + DESK.width / 2 - 0.075 - 0.13, 0, -ROOM.depth / 2 + 0.07 + 0.21);
	scene.add(pc.group);
	colliders.push({
		center: new THREE.Vector3(pc.group.position.x, pc.size.y / 2, pc.group.position.z),
		half: pc.size.clone().multiplyScalar(0.5),
	});

	// ---------------------------------------------------------------- chair
	const chair = buildChair(M);
	chair.group.position.set(cx + 0.05, 0, deskFront + 0.5);
	chair.group.rotation.y = THREE.MathUtils.degToRad(-9);
	scene.add(chair.group);
	colliders.push({ center: new THREE.Vector3(cx + 0.05, 0.43, deskFront + 0.52), half: new THREE.Vector3(0.26, 0.05, 0.25) });
	colliders.push({ center: new THREE.Vector3(cx + 0.05, 0.25, deskFront + 0.5), half: new THREE.Vector3(0.05, 0.2, 0.05) });
	colliders.push({ center: new THREE.Vector3(cx + 0.03, 0.04, deskFront + 0.5), half: new THREE.Vector3(0.32, 0.04, 0.32) });
	colliders.push({ center: new THREE.Vector3(cx + 0.09, 0.85, deskFront + 0.82), half: new THREE.Vector3(0.24, 0.3, 0.04), rotationY: THREE.MathUtils.degToRad(-9) });

	// ---------------------------------------------------------------- dynamic props (physics bodies attach later)
	const mug = buildMug(M);
	mug.group.position.set(cx + 0.58, deskY, deskBack + 0.42);
	mug.group.rotation.y = 2.2;
	scene.add(mug.group);
	const notebook = buildNotebook(M);
	notebook.group.position.set(cx - 0.56, deskY, deskFront - 0.24);
	notebook.group.rotation.y = THREE.MathUtils.degToRad(11);
	scene.add(notebook.group);
	const pen = buildPen(M);
	pen.group.position.set(cx - 0.47, deskY + 0.0153 + 0.0049, deskFront - 0.22);
	pen.group.rotation.y = THREE.MathUtils.degToRad(68);
	scene.add(pen.group);

	// ---------------------------------------------------------------- wall details
	const socket = buildSocket(M);
	socket.position.set(cx + 0.38, 0.3, -ROOM.depth / 2);
	scene.add(socket);
	const credenza = buildCredenza(M);
	credenza.group.position.set(ROOM.width / 2 - 0.02, 0, -0.55);
	credenza.group.rotation.y = -Math.PI / 2;
	scene.add(credenza.group);
	colliders.push({
		center: new THREE.Vector3(ROOM.width / 2 - 0.02 - credenza.size.z / 2, credenza.size.y / 2, -0.55),
		half: new THREE.Vector3(credenza.size.z / 2, credenza.size.y / 2, credenza.size.x / 2),
	});
	const art = buildArtPrint(M);
	art.position.set(ROOM.width / 2, 1.42, -0.55);
	art.rotation.y = -Math.PI / 2;
	scene.add(art);

	// ---------------------------------------------------------------- Poly Haven models (CC0)
	const gltf = new GLTFLoader();
	const load = async (name: string) => {
		// Self-contained glTF JSON (scripts/pack-models.mjs). Its buffer is a
		// data: URI, which strict hosts (Claude artifacts) refuse to fetch, so
		// decode it here and hand GLTFLoader an in-memory GLB instead.
		const json = await (await fetch(`models/${name}/${name}.json`)).json();
		const r = await gltf.parseAsync(gltfJsonToGlb(json), `models/${name}/`);
		r.scene.traverse((o) => {
			const m = o as THREE.Mesh;
			if (m.isMesh) {
				m.castShadow = m.receiveShadow = true;
				const mat = m.material as THREE.MeshStandardMaterial;
				if (mat.map) mat.map.anisotropy = 8;
			}
		});
		return r.scene;
	};
	const [lamp, plant, clock] = await Promise.all([load('desk_lamp_arm_01'), load('potted_plant_02'), load('wall_clock')]);
	const sitOn = (o: THREE.Object3D, y: number) => {
		o.updateMatrixWorld(true);
		const b = new THREE.Box3().setFromObject(o);
		o.position.y += y - b.min.y;
	};
	// the lamp's origin is the desk surface: its mounting peg drops into a grommet hole
	lamp.position.set(cx - 0.66, deskY, deskBack + 0.13);
	lamp.rotation.y = THREE.MathUtils.degToRad(-55);
	scene.add(lamp);
	// The asset's soil is a 54k-triangle sculpt that is almost entirely hidden
	// under the leaves; swap it for a low-poly mound with the same CC0 material.
	const dirt = plant.getObjectByName('potted_plant_02_dirt') as THREE.Mesh | undefined;
	if (dirt) {
		dirt.geometry.computeBoundingBox();
		const bb = dirt.geometry.boundingBox!;
		const r = (bb.max.x - bb.min.x) / 2, c = bb.getCenter(new THREE.Vector3());
		const mound = new THREE.LatheGeometry([0, 0.35, 0.7, 0.92, 1].map((t, i) => new THREE.Vector2(t * r, bb.max.y - (bb.max.y - bb.min.y) * (i === 0 ? 0.15 : t * t * 0.6))).reverse(), 32);
		mound.rotateY(0.3);
		mound.translate(c.x, 0, c.z);
		const uv = mound.getAttribute('uv'), pos = mound.getAttribute('position');
		for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + (pos.getX(i) - c.x) / (2 * r), 0.5 + (pos.getZ(i) - c.z) / (2 * r));
		dirt.geometry.dispose();
		dirt.geometry = mound;
	}
	plant.position.set(-ROOM.width / 2 + 0.36, 0, -ROOM.depth / 2 + 0.36);
	plant.rotation.y = 0.7;
	scene.add(plant);
	sitOn(plant, 0);
	colliders.push({ center: new THREE.Vector3(plant.position.x, 0.17, plant.position.z), half: new THREE.Vector3(0.22, 0.17, 0.22) });

	// clock: find its depth and hang it flush on the north wall to the right of the desk
	clock.rotation.set(0, 0, 0);
	clock.updateMatrixWorld(true);
	const cb = new THREE.Box3().setFromObject(clock);
	clock.position.set(1.35, 1.92, -ROOM.depth / 2 - cb.min.z + 0.002);
	scene.add(clock);
	// The asset's glass uses KHR_materials_transmission, which needs a costly
	// extra render pass (and samples black outside it); use our thin glass.
	clock.traverse((o) => {
		const m = o as THREE.Mesh;
		if (m.isMesh && (m.material as THREE.Material).name === 'wall_clock_glass') {
			const gm = M.glass.clone();
			gm.opacity = 0.08;
			m.material = gm;
		}
	});
	// Hands are modelled at a fixed time; measure each hand's baked angle
	// (clockwise from 12) so the live time can be applied relative to it.
	const handAngle = (o?: THREE.Object3D) => {
		const m = o as THREE.Mesh | undefined;
		if (!m?.geometry) return 0;
		const p = m.geometry.getAttribute('position');
		let best = 0, ang = 0;
		for (let i = 0; i < p.count; i++) {
			const x = p.getX(i), y = p.getY(i), d = x * x + y * y;
			if (d > best) { best = d; ang = Math.atan2(x, y); }
		}
		return ang;
	};
	const hands = {
		hour: clock.getObjectByName('wall_clock_hours_hand'),
		minute: clock.getObjectByName('wall_clock_minute_hand'),
		second: clock.getObjectByName('wall_clock_second_hand'),
	};
	const base = { hour: handAngle(hands.hour), minute: handAngle(hands.minute), second: handAngle(hands.second) };

	// ---------------------------------------------------------------- cables
	const cables: THREE.BufferGeometry[] = [];
	const trayY = desk.trayY + 0.01, trayZ = desk.trayZ;
	const monBackY = deskY + MONITOR.centerY - 0.09, monBackZ = deskBack + 0.255 - 0.08;
	// display + power from the monitor, down the back of the neck, over the back edge into the tray
	for (const dx of [-0.006, 0.006]) {
		cables.push(tube([
			new THREE.Vector3(cx + dx, monBackY, monBackZ),
			new THREE.Vector3(cx + dx, deskY + 0.12, monBackZ - 0.02),
			new THREE.Vector3(cx + dx * 2, deskY + 0.006, deskBack + 0.12),
			new THREE.Vector3(cx + 0.02 + dx, deskY + 0.004, deskBack + 0.03),
			new THREE.Vector3(cx + 0.04 + dx, deskY - 0.03, deskBack - 0.008),
			new THREE.Vector3(cx + 0.1 + dx, trayY + 0.01, trayZ),
			new THREE.Vector3(cx + 0.35 + dx, trayY + 0.008, trayZ),
			new THREE.Vector3(pc.group.position.x + 0.03 + dx, trayY - 0.05, trayZ - 0.03),
			new THREE.Vector3(pc.group.position.x + 0.03 + dx, 0.38, pc.group.position.z - 0.215),
			new THREE.Vector3(pc.group.position.x + 0.03 + dx, 0.32, pc.group.position.z - 0.205),
		], 0.0033, 160, 8));
	}
	// keyboard USB-C: from the keyboard back edge, a relaxed curve to the back of the desk
	const kbBack = keyboard.group.position.clone().add(new THREE.Vector3(0.06, 0.02, -KB_SIZE.d / 2));
	cables.push(tube([
		kbBack,
		kbBack.clone().add(new THREE.Vector3(0.0, -0.016, -0.03)),
		new THREE.Vector3(cx + 0.1, deskY + 0.0028, deskFront - 0.37),
		new THREE.Vector3(cx + 0.16, deskY + 0.0028, deskBack + 0.1),
		new THREE.Vector3(cx + 0.18, deskY + 0.003, deskBack + 0.02),
		new THREE.Vector3(cx + 0.2, deskY - 0.03, deskBack - 0.006),
		new THREE.Vector3(cx + 0.25, trayY + 0.01, trayZ + 0.02),
	], 0.0022, 120, 8));
	// PC power cable to the wall socket
	cables.push(tube([
		new THREE.Vector3(pc.group.position.x - 0.05, 0.1, pc.group.position.z - 0.21),
		new THREE.Vector3(pc.group.position.x - 0.06, 0.07, pc.group.position.z - 0.25),
		new THREE.Vector3(socket.position.x - 0.02, 0.15, -ROOM.depth / 2 + 0.03),
		new THREE.Vector3(socket.position.x - 0.036, 0.295, -ROOM.depth / 2 + 0.02),
	], 0.0035, 60, 8));
	// lamp cable from the lamp base over the back edge
	const lampBase = lamp.position.clone();
	cables.push(tube([
		new THREE.Vector3(lampBase.x + 0.02, deskY + 0.01, lampBase.z - 0.03),
		new THREE.Vector3(lampBase.x + 0.05, deskY + 0.0025, lampBase.z - 0.08),
		new THREE.Vector3(lampBase.x + 0.1, deskY - 0.03, deskBack - 0.008),
		new THREE.Vector3(lampBase.x + 0.3, trayY + 0.012, trayZ),
		new THREE.Vector3(cx - 0.2, trayY + 0.01, trayZ),
	], 0.0022, 80, 8));
	const cableMesh = new THREE.Mesh(merge(cables), M.cable);
	cableMesh.name = 'cables';
	cableMesh.castShadow = true;
	scene.add(cableMesh);

	return {
		colliders, baked, desk, monitor, keyboard, mouse, pc, chair, mug, notebook, pen, lamp, plant, clock,
		updateClock(date = new Date()) {
			const s = date.getSeconds() + date.getMilliseconds() / 1000;
			const m = date.getMinutes() + s / 60;
			const h = (date.getHours() % 12) + m / 60;
			if (hands.second) hands.second.rotation.z = -((s / 60) * Math.PI * 2 - base.second);
			if (hands.minute) hands.minute.rotation.z = -((m / 60) * Math.PI * 2 - base.minute);
			if (hands.hour) hands.hour.rotation.z = -((h / 12) * Math.PI * 2 - base.hour);
		},
	};
}

/** Build a binary glTF (GLB) from glTF JSON whose buffers are base64 data URIs. */
function gltfJsonToGlb(json: any): ArrayBuffer {
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

export type Workstation = Awaited<ReturnType<typeof buildWorkstation>>;
