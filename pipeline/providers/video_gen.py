"""Shot (image-to-video) generation.

Default fallback (no key needed): animates a still image with a Ken Burns
pan/zoom using moviepy — gives real motion on screen for a first demo.

If KLING_API_KEY or RUNWAY_API_KEY is set, those are tried first for actual
AI-generated motion; both are stubbed with clear TODOs since their public
APIs/auth flows change often — fill in the request shape for whichever
service you sign up for.
"""
import os
import random

from moviepy.editor import ImageClip, vfx

from .. import config


def _kling_generate(image_path: str, out_path: str, duration: float) -> str:
    # TODO: wire up Kling's image-to-video endpoint once you have a key.
    # Left unimplemented on purpose — raises so the pipeline falls back.
    raise NotImplementedError("Kling provider not wired up yet")


def _runway_generate(image_path: str, out_path: str, duration: float) -> str:
    # TODO: wire up Runway's image-to-video endpoint once you have a key.
    raise NotImplementedError("Runway provider not wired up yet")


def _ken_burns_fallback(image_path: str, out_path: str, duration: float) -> str:
    """Free, no-key fallback: subtle zoom + pan on the still image, cropped
    back to a fixed output size every frame so the encoder gets a constant
    resolution (varying frame sizes corrupt the mp4 output)."""
    base_clip = ImageClip(image_path)
    out_w, out_h = base_clip.w, base_clip.h
    clip = base_clip.set_duration(duration)

    zoom_start = 1.0
    zoom_end = random.choice([1.1, 1.15])
    direction = random.choice(["in", "out"])
    if direction == "out":
        zoom_start, zoom_end = zoom_end, zoom_start

    def zoom(t):
        progress = (t / duration) if duration else 0
        return zoom_start + (zoom_end - zoom_start) * progress

    animated = clip.fx(vfx.resize, zoom)

    # Crop every frame back to (out_w, out_h), centered, so the encoder
    # always gets a constant resolution.
    def make_frame(t):
        frame = animated.get_frame(t)
        h, w = frame.shape[:2]
        x1 = max(0, (w - out_w) // 2)
        y1 = max(0, (h - out_h) // 2)
        return frame[y1:y1 + out_h, x1:x1 + out_w]

    from moviepy.editor import VideoClip
    fixed = VideoClip(make_frame, duration=duration)
    fixed.write_videofile(
        out_path, fps=24, codec="libx264", audio=False, verbose=False, logger=None
    )
    return out_path


def generate_shot_video(image_path: str, shot_number: int, duration: float) -> str:
    out_path = os.path.join(config.VIDEO_DIR, f"shot_{shot_number:02d}.mp4")

    if config.KLING_API_KEY:
        try:
            return _kling_generate(image_path, out_path, duration)
        except Exception as e:
            print(f"[video_gen] Kling failed ({e}), trying next provider...")

    if config.RUNWAY_API_KEY:
        try:
            return _runway_generate(image_path, out_path, duration)
        except Exception as e:
            print(f"[video_gen] Runway failed ({e}), falling back to Ken Burns...")

    print(f"[video_gen] Using free Ken Burns pan/zoom fallback for shot {shot_number}.")
    return _ken_burns_fallback(image_path, out_path, duration)
