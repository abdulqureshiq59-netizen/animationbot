# AISA — AI Cartoon Demo Pipeline (Node.js)

An automation pipeline that turns a character description + a one-line
story idea into a short, finished, AI-generated cartoon scene — script,
character reference sheet, animated shots, locked voice, background music,
and final video assembly — all in one request.

This exists to produce the **paid pilot demo** described in the client
proposal (`AI-Animated Cartoon Series`): a 30–60 second scene using the
client's real character, story and chosen voice, so they can judge quality
before committing to a full series.

## How it works

```
story idea + character description
        │
        ▼
 1. Script & shot breakdown   (LLM: Gemini / Groq / offline template)
        ▼
 2. Character reference sheet (image gen: Cloudflare Workers AI, free)
        ▼
 3. Per-shot image → video    (Kling/Runway if configured, else free
                                Ken Burns pan/zoom via ffmpeg)
        ▼
 4. Voice per shot            (msedge-tts, free, locked voice per character)
        ▼
 5. Background music          (synthesised ambient pad, free, no key)
        ▼
 6. Final assembly (ffmpeg) → assets/output/<name>.mp4
```

**Every stage has a free, no-API-key fallback**, so the whole thing runs
out of the box with no `.env` at all. As you get real API keys (Kling,
ElevenLabs, a paid LLM, etc.) drop them into `.env` and that stage upgrades
automatically — no code changes needed elsewhere.

> Note: some hosts (locked-down sandboxes, CI) block outbound network to
> image/voice services entirely. In that case the pipeline still completes
> end-to-end using fully-offline fallbacks (a labelled placeholder image,
> and `espeak-ng`/Google Translate TTS for voice) so you can smoke-test the
> whole flow. On a normal server (e.g. Render) the free online services
> (Cloudflare Workers AI, msedge-tts) are used directly and produce real
> cartoon images/voices.
>
> **Image generation needs a free Cloudflare account** (see below) —
> without it, every image is a plain labelled placeholder card, not a
> cartoon. (Pollinations.ai, used here previously, started requiring a
> paid API key/budget in 2026 and was dropped from the default chain.)

## Requirements

- Node.js 18+
- `ffmpeg` and `ffprobe` on the system `PATH`
- (optional, offline-voice fallback only) `espeak-ng`

## Setup

```bash
npm install
```

Then create a `.env` file in the project root (gitignored — never commit
it) with only the keys you actually have; every line is optional and the
pipeline runs fine with none of them set:

```bash
# --- Script / story generation (LLM) — pick ONE, or leave both blank to
# use the built-in offline template writer ---
#   Google Gemini -> https://aistudio.google.com/apikey   (free tier)
#   Groq          -> https://console.groq.com/keys        (free tier, fast)
GEMINI_API_KEY=
GROQ_API_KEY=

# --- Character reference sheet (image generation) ---
# Default is Cloudflare Workers AI (FLUX.1 schnell) — genuinely free,
# recurring daily quota (10,000 "neurons"/day, ~170 images, resets daily,
# no credit card). Sign up free at https://dash.cloudflare.com/sign-up,
# then:
#   CLOUDFLARE_ACCOUNT_ID -> dashboard right sidebar, or Workers & Pages overview
#   CLOUDFLARE_API_TOKEN  -> My Profile -> API Tokens -> Create Token ->
#                            "Workers AI" template (or custom token with
#                            "Workers AI: Read/Edit" permission)
# Without these two set, every image is a plain placeholder card instead
# of a real cartoon image.
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
STABILITY_API_KEY=

# --- Shot / image-to-video generation ---
# Default fallback (no key needed) is a Ken Burns pan/zoom via ffmpeg.
# Add a real key to get actual AI-generated motion:
KLING_API_KEY=
RUNWAY_API_KEY=

# --- Voice (text-to-speech) ---
# Default is msedge-tts — fully free, no key needed, many languages.
ELEVENLABS_API_KEY=

# --- Music / SFX ---
# Default is a synthesised ambient pad, generated locally, no key needed.
SUNO_API_KEY=
```

## Running it

### As a web service (recommended — this is how it deploys on Render)

```bash
npm start
```

Open `http://localhost:3000`, fill in the character/story form, submit,
and poll the status page until the download link appears. Or drive it
directly:

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d '{"character": "A small orange fox with big round glasses and a blue backpack", "story": "the fox finds a glowing map in the forest", "language": "english"}'
# -> { "jobId": "...", "statusUrl": "/status/..." }

curl http://localhost:3000/status/<jobId>
# -> { "status": "done", "outputFile": "<jobId>.mp4" }

curl -o demo.mp4 http://localhost:3000/download/<jobId>.mp4
```

`language` also selects the locked voice preset — see
`src/providers/tts.js` → `VOICE_PRESETS` (english, english-male, urdu,
urdu-male, hindi; add more msedge-tts voice names as needed).

**Known limitation:** per-shot intermediate files (reference sheet, shot
images/videos, voice lines) use fixed filenames shared across jobs, so
only run one generation job at a time — concurrent jobs will overwrite
each other's intermediate files. Fine for a single-operator demo tool;
flag it if you need true concurrency later (each job would need its own
subfolder).

### As a one-off CLI script

```bash
npm run demo -- \
  --character "A small orange fox with big round glasses and a blue backpack" \
  --story "the fox finds a glowing map in the forest" \
  --language english \
  --out demo_scene.mp4
```

Output lands in `assets/output/demo_scene.mp4`, plus `scene_script.json`
(the generated script/shot breakdown) in the same folder.

## Project layout

```
src/
  config.js           loads .env, defines shared paths
  server.js            Express web service (generate/status/download)
  runDemo.js            CLI entry point + the `run()` function server.js calls
  assemble.js           final ffmpeg assembly
  providers/
    llm.js              script + shot breakdown
    imageGen.js          character reference sheet + per-shot images
    videoGen.js          image-to-video (Ken Burns fallback + paid hooks)
    tts.js               voice generation (msedge-tts + espeak-ng fallback)
    music.js             background music (synthesised pad + paid hook)
assets/
  characters/            generated reference sheet + shot images
  video/                  per-shot video clips
  audio/                  voice lines + music bed
  output/                 final assembled videos + script JSON
```

## Deploying on Render

This is a normal Node **Web Service** now — Render auto-detects it from
`package.json` (`npm install` then `npm start`), no extra configuration
needed:

1. Push this repo to GitHub (already done if you're reading this there).
2. Render dashboard → **New → Web Service** → pick this repo.
3. Build command: `npm install && apt-get update && apt-get install -y espeak-ng`
   (the `espeak-ng` step is only a safety-net fallback; on Render's normal
   network, msedge-tts is reachable directly and that's used instead).
   Start command: `npm start` (should be auto-filled from `package.json`).
4. In the service's **Environment** tab, add any real API keys you have
   (same variable names as above). All optional.
5. Once deployed, open the service's URL — you'll see the same form as
   `localhost:3000` above.

## Upgrading a stage later (example: real AI video via Kling)

1. Get a `KLING_API_KEY`, add it to `.env` / Render env vars.
2. Fill in the request/response handling inside
   `src/providers/videoGen.js` → `klingGenerate()` — it's stubbed with a
   clear `TODO` and already wired into the fallback chain, so nothing
   else in the pipeline needs to change.

Same pattern for ElevenLabs (`tts.js`), Suno (`music.js`), and
Gemini/Groq (`llm.js`, already fully wired — just add the key).
