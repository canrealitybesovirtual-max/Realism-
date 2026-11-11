// Example Cloudflare Worker (not deployed): mints short-lived Cloudflare TURN credentials for the CQC game.
// Cloudflare TURN keys must never be in the page, so the game asks this worker instead.
// Setup: Cloudflare dashboard > Realtime > TURN Server > Create key: note the Key ID and the API token.
// Workers & Pages > Create Worker > paste this file > Settings > Variables: TURN_KEY_ID (text), TURN_KEY_TOKEN (secret),
// ALLOW_ORIGIN (your game's origin, e.g. https://example.github.io). Deploy, then put the worker URL in
// cqc/net-config.json: "cloudflare": { "url": "https://<worker>.<you>.workers.dev" }.
export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'no-store' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 })                         // 24 h; the game caches them for 1 h
    });
    if (!r.ok) return new Response(JSON.stringify({ error: 'turn ' + r.status }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    const j = await r.json();                                      // { iceServers: [...] } (the game also reads the older single-object shape)
    return new Response(JSON.stringify({ iceServers: j.iceServers }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};
