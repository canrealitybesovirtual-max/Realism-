import * as THREE from 'three';
import type { StaticCollider } from '../world/room';
import { ROOM } from '../config';
import type { Computer } from '../computer/computer';

/**
 * Shared pieces of the interaction layer used by both desktop and XR input:
 * walkable-area tests, the desk mouse that drives the OS cursor, and the
 * single-owner lock that keeps two input sources from fighting over the
 * computer.
 */

const BODY_MIN_Y = 0.05, BODY_MAX_Y = 1.8;

export class Walkable {
	private blockers: THREE.Box2[];
	readonly bounds: THREE.Box2;
	constructor(colliders: StaticCollider[]) {
		this.blockers = colliders
			.filter((c) => c.center.y - c.half.y < BODY_MAX_Y && c.center.y + c.half.y > BODY_MIN_Y)
			.map((c) => {
				// rotated colliders are approximated by their axis-aligned footprint
				const r = c.rotationY ?? 0;
				const hx = Math.abs(Math.cos(r)) * c.half.x + Math.abs(Math.sin(r)) * c.half.z;
				const hz = Math.abs(Math.sin(r)) * c.half.x + Math.abs(Math.cos(r)) * c.half.z;
				return new THREE.Box2(new THREE.Vector2(c.center.x - hx, c.center.z - hz), new THREE.Vector2(c.center.x + hx, c.center.z + hz));
			});
		this.bounds = new THREE.Box2(new THREE.Vector2(-ROOM.width / 2, -ROOM.depth / 2), new THREE.Vector2(ROOM.width / 2, ROOM.depth / 2));
	}

	/** Is a standing person of radius r at (x, z) clear of walls and furniture? */
	ok(x: number, z: number, r = 0.22): boolean {
		const b = this.bounds;
		if (x < b.min.x + r || x > b.max.x - r || z < b.min.y + r || z > b.max.y - r) return false;
		for (const k of this.blockers) {
			const cx = Math.max(k.min.x, Math.min(x, k.max.x)), cz = Math.max(k.min.y, Math.min(z, k.max.y));
			if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) return false;
		}
		return true;
	}

	/** Move from (x,z) by (dx,dz), sliding along obstacles. Returns the new position. */
	slide(x: number, z: number, dx: number, dz: number, r = 0.22): [number, number] {
		if (this.ok(x + dx, z + dz, r)) return [x + dx, z + dz];
		if (this.ok(x + dx, z, r)) return [x + dx, z];
		if (this.ok(x, z + dz, r)) return [x, z + dz];
		return [x, z];
	}
}

/**
 * The 3D mouse on the desk pad. Moving it (by hand in VR, or mirrored from
 * the real mouse on desktop) moves the OS cursor by the same physical
 * distance a real 1600-CPI-ish mouse would.
 */
export class DeskMouse {
	static readonly PX_PER_M = 9000;
	readonly home: THREE.Vector3;
	readonly area: THREE.Box2; // allowed XZ region on the pad
	constructor(readonly object: THREE.Object3D, padCenter: THREE.Vector3, padHalf: THREE.Vector2) {
		this.home = object.position.clone();
		this.area = new THREE.Box2(
			new THREE.Vector2(padCenter.x - padHalf.x + 0.04, padCenter.z - padHalf.y + 0.06),
			new THREE.Vector2(padCenter.x + padHalf.x - 0.04, padCenter.z + padHalf.y - 0.06),
		);
	}

	/** Mirror a cursor movement in pixels onto the model (desktop mode). */
	nudgePixels(dx: number, dy: number) {
		const p = this.object.position;
		p.x = THREE.MathUtils.clamp(p.x + dx / DeskMouse.PX_PER_M, this.area.min.x, this.area.max.x);
		p.z = THREE.MathUtils.clamp(p.z + dy / DeskMouse.PX_PER_M, this.area.min.y, this.area.max.y);
	}

	/** Slide the model toward a world XZ point; returns the cursor delta in pixels. */
	slideTo(x: number, z: number): [number, number] {
		const p = this.object.position;
		const nx = THREE.MathUtils.clamp(x, this.area.min.x, this.area.max.x);
		const nz = THREE.MathUtils.clamp(z, this.area.min.y, this.area.max.y);
		const d: [number, number] = [(nx - p.x) * DeskMouse.PX_PER_M, (nz - p.z) * DeskMouse.PX_PER_M];
		p.x = nx; p.z = nz;
		return d;
	}
}

/** Only one input source may drive the computer's pointer at a time. */
export class PointerOwner {
	private owner: string | null = null;
	claim(id: string): boolean { if (this.owner && this.owner !== id) return false; this.owner = id; return true; }
	release(id: string) { if (this.owner === id) this.owner = null; }
	is(id: string) { return this.owner === id; }
	get free() { return this.owner === null; }
}

export interface InteractionTargets {
	/** the pistol, when loaded */
	gun?: import('../world/pistolSystem').PistolSystem;
	/** the editor's in-world tools (select / carry), when the Studio is set up */
	editorTool?: import('../engine/worldTool').WorldTool;
	/** every usable gun (the pistol included) */
	guns?: import('../world/firearmSystem').Gun[];
	screen: THREE.Mesh;
	keycaps: THREE.Mesh;
	computer: Computer;
	mouse: DeskMouse;
}
