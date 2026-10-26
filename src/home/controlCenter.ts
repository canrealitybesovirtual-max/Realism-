import type { Home } from './home';
import { STYLE_NAMES } from './designer';
import { PRESET_NAMES, finishOf } from './materials';
import type { RoomId } from './house';

/**
 * The home's control center on desktop: a docked panel with one big
 * microphone, what you said and what was understood, live status with
 * progress and Cancel, Undo / Redo / Save, and tabs for history, saved
 * designs, quick controls, performance and settings.
 *
 * It never blocks: requests run in the background while you keep walking,
 * and the panel redraws at most ten times a second.
 */
const CSS = `
#hc{position:fixed;top:calc(12px + env(safe-area-inset-top,0px));right:max(12px,env(safe-area-inset-right,0px));width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;z-index:8;display:none;
 background:rgba(18,20,24,.88);color:#eef1f4;border-radius:18px;font:500 15px/1.4 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.35);backdrop-filter:blur(8px)}
#hc.on{display:block}#hc.min{width:auto}#hc.min .body{display:none}
#hc .top{display:flex;align-items:center;gap:12px;padding:14px 16px 6px}
#hc .mic{width:76px;height:76px;border-radius:50%;border:0;cursor:pointer;flex:none;background:#2d6cdf;color:#fff;font:700 13px system-ui;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;box-shadow:0 0 0 0 rgba(45,108,223,.6);transition:background .15s}
#hc .mic svg{width:30px;height:30px}
#hc .mic.listening,#hc .mic.hearing{background:#e0484b;animation:hcp 1.2s infinite}#hc .mic.waiting{background:#d48a1c}#hc .mic.off.unsupported{background:#555b63;cursor:default}
@keyframes hcp{0%{box-shadow:0 0 0 0 rgba(224,72,75,.6)}70%{box-shadow:0 0 0 16px rgba(224,72,75,0)}100%{box-shadow:0 0 0 0 rgba(224,72,75,0)}}
#hc .where{font-size:13px;color:#aab4bf}#hc .where b{color:#fff;font-weight:600}
#hc .hint{font-size:12px;color:#8e99a5}
#hc .say{display:flex;gap:8px;padding:6px 16px}
#hc input[type=text]{flex:1;min-width:0;background:#262a31;border:1px solid #3a404a;color:#fff;border-radius:10px;padding:10px 12px;font:500 15px system-ui}
#hc button.b{background:#2b3038;border:1px solid #3b424d;color:#eef1f4;border-radius:10px;padding:8px 12px;font:600 14px system-ui;cursor:pointer}
#hc button.b:hover{background:#353b45}#hc button.b:disabled{opacity:.4;cursor:default}#hc button.p{background:#2d6cdf;border-color:#2d6cdf}#hc button.w{background:#7a2b2e;border-color:#a33c40}
#hc .lines{padding:4px 16px;font-size:14px}#hc .lines div{margin:3px 0}#hc .lines .k{color:#8e99a5;font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-right:6px}
#hc .status{margin:6px 16px;padding:10px 12px;border-radius:12px;background:#22262d;font-size:14px}
#hc .bar{height:6px;border-radius:3px;background:#333a44;margin-top:8px;overflow:hidden}#hc .bar i{display:block;height:100%;background:#4f8ff7;width:0}
#hc .bar.ind i{width:35%;animation:hci 1.1s infinite ease-in-out}@keyframes hci{0%{margin-left:-35%}100%{margin-left:100%}}
#hc .row{display:flex;gap:8px;flex-wrap:wrap;padding:6px 16px}
#hc .choices button{flex:1 1 100%;text-align:left}
#hc .tabs{display:flex;gap:4px;padding:8px 12px 0;border-top:1px solid #2c323a;margin-top:6px}
#hc .tabs button{flex:1;background:none;border:0;color:#9aa5b1;padding:8px 2px;font:600 13px system-ui;cursor:pointer;border-bottom:2px solid transparent}
#hc .tabs button.on{color:#fff;border-color:#4f8ff7}
#hc .pane{padding:8px 16px 16px;font-size:13px}#hc .pane ol,#hc .pane ul{margin:0;padding-left:18px}#hc .pane li{margin:3px 0}
#hc table{width:100%;border-collapse:collapse;font-size:12px}#hc td,#hc th{padding:3px 4px;text-align:left;border-bottom:1px solid #2c323a;vertical-align:top}#hc th{color:#8e99a5;font-weight:600}
#hc .ok{color:#7fd67f}#hc .bad{color:#f08080}
#hc select{background:#262a31;color:#fff;border:1px solid #3a404a;border-radius:8px;padding:6px}
#hc label.s{display:flex;align-items:center;gap:8px;margin:6px 0}#hc label.s input[type=range]{flex:1}
#hc .x{background:none;border:0;color:#9aa5b1;font:700 18px system-ui;cursor:pointer;margin-left:auto;padding:4px 8px}
`;
const MIC = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z"/></svg>';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ms = (a?: number, b?: number) => (a !== undefined && b !== undefined && a > 0 && b > 0 ? `${Math.round(b - a)} ms` : '–');

export class ControlCenter {
	private el: HTMLDivElement;
	private dyn: Record<string, HTMLElement> = {};
	private input: HTMLInputElement;
	private dirty = true;
	private last = 0;
	private tab: 'history' | 'designs' | 'quick' | 'perf' | 'settings' = 'quick';

	constructor(private home: Home) {
		const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
		const el = this.el = document.createElement('div'); el.id = 'hc';
		el.innerHTML = `
<div class="top"><button class="mic" data-a="mic" title="Hold V to talk">${MIC}<span>Talk</span></button>
 <div style="min-width:0"><div class="where" data-d="where"></div><div class="hint" data-d="hint"></div></div><button class="x" data-a="min" title="Hide">–</button></div>
<div class="body">
 <div class="say"><input type="text" data-a="text" placeholder="Or type: make the walls sage green" autocomplete="off"><button class="b p" data-a="send">Go</button></div>
 <div class="lines" data-d="lines"></div>
 <div class="status" data-d="status"></div>
 <div class="row choices" data-d="choices"></div>
 <div class="row"><button class="b" data-a="undo">Undo</button><button class="b" data-a="redo">Redo</button><button class="b" data-a="save">Save</button><button class="b w" data-a="cancel">Cancel</button><button class="b" data-a="leave" style="margin-left:auto">Leave home</button></div>
 <div class="tabs"><button data-t="quick">Quick</button><button data-t="history">History</button><button data-t="designs">Designs</button><button data-t="perf">Speed</button><button data-t="settings">Settings</button></div>
 <div class="pane" data-d="pane"></div>
</div>`;
		(document.getElementById('ar-root') ?? document.body).appendChild(el); // inside the AR DOM overlay on phones
		el.querySelectorAll<HTMLElement>('[data-d]').forEach((n) => { this.dyn[n.dataset.d!] = n; });
		this.input = el.querySelector('input[data-a=text]')!;
		// typing must not walk the player around
		for (const ev of ['keydown', 'keyup', 'keypress']) this.input.addEventListener(ev, (e) => e.stopPropagation());
		this.input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') this.send(); if ((e as KeyboardEvent).key === 'Escape') this.input.blur(); });
		el.addEventListener('click', (e) => this.click(e));
		el.addEventListener('beforexrselect', (e) => e.preventDefault()); // AR on phones: a tap on the panel is not a tap on the floor
		el.addEventListener('input', (e) => this.slide(e));
		el.addEventListener('change', (e) => this.pick(e));
		const mic = el.querySelector<HTMLButtonElement>('[data-a=mic]')!;
		// press and hold, or click to toggle
		let downAt = 0;
		mic.addEventListener('pointerdown', () => { downAt = performance.now(); if (this.home.voice.state === 'off') this.home.voice.start(); });
		mic.addEventListener('pointerup', () => { if (performance.now() - downAt > 450) this.home.voice.stop(); });
	}

	show(on: boolean) { this.el.classList.toggle('on', on); this.invalidate(); }
	invalidate() { this.dirty = true; }
	focusInput() { if (document.pointerLockElement) document.exitPointerLock(); this.el.classList.remove('min'); this.input.focus(); }
	openTab(t: ControlCenter['tab']) { this.tab = t; this.invalidate(); }
	private send() { const v = this.input.value.trim(); if (!v) return; this.input.value = ''; this.home.submit(v, 'typed'); }

	private click(e: Event) {
		const t = (e.target as HTMLElement).closest('[data-a],[data-t],[data-c],[data-s],[data-r],[data-del],[data-style]') as HTMLElement | null;
		if (!t) return;
		const h = this.home;
		if (t.dataset.t) { this.tab = t.dataset.t as any; this.invalidate(); return; }
		if (t.dataset.c !== undefined) { h.choose(+t.dataset.c); return; }
		if (t.dataset.r) { h.submit(`restore ${t.dataset.r}`, 'button'); return; }
		if (t.dataset.del) { h.deleteSnapshot(t.dataset.del); return; }
		if (t.dataset.style) { h.runOps([{ op: 'style', room: h.room, style: t.dataset.style as any }], `${t.dataset.style[0].toUpperCase() + t.dataset.style.slice(1)} ${h.house.rooms[h.room].name}`); return; }
		switch (t.dataset.a) {
			case 'mic': if (!h.voice.supported) { this.focusInput(); } else if (h.voice.state !== 'off' && performance.now() > 0) h.voice.stop(); return;
			case 'send': this.send(); return;
			case 'undo': h.submit('undo', 'button'); return;
			case 'redo': h.submit('redo', 'button'); return;
			case 'cancel': h.submit('cancel', 'button'); return;
			case 'save': { const n = prompt('Name this design', `My ${h.house.rooms[h.room].name}`); if (n) h.submit(`save as ${n}`, 'button'); return; }
			case 'leave': h.leave(); return;
			case 'min': this.el.classList.toggle('min'); return;
			case 'alts': h.submit('show me three alternatives', 'button'); return;
			case 'reset': if (confirm('Go back to the original home? (Your current design is saved as "Before reset" first.)')) h.submit('reset', 'button'); return;
			case 'wake': h.voice.wake = !h.voice.wake; h.voice.abort(); if (h.voice.wake) h.voice.start(); this.invalidate(); return;
			case 'speak': h.voice.speak = !h.voice.speak; this.invalidate(); return;
		}
	}
	/** live sliders: lighting of the room you are in */
	private slide(e: Event) {
		const t = e.target as HTMLInputElement, key = t.dataset.l as 'warmth' | 'brightness' | 'soft' | undefined;
		if (!key) return;
		const h = this.home;
		h.designer.light[h.room][key] = +t.value; h.designer.applyLight(h.room);
	}
	private pick(e: Event) {
		const t = e.target as HTMLInputElement | HTMLSelectElement, h = this.home;
		if ((t as HTMLInputElement).dataset.l) {
			// commit the slider as one undoable step
			const l = h.designer.light[h.room];
			h.runOps([{ op: 'light', room: h.room, warmth: l.warmth, brightness: l.brightness, soft: l.soft }], 'Lighting');
			return;
		}
		if (t.dataset.lang) { h.voice.lang = t.value; return; }
		if (t.dataset.wakephrase) { h.voice.wakePhrase = t.value.trim().toLowerCase() || 'home'; return; }
		const id = t.dataset.item, slot = t.dataset.slot;
		if (!id || !slot) return;
		if (t.dataset.kind === 'preset') h.runOps([{ op: 'finish', target: id, slot, preset: t.value as any }], `${h.designer.item(id)?.name}: ${t.value}`);
		else h.runOps([{ op: 'finish', target: id, slot, color: t.value }], `${h.designer.item(id)?.name}: ${t.value}`);
	}

	tick() {
		if (!this.dirty || performance.now() - this.last < 100 || !this.el.classList.contains('on')) return;
		this.dirty = false; this.last = performance.now();
		const h = this.home, v = h.voice, D = this.dyn;
		const mic = this.el.querySelector<HTMLButtonElement>('[data-a=mic]')!;
		mic.className = `mic ${v.state}${v.supported ? '' : ' unsupported'}`;
		mic.querySelector('span')!.textContent = !v.supported ? 'Type' : v.state === 'off' ? 'Talk' : v.state === 'waiting' ? '…' : 'Listening';
		D.where.innerHTML = `In the <b>${esc(h.house.rooms[h.room].name)}</b>${h.aimed ? ` · looking at <b>${esc(h.aimed.name)}</b>` : ''}`;
		D.hint.textContent = v.error || (!v.supported ? 'Voice is not available in this browser: type, or use the buttons.' : v.wake ? `Listening for “${v.wakePhrase}…”` : 'Hold V or the button to talk · T to type · E at the front door to leave');
		D.lines.innerHTML = (v.interim ? `<div><span class="k">Hearing</span>${esc(v.interim)}</div>` : h.transcript ? `<div><span class="k">You said</span>${esc(h.transcript)}</div>` : '') + (h.understood ? `<div><span class="k">Understood</span>${esc(h.understood)}</div>` : '');
		const p = h.status.progress;
		D.status.innerHTML = `${esc(h.status.text)}${h.status.busy ? `<div class="bar${p === null ? ' ind' : ''}"><i style="width:${p === null ? 35 : Math.round(p * 100)}%"></i></div>` : ''}`;
		this.el.querySelector<HTMLButtonElement>('[data-a=cancel]')!.disabled = !h.status.busy && !h.question;
		this.el.querySelector<HTMLButtonElement>('[data-a=undo]')!.disabled = !h.designer.canUndo;
		this.el.querySelector<HTMLButtonElement>('[data-a=redo]')!.disabled = !h.designer.canRedo;
		D.choices.innerHTML = h.question?.choices.length
			? h.question.choices.map((c, i) => `<button class="b" data-c="${i}">${i + 1}. ${esc(c.label)}</button>`).join('')
			: h.alts ? h.alts.options.map((o, i) => `<button class="b${h.alts!.applied === i ? ' p' : ''}" data-c="${i}">${i + 1}. ${esc(o.label)}</button>`).join('') : '';
		this.el.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
		D.pane.innerHTML = this.pane();
	}

	private pane(): string {
		const h = this.home;
		if (this.tab === 'quick') {
			const l = h.designer.light[h.room];
			let s = `<div style="margin-bottom:6px">Make the ${esc(h.house.rooms[h.room].name)}…</div><div class="row" style="padding:0">${STYLE_NAMES.map((st) => `<button class="b" data-style="${st}">${st}</button>`).join('')}<button class="b" data-a="alts">3 alternatives</button></div>`;
			s += `<div style="margin-top:10px">Lighting</div>
<label class="s">Warm<input type="range" min="1800" max="6500" step="50" value="${l.warmth}" data-l="warmth">Cool</label>
<label class="s">Dim<input type="range" min="0" max="2.5" step="0.05" value="${l.brightness}" data-l="brightness">Bright</label>
<label class="s">Crisp<input type="range" min="0" max="1" step="0.05" value="${l.soft}" data-l="soft">Soft</label>`;
			const target = h.aimed ?? h.designer.item(`${h.room}.walls`)!;
			s += `<div style="margin-top:10px">${h.aimed ? esc(target.name) : `Walls (look at something to change it)`}</div>`;
			for (const [slot, sl] of Object.entries(target.slots)) {
				const f = finishOf(sl.mat);
				s += `<label class="s" style="gap:6px"><span style="width:62px">${esc(slot === 'main' ? 'finish' : slot)}</span><select data-item="${target.id}" data-slot="${slot}" data-kind="preset">${PRESET_NAMES.map((p) => `<option${f?.preset === p ? ' selected' : ''}>${p}</option>`).join('')}</select>
<input type="color" value="${f?.color ?? '#' + sl.mat.color.getHexString()}" data-item="${target.id}" data-slot="${slot}" data-kind="color"></label>`;
			}
			return s;
		}
		if (this.tab === 'history') {
			const list = h.designer.history.slice().reverse();
			return list.length ? `<ol>${list.map((x, i) => `<li>${esc(x)}${i === 0 ? ' <span class="ok">(undo removes this)</span>' : ''}</li>`).join('')}</ol>` : 'No changes yet.';
		}
		if (this.tab === 'designs') {
			const all = h.snapshots(), names = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
			return `${names.length ? `<ul>${names.map((n) => `<li>${esc(n)} <span style="color:#8e99a5">${new Date(all[n].at).toLocaleString()}</span> <button class="b" data-r="${esc(n)}">Restore</button> <button class="b" data-del="${esc(n)}">Delete</button></li>`).join('')}</ul>` : 'Nothing saved yet. Press Save, or say “save as cosy evening”.'}
<p style="color:#8e99a5">Your current design is also saved automatically, and comes back next time.</p><button class="b w" data-a="reset">Back to the original home</button>`;
		}
		if (this.tab === 'perf') {
			const rows = h.metrics.slice(0, 12).map((m) => `<tr><td>${esc(m.text.slice(0, 34))}</td><td>${m.path}</td><td>${ms(m.tSpeechEnd, m.tTranscript)}</td><td>${ms(m.tTranscript, m.tPlanFirst)}</td><td>${ms(m.tSpeechEnd ?? m.tTranscript, m.tFirstVisible)}</td><td>${ms(m.tSpeechEnd ?? m.tTranscript, m.tDone)}</td><td class="${m.verified ? 'ok' : 'bad'}">${m.verified ? '✓' : m.tDone ? '✗' : '…'}</td></tr>`).join('');
			const done = h.metrics.filter((m) => m.tFirstVisible && m.tFirstVisible > 0);
			const avg = (f: (m: any) => number) => (done.length ? Math.round(done.reduce((a, m) => a + f(m), 0) / done.length) : 0);
			return `<div>${esc(h.claudeNote())}</div>
<div style="margin:6px 0">Average: first visible change ${avg((m) => m.tFirstVisible - (m.tSpeechEnd ?? m.tTranscript))} ms · finished ${avg((m) => (m.tDone ?? 0) - (m.tSpeechEnd ?? m.tTranscript))} ms (${done.length} requests)</div>
<table><tr><th>request</th><th>path</th><th>speech→text</th><th>Claude 1st</th><th>first visible</th><th>done</th><th></th></tr>${rows || '<tr><td colspan="7">No requests yet</td></tr>'}</table>`;
		}
		const v = h.voice;
		return `<label class="s"><input type="checkbox" data-a="wake" ${v.wake ? 'checked' : ''} ${v.supported ? '' : 'disabled'}> Always listen for a wake word</label>
<label class="s">Wake word <input type="text" data-wakephrase="1" value="${esc(v.wakePhrase)}" style="max-width:140px"></label>
<label class="s"><input type="checkbox" data-a="speak" ${v.speak ? 'checked' : ''}> Spoken replies</label>
<label class="s">Language <select data-lang="1">${['en-US', 'en-GB', 'en-AU', 'nl-NL', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pl-PL', 'ko-KR', 'ja-JP'].map((l) => `<option${v.lang === l ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
<p style="color:#8e99a5">Voice uses the browser's speech recognition${v.supported ? '' : ' (not available in this browser)'}. Everyday requests run locally; others go to ${esc(h.claudeNote().replace('Claude: ', ''))}.</p>`;
	}
}

export type { RoomId };
