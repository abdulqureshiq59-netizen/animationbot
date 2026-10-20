"""Script + shot-breakdown generation.

Tries, in order: Gemini (free tier) -> Groq (free tier) -> a built-in
offline template writer that needs no key at all, so the pipeline never
hard-fails just because no LLM key is configured yet.
"""
import json
import re
import requests

from .. import config


SYSTEM_PROMPT = """You are a children's cartoon scriptwriter. Given a character
description and a one-line story idea, write ONE short scene (30-60 seconds
of screen time) broken into 3-5 shots. Reply with ONLY valid JSON, no markdown
fences, in this exact shape:

{
  "title": "short scene title",
  "voice_line_language": "English",
  "shots": [
    {
      "shot_number": 1,
      "description": "visual description of the shot, for an image generator",
      "camera": "e.g. wide shot / close-up / pan left",
      "dialogue": "line of dialogue spoken by the character, or empty string",
      "duration_seconds": 6
    }
  ]
}
"""


def _call_gemini(character: str, story_idea: str, language: str) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-1.5-flash:generateContent?key={config.GEMINI_API_KEY}"
    )
    prompt = (
        f"{SYSTEM_PROMPT}\n\nCharacter: {character}\nStory idea: {story_idea}\n"
        f"Voiceover language: {language}"
    )
    resp = requests.post(
        url,
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_groq(character: str, story_idea: str, language: str) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {config.GROQ_API_KEY}"}
    prompt = (
        f"Character: {character}\nStory idea: {story_idea}\n"
        f"Voiceover language: {language}"
    )
    resp = requests.post(
        url,
        headers=headers,
        json={
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def _offline_template(character: str, story_idea: str, language: str) -> dict:
    """No-key fallback: a simple deterministic 4-shot scene so the pipeline
    still produces a real demo even with zero LLM configured."""
    return {
        "title": "A Small Discovery",
        "voice_line_language": language,
        "shots": [
            {
                "shot_number": 1,
                "description": f"{character}, standing in a bright open field, looking curiously off-screen.",
                "camera": "wide shot",
                "dialogue": f"So... {story_idea}",
                "duration_seconds": 6,
            },
            {
                "shot_number": 2,
                "description": f"{character}, close up, eyes widening with surprise and excitement.",
                "camera": "close-up",
                "dialogue": "Wait... is that really happening?",
                "duration_seconds": 5,
            },
            {
                "shot_number": 3,
                "description": f"{character}, walking forward confidently, determined expression.",
                "camera": "tracking shot",
                "dialogue": "Okay. Let's find out.",
                "duration_seconds": 6,
            },
            {
                "shot_number": 4,
                "description": f"{character}, smiling warmly at the camera, arms open.",
                "camera": "medium shot",
                "dialogue": "This is just the beginning.",
                "duration_seconds": 5,
            },
        ],
    }


def _parse_json(raw: str) -> dict:
    cleaned = re.sub(r"^```(json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    return json.loads(cleaned)


def generate_scene(character: str, story_idea: str, language: str = "English") -> dict:
    """Returns a dict: {title, voice_line_language, shots: [...]}"""
    if config.GEMINI_API_KEY:
        try:
            return _parse_json(_call_gemini(character, story_idea, language))
        except Exception as e:
            print(f"[llm] Gemini failed ({e}), trying next provider...")

    if config.GROQ_API_KEY:
        try:
            return _parse_json(_call_groq(character, story_idea, language))
        except Exception as e:
            print(f"[llm] Groq failed ({e}), falling back to offline template...")

    print("[llm] No working LLM key configured — using built-in offline scene template.")
    return _offline_template(character, story_idea, language)
