import * as THREE from 'three';
import { HandModel, POSES, type PoseName } from '../interaction/handModel';

/**
 * Development aid (?handpreview): lays out a row of hands in each named pose
 * on the desk, so the procedural hand and its poses can be screenshotted.
 */
export function addHandPreview(scene: THREE.Scene, camera: THREE.PerspectiveCamera, which = 'all') {
	const names = (which === 'all' ? Object.keys(POSES) : which.split(',')) as PoseName[];
	const g = new THREE.Group();
	names.forEach((n, i) => {
		for (const side of ['right', 'left'] as const) {
			const h = new HandModel(side);
			h.setPose(POSES[n]);
			// palm down, fingers pointing away from the viewer
			h.root.position.set((i - (names.length - 1) / 2) * 0.17 + (side === 'left' ? -0.0 : 0), side === 'right' ? 1.0 : 1.18, -1.65);
			if (side === 'left') { h.root.rotation.set(0, Math.PI, 0); h.root.position.z = -1.7; h.root.rotation.x = -0.3; }
			else h.root.rotation.x = 0.35;
			g.add(h.root);
		}
	});
	scene.add(g);
	camera.position.set(0, 1.32, -1.2);
	camera.lookAt(0, 1.05, -1.75);
	camera.fov = 60;
	camera.updateProjectionMatrix();
	return g;
}
