import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics, Prop } from '../physics/physics';

/**
 * Soft contact shadows for movable props.
 *
 * Static furniture gets baked AO, but props move, and the desk is out of the
 * sun, so without this a mug put down on the desk would look pasted on. Each
 * prop gets a small radial-gradient decal placed on the surface beneath it
 * (found with a physics ray cast), fading and widening with height, which is
 * how an occluder's ambient shadow behaves under soft indoor light.
 */
export class ContactShadows {
	private items: { prop: Prop; mesh: THREE.Mesh }[] = [];
	private tex: THREE.Texture;

	constructor(private scene: THREE.Scene, private physics: Physics) {
		const c = document.createElement('canvas');
		c.width = c.height = 128;
		const g = c.getContext('2d')!;
		const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
		grd.addColorStop(0, 'rgba(0,0,0,0.85)');
		grd.addColorStop(0.35, 'rgba(0,0,0,0.5)');
		grd.addColorStop(0.7, 'rgba(0,0,0,0.12)');
		grd.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = grd;
		g.fillRect(0, 0, 128, 128);
		this.tex = new THREE.CanvasTexture(c);
	}

	add(prop: Prop, radius: number, stretch = 1) {
		const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
		mesh.userData.base = [radius * 2 * stretch, radius * 2];
		mesh.renderOrder = 2;
		mesh.name = 'contact-shadow-' + prop.desc.name;
		this.scene.add(mesh);
		this.items.push({ prop, mesh });
	}

	update() {
		const down = { x: 0, y: -1, z: 0 };
		for (const it of this.items) {
			const o = it.prop.desc.object;
			const p = o.position;
			const ray = new RAPIER.Ray({ x: p.x, y: p.y + 0.02, z: p.z }, down);
			// ignore the prop's own colliders
			const hit = this.physics.world.castRay(ray, 3, true, undefined, undefined, undefined, it.prop.body);
			if (!hit) { it.mesh.visible = false; continue; }
			const surfaceY = p.y + 0.02 - hit.timeOfImpact;
			const h = Math.max(0, p.y - surfaceY);
			it.mesh.visible = true;
			it.mesh.position.set(p.x, surfaceY + 0.0006, p.z);
			// follow the prop's heading (matters for the long pen)
			const yaw = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ').y;
			it.mesh.rotation.y = yaw;
			const spread = 1 + h * 6;
			const [bx, bz] = it.mesh.userData.base as [number, number];
			it.mesh.scale.set(bx * spread, 1, bz * spread);
			(it.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 / (1 + h * 14);
		}
	}
}
