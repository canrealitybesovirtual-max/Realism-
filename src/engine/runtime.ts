import * as THREE from 'three';
import type { EntityWorld } from './entities';
import { log } from './log';

/**
 * Game state vs editor state.
 *
 * - play:   the simulation runs (physics, gameplay updates).
 * - paused: everything holds still; rendering and the editor keep working.
 * - edit:   like paused, and the editor's world tools are active.
 * step() advances exactly one physics tick while paused or editing.
 * play() from edit records where every dynamic body is (the edit state);
 * stop() puts them all back there and returns to edit, so playing never
 * changes the scene you authored. Editor changes made while playing are
 * written into that record too, so they survive stop().
 */
export type Mode = 'play' | 'paused' | 'edit';

interface BodyState { p: THREE.Vector3; q: THREE.Quaternion }

export class Runtime {
	mode: Mode = 'play';
	private stepPending = 0;
	private editState = new Map<string, BodyState>();
	onChange: (m: Mode) => void = () => {};
	/** simulated seconds since the page loaded (gameplay clock) */
	time = 0;

	constructor(private w: EntityWorld) {}

	get simulating() { return this.mode === 'play' || this.stepPending > 0; }

	/** called once per frame by the loop; returns the dt the simulation should advance */
	frameDt(dt: number) {
		if (this.mode === 'play') { this.time += dt; return dt; }
		if (this.stepPending > 0) { this.stepPending--; this.time += 1 / 120; return 1 / 120; }
		return 0;
	}

	private set(m: Mode) { if (m === this.mode) return; this.mode = m; log.info('Runtime: ' + m); this.onChange(m); }

	play() {
		if (this.mode === 'edit') this.record();
		this.set('play');
	}
	pause() { this.set('paused'); }
	edit() { this.set('edit'); }
	step() { if (this.mode === 'play') this.set('paused'); this.stepPending++; }

	/** back to the authored state, in edit mode */
	stop() {
		const ph = this.w.physics;
		if (ph?.enabled) {
			for (const e of this.w.list) {
				const s = e.prop && this.editState.get(e.id);
				if (s && !e.deleted) { ph.teleport(e.prop!, s.p, s.q); e.object.position.copy(s.p); e.object.quaternion.copy(s.q); }
			}
		}
		this.set('edit');
	}

	/** remember where every dynamic body is now */
	record() {
		this.editState.clear();
		for (const e of this.w.list) if (e.prop) this.editState.set(e.id, { p: e.object.position.clone(), q: e.object.quaternion.clone() });
	}

	/** an editor change moved a body: that is the new authored place */
	authored(id: string, p: THREE.Vector3, q: THREE.Quaternion) {
		if (this.editState.has(id) || this.mode !== 'play') this.editState.set(id, { p: p.clone(), q: q.clone() });
	}
}
