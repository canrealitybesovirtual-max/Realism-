import type { EntityWorld } from './entities';
import type { Gameplay } from './gameplay';
import { COMPONENTS } from './components';
import { NODES } from './graph';
import { validateOp, type Op } from './ops';
import { readTRS } from './entities';
import { diffLines, diffStats } from './codeTools';
import { assetCache } from './assets';

/**
 * The Claude development agent's contract with the engine.
 *
 * Claude never touches the scene directly. It answers with a *proposal*: a
 * short summary plus a list of ordinary scene ops (the same typed, validated
 * ops the editor uses - move, material, light, physics, spawn, components,
 * node graphs, scripts). The page previews every step (with diffs for
 * scripts), the person approves or rejects, and an approved proposal is
 * applied as one transaction (Editor.applyBatch): every op is validated
 * against the scene as the previous ones left it, any failure rolls the
 * whole thing back, and success is a single undo step.
 *
 * Proposed scripts are code from outside: they go through the same checks
 * as typed scripts (syntax, engine lint, loop guards) and are shown in full
 * before approval. Nothing runs before the person approves.
 */
export interface Proposal { summary: string; ops: Op[]; notes?: string }
export interface StepPreview { i: number; label: string; status: 'ok' | 'error' | 'later'; why?: string; diff?: { before: string; after: string; added: number; removed: number } }

import { MAX_OPS } from './agentPrompt';
export { buildPrompt, MAX_OPS } from './agentPrompt';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** what Claude is told about the scene (compact; no secrets live in the scene) */
export function sceneContext(w: EntityWorld, gp: Gameplay, selection: string[], mode: string) {
	const ents = w.list.filter((e) => !e.deleted).slice(0, 220).map((e) => {
		const t = readTRS(e.object);
		const flags = [e.locked && 'locked', e.bakedStatic && 'baked', e.prop && 'physics', e.spawn && 'spawned'].filter(Boolean).join(',');
		const comps = e.components.map((c) => `${c.type}${Object.keys(c.data).length ? JSON.stringify(c.data) : ''}`).join(' ');
		return `${e.id} | ${e.name} | ${e.layer} | p=${t.p.map(r2).join(',')} r=${t.r.map((v) => Math.round(v)).join(',')} s=${t.s.map(r2).join(',')} | mats=${w.materials(e).length} lights=${w.lights(e).length}${flags ? ' | ' + flags : ''}${comps ? ' | ' + comps : ''}`;
	});
	const comps = [...COMPONENTS.values()].map((d) => `${d.type}: ${d.description} fields {${Object.entries(d.fields).map(([k, f]) => `${k}:${f.kind}${f.min !== undefined ? `[${f.min}..${f.max}]` : ''}=${JSON.stringify(f.default)}`).join(', ')}}${d.events?.length ? ` events ${d.events.join('/')}` : ''}${d.commands?.length ? ` commands ${d.commands.join('/')}` : ''}`);
	const scripts = [...gp.scripts.values()].map((s) => `--- script ${s.id} "${s.name}"\n${s.source.slice(0, 3000)}`);
	const graphs = [...gp.graphs.values()].map((g) => `graph ${g.id} "${g.name}": ${g.nodes.length} nodes`);
	return [
		`Runtime mode: ${mode}. Selected: ${selection.join(', ') || 'nothing'}.`,
		'', 'ENTITIES (id | name | layer | transform: position m, rotation deg XYZ, scale | counts | flags | components):', ...ents,
		'', 'COMPONENT TYPES:', ...comps,
		'', `GRAPH NODE TYPES: ${NODES.map((n) => `${n.type}(${Object.keys(n.params).join(',')})`).join(' ')}`,
		'', 'GRAPHS:', ...(graphs.length ? graphs : ['(none)']),
		'', 'SCRIPTS:', ...(scripts.length ? scripts : ['(none)']),
		'', 'ASSETS (imported models):', ...([...assetCache.values()].map((a) => `${a.info.id} "${a.info.name}" ${a.info.size.join('x')} m`).concat(assetCache.size ? [] : ['(none)'])),
	].join('\n');
}

/** the reply (already JSON-parsed or text) -> a proposal, or a reason it is unusable */
export function parseProposal(reply: unknown): Proposal | string {
	let v = reply;
	if (typeof v === 'string') {
		const m = /```(?:json)?\s*([\s\S]*?)```/.exec(v);
		const body = m ? m[1] : v.slice(v.indexOf('{'), v.lastIndexOf('}') + 1);
		try { v = JSON.parse(body); } catch { return 'the reply was not valid JSON'; }
	}
	if (!v || typeof v !== 'object' || Array.isArray(v)) return 'the reply is not a proposal object';
	const o = v as Record<string, unknown>;
	if (typeof o.summary !== 'string') return 'the proposal has no summary';
	if (!Array.isArray(o.ops)) return 'the proposal has no ops list';
	if (o.ops.length > MAX_OPS) return `too many steps (${o.ops.length} > ${MAX_OPS})`;
	if (!o.ops.every((x) => x && typeof x === 'object' && typeof (x as any).op === 'string')) return 'a step is not an op';
	return { summary: o.summary.slice(0, 300), ops: o.ops as Op[], notes: typeof o.notes === 'string' ? o.notes.slice(0, 600) : undefined };
}

function describe(o: Op, w: EntityWorld, gp: Gameplay): string {
	const name = (id: string) => w.get(id)?.name ?? id;
	switch (o.op) {
		case 'trs': return `Move ${name(o.id)} to ${o.to?.p?.map(r2).join(', ')} (rot ${o.to?.r?.map((v) => Math.round(v)).join(', ')}, scale ${o.to?.s?.map(r2).join(', ')})`;
		case 'mat': return `${name(o.id)}: material ${o.mi} ${o.key} → ${o.value}`;
		case 'unique': return `${name(o.id)}: make material ${o.mi} its own`;
		case 'light': return `${name(o.id)}: light ${o.li} ${o.key} → ${o.value}`;
		case 'phys': return `${name(o.id)}: ${o.key} → ${o.value}`;
		case 'static': return `${name(o.id)}: ${o.value ? 'static' : 'dynamic'}`;
		case 'rename': return `Rename ${name(o.id)} → "${o.name}"`;
		case 'delete': return `Delete ${name(o.id)}`;
		case 'env': return `Environment: ${o.key} → ${o.value}`;
		case 'spawn': return `Spawn ${o.spec?.kind === 'asset' ? assetCache.get(o.spec.asset ?? '')?.info.name ?? 'model' : o.spec?.kind} "${o.id}" at ${o.to?.p?.map(r2).join(', ')}`;
		case 'comp': return o.data === null ? `Remove ${o.ctype} from ${name(o.id)}` : `${name(o.id)}: ${w.get(o.id)?.components.some((c) => c.type === o.ctype) ? 'set' : 'add'} ${o.ctype} ${JSON.stringify(o.data)}`;
		case 'graph': return o.graph === null ? `Delete graph ${o.id}` : `${gp.graphs.has(o.id) ? 'Replace' : 'New'} graph "${o.graph.name}" (${o.graph.nodes?.length} nodes)`;
		case 'script': return o.script === null ? `Delete script ${o.id}` : `${gp.scripts.has(o.id) ? 'Edit' : 'New'} script "${o.script.name}"`;
	}
	return `Unknown step "${(o as any).op}"`;
}

/**
 * Preview each step against the current scene. Steps that refer to things
 * the proposal itself creates are marked 'later' - they are validated when
 * the transaction runs, in order.
 */
export function previewProposal(p: Proposal, w: EntityWorld, gp: Gameplay): StepPreview[] {
	const created = new Set<string>();
	return p.ops.map((o, i) => {
		const label = describe(o, w, gp);
		const depends = o.op !== 'graph' && o.op !== 'script' && o.op !== 'spawn' && created.has(o.id);
		if (o.op === 'spawn' && typeof o.id === 'string') created.add(o.id);
		const why = depends ? null : validateOp(o, w);
		const step: StepPreview = { i, label, status: depends ? 'later' : why ? 'error' : 'ok', why: why ?? undefined };
		if (o.op === 'script' && o.script && !why) {
			const before = gp.scripts.get(o.id)?.source ?? '';
			const st = before ? diffStats(diffLines(before, o.script.source)) : { added: o.script.source.split('\n').length, removed: 0 };
			step.diff = { before, after: o.script.source, ...st };
		}
		return step;
	});
}
