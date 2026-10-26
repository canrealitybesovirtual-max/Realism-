/**
 * Speech in and out, through the browser's own Web Speech API.
 *
 * - Push to talk: start() listens for one request and hands the final
 *   transcript over (interim words are shown while you speak).
 * - Wake phrase: with `wake` on, it keeps listening and only acts on what
 *   follows the phrase ("home, make the walls green").
 * - say(): spoken confirmations (optional).
 *
 * Browsers without SpeechRecognition (Firefox, many headset browsers) get
 * `supported = false`; the control center then offers typing and buttons.
 * Recognition may also need microphone permission, which some embedded
 * views refuse: `error` explains what happened.
 */
export type VoiceState = 'off' | 'listening' | 'hearing' | 'waiting';

export class Voice {
	readonly supported: boolean;
	state: VoiceState = 'off';
	interim = '';
	error = '';
	lang = 'en-US';
	wake = false;
	wakePhrase = 'home';
	speak = true;
	/** when speech ended (for latency: speech end -> transcript) */
	speechEnd = 0;
	onFinal: (text: string, t: { speechEnd: number; final: number }) => void = () => {};
	onChange: () => void = () => {};
	private rec: any = null;
	private wantOn = false;

	constructor() {
		const W = window as any;
		const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
		this.supported = !!SR;
		if (!SR) return;
		const r = new SR();
		r.interimResults = true;
		r.maxAlternatives = 1;
		r.onstart = () => { this.state = 'listening'; this.error = ''; this.onChange(); };
		r.onspeechstart = () => { this.state = 'hearing'; this.onChange(); };
		r.onspeechend = () => { this.speechEnd = performance.now(); this.state = 'waiting'; this.onChange(); };
		r.onresult = (e: any) => {
			let fin = '', mid = '';
			for (let i = e.resultIndex; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) fin += x[0].transcript; else mid += x[0].transcript; }
			this.interim = mid; this.onChange();
			if (!fin.trim()) return;
			let text = fin.trim();
			if (this.wake) {
				const m = new RegExp(`\\b(hey |ok |okay )?${this.wakePhrase}[,.!]?\\s+(.*)$`, 'i').exec(text);
				if (!m) return; // not for us
				text = m[2];
			}
			const now = performance.now();
			this.interim = '';
			this.onFinal(text, { speechEnd: this.speechEnd || now, final: now });
			this.speechEnd = 0;
		};
		r.onerror = (e: any) => {
			const why: Record<string, string> = {
				'not-allowed': 'The microphone is blocked for this page. Allow it in the browser (or open the game in its own tab) and try again.',
				'service-not-allowed': 'Speech recognition is not allowed here. Open the game in its own tab, or type instead.',
				'no-speech': '', aborted: '', network: 'Speech recognition needs a network connection.', 'audio-capture': 'No microphone was found.',
			};
			this.error = why[e.error] ?? `Speech recognition: ${e.error}`;
			if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') this.wantOn = false;
			this.onChange();
		};
		r.onend = () => {
			// keep a wake-phrase session alive; push-to-talk ends here
			if (this.wantOn && this.wake) { try { r.start(); return; } catch { /* restart below */ } }
			this.wantOn = false; this.state = 'off'; this.onChange();
		};
		this.rec = r;
	}

	/** listen (push to talk), or keep listening for the wake phrase */
	start() {
		if (!this.rec || this.state !== 'off') return;
		this.rec.lang = this.lang;
		this.rec.continuous = this.wake;
		this.wantOn = true;
		try { this.rec.start(); } catch (e) { this.error = (e as Error).message; this.onChange(); }
	}
	/** stop listening; the words so far still count */
	stop() { this.wantOn = false; try { this.rec?.stop(); } catch { /* not started */ } }
	/** stop and throw away what was heard */
	abort() { this.wantOn = false; this.interim = ''; try { this.rec?.abort(); } catch { /* not started */ } }
	toggle() { if (this.state === 'off') this.start(); else this.stop(); }

	say(text: string) {
		if (!this.speak || !text || !('speechSynthesis' in window)) return;
		try {
			speechSynthesis.cancel();
			const u = new SpeechSynthesisUtterance(text); u.lang = this.lang; u.rate = 1.05;
			speechSynthesis.speak(u);
		} catch { /* no voice output */ }
	}
}
