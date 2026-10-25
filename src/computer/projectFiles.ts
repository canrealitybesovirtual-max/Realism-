/**
 * Client for the dev server's guarded project-file API (tools/studioServer).
 * In a build or the published page there is no such server: `state` becomes
 * 'unavailable' and the Code app says so instead of pretending.
 */
export interface FileEntry { path: string; size: number }
export interface Checkpoint { id: string; path: string; time: string; hash: string; reason: string; size: number }
export interface TaskResult { task: string; label: string; code: number | null; out: string; ms: number; timedOut: boolean }
export interface SearchHit { path: string; line: number; text: string }

export class ProjectFiles {
	state: 'checking' | 'ready' | 'unavailable' = 'checking';
	canWrite = false;
	/** the dev server has an API key in its environment for the Claude agent */
	agent = false;
	tasks: Record<string, string> = {};
	private token = '';
	files: FileEntry[] = [];
	reason = '';

	async init() {
		try {
			const r = await fetch('/__studio/session', { headers: { 'x-studio': '1' } });
			if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('no dev server');
			const s = await r.json();
			this.token = s.token; this.canWrite = !!s.canWrite; this.agent = !!s.agent; this.tasks = s.tasks ?? {};
			this.state = 'ready';
			await this.refresh();
		} catch {
			this.state = 'unavailable';
			this.reason = 'Project files need the local dev server (npm run dev). This build cannot read or write source files.';
		}
	}

	private async call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
		const r = await fetch('/__studio/' + path, {
			method: init?.method ?? 'GET',
			headers: { 'x-studio': '1', 'x-studio-token': this.token, ...(init?.body ? { 'content-type': 'application/json' } : {}) },
			body: init?.body ? JSON.stringify(init.body) : undefined,
		});
		const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
		if (!r.ok) { const e = new Error(j.error ?? `HTTP ${r.status}`) as Error & { status: number; hash?: string }; e.status = r.status; e.hash = j.hash; throw e; }
		return j as T;
	}

	async refresh() { this.files = (await this.call<{ files: FileEntry[] }>('files')).files; }
	read(path: string) { return this.call<{ path: string; text: string; hash: string }>('file?path=' + encodeURIComponent(path)); }
	write(path: string, text: string, baseHash: string | null, reason: string, create = false) { return this.call<{ path: string; hash: string; checkpoint: string | null }>('write', { method: 'POST', body: { path, text, baseHash, reason, create } }); }
	history(path: string) { return this.call<{ checkpoints: Checkpoint[] }>('history?path=' + encodeURIComponent(path)).then((r) => r.checkpoints); }
	checkpoint(id: string) { return this.call<Checkpoint & { text: string }>('checkpoint?id=' + id); }
	restore(id: string) { return this.call<{ path: string; hash: string; checkpoint: string }>('restore', { method: 'POST', body: { id } }); }
	search(q: string) { return this.call<{ hits: SearchHit[] }>('search?q=' + encodeURIComponent(q)).then((r) => r.hits); }
	askClaude(request: string, context: string) { return this.call<{ text: string; truncated: boolean; model: string }>('agent', { method: 'POST', body: { request, context } }); }
	run(task: string) { return this.call<TaskResult>('run', { method: 'POST', body: { task } }); }
}

/** `src/a.ts(12,5): error TS2322: ...` lines from tsc output */
export function parseTsc(out: string) {
	const res: { path: string; line: number; col: number; message: string }[] = [];
	for (const m of out.matchAll(/^([^\s(][^(\n]*)\((\d+),(\d+)\): (error|warning) (TS\d+: .*)$/gm)) res.push({ path: m[1].trim(), line: +m[2], col: +m[3], message: m[5] });
	return res;
}
