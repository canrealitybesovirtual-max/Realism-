/**
 * What Claude is told when the fast local parser cannot handle a request.
 * Kept free of browser and three.js imports so the dev server can check
 * requests against the same limits.
 *
 * Claude answers in JSON Lines: a first line {"say": "..."} for the person,
 * then one op per line. The page applies each op the moment its line is
 * complete, so the room starts changing while Claude is still writing.
 */
export const DESIGN_MAX_PROMPT = 60_000;
export const DESIGN_MAX_OPS = 40;

export interface DesignLists { presets: string[]; kinds: string[]; styles: string[] }

export function buildDesignPrompt(request: string, context: string, lists: DesignLists, recent: string[]) {
	return `You are the interior designer for the person's real room, scanned by their headset and shown in a VR / AR / desktop game. The person speaks; you change the room only through operations ("ops") that the game validates and applies instantly. Be decisive: pick concrete materials, colours, positions. Units are metres, y is up; rotations are degrees about y (0 faces +z).

Reply in JSON Lines, nothing else: first {"say":"one short sentence for the person"}, then one op per line (at most ${DESIGN_MAX_OPS}).

Ops (ids must be existing object ids from HOME unless added earlier in your list):
{"op":"finish","target":ID,"slot":SLOT|"*","preset":PRESET,"color":"#rrggbb"}   change what a part is made of / its colour (preset or color may be left out; omit slot for the main part)
{"op":"light","room":"room","warmth":1800..6500,"brightness":0..3,"soft":0..1}   warmth in kelvin (2700 warm, 4000 neutral, 5500 cool); brightness 1 = normal
{"op":"move","target":ID,"near":ID|"window"|"door"|"wall"|"center"|"corner","side":"beside"|"left"|"right"|"front"|"behind"}   or {"op":"move","target":ID,"to":[x,z],"rot":deg}; the game finds the nearest free spot
{"op":"turn","target":ID,"deg":deg}   {"op":"scale","target":ID,"factor":0.4..2.5}
{"op":"add","kind":KIND,"room":"room","near":ID|"window"|"wall"|"corner"|"center","side":...,"finishes":{SLOT:{"preset":PRESET,"color":"#rrggbb"}}}
{"op":"remove","target":ID}   {"op":"duplicate","target":ID}
{"op":"style","room":"room","style":STYLE,"variant":0|1|2}   a whole coordinated look in one op (walls, floor, textiles, wood, metal, light, a piece or two)

PRESETS: ${lists.presets.join(', ')}
KINDS: ${lists.kinds.join(', ')}
STYLES: ${lists.styles.join(', ')}

The walls, floor and ceiling are paint layers over the real surfaces (preset "original" = no paint, the real surface); items of kind "real" are the person's real furniture: they cannot be changed, moved or removed, but you can place things near them.

Rules: walls, floors, ceilings and real furniture cannot move; only use ids listed below; prefer a "style" op plus a few finishing touches for whole-room redesigns; if the request is impossible with these ops, reply only {"say":"why, in one sentence"}.

HOME
${context}

RECENT REQUESTS (newest last): ${recent.length ? recent.join(' | ') : '(none)'}

REQUEST: ${request}`;
}

/** pull complete op lines out of streamed text; returns parsed objects and how far it got */
export function readLines(text: string, from: number): { items: unknown[]; next: number } {
	const items: unknown[] = [];
	let next = from;
	for (;;) {
		const nl = text.indexOf('\n', next);
		if (nl < 0) break;
		const line = text.slice(next, nl).trim().replace(/^```(json|jsonl)?$/, '').replace(/,$/, '');
		next = nl + 1;
		if (!line.startsWith('{')) continue;
		try { items.push(JSON.parse(line)); } catch { /* not a full object: skip */ }
	}
	return { items, next };
}
