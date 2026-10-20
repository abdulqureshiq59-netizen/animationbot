"""Central config: loads .env and exposes which providers are active."""
import os
from dotenv import load_dotenv

load_dotenv()


def _get(name: str) -> str:
    return (os.getenv(name) or "").strip()


GEMINI_API_KEY = _get("GEMINI_API_KEY")
GROQ_API_KEY = _get("GROQ_API_KEY")
STABILITY_API_KEY = _get("STABILITY_API_KEY")
KLING_API_KEY = _get("KLING_API_KEY")
RUNWAY_API_KEY = _get("RUNWAY_API_KEY")
ELEVENLABS_API_KEY = _get("ELEVENLABS_API_KEY")
SUNO_API_KEY = _get("SUNO_API_KEY")

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "output")
CHARACTERS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "characters")
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "audio")
VIDEO_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "video")

for d in (OUTPUT_DIR, CHARACTERS_DIR, AUDIO_DIR, VIDEO_DIR):
    os.makedirs(d, exist_ok=True)
