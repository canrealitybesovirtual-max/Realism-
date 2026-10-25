import type * as THREE from 'three';
import type { PropDesc } from './physics';

/**
 * Physical properties of the movable objects. Masses are real-world values;
 * friction / restitution are typical for the material pairs against a
 * wooden desk or concrete floor (Rapier combines them by averaging).
 */
export function mugDesc(object: THREE.Object3D): PropDesc {
	return {
		name: 'mug', object, mass: 0.34, friction: 0.55, restitution: 0.12,
		linearDamping: 0.05, angularDamping: 0.4,
		shapes: [
			{ kind: 'cylinder', size: [0.0408, 0.0475], offset: [0, 0.0475, 0] },
			{ kind: 'cuboid', size: [0.0125, 0.026, 0.007], offset: [0.056, 0.05, 0] }, // handle
		],
	};
}

export function notebookDesc(object: THREE.Object3D): PropDesc {
	return {
		name: 'notebook', object, mass: 0.32, friction: 0.65, restitution: 0.05,
		angularDamping: 0.5,
		shapes: [{ kind: 'cuboid', size: [0.074, 0.0075, 0.105], offset: [0, 0.0075, 0] }],
	};
}

export function penDesc(object: THREE.Object3D): PropDesc {
	// a round pen rolls freely in reality; high angular damping stands in for
	// rolling resistance so it stops within a few centimetres on the desk
	return {
		name: 'pen', object, mass: 0.022, friction: 0.45, restitution: 0.25,
		angularDamping: 2.5,
		shapes: [{ kind: 'capsuleX', size: [0.0049, 0.066] }],
	};
}

export function pistolDesc(object: THREE.Object3D): PropDesc {
	// slide/barrel block plus the grip; ~0.95 kg loaded (Walther P38: 0.8 kg empty)
	return {
		name: 'pistol', object, mass: 0.95, friction: 0.6, restitution: 0.08,
		angularDamping: 0.6,
		shapes: [
			{ kind: 'cuboid', size: [0.016, 0.019, 0.105], offset: [0, 0.062, -0.065] },
			{ kind: 'cuboid', size: [0.015, 0.042, 0.026], offset: [0, -0.003, 0.016] }, // grip bottom at y = -0.045
		],
	};
}

export function firearmDesc(object: THREE.Object3D, name: string, mass: number, hull: { half: [number, number, number]; offset: [number, number, number] }[]): PropDesc {
	// polymer / steel against wood or concrete; hull from the model's own parts
	return {
		name, object, mass, friction: 0.6, restitution: 0.06, angularDamping: 0.8,
		shapes: hull.map((c) => ({ kind: 'cuboid' as const, size: c.half, offset: c.offset })),
	};
}
