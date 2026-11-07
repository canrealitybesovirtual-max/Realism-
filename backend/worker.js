// Studio Claude backend: one Cloudflare Worker (roadmap sections 7a, 7b, 7c).
// - Holds the Anthropic API key and the access code as Worker secrets (never in a game file).
// - Accepts requests only from the game's own address and only with the access code.
// - Rate-limits per device and overall, caps request size, reply length and time (60 s).
// - Hands Claude the command registry (commands.json, fetched from the game itself) as tools, so Claude can
//   only answer with commands the game knows. The game checks every call again before it runs it.
// - Speech to text for the voice fallback (Workers AI), same checks.
// - Stores nothing: no prompts, no replies.
//
// Plain fetch to the Messages API on purpose: this file is pasted into the Cloudflare dashboard as is,
// with no build step, so it cannot import the Anthropic SDK.
//
// Secrets (Settings > Variables and Secrets):  ANTHROPIC_API_KEY, ACCESS_CODE
// Variables:  GAME_ORIGIN  e.g. https://studio-office.pages.dev   (no trailing slash)
//             WEB_SEARCH   "on" to let Claude search the web in the chat lane (optional)
// Bindings (optional):  AI (Workers AI, for voice),  LIMITER (Rate Limiting binding)

const MODEL = "claude-opus-5-5";
const API = "https://api.anthropic.com/v1/messages";
const MAX_BODY = 64 * 1024;          // request size cap (text, scene summary, console lines)
const MAX_AUDIO = 2 * 1024 * 1024;   // about 30 s of compressed speech
const TIMEOUT_MS = 60000;
const MAX_CALLS = 20;                // commands per quick reply
const MAX_PLAN_STEPS = 60;           // commands per job plan
const PER_DEVICE_PER_MIN = 6, ALL_PER_MIN = 30;

// ---------- small helpers ----------
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: cors(origin, { "content-type": "application/json" }) });
}
function cors(origin, extra) {
  return Object.assign({ "access-control-allow-origin": origin || "null", "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type, x-access-code, x-device", "access-control-max-age": "600", "vary": "origin" }, extra || {});
}
function fail(msg, status, origin) { return json({ error: msg }, status || 400, origin); }
function same(a, b) { // constant-time compare for the access code
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}

// best-effort counters inside this Worker instance; the LIMITER binding (if added) covers all instances
const hits = new Map();
function allowed(key, max) {
  const now = Date.now(), list = (hits.get(key) || []).filter((t) => now - t < 60000);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now); hits.set(key, list); return true;
}

// ---------- the registry as tools ----------
let REG = null, TOOLS = null;
async function registry(env, want) {
  if (REG && (!want || REG.version === want)) return REG;
  const r = await fetch(env.GAME_ORIGIN + "/commands.json?v=" + (want || Date.now()), { cf: { cacheTtl: 60 } });
  if (!r.ok) throw new Error("could not load commands.json from the game (" + r.status + ")");
  const j = await r.json();
  if (j.format !== "studio-commands") throw new Error("the game's commands.json is not a command registry");
  REG = j; TOOLS = buildTools(j, env);
  return REG;
}
function blankSchema(b, reg) {
  switch (b.type) {
    case "enum": return { type: "string", enum: reg.enums[b.of] || [] };
    case "object": return { type: "string", description: "An object's name as in the scene list, or 'it' for the selection." };
    case "prop": return { type: "string", description: "A prop word, for example crate, cone, ball, lamp, domino." };
    case "color": return { type: "string", description: "A colour name (red, navy, light grey...) or #rrggbb." };
    case "length": return { type: "string", description: "A distance with its unit, for example '30 cm' or '1.5 m'." + (b.min !== undefined ? " Allowed " + b.min + " to " + b.max + " m." : "") };
    case "mass": return { type: "string", description: "A mass with its unit, for example '2 kg' or '300 g'." };
    case "name": return { type: "string", description: "A short name." };
    default: return { type: "string", description: "A number" + (b.min !== undefined ? " from " + b.min + " to " + b.max : "") + "." };
  }
}
function buildTools(reg, env) {
  const tools = reg.commands.filter((c) => c.status === "ready").map((c) => {
    const props = {}, req = [];
    for (const k in c.blanks) { props[k] = blankSchema(c.blanks[k], reg); if (!(c.defaults && k in c.defaults)) req.push(k); }
    return { name: c.name, description: c.group + ". Says: \"" + c.phrases.slice(0, 2).join("\" / \"") + "\". Example: \"" + c.example + "\"." + (c.cost !== "Low" ? " Cost on Quest: " + c.cost + "." : ""),
      input_schema: { type: "object", properties: props, required: req, additionalProperties: false } };
  });
  tools.push({ name: "propose_plan", description: "For a bigger request (more than about 5 commands, or anything that reshapes the room): describe the plan and list every step as a registry command. The player approves it before anything changes.",
    input_schema: { type: "object", additionalProperties: false, required: ["summary", "steps"], properties: {
      summary: { type: "string", description: "One or two plain sentences." },
      steps: { type: "array", maxItems: MAX_PLAN_STEPS, items: { type: "object", additionalProperties: false, required: ["command", "args"], properties: {
        command: { type: "string", description: "A registry command name." }, args: { type: "object", description: "That command's blanks." } } } } } } });
  if (env.WEB_SEARCH === "on") tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 3 });
  // one cache breakpoint after the tools: the registry is the same on every request
  tools[tools.length - 1].cache_control = { type: "ephemeral" };
  return tools;
}

const SYSTEM = [
  "You are the assistant inside a WebXR game editor (a small office studio for Meta Quest 3S, made with three.js).",
  "You change the room ONLY by calling the tools you have; each tool is one command from the game's registry. Never invent commands or write code.",
  "Small request (up to about 5 commands): call the command tools directly, in order. Use 'it' to mean the selected object; a newly added object becomes the selection.",
  "Bigger request: call propose_plan once with every step. The player approves it first.",
  "Question, explanation, planning or debugging help: answer in plain text, short and friendly. If a fix is a command, offer it or call it.",
  "If no command can do what was asked, say so in one sentence and suggest the closest thing that works.",
  "Debugging: you may get Console lines, Profiler readings and the scene list. Use only that evidence. You cannot see or feel the headset: comfort, text legibility and real frame drops are for the player to check. Changes to the game's files happen outside the game, not from here.",
  "Keep Quest performance in mind: 72 Hz, few real-time shadows, at most 100 physics props."
].join("\n");

// ---------- Claude ----------
async function askClaude(env, body, signal) {
  const reg = await registry(env, body.registryVersion);
  if (body.registryVersion && reg.version !== body.registryVersion) throw Object.assign(new Error("The game and the backend use different command lists. Redeploy the game, then try again."), { plain: true });
  const ctx = ["Room: " + String(body.scene || "").slice(0, 24000)];
  if (body.debug) ctx.push("Debug information:\n" + String(body.debug).slice(0, 16000));
  const messages = [];
  (Array.isArray(body.history) ? body.history.slice(-8) : []).forEach((m) => {
    if ((m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim()) messages.push({ role: m.role, content: m.text.slice(0, 4000) });
  });
  while (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: ctx.join("\n\n") + "\n\nPlayer: " + String(body.text).slice(0, 4000) });
  // turns must alternate
  const merged = []; messages.forEach((m) => { const last = merged[merged.length - 1]; if (last && last.role === m.role) last.content += "\n\n" + m.content; else merged.push(m); });
  const req = {
    model: MODEL, max_tokens: 8000, system: SYSTEM, tools: TOOLS, tool_choice: { type: "auto" }, messages: merged,
    output_config: { effort: body.mode === "chat" ? "medium" : "low" },
    fallbacks: "default" // if a safety classifier declines, the API re-runs the request on its recommended fallback model
  };
  const r = await fetch(API, { method: "POST", signal, headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY,
    "anthropic-version": "2026-10-21", "anthropic-beta": "server-side-fallback-2026-07-01" }, body: JSON.stringify(req) });
  if (!r.ok) {
    const why = r.status === 429 ? "Claude is busy right now. Wait a minute and try again." : r.status === 401 ? "The API key in the backend is wrong." : r.status === 529 || r.status >= 500 ? "Claude's service is having trouble. Try again soon." : "Claude refused the request (" + r.status + ").";
    throw Object.assign(new Error(why), { plain: true });
  }
  const msg = await r.json();
  if (msg.stop_reason === "refusal") return { kind: "text", text: "Claude can't help with that one." };
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  const uses = msg.content.filter((b) => b.type === "tool_use");
  const plan = uses.find((u) => u.name === "propose_plan");
  if (plan) {
    const steps = (plan.input.steps || []).slice(0, MAX_PLAN_STEPS).map((s) => ({ name: String(s.command), args: s.args && typeof s.args === "object" ? s.args : {} }));
    return { kind: "plan", summary: String(plan.input.summary || "").slice(0, 600), steps, text: text.slice(0, 2000) };
  }
  if (uses.length) return { kind: "calls", calls: uses.slice(0, MAX_CALLS).map((u) => ({ name: u.name, args: u.input || {} })), cut: uses.length > MAX_CALLS, text: text.slice(0, 2000) };
  return { kind: "text", text: (text || "No answer.").slice(0, 6000), truncated: msg.stop_reason === "max_tokens" };
}

// ---------- speech to text ----------
async function speech(env, req) {
  if (!env.AI) throw Object.assign(new Error("Voice on the backend is off: add the Workers AI binding named AI."), { plain: true });
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) throw Object.assign(new Error("No sound was recorded."), { plain: true });
  if (buf.byteLength > MAX_AUDIO) throw Object.assign(new Error("The recording is too long."), { plain: true });
  const out = await env.AI.run("@cf/openai/whisper", { audio: [...new Uint8Array(buf)] });
  return { text: String((out && out.text) || "").trim().slice(0, 500) };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get("origin") || "";
    const okOrigin = env.GAME_ORIGIN && origin === env.GAME_ORIGIN;
    if (req.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors(okOrigin ? origin : "null") });
    if (!okOrigin) return fail("This backend only answers the game's own address.", 403);
    if (!env.ANTHROPIC_API_KEY || !env.ACCESS_CODE) return fail("The backend is missing its secrets.", 500, origin);
    if (!same(req.headers.get("x-access-code") || "", env.ACCESS_CODE)) return fail("Wrong access code.", 401, origin);
    const device = (req.headers.get("x-device") || "unknown").slice(0, 40);
    if (url.pathname === "/health") {
      try { const reg = await registry(env); return json({ ok: true, model: MODEL, registryVersion: reg.version, voice: !!env.AI }, 200, origin); }
      catch (e) { return fail(e.message, 502, origin); }
    }
    if (req.method !== "POST") return fail("Use POST.", 405, origin);
    if (!allowed("d:" + device, PER_DEVICE_PER_MIN) || !allowed("all", ALL_PER_MIN)) return fail("Too many requests. Wait a minute.", 429, origin);
    if (env.LIMITER) { const { success } = await env.LIMITER.limit({ key: device }); if (!success) return fail("Too many requests. Wait a minute.", 429, origin); }
    const size = Number(req.headers.get("content-length") || 0);
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      if (url.pathname === "/stt") return json(await speech(env, req), 200, origin);
      if (url.pathname !== "/ask") return fail("Unknown address.", 404, origin);
      if (size > MAX_BODY) return fail("The request is too big.", 413, origin);
      const raw = await req.text();
      if (raw.length > MAX_BODY) return fail("The request is too big.", 413, origin);
      let body; try { body = JSON.parse(raw); } catch (e) { return fail("The request is not valid JSON."); }
      if (!body || typeof body.text !== "string" || !body.text.trim()) return fail("Say what you want first.");
      return json(await askClaude(env, body, ctrl.signal), 200, origin);
    } catch (e) {
      if (e.name === "AbortError") return fail("Claude took longer than a minute. Try a smaller request.", 504, origin);
      return fail(e.plain ? e.message : "The backend hit an error.", 502, origin);
    } finally { clearTimeout(timer); }
  }
};
