"""Combines per-shot video clips + per-shot voice lines + a background
music bed into one final demo video."""
import os

from moviepy.editor import (
    VideoFileClip,
    AudioFileClip,
    CompositeAudioClip,
    concatenate_videoclips,
)

from . import config


def assemble_final_video(shot_video_paths: list, shot_voice_paths: list, music_path: str, output_name: str) -> str:
    clips = []
    for video_path, voice_path in zip(shot_video_paths, shot_voice_paths):
        clip = VideoFileClip(video_path)
        if voice_path and os.path.exists(voice_path):
            voice_clip = AudioFileClip(voice_path)
            # Stretch shot duration slightly if the voice line runs longer
            # than the generated clip, so dialogue is never cut off.
            if voice_clip.duration > clip.duration:
                clip = clip.set_duration(voice_clip.duration)
            clip = clip.set_audio(voice_clip)
        clips.append(clip)

    final = concatenate_videoclips(clips, method="compose")

    if music_path and os.path.exists(music_path):
        music = AudioFileClip(music_path).volumex(0.25)
        if music.duration < final.duration:
            loops = int(final.duration // music.duration) + 1
            music = CompositeAudioClip([music] * loops).subclip(0, final.duration)
        else:
            music = music.subclip(0, final.duration)

        existing_audio = final.audio
        if existing_audio is not None:
            combined_audio = CompositeAudioClip([existing_audio, music])
        else:
            combined_audio = music
        final = final.set_audio(combined_audio)

    out_path = os.path.join(config.OUTPUT_DIR, output_name)
    final.write_videofile(out_path, fps=24, codec="libx264", audio_codec="aac", verbose=False, logger=None)
    return out_path
