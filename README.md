# AISA — AI Cartoon Demo Pipeline

An automation pipeline that turns a character description + a one-line
story idea into a short, finished, AI-generated cartoon scene — script,
character reference sheet, animated shots, locked voice, background music,
and final video assembly — all in one command.

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
 2. Character reference sheet (image gen: Pollinations.ai, free)
        ▼
 3. Per-shot image → video    (Kling/Runway if configured, else free
                                Ken Burns pan/zoom fallback)
        ▼
 4. Voice per shot            (edge-tts, free, locked voice per character)
        ▼
 5. Background music          (synthesised ambient pad, free, no key)
        ▼
 6. Final assembly (ffmpeg via moviepy) → assets/output/<name>.mp4
```

**Every stage has a free, no-API-key fallback**, so the whole thing runs
out of the box with an empty `.env`. As you get real API keys (Kling,
ElevenLabs, a paid LLM, etc.) drop them into `.env` and that stage upgrades
automatically — no code changes needed elsewhere.

> Note: some hosts (locked-down sandboxes, CI) block outbound network to
> image/voice services entirely. In that case the pipeline still completes
> end-to-end using fully-offline fallbacks (a labelled placeholder image,
> and `espeak-ng` for voice) so you can smoke-test the whole flow. On a
> normal server (e.g. Render) the free online services (Pollinations,
> edge-tts) are used directly and produce real cartoon images/voices.

## Setup

```bash
pip install -r requirements.txt
```

Then create a `.env` file in the project root (this file is gitignored —
never commit it) with only the keys you actually have; every line is
optional and the pipeline runs fine with none of them set:

```bash
# --- Script / story generation (LLM) — pick ONE, or leave both blank to
# use the built-in offline template writer ---
#   Google Gemini -> https://aistudio.google.com/apikey   (free tier)
#   Groq          -> https://console.groq.com/keys        (free tier, fast)
GEMINI_API_KEY=
GROQ_API_KEY=

# --- Character reference sheet (image generation) ---
# Default is Pollinations.ai — fully free, no key needed.
STABILITY_API_KEY=

# --- Shot / image-to-video generation ---
# Default fallback (no key needed) is a Ken Burns pan/zoom on the still
# image. Add a real key to get actual AI-generated motion:
KLING_API_KEY=
RUNWAY_API_KEY=

# --- Voice (text-to-speech) ---
# Default is edge-tts — fully free, no key needed, many languages.
ELEVENLABS_API_KEY=

# --- Music / SFX ---
# Default is a synthesised ambient pad, generated locally, no key needed.
SUNO_API_KEY=
```

If you want the fully-offline voice fallback to work in a restricted
environment (no outbound network at all):
```bash
apt-get install -y espeak-ng
```

## Run a demo scene

```bash
python -m pipeline.run_demo \
  --character "A small orange fox with big round glasses and a blue backpack" \
  --story "the fox finds a glowing map in the forest" \
  --language english \
  --out demo_scene.mp4
```

Output lands in `assets/output/demo_scene.mp4`, plus `scene_script.json`
(the generated script/shot breakdown) in the same folder.

`--language` also selects the locked voice preset — see
`pipeline/providers/tts.py` → `VOICE_PRESETS` (english, english-male, urdu,
urdu-male, hindi; add more edge-tts voice names as needed).

## Project layout

```
pipeline/
  config.py          loads .env, defines shared paths
  run_demo.py         CLI entry point — orchestrates all 5 stages
  assemble.py         final ffmpeg/moviepy assembly
  providers/
    llm.py            script + shot breakdown
    image_gen.py       character reference sheet + per-shot images
    video_gen.py       image-to-video (Ken Burns fallback + paid hooks)
    tts.py             voice generation (edge-tts + espeak-ng fallback)
    music.py           background music (synthesised pad + paid hook)
assets/
  characters/          generated reference sheet + shot images
  video/                per-shot video clips
  audio/                voice lines + music bed
  output/               final assembled video + script JSON
```

## Deploying (Render)

This is a one-shot script (it generates one video and exits) — not a
persistent server. **Do not** create it as a plain "Web Service" with
Node.js selected (that was the cause of the first failed deploy: Render
defaulted to `npm install`, which fails immediately because there's no
`package.json` — this is a Python project).

Correct path — use the `render.yaml` already in this repo:

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. In the Render dashboard, choose **New → Blueprint**, not "Web Service",
   and point it at this repo. Render reads `render.yaml` and creates a
   **Cron Job** with the Python environment, correct build command
   (`pip install -r requirements.txt` + `espeak-ng`), and placeholder
   env vars automatically — no manual "Environment: Python" clicking.
3. In that Cron Job's **Environment** tab, fill in any real API keys you
   have (`GEMINI_API_KEY`, `KLING_API_KEY`, etc.) and the actual
   `CHARACTER_DESC` / `STORY_IDEA` / `VOICE_LANGUAGE` for your demo.
   Everything is optional — it runs fine with just the defaults.
4. The job's schedule is set to a date that never occurs (Feb 31st) on
   purpose, so it only runs when you click **Trigger Run** — this isn't
   meant to auto-generate videos on a timer.
5. After a run finishes, grab the output file from that job's **Shell**
   tab at `assets/output/demo.mp4` (Render jobs don't have a public URL
   to download from directly).

If you'd rather not use the Blueprint flow, you can still create a plain
**Background Worker**, but you must manually set **Environment: Python 3**
in its settings (Render won't auto-detect this), and trigger runs via its
Shell tab rather than expecting it to serve anything.

## Upgrading a stage later (example: real AI video via Kling)

1. Get a `KLING_API_KEY`, add it to `.env` / Render env vars.
2. Fill in the request/response handling inside
   `pipeline/providers/video_gen.py` → `_kling_generate()` — it's stubbed
   with a clear `TODO` and already wired into the fallback chain, so
   nothing else in the pipeline needs to change.

Same pattern for ElevenLabs (`tts.py`), Suno (`music.py`), and
Gemini/Groq (`llm.py`, already fully wired — just add the key).
