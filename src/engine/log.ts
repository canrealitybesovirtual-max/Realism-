/**
 * Runtime log shared by the editor, the code workstation and diagnostics.
 * Captures uncaught errors, unhandled promise rejections and console
 * warnings / errors, so problems show up on the in-world computer too.
 */
export type Level = 'info' | 'warn' | 'error';
export interface LogEntry { t: number; level: Level; msg: string; count: number }

class Log {
	readonly entries: LogEntry[] = [];
	version = 0;
	private max = 400;

	push(level: Level, msg: string) {
		const last = this.entries[this.entries.length - 1];
		if (last && last.msg === msg && last.level === level) { last.count++; last.t = performance.now(); }
		else {
			this.entries.push({ t: performance.now(), level, msg, count: 1 });
			if (this.entries.length > this.max) this.entries.shift();
		}
		this.version++;
	}
	info(m: string) { this.push('info', m); }
	warn(m: string) { this.push('warn', m); }
	error(m: string) { this.push('error', m); }
	get errors() { return this.entries.filter((e) => e.level === 'error').length; }

	/** hook the page's error channels (once) */
	capture() {
		if ((this as any).captured) return;
		(this as any).captured = true;
		addEventListener('error', (e) => this.error(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
		addEventListener('unhandledrejection', (e) => this.error('Unhandled: ' + (e.reason?.message ?? String(e.reason))));
		for (const level of ['warn', 'error'] as const) {
			const orig = console[level].bind(console);
			console[level] = (...args: unknown[]) => {
				orig(...args);
				const msg = args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)?.slice(0, 200))).join(' ');
				// three.js prints the same texture warnings every frame; keep them, collapsed
				this.push(level, msg.slice(0, 400));
			};
		}
	}
}

export const log = new Log();
