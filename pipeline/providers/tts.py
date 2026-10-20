"""Voice generation.

Default: edge-tts — completely free, no API key, many languages/voices,
and the same voice name gives a consistent "locked" voice across shots
and episodes (matches the proposal's "one locked voice model per
character" requirement).

If ELEVENLABS_API_KEY is set, that path is tried first for higher-quality
cloned voices; stubbed with a TODO since voice cloning needs a sample
upload step that's specific to your account.
"""
import asyncio
import os
import shutil
import subprocess

import edge_tts

from .. import config

# A few good free edge-tts voices to choose from per language. Pick one and
# keep using the SAME voice name across every shot/episode to keep the
# character's voice identical throughout, per the proposal's requirement.
VOICE_PRESETS = {
    "english": "en-US-AriaNeural",
    "english-male": "en-US-GuyNeural",
    "urdu": "ur-PK-UzmaNeural",
    "urdu-male": "ur-PK-AsadNeural",
    "hindi": "hi-IN-SwaraNeural",
}


def _elevenlabs_generate(text: str, out_path: str, voice: str) -> str:
    # TODO: wire up ElevenLabs TTS once you have a key + a cloned voice id.
    raise NotImplementedError("ElevenLabs provider not wired up yet")


async def _edge_tts_generate(text: str, out_path: str, voice: str) -> str:
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)
    return out_path


def _espeak_fallback(text: str, out_path: str) -> str:
    """Last-resort fully-offline voice (espeak-ng) for environments with no
    outbound network at all (e.g. a locked-down sandbox). Robotic quality,
    but it keeps the pipeline runnable end-to-end everywhere. On a normal
    server, edge-tts above will be reachable and this is never used."""
    if not shutil.which("espeak-ng"):
        raise RuntimeError("espeak-ng not installed and edge-tts unreachable")
    wav_path = out_path.rsplit(".", 1)[0] + ".wav"
    subprocess.run(
        ["espeak-ng", "-s", "150", "-w", wav_path, text],
        check=True, capture_output=True,
    )
    return wav_path


def generate_voice_line(text: str, shot_number: int, voice_key: str = "english") -> str:
    out_path = os.path.join(config.AUDIO_DIR, f"voice_{shot_number:02d}.mp3")
    if not text.strip():
        return ""

    voice_name = VOICE_PRESETS.get(voice_key.lower(), VOICE_PRESETS["english"])

    if config.ELEVENLABS_API_KEY:
        try:
            return _elevenlabs_generate(text, out_path, voice_name)
        except Exception as e:
            print(f"[tts] ElevenLabs failed ({e}), falling back to edge-tts...")

    try:
        asyncio.run(_edge_tts_generate(text, out_path, voice_name))
        return out_path
    except Exception as e:
        if os.path.exists(out_path):
            os.remove(out_path)  # edge-tts can leave a 0-byte file before failing
        print(f"[tts] edge-tts unreachable ({e}); using offline espeak-ng fallback.")
        return _espeak_fallback(text, out_path)
