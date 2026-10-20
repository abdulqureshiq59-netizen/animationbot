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
cp .env.example .env   # fill in only the keys you actually have; all optional
```

If you want the offline voice fallback to work in a restricted environment:
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

1. Push this repo to GitHub.
2. Create a new Render **Background Worker** or **Web Service** pointing
   at this repo.
3. Build command: `pip install -r requirements.txt && apt-get update && apt-get install -y espeak-ng`
   (the `espeak-ng` install is only needed as a safety-net fallback; on
   Render's normal network, edge-tts will be used directly).
4. Set any API keys you have as environment variables in Render's
   dashboard (same names as `.env.example`).
5. Run with: `python -m pipeline.run_demo --character "..." --story "..." --out demo.mp4`

## Upgrading a stage later (example: real AI video via Kling)

1. Get a `KLING_API_KEY`, add it to `.env` / Render env vars.
2. Fill in the request/response handling inside
   `pipeline/providers/video_gen.py` → `_kling_generate()` — it's stubbed
   with a clear `TODO` and already wired into the fallback chain, so
   nothing else in the pipeline needs to change.

Same pattern for ElevenLabs (`tts.py`), Suno (`music.py`), and
Gemini/Groq (`llm.py`, already fully wired — just add the key).
