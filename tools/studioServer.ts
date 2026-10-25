import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { hashText } from '../src/engine/codeTools';
import { buildPrompt } from '../src/engine/agentPrompt';

/**
 * The code workstation's bridge to project files, for the local dev server
 * only (`npm run dev`; it does not exist in a build or the published page).
 *
 * Deliberately narrow:
 * - files: read / write inside an allowlist (src, tests/unit, docs,
 *   public/addons, README, index.html) - no dotfiles, no package.json,
 *   no node_modules, no paths outside the project;
 * - every write needs the per-server-session token, the hash the editor
 *   started from (refused with 409 if the file changed meanwhile) and keeps a
 *   checkpoint of the old content in .studio/history, so any write can be
 *   undone with "restore";
 * - nothing is ever deleted;
 * - the only commands are the type check and the unit tests, run without a
 *   shell, one at a time, with a time limit; their real output is returned;
 * - writes and commands only from this machine (loopback) unless
 *   STUDIO_ALLOW_LAN=1 - the headset on the LAN can browse and read;
 * - the Claude agent route: the page sends a request + scene context, this
 *   server calls the Messages API with ANTHROPIC_API_KEY from ITS
 *   environment (the key never reaches the browser) and returns Claude's
 *   text. It runs nothing: the page turns the reply into a proposal that
 *   the person must approve.
 * Cross-site pages cannot use it: requests need a custom header (CORS
 * preflight, never answered) and the token is only readable same-origin.
 */
const ALLOW_DIRS = ['src/', 'tests/unit/', 'docs/', 'public/addons/', 'tools/'];
const ALLOW_FILES = ['README.md', 'index.html', 'vite.config.ts'];
const EXT = /\.(ts|js|mjs|md|html|css|json)$/;
const MAX_FILE = 512 * 1024;
const TASKS: Record<string, { cmd: string; args: string[]; label: string }> = {
	typecheck: { cmd: 'node_modules/.bin/tsc', args: ['--noEmit', '-p', '.'], label: 'Type check (tsc --noEmit)' },
	test: { cmd: 'node_modules/.bin/vitest', args: ['run', '--reporter=default', '--color=false'], label: 'Unit tests (vitest run)' },
};

export function studioServer(): Plugin {
	const token = crypto.randomBytes(18).toString('hex');
	let root = process.cwd();
	let running: string | null = null;
	let agentBusy = false;
	const hasKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
	async function askClaude(prompt: string) {
		const { default: Anthropic } = await import('@anthropic-ai/sdk');
		const client = new Anthropic(); // reads ANTHROPIC_API_KEY from this process's environment
		const r = await client.beta.messages.create({
			model: 'claude-opus-5-5',
			max_tokens: 16000,
			output_config: { effort: 'high' },
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			messages: [{ role: 'user', content: prompt }],
		});
		if (r.stop_reason === 'refusal') throw new Error('Claude declined this request');
		const text = r.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
		return { text, truncated: r.stop_reason === 'max_tokens', model: r.model };
	}
	const histDir = () => path.join(root, '.studio', 'history');

	/** project-relative path if allowed, else null */
	const allowed = (p: unknown): string | null => {
		if (typeof p !== 'string' || p.length > 200 || p.includes('\\') || p.includes('\0')) return null;
		const norm = path.posix.normalize(p);
		if (norm.startsWith('/') || norm.startsWith('..') || norm.split('/').some((seg) => seg.startsWith('.') || seg === 'node_modules')) return null;
		if (!EXT.test(norm) || norm.endsWith('package.json') || norm.endsWith('package-lock.json')) return null;
		if (!ALLOW_FILES.includes(norm) && !ALLOW_DIRS.some((d) => norm.startsWith(d))) return null;
		const abs = path.resolve(root, norm);
		return abs.startsWith(root + path.sep) ? norm : null;
	};

	const send = (res: ServerResponse, code: number, body: unknown) => {
		res.statusCode = code;
		res.setHeader('content-type', 'application/json');
		res.setHeader('cache-control', 'no-store');
		res.end(JSON.stringify(body));
	};
	const body = (req: IncomingMessage) => new Promise<any>((ok, bad) => {
		let s = '';
		req.on('data', (c) => { s += c; if (s.length > MAX_FILE * 2) { bad(new Error('request too large')); req.destroy(); } });
		req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { bad(new Error('bad JSON')); } });
	});
	const local = (req: IncomingMessage) => { const a = req.socket.remoteAddress ?? ''; return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1' || process.env.STUDIO_ALLOW_LAN === '1'; };

	async function listFiles() {
		const out: { path: string; size: number }[] = [];
		const walk = async (rel: string) => {
			let ents: import('node:fs').Dirent[];
			try { ents = await fs.readdir(path.join(root, rel), { withFileTypes: true }); } catch { return; }
			for (const e of ents) {
				const p = rel ? `${rel}/${e.name}` : e.name;
				if (e.name.startsWith('.') || e.name === 'node_modules') continue;
				if (e.isDirectory()) { if (ALLOW_DIRS.some((d) => d.startsWith(p + '/') || p.startsWith(d))) await walk(p); }
				else if (allowed(p)) { const st = await fs.stat(path.join(root, p)); if (st.size <= MAX_FILE) out.push({ path: p, size: st.size }); }
			}
		};
		await walk('');
		return out.sort((a, b) => a.path.localeCompare(b.path));
	}

	async function checkpoint(rel: string, text: string, reason: string) {
		await fs.mkdir(histDir(), { recursive: true });
		const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
		await fs.writeFile(path.join(histDir(), id + '.json'), JSON.stringify({ id, path: rel, time: new Date().toISOString(), hash: hashText(text), reason, text }));
		return id;
	}

	async function history(rel: string | null) {
		let names: string[] = [];
		try { names = await fs.readdir(histDir()); } catch { return []; }
		const out = [];
		for (const n of names.sort().reverse().slice(0, 400)) {
			try { const d = JSON.parse(await fs.readFile(path.join(histDir(), n), 'utf8')); if (!rel || d.path === rel) out.push({ id: d.id, path: d.path, time: d.time, hash: d.hash, reason: d.reason, size: d.text.length }); } catch { /* skip damaged */ }
			if (out.length >= 60) break;
		}
		return out;
	}

	function run(task: string): Promise<{ code: number | null; out: string; ms: number; timedOut: boolean }> {
		const t = TASKS[task];
		const t0 = Date.now();
		return new Promise((ok) => {
			const p = spawn(path.join(root, t.cmd), t.args, { cwd: root, shell: false, env: { ...process.env, FORCE_COLOR: '0', CI: '1' } });
			let out = '';
			const add = (b: Buffer) => { if (out.length < 200_000) out += b.toString(); };
			p.stdout.on('data', add); p.stderr.on('data', add);
			const timer = setTimeout(() => { p.kill('SIGTERM'); }, 240_000);
			p.on('error', (e) => { clearTimeout(timer); ok({ code: null, out: out + '\n' + e.message, ms: Date.now() - t0, timedOut: false }); });
			p.on('close', (code, sig) => { clearTimeout(timer); ok({ code, out: out.replace(/\x1b\[[0-9;]*m/g, ''), ms: Date.now() - t0, timedOut: sig === 'SIGTERM' }); });
		});
	}

	async function handle(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url ?? '/', 'http://x');
		const route = url.pathname.replace(/^\/+/, '');
		// same-origin only: a custom header is required (cross-site pages would need a CORS preflight, which is never answered)
		if (req.headers['x-studio'] !== '1') return send(res, 403, { error: 'missing x-studio header' });
		if (route === 'session') return send(res, 200, { token, canWrite: local(req), agent: hasKey(), tasks: Object.fromEntries(Object.entries(TASKS).map(([k, v]) => [k, v.label])) });
		if (req.headers['x-studio-token'] !== token) return send(res, 403, { error: 'bad or missing session token (reload the page)' });

		if (req.method === 'GET' && route === 'files') return send(res, 200, { files: await listFiles() });
		if (req.method === 'GET' && route === 'file') {
			const rel = allowed(url.searchParams.get('path'));
			if (!rel) return send(res, 403, { error: 'that path is outside the allowlist' });
			try { const text = await fs.readFile(path.join(root, rel), 'utf8'); return send(res, 200, { path: rel, text, hash: hashText(text) }); } catch { return send(res, 404, { error: 'no such file' }); }
		}
		if (req.method === 'GET' && route === 'search') {
			const q = (url.searchParams.get('q') ?? '').toLowerCase();
			if (q.length < 2) return send(res, 400, { error: 'search for at least 2 characters' });
			const hits: { path: string; line: number; text: string }[] = [];
			for (const f of await listFiles()) {
				const lines = (await fs.readFile(path.join(root, f.path), 'utf8')).split('\n');
				lines.forEach((l, i) => { if (hits.length < 300 && l.toLowerCase().includes(q)) hits.push({ path: f.path, line: i + 1, text: l.trim().slice(0, 160) }); });
				if (hits.length >= 300) break;
			}
			return send(res, 200, { hits });
		}
		if (req.method === 'GET' && route === 'history') return send(res, 200, { checkpoints: await history(url.searchParams.get('path') ? allowed(url.searchParams.get('path')) : null) });
		if (req.method === 'GET' && route === 'checkpoint') {
			const id = url.searchParams.get('id') ?? '';
			if (!/^\d+-[0-9a-f]{6}$/.test(id)) return send(res, 400, { error: 'bad id' });
			try { return send(res, 200, JSON.parse(await fs.readFile(path.join(histDir(), id + '.json'), 'utf8'))); } catch { return send(res, 404, { error: 'no such checkpoint' }); }
		}

		if (req.method !== 'POST') return send(res, 404, { error: 'unknown route' });
		if (!local(req)) return send(res, 403, { error: 'writes and commands are only allowed from this computer (set STUDIO_ALLOW_LAN=1 to allow the LAN)' });
		let b: any;
		try { b = await body(req); } catch (e) { return send(res, 400, { error: (e as Error).message }); }

		if (route === 'write') {
			const rel = allowed(b.path);
			if (!rel) return send(res, 403, { error: 'that path is outside the allowlist' });
			if (typeof b.text !== 'string' || b.text.length > MAX_FILE) return send(res, 400, { error: 'text missing or too large' });
			const abs = path.join(root, rel);
			let current: string | null = null;
			try { current = await fs.readFile(abs, 'utf8'); } catch { /* new file */ }
			if (current === null && !b.create) return send(res, 404, { error: 'file does not exist (pass create to make it)' });
			if (current !== null && b.create) return send(res, 409, { error: 'file already exists' });
			if (current !== null && b.baseHash !== hashText(current)) return send(res, 409, { error: 'the file changed on disk since you opened it', hash: hashText(current) });
			const cp = current !== null ? await checkpoint(rel, current, typeof b.reason === 'string' ? b.reason.slice(0, 120) : 'before write') : null;
			await fs.mkdir(path.dirname(abs), { recursive: true });
			await fs.writeFile(abs, b.text);
			return send(res, 200, { path: rel, hash: hashText(b.text), checkpoint: cp });
		}
		if (route === 'restore') {
			if (typeof b.id !== 'string' || !/^\d+-[0-9a-f]{6}$/.test(b.id)) return send(res, 400, { error: 'bad id' });
			let d: any;
			try { d = JSON.parse(await fs.readFile(path.join(histDir(), b.id + '.json'), 'utf8')); } catch { return send(res, 404, { error: 'no such checkpoint' }); }
			const rel = allowed(d.path);
			if (!rel) return send(res, 403, { error: 'checkpoint path is outside the allowlist' });
			const abs = path.join(root, rel);
			let current = '';
			try { current = await fs.readFile(abs, 'utf8'); } catch { /* recreate */ }
			const cp = await checkpoint(rel, current, `before restoring ${b.id}`);
			await fs.writeFile(abs, d.text);
			return send(res, 200, { path: rel, hash: hashText(d.text), checkpoint: cp });
		}
		if (route === 'agent') {
			if (!hasKey()) return send(res, 503, { error: 'ANTHROPIC_API_KEY is not set in the dev server\'s environment' });
			if (typeof b.request !== 'string' || !b.request.trim() || b.request.length > 4000) return send(res, 400, { error: 'request missing or too long' });
			if (typeof b.context !== 'string' || b.context.length > 200_000) return send(res, 400, { error: 'context missing or too large' });
			if (agentBusy) return send(res, 409, { error: 'Claude is already working on a request' });
			agentBusy = true;
			try { return send(res, 200, await askClaude(buildPrompt(b.request, b.context))); }
			catch (e) { return send(res, 502, { error: (e as Error).message }); }
			finally { agentBusy = false; }
		}
		if (route === 'run') {
			if (!TASKS[b.task]) return send(res, 400, { error: `only these can run: ${Object.keys(TASKS).join(', ')}` });
			if (running) return send(res, 409, { error: `${running} is already running` });
			running = b.task;
			try { return send(res, 200, { task: b.task, label: TASKS[b.task].label, ...(await run(b.task)) }); } finally { running = null; }
		}
		return send(res, 404, { error: 'unknown route' });
	}

	return {
		name: 'studio-dev-server',
		apply: 'serve',
		configResolved(c) { root = path.resolve(c.root); },
		configureServer(server) {
			// keep checkpoints from triggering page reloads
			server.watcher.unwatch(path.join(root, '.studio'));
			server.middlewares.use('/__studio', (req, res) => { handle(req, res).catch((e) => send(res, 500, { error: (e as Error).message })); });
		},
	};
}
