"""Background music / ambience.

Default: a synthesised soft ambient pad generated locally with numpy — no
download, no API key, no licensing to worry about. It's simple (not a real
composed track) but it's free, safe to use, and good enough to give the
demo a "produced" feel instead of dead silence.

If SUNO_API_KEY is set later, swap in a real AI-music call here.
"""
import os
import numpy as np
from scipy.io import wavfile

from .. import config

SAMPLE_RATE = 44100

# A gentle, warm chord progression (Cmaj7 -> Fmaj7 -> Cmaj7 -> G) in Hz,
# low enough in the mix to sit under dialogue.
CHORDS = [
    [261.63, 329.63, 392.00, 493.88],  # C major 7
    [349.23, 440.00, 523.25, 659.25],  # F major 7
    [261.63, 329.63, 392.00, 493.88],  # C major 7
    [392.00, 493.88, 587.33, 739.99],  # G major 7
]


def _suno_generate(duration: float, out_path: str) -> str:
    raise NotImplementedError("Suno provider not wired up yet")


def _synth_pad(duration: float, out_path: str) -> str:
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    audio = np.zeros(n_samples)

    chord_len = duration / len(CHORDS)
    for i, chord in enumerate(CHORDS):
        start = int(i * chord_len * SAMPLE_RATE)
        end = int((i + 1) * chord_len * SAMPLE_RATE)
        segment_t = t[start:end] if end <= n_samples else t[start:]
        for freq in chord:
            audio[start:start + len(segment_t)] += 0.04 * np.sin(2 * np.pi * freq * segment_t)

    # Gentle fade in/out so loops/cuts don't click.
    fade_samples = int(0.5 * SAMPLE_RATE)
    fade_in = np.linspace(0, 1, min(fade_samples, n_samples))
    fade_out = fade_in[::-1]
    audio[: len(fade_in)] *= fade_in
    audio[-len(fade_out):] *= fade_out

    audio = np.clip(audio, -1, 1)
    pcm = (audio * 32767).astype(np.int16)
    wavfile.write(out_path, SAMPLE_RATE, pcm)
    return out_path


def generate_background_music(duration: float) -> str:
    out_path = os.path.join(config.AUDIO_DIR, "music_bed.wav")

    if config.SUNO_API_KEY:
        try:
            return _suno_generate(duration, out_path)
        except Exception as e:
            print(f"[music] Suno failed ({e}), falling back to synthesised pad...")

    print("[music] Using free synthesised ambient pad (no key needed).")
    return _synth_pad(max(duration, 1.0), out_path)
