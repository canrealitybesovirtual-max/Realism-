# Claude backend: setup

This sets up Ask Claude in the Game Editor. It takes about 15 minutes, and everything runs on your own accounts. The game itself never holds your API key.

## 1. Accounts
1. Create a free Cloudflare account at dash.cloudflare.com.
2. Create an Anthropic API key at platform.claude.com, under **API keys** → **Create key**. Copy it somewhere safe.
3. **Set a monthly spend limit** in the Anthropic console, under **Settings → Limits**. Do this first: if the access code ever leaks, the limit caps the bill.

## 2. Put the game online (Cloudflare Pages)
1. In the Cloudflare dashboard, open **Workers & Pages → Create → Pages → Upload assets**.
2. Name the project, for example `studio-office`.
3. Drag in the unzipped game folder: the folder that contains `index.html`. The `backend/` folder can stay in it, because nothing secret is in there.
4. Click **Deploy**. Your game's address will look like `https://studio-office.pages.dev`. WebXR needs HTTPS, and this address has it.

## 3. Create the Worker (the backend)
1. Open **Workers & Pages → Create → Workers → Create Worker**. Name it `studio-claude`, then click **Deploy**.
2. Click **Edit code**. Delete what is there, paste in the whole of `backend/worker.js`, then click **Deploy**.
3. Go to **Settings → Variables and Secrets** and add:
   - `ANTHROPIC_API_KEY` (type **Secret**): your API key.
   - `ACCESS_CODE` (type **Secret**): a long password you make up, for example 5 random words.
   - `GAME_ORIGIN` (type **Text**): your game's address from step 2, with no slash at the end.
   - `WEB_SEARCH` (type **Text**, optional): set it to `on` if you want Claude to be able to search the web when you ask it questions.
4. Voice fallback (optional): open **Settings → Bindings → Add → Workers AI** and set the variable name to `AI`. This uses Cloudflare's speech-to-text model `@cf/openai/whisper`. Check that it is still listed under Workers AI → Models; if it has been renamed, change the name in `speech()`.
5. Extra rate limit (optional): open **Settings → Bindings → Add → Rate limiting**, set the name to `LIMITER`, the limit to 10 and the period to 60 seconds.
6. Copy the Worker's address, for example `https://studio-claude.yourname.workers.dev`.

## 4. Connect the game
1. Open the game, open the computer, open the **Game Editor**, then the **Ask Claude** tab.
2. Type `/connect https://studio-claude.yourname.workers.dev YOUR-ACCESS-CODE` and press **Make it**.
3. It should answer "Connected: claude-opus-5-5, commands version 2". The access code is saved on that device only. Type `/forget` to remove it.
   - Optional: to skip typing the address on each device, put a file named `claude.config.json` next to `index.html` containing `{"workerUrl": "https://studio-claude.yourname.workers.dev"}`. Never put the access code in that file.

## 5. Test
1. A command (no AI is used, so it costs nothing): select something, then type `make it red`.
2. Quick lane: `drop something round and blue on the desk`. The changes appear at once as one Undo step.
3. Job lane: `build a small obstacle course with cones and a ramp`. You get a plan, and nothing changes until you press **Approve**.
4. Chat and debugging: `why is the frame rate bad?`. The Console lines and Profiler readings are attached when you set **Debug** to auto or on.
5. Voice: press **🎤 Talk**, speak, then press it again. The heard text appears in the box before anything runs.
6. Test on the headset, both inside and outside VR, and note which voice route worked: browser speech, the Quest keyboard's microphone key, or backend speech.

## What the backend does and doesn't do
- It keeps the API key and access code as secrets. It only answers requests from your game's address that carry the access code.
- It rate-limits each device and the total, caps request size and reply length, and gives up after 60 seconds.
- It sends Claude the game's own `commands.json` as tools (cached between requests), together with a scene summary. Claude can only answer with those commands, and the game checks each one again before running it.
- It stores nothing: prompts and replies are not saved.
- If you change `commands.json`, redeploy the game. The backend reads the list from the game, so the two always match.
- Model: `claude-opus-5-5`. If a safety check declines a request, Anthropic's recommended fallback model answers instead (`fallbacks: "default"`). To turn that off, remove the `fallbacks` line and the `anthropic-beta` header in `worker.js`.
