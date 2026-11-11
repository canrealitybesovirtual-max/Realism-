# Multiplayer setup (owner, once)

Two players in different homes connect peer to peer. Most home networks link directly. Mobile hotspots, CGNAT and
strict NATs need a TURN relay. Players never type keys: you fill `cqc/net-config.json` once and publish it with the game.

## Metered TURN (easiest, has a free tier)

1. Sign up at metered.ca, open the dashboard, create a TURN app. Its name is the subdomain in `https://<name>.metered.live`.
2. In the app, open "TURN Server" > "API keys" and copy the API key (a frontend key, safe in the page by Metered's design).
3. In `cqc/net-config.json` paste them:
   `"metered": { "app": "<name>", "apiKey": "<the key>" }`
   Save and publish. The game fetches fresh credentials at host / join time (cached 1 hour). If the fetch fails it
   falls back to STUN only.

## Cloudflare TURN (optional)

Cloudflare TURN keys must be minted on a server. Deploy `cqc/tools/cf-turn-worker.js` as a Worker (steps in the file)
and put its URL in `"cloudflare": { "url": "https://..." }`.

## Static TURN (optional, e.g. your own coturn)

`"turn": [{ "urls": ["turn:host:3478?transport=udp", "turn:host:3478?transport=tcp", "turns:host:443?transport=tcp"], "username": "u", "credential": "p" }]`

## Self-hosted broker (optional)

The broker only introduces the two players (default: the public PeerJS server 0.peerjs.com). To run your own:
`npx peer@1 --port 9000 --path /cqc` on a server, then
`"brokers": [{ "host": "your.host", "port": 443, "path": "/cqc", "secure": true, "key": "peerjs" }, { "host": "0.peerjs.com", "port": 443, "path": "/", "secure": true, "key": "peerjs" }]`
(tried in order; both players must reach one the host is on).

## Checking

In the game the watch / M menu has a `Net:` cell: RTT, `direct` or `relayed`, and `relay Metered / Cloudflare / TURN / none`.
Press it for details (candidate types, jitter, loss, kB/s) or to retry after a failure. Test URLs:
`?turn=turn:host:3478&tu=user&tp=pass` adds a TURN server, `?relay=1` forces relay only (proves the TURN works).
