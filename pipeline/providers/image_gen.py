"""Character reference sheet + per-shot image generation.

Default: Pollinations.ai — free, no API key, simple HTTP GET that returns
an image. Good enough for a first stylised-cartoon demo. If STABILITY_API_KEY
is set later, that path can be wired in the same way without changing the
rest of the pipeline.
"""
import os
import textwrap
import urllib.parse
import requests
from PIL import Image, ImageDraw, ImageFont

from .. import config

POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}"

STYLE_SUFFIX = (
    ", 3D rendered cartoon style, Pixar-like stylised animation, clean lighting, "
    "vibrant colors, consistent character design, high quality render"
)


def _pollinations_fetch(prompt: str, out_path: str, seed: int, width=768, height=768) -> str:
    encoded = urllib.parse.quote(prompt)
    url = POLLINATIONS_URL.format(prompt=encoded)
    params = {"width": width, "height": height, "seed": seed, "nologo": "true"}
    resp = requests.get(url, params=params, timeout=90)
    resp.raise_for_status()
    with open(out_path, "wb") as f:
        f.write(resp.content)
    return out_path


def _offline_placeholder(prompt: str, out_path: str, seed: int, width=768, height=768) -> str:
    """Last-resort fallback when no image-generation network is reachable
    at all (e.g. a locked-down sandbox). Draws a simple labelled card so
    the rest of the pipeline (video/voice/assembly) can still be tested
    end-to-end. On a normal server (e.g. Render) Pollinations will be
    reachable and this is never used."""
    import random as _random

    rng = _random.Random(seed)
    bg = (
        rng.randint(60, 200),
        rng.randint(60, 200),
        rng.randint(60, 200),
    )
    img = Image.new("RGB", (width, height), color=bg)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28
        )
    except Exception:
        font = ImageFont.load_default()

    wrapped = textwrap.fill(prompt, width=40)
    draw.multiline_text((30, 30), wrapped, fill=(255, 255, 255), font=font, spacing=8)
    draw.text((30, height - 40), "[placeholder image — image-gen network unreachable]", fill=(255, 230, 0))
    img.save(out_path)
    return out_path


def _fetch_image(prompt: str, out_path: str, seed: int, width=768, height=768) -> str:
    try:
        return _pollinations_fetch(prompt, out_path, seed, width, height)
    except Exception as e:
        print(f"[image_gen] Pollinations unreachable ({e}); using offline placeholder image.")
        return _offline_placeholder(prompt, out_path, seed, width, height)


def generate_character_sheet(character_description: str, seed: int = 42) -> list:
    """Generates a small multi-angle reference sheet for the character.
    Returns a list of file paths (front, 3/4, side, expression)."""
    angles = [
        ("front", "front view, full body, neutral expression"),
        ("threequarter", "three-quarter view, full body, slight smile"),
        ("side", "side profile view, full body"),
        ("expression", "close-up portrait, happy excited expression"),
    ]
    paths = []
    for key, angle_desc in angles:
        prompt = f"{character_description}, {angle_desc}{STYLE_SUFFIX}"
        out_path = os.path.join(config.CHARACTERS_DIR, f"reference_{key}.png")
        _fetch_image(prompt, out_path, seed=seed)
        paths.append(out_path)
    return paths


def generate_shot_image(shot_description: str, character_description: str, seed: int, shot_number: int) -> str:
    prompt = f"{character_description}, {shot_description}{STYLE_SUFFIX}"
    out_path = os.path.join(config.CHARACTERS_DIR, f"shot_{shot_number:02d}.png")
    _fetch_image(prompt, out_path, seed=seed + shot_number, width=1024, height=576)
    return out_path
