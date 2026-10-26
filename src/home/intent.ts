import { KINDS, KIND_LIST, type Kind } from './catalog';
import { COLOR_WORDS, PRESET_NAMES, type PresetName } from './materials';
import { STYLE_NAMES, alternatives, type LightState, type Op, type Side, type StyleName } from './designer';
import type { RoomId } from './house';

/**
 * The fast path from words to ops, without asking a model. Everyday design
 * requests ("make this chair blue", "change the walls and floors to natural
 * stone", "make the lighting softer", "move that chair beside the window",
 * "make this room look more modern", "undo that") resolve here in a
 * millisecond. Anything this does not recognise goes to Claude.
 *
 * Pure: no browser, no three.js scene (unit-tested in node).
 */

export interface IntentItem { id: string; kind: string; room: RoomId; name: string }
export interface IntentContext {
	/** the room you are standing in */
	room: RoomId;
	/** the object you are looking / pointing at */
	aimed: string | null;
	/** what the last request changed (for "it", "make it darker") */
	last: string[];
	lastStyle?: StyleName;
	items: IntentItem[];
	light: Record<RoomId, LightState>;
}
export type Intent =
	| { kind: 'ops'; ops: Op[]; say: string; targets: string[]; style?: StyleName }
	| { kind: 'control'; action: 'undo' | 'redo' | 'cancel' | 'save' | 'restore' | 'listSaves' | 'reset'; name?: string; say: string }
	| { kind: 'alternatives'; options: { label: string; op: Op }[]; say: string; style: StyleName }
	| { kind: 'pick'; index: number; say: string }
	| { kind: 'question'; say: string; choices: { label: string; id: string }[]; resume: (id: string) => Intent }
	| { kind: 'claude'; say: string };

// there is one room (yours): any room word, or "the house", means it
const ROOM_WORDS = /\b(living ?room|lounge|sitting room|family room|kitchen|dining( room| area)?|bed ?room|office|study|room|house|home|place|everywhere)\b/;
const NUM: Record<string, number> = { one: 1, first: 1, '1': 1, '1st': 1, two: 2, second: 2, '2': 2, '2nd': 2, three: 3, third: 3, '3': 3, '3rd': 3, four: 4, fourth: 4, '4': 4, five: 5, fifth: 5 };

const STYLE_WORDS: [RegExp, StyleName][] = [
	[/\bmodern|contemporary|sleek\b/, 'modern'], [/\bminimal(ist)?|clean|simple|bare\b/, 'minimal'], [/\bluxur(y|ious)|fancy|elegant|glamorous|high[- ]end|posh\b/, 'luxury'],
	[/\bscandi(navian)?|nordic|hygge\b/, 'scandinavian'], [/\bindustrial|loft|warehouse\b/, 'industrial'], [/\brustic|farm ?house|cottage|cabin\b/, 'rustic'],
	[/\bjapandi|japanese|zen\b/, 'japandi'], [/\bcoastal|beach|nautical|seaside\b/, 'coastal'],
	[/\b(warm(er)?|cos(y|ier)|coz(y|ier)|inviting|homely|snug)\b/, 'warm'], [/\b(cool(er)?|fresh(er)?|crisp|airy)\b/, 'cool'],
];
export const MATERIAL_WORDS: [RegExp, PresetName][] = [
	[/\bnatural stone|stone|flagstone|limestone\b/, 'natural stone'], [/\bmarble\b/, 'marble'], [/\bslate\b/, 'slate'], [/\btravertine\b/, 'travertine'], [/\bterrazzo\b/, 'terrazzo'],
	[/\bconcrete|cement\b/, 'concrete'], [/\bbricks?\b/, 'brick'], [/\bplaster|stucco|limewash\b/, 'plaster'], [/\b(white )?tiles?|tiled|ceramic\b/, 'white tile'],
	[/\bherringbone|parquet\b/, 'herringbone'], [/\bwhitewashed|light wood|pale wood|ash\b/, 'whitewashed oak'], [/\bwalnut|dark wood|mahogany|ebony\b/, 'walnut'], [/\boak|wood(en)?|timber|hardwood\b/, 'oak'],
	[/\bvelvet\b/, 'velvet'], [/\bleather\b/, 'leather'], [/\bwool|woolen|woollen|knit\b/, 'wool'], [/\blinen|fabric|cloth|cotton\b/, 'linen'],
	[/\bbrushed steel|stainless( steel)?|steel|aluminium|aluminum\b/, 'brushed steel'], [/\bbrass|golden|bronze\b/, 'brass'], [/\bchrome|silver|mirror(ed)?\b/, 'chrome'], [/\bblack metal|iron|wrought iron\b/, 'black metal'],
	[/\b(original|real (wall|floor|ceiling)s?|real again|as (it|they) (was|were)|no paint|unpainted)\b/, 'original'],
	[/\bglass\b/, 'glass'], [/\blacquer(ed)?|gloss(y)?|shiny\b/, 'lacquer'], [/\bpaint(ed)?|matte\b/, 'paint'],
];
const SURFACES: [RegExp, 'walls' | 'floor' | 'ceiling'][] = [[/\bwalls?\b|\bwallpaper\b/, 'walls'], [/\bfloors?\b|\bflooring\b/, 'floor'], [/\bceilings?\b/, 'ceiling']];

/** every kind word, longest first, so "coffee table" wins over "table" */
const KIND_WORDS = KIND_LIST.flatMap((k) => KINDS[k].words.map((w) => ({ w, k }))).sort((a, b) => b.w.length - a.w.length);

function norm(s: string) { return ' ' + s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9#' -]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }

export function parseColor(t: string): string | null {
	const hex = /#[0-9a-f]{6}\b/i.exec(t); if (hex) return hex[0].toLowerCase();
	const words = Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length);
	for (const w of words) {
		const m = new RegExp(`\\b((light|pale|dark|deep|soft|bright)\\s+)?${w}\\b`).exec(t);
		if (!m) continue;
		let c = COLOR_WORDS[w];
		const mod = m[2];
		if (mod === 'light' || mod === 'pale' || mod === 'soft') c = mixHex(c, '#ffffff', 0.4);
		if (mod === 'dark' || mod === 'deep') c = mixHex(c, '#000000', 0.35);
		return c;
	}
	return null;
}
function mixHex(a: string, b: string, t: number) {
	const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const [x, y] = [p(a), p(b)];
	return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export function parseMaterial(t: string): PresetName | null {
	// "stone grey" is a colour: only take a material word that is not part of a colour phrase
	for (const [re, p] of MATERIAL_WORDS) if (re.test(t)) return p;
	return null;
}
function roomsIn(t: string, ctx: IntentContext): RoomId[] | null {
	return ROOM_WORDS.test(t) || /\bhere\b/.test(t) ? [ctx.room] : null;
}

interface Found { ids: string[]; noun: string; ask?: { label: string; id: string }[]; kind?: string }
/**
 * Objects a phrase names: surfaces ("the walls and floors"), furniture
 * ("the chairs", "that lamp"), pronouns ("this", "it"). Ambiguous singulars
 * come back with choices to ask about.
 */
function targets(t: string, ctx: IntentContext, scope: RoomId[]): Found | null {
	const ids: string[] = [];
	const nouns: string[] = [];
	for (const [re, s] of SURFACES) if (re.test(t)) { for (const r of scope) ids.push(`${r}.${s}`); nouns.push(s === 'walls' ? 'walls' : s === 'floor' ? 'floor' : 'ceiling'); }
	let kindFound: { k: Kind; w: string } | null = null;
	for (const { w, k } of KIND_WORDS) {
		const m = new RegExp(`\\b${w}(s|es)?\\b`).exec(t);
		if (!m) continue;
		kindFound = { k, w };
		const plural = !!m[1] || new RegExp(`\\b(all|both|every|the two|these|those) (the )?${w}`).test(t);
		// same word can name more than one kind ("lamp", "chair", "table"): match what is here
		const wordKinds = KIND_LIST.filter((kk) => KINDS[kk].words.includes(w));
		const here = ctx.items.filter((i) => wordKinds.includes(i.kind as Kind) && scope.includes(i.room));
		const anywhere = ctx.items.filter((i) => wordKinds.includes(i.kind as Kind));
		// AR: your real furniture goes by what the headset called it ("couch", "table")
		here.push(...ctx.items.filter((i) => i.kind === 'real' && scope.includes(i.room) && new RegExp(`\\b${w}\\b`).test(i.name)));
		const pool = here.length ? here : anywhere;
		if (!pool.length) return { ids, noun: w, kind: k };
		if (plural || pool.length === 1) ids.push(...pool.map((i) => i.id));
		else if (ctx.aimed && pool.some((i) => i.id === ctx.aimed)) ids.push(ctx.aimed);
		else if (ctx.last.length === 1 && pool.some((i) => i.id === ctx.last[0]) && /\b(it|that|same)\b/.test(t)) ids.push(ctx.last[0]);
		else return { ids, noun: w, kind: k, ask: pool.map((i) => ({ label: i.kind === 'real' ? `your real ${i.name}` : i.kind === 'real' || ctx.items.some((x) => x.kind === 'real') ? `the new ${i.name}` : i.name, id: i.id })) };
		nouns.push(plural ? w + 's' : w);
		break;
	}
	if (!ids.length && /\b(this|that|it|this one|that one|these|those)\b/.test(t)) {
		if (ctx.aimed) { ids.push(ctx.aimed); nouns.push(ctx.items.find((i) => i.id === ctx.aimed)?.name ?? 'that'); }
		else if (ctx.last.length) { ids.push(...ctx.last); nouns.push('that'); }
	}
	if (!ids.length) return kindFound ? { ids, noun: kindFound.w, kind: kindFound.k } : null;
	return { ids, noun: nouns.join(' and ') };
}

function where(t: string, ctx: IntentContext, scope: RoomId[], self: string[]): { near: string; side?: Side; say: string; ask?: { label: string; id: string }[]; noun?: string } | null {
	const m = /\b(beside|next to|near|by|close to|alongside|to the left of|left of|to the right of|right of|in front of|facing|behind|against|under(neath)?|in the corner|into the corner|to the corner|in the (center|centre|middle)|to the (center|centre|middle))\b(.*)$/.exec(t);
	if (!m) return null;
	const rel = m[1], rest = m[m.length - 1] ?? '';
	let side: Side | undefined = /left/.test(rel) ? 'left' : /right/.test(rel) ? 'right' : /front|facing/.test(rel) ? 'front' : /behind/.test(rel) ? 'behind' : 'beside';
	if (/corner/.test(rel)) return { near: 'corner', say: 'into the corner' };
	if (/(center|centre|middle)/.test(rel)) return { near: 'center', say: 'to the middle of the room' };
	if (/\bwindows?\b/.test(rest)) return { near: 'window', side: side === 'left' || side === 'right' ? side : undefined, say: `${rel} the window` };
	if (/\bdoors?\b/.test(rest)) return { near: 'door', say: `${rel} the door` };
	if (/\bwall\b/.test(rest) || rel === 'against') return { near: 'wall', say: 'against the wall' };
	const f = targets(' ' + rest + ' ', { ...ctx, aimed: null, last: [] }, scope);
	// "beside the couch" when there is more than one: ask
	if (f?.ask) { const choices = f.ask.filter((c) => !self.includes(c.id)); if (choices.length > 1) return { near: '', side, say: `${rel} the ${f.noun}`, ask: choices, noun: f.noun }; if (choices[0]) return { near: choices[0].id, side, say: `${rel} the ${f.noun}` }; }
	const id = f?.ids.find((x) => !self.includes(x));
	if (id) return { near: id, side, say: `${rel} the ${ctx.items.find((i) => i.id === id)?.name ?? 'that'}` };
	return null;
}

const ask = (what: string, choices: { label: string; id: string }[], resume: (id: string) => Intent): Intent =>
	({ kind: 'question', say: `Which ${what}? ${choices.map((c, i) => `${i + 1}: ${c.label}`).join(', ')}.`, choices, resume });

export function parse(input: string, ctx: IntentContext): Intent {
	const t = norm(input);
	// --------------------------------------------------- control
	if (/^ (undo|undo that|go back|revert( that)?|take that back|no undo|back) $/.test(t) || /\bundo\b/.test(t) && t.length < 24) return { kind: 'control', action: 'undo', say: 'Undoing' };
	if (/\b(redo|do it again|put it back)\b/.test(t) && t.length < 26) return { kind: 'control', action: 'redo', say: 'Redoing' };
	if (/^ (cancel|stop|never ?mind|forget it|abort) /.test(t)) return { kind: 'control', action: 'cancel', say: 'Cancelled' };
	let m = /\bsave( (this|the|my) (design|room|home|look|version|layout))?( as| called)? ([a-z0-9 ]{1,30})\b/.exec(t);
	if (/^ save( it| this| that| my design| the design| everything)? $/.test(t)) return { kind: 'control', action: 'save', say: 'Saving' };
	if (m && /\b(as|called)\b/.test(t)) return { kind: 'control', action: 'save', name: m[5].trim(), say: `Saving as "${m[5].trim()}"` };
	m = /\b(restore|load|go back to|bring back|open) (the )?(design |version |save )?(called )?([a-z0-9 ]{1,30})$/.exec(t.trim());
	if (m && !/\b(window|door|light)/.test(t)) return { kind: 'control', action: 'restore', name: m[5].trim(), say: `Restoring "${m[5].trim()}"` };
	if (/\b(list|show)( me)?( my)? (saves|saved designs|designs|snapshots)\b/.test(t)) return { kind: 'control', action: 'listSaves', say: 'Your saved designs' };
	if (/\b(reset|start over|back to (the )?original)\b/.test(t)) return { kind: 'control', action: 'reset', say: 'Back to your room as scanned' };
	// "option two", "the second one", "number 3"
	m = /^ (?:(?:pick|choose|use|try|apply|go with|i like|show) )?(?:the )?(?:option |number |choice |alternative |variant )?(one|two|three|four|five|first|second|third|fourth|fifth|1st|2nd|3rd|[1-5])(?: one| option)?(?: please)? $/.exec(t);
	if (m) return { kind: 'pick', index: NUM[m[1]] - 1, say: `Option ${NUM[m[1]]}` };

	const scope = roomsIn(t, ctx) ?? [ctx.room];
	const scopeName = 'your room';
	const styles = STYLE_WORDS.filter(([re]) => re.test(t)).map(([, st]) => st);
	// "modern luxury": the more specific one wins
	const style = styles.includes('luxury') ? 'luxury' : styles[0];
	// a bare "brighter" / "dimmer" means the lighting
	const mentionsLight = /\b(light(s|ing)?|lamps?|bulbs?|illumination|brightness|glow)\b/.test(t) || /^ (a (bit|little) |slightly |much )?(brighter|dimmer)( please)? $/.test(t);

	// --------------------------------------------------- alternatives
	if (/\b(alternatives?|options|variations?|other (ideas|versions|looks)|ideas|different versions)\b/.test(t)) {
		const st = style ?? ctx.lastStyle ?? 'modern';
		const room = scope[0];
		return { kind: 'alternatives', options: alternatives(room, st), say: `Three ${st} options for ${scopeName}. Say "option one", two or three.`, style: st };
	}

	// --------------------------------------------------- lighting
	if (mentionsLight && /\b(warm(er)?|cool(er)?|cold(er)?|soft(er)?|harsh(er)?|bright(er)?|dark(er)?|dim(mer)?|lower|higher|off|on|up|down|cozy|cosy|moody|natural|daylight)\b/.test(t)
		&& !/\b(add|put|place|move|lamp (in|to|beside))\b/.test(t.replace(/\blights?\b/, ''))) {
		const ops: Op[] = [];
		for (const r of scope) {
			const s = ctx.light[r];
			let { warmth, brightness, soft } = s;
			if (/\bwarm(er)?|cozy|cosy|moody\b/.test(t)) warmth = Math.max(2200, warmth - 500);
			if (/\bcool(er)?|cold(er)?|daylight|natural\b/.test(t)) warmth = Math.min(6000, warmth + 700);
			if (/\bsoft(er)?|gentle|diffuse\b/.test(t)) { soft = Math.min(1, soft + 0.3); brightness = Math.max(0.3, brightness * 0.85); }
			if (/\bharsh(er)?|sharp(er)?\b/.test(t)) soft = Math.max(0, soft - 0.3);
			if (/\bbright(er)?|up|higher\b/.test(t)) brightness = Math.min(2.5, brightness * 1.35);
			if (/\bdark(er)?|dim(mer)?|lower|down|moody\b/.test(t)) brightness = Math.max(0.15, brightness * 0.7);
			if (/\b(lights?|lamps?) off|turn off|switch off\b/.test(t)) brightness = 0;
			if (/\b(lights?|lamps?) on|turn on|switch on\b/.test(t) && brightness < 0.2) brightness = 1;
			ops.push({ op: 'light', room: r, warmth: Math.round(warmth), brightness: Math.round(brightness * 100) / 100, soft: Math.round(soft * 100) / 100 });
		}
		return { kind: 'ops', ops, say: `Adjusting the light in ${scopeName}`, targets: [] };
	}

	// --------------------------------------------------- remove / duplicate / add
	if (/\b(remove|delete|get rid of|take (away|out)|throw (away|out)|lose)\b/.test(t)) {
		const f = targets(t, ctx, scope);
		if (f?.ask) return ask(f.noun, f.ask, (id) => ({ kind: 'ops', ops: [{ op: 'remove', target: id }], say: 'Removing it', targets: [id] }));
		if (f?.ids.length) return { kind: 'ops', ops: f.ids.map((id) => ({ op: 'remove', target: id } as Op)), say: `Removing the ${f.noun}`, targets: f.ids };
		return { kind: 'claude', say: 'Not sure what to remove' };
	}
	if (/\b(duplicate|copy|another one( of)?|one more)\b/.test(t) && !/\b(add|put|place)\b/.test(t)) {
		const f = targets(t, ctx, scope);
		if (f?.ask) return ask(f.noun, f.ask, (id) => ({ kind: 'ops', ops: [{ op: 'duplicate', target: id }], say: 'Copying it', targets: [id] }));
		if (f?.ids.length) return { kind: 'ops', ops: [{ op: 'duplicate', target: f.ids[0] }], say: `Copying the ${f.noun}`, targets: f.ids.slice(0, 1) };
	}
	m = /\b(add|put|place|bring( in)?|i want|i'd like|give me|we need|could use|get( me)?)\b( (another|an|a|some|one more|a few|two|three)\b)?/.exec(t);
	// "put / place / bring the chair..." moves it; only "put a ..." adds one
	if (m && /^(put|place|bring|get)/.test(m[1]) && !m[4]) m = null;
	if (m) {
		const rest = t.slice(m.index + m[0].length);
		const kind = KIND_WORDS.find(({ w }) => new RegExp(`^ (\\w+ )?${w}(s|es)?\\b`).test(rest) || new RegExp(`^ ${w}`).test(rest))?.k;
		if (kind) {
			const room = scope[0];
			const w = where(t, ctx, [room], []);
			const color = parseColor(rest), mat = parseMaterial(rest.replace(new RegExp(KINDS[kind].words.join('|')), ''));
			const finishes = color || mat ? { [KINDS[kind].slots[0]]: { preset: mat ?? (kind === 'rug' ? 'wool' : kind === 'sofa' || kind === 'armchair' ? 'linen' : 'paint'), color: color ?? undefined } as any } : undefined;
			const count = /\b(two|a couple)\b/.test(m[0] + rest.slice(0, 12)) ? 2 : /\bthree|a few\b/.test(m[0] + rest.slice(0, 12)) ? 3 : 1;
			const mkOps = (near?: string): Op[] => Array.from({ length: count }, () => ({ op: 'add', kind, room, near, side: w?.side, finishes } as Op));
			if (w?.ask) return ask(w.noun!, w.ask, (id) => ({ kind: 'ops', ops: mkOps(id), say: `Adding ${count > 1 ? count + ' ' + kind + 's' : 'a ' + kind} ${w.say}`, targets: [] }));
			const ops = mkOps(w?.near);
			return { kind: 'ops', ops, say: `Adding ${count > 1 ? count + ' ' + kind + 's' : 'a ' + kind}${w ? ' ' + w.say : ''}`, targets: [] };
		}
	}

	// --------------------------------------------------- move / turn / resize
	if (/\b(move|put|place|push|shift|slide|bring|drag|relocate|set)\b/.test(t) && !/\b(paint|colou?r|material)\b/.test(t)) {
		const head = t.split(/\b(beside|next to|near|by|close to|alongside|to the left of|left of|to the right of|right of|in front of|facing|behind|against|under|in the corner|into the corner|to the corner|in the|to the)\b/)[0];
		const f = targets(head, ctx, scope);
		const w = where(t, ctx, scope, f?.ids ?? []);
		const mk = (id: string): Intent => {
			const ww = where(t, ctx, scope, [id]);
			if (ww?.ask) return ask(ww.noun!, ww.ask, (nid) => ({ kind: 'ops', ops: [{ op: 'move', target: id, near: nid, side: ww.side }], say: `Moving it ${ww.say}`, targets: [id] }));
			return ww ? { kind: 'ops', ops: [{ op: 'move', target: id, near: ww.near, side: ww.side }], say: `Moving it ${ww.say}`, targets: [id] } : { kind: 'claude', say: 'Not sure where to move it' };
		};
		if (f?.ask) return ask(f.noun, f.ask, mk);
		if (f?.ids.length && w?.ask) return ask(w.noun!, w.ask, (nid) => ({ kind: 'ops', ops: f.ids.slice(0, 4).map((id) => ({ op: 'move', target: id, near: nid, side: w.side } as Op)), say: `Moving the ${f.noun} ${w.say}`, targets: f.ids.slice(0, 4) }));
		if (f?.ids.length && w) return { kind: 'ops', ops: f.ids.slice(0, 4).map((id) => ({ op: 'move', target: id, near: w.near, side: w.side } as Op)), say: `Moving the ${f.noun} ${w.say}`, targets: f.ids.slice(0, 4) };
		if (f?.ids.length) return { kind: 'claude', say: 'Not sure where' };
		if (/\b(this|that|it)\b/.test(t)) return { kind: 'question', say: 'Which object? Look at it (or point at it) and say that again.', choices: [], resume: () => ({ kind: 'claude', say: '' }) };
	}
	m = /\b(turn|rotate|spin|flip)\b/.exec(t);
	if (m && !mentionsLight && !/\b(into|to (a|an|the)? ?(modern|luxury|stone|wood))\b/.test(t)) {
		const f = targets(t, ctx, scope);
		const deg = /\baround|180|flip|other way|backwards\b/.test(t) ? 180 : /\bleft\b/.test(t) ? 90 : /\bright\b/.test(t) ? -90 : /\b45\b/.test(t) ? 45 : /\b(90|quarter)\b/.test(t) ? 90 : 90;
		const mk = (id: string): Intent => ({ kind: 'ops', ops: [{ op: 'turn', target: id, deg }], say: `Turning it ${deg}°`, targets: [id] });
		if (f?.ask) return ask(f.noun, f.ask, mk);
		if (f?.ids.length) return { kind: 'ops', ops: f.ids.slice(0, 6).map((id) => ({ op: 'turn', target: id, deg } as Op)), say: `Turning the ${f.noun}`, targets: f.ids };
	}
	m = /\b(bigger|larger|smaller|tinier|wider|narrower|huge|tiny|enlarge|shrink|scale (it )?(up|down))\b/.exec(t);
	if (m) {
		const f = targets(t, ctx, scope);
		const factor = /\bbigger|larger|wider|enlarge|up|huge\b/.test(m[0]) ? (/\bmuch|a lot|huge|twice\b/.test(t) ? 1.5 : 1.2) : (/\bmuch|a lot|tiny|half\b/.test(t) ? 0.65 : 0.83);
		const mk = (id: string): Intent => ({ kind: 'ops', ops: [{ op: 'scale', target: id, factor }], say: factor > 1 ? 'Making it bigger' : 'Making it smaller', targets: [id] });
		if (f?.ask) return ask(f.noun, f.ask, mk);
		if (f?.ids.length) return { kind: 'ops', ops: f.ids.slice(0, 6).map((id) => ({ op: 'scale', target: id, factor } as Op)), say: `${factor > 1 ? 'Enlarging' : 'Shrinking'} the ${f.noun}`, targets: f.ids };
	}
	// --------------------------------------------------- finishes (material and colour)
	const color = parseColor(t), mat = parseMaterial(t.replace(/\b(stone|slate|charcoal|sand|walnut|gold|silver|chocolate|caramel|rust|olive|cream|ivory) (gr[ae]y|white|blue|green|brown|black)\b/g, ''));
	if ((color || mat) && !style) {
		const f = targets(t, ctx, scope);
		const preset = mat ?? undefined, c = color ?? undefined;
		const cw = color && (Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length).find((k) => t.includes(' ' + k + ' ')) || color);
		const desc = [mat === 'paint' && cw ? '' : mat, cw].filter(Boolean).join(' ');
		const mk = (ids: string[]): Intent => ({ kind: 'ops', ops: ids.map((id) => ({ op: 'finish', target: id, preset, color: c } as Op)), say: `Making ${ids.length > 1 ? 'them' : 'it'} ${desc}`, targets: ids });
		if (f?.ask) return ask(f.noun, f.ask, (id) => mk([id]));
		if (f?.ids.length) { const r = mk(f.ids); (r as any).say = `Making the ${f.noun} ${desc}`; return r; }
		if (f?.kind) return { kind: 'claude', say: `There is no ${f.noun} here` };
		return { kind: 'question', say: 'Which object should change? Look at it (or point at it) and say that again.', choices: [], resume: () => ({ kind: 'claude', say: '' }) };
	}

	// --------------------------------------------------- a style for a room
	if (style && /\b(make|turn|give|redesign|redo|style|decorate|change|transform|feel|look|more|go|want|like|vibe|theme)\b/.test(t)) {
		const room = scope[0];
		const variant = /\bdifferent|another|other\b/.test(t) && ctx.lastStyle === style ? 1 : 0;
		return { kind: 'ops', ops: [{ op: 'style', room, style, variant }], say: `Making ${scopeName} ${style === 'warm' ? 'warmer and cosier' : style === 'cool' ? 'cooler and fresher' : 'more ' + style}`, targets: [], style };
	}
	return { kind: 'claude', say: 'Asking Claude' };
}

export { STYLE_NAMES, PRESET_NAMES };
