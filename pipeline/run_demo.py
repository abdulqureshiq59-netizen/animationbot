"""End-to-end demo runner.

Usage:
    python -m pipeline.run_demo \
        --character "A small orange fox with big round glasses and a blue backpack" \
        --story "the fox finds a glowing map in the forest" \
        --language english \
        --out demo_scene.mp4

Every stage has a free, no-API-key fallback, so this runs out of the box.
Add keys to .env later to swap in higher-quality providers without
touching this file.
"""
import argparse
import json
import os

from . import config
from .providers import llm, image_gen, video_gen, tts, music
from . import assemble


def run(character: str, story: str, language: str, out_name: str, seed: int = 42):
    print("== STEP 1/5: Script + shot breakdown ==")
    scene = llm.generate_scene(character, story, language=language)
    print(json.dumps(scene, indent=2))

    with open(os.path.join(config.OUTPUT_DIR, "scene_script.json"), "w") as f:
        json.dump(scene, f, indent=2)

    print("\n== STEP 2/5: Character reference sheet ==")
    ref_sheet = image_gen.generate_character_sheet(character, seed=seed)
    for p in ref_sheet:
        print(f"  -> {p}")

    shot_videos = []
    shot_voices = []

    for shot in scene["shots"]:
        n = shot["shot_number"]
        print(f"\n== STEP 3/5: Shot {n} — image ==")
        img_path = image_gen.generate_shot_image(
            shot["description"], character, seed=seed, shot_number=n
        )
        print(f"  -> {img_path}")

        print(f"== STEP 3/5: Shot {n} — video ==")
        video_path = video_gen.generate_shot_video(
            img_path, shot_number=n, duration=float(shot.get("duration_seconds", 5))
        )
        print(f"  -> {video_path}")
        shot_videos.append(video_path)

        print(f"== STEP 4/5: Shot {n} — voice ==")
        voice_path = tts.generate_voice_line(
            shot.get("dialogue", ""), shot_number=n, voice_key=language
        )
        print(f"  -> {voice_path or '(no dialogue in this shot)'}")
        shot_voices.append(voice_path)

    total_duration = sum(float(s.get("duration_seconds", 5)) for s in scene["shots"])

    print("\n== STEP 4/5: Background music ==")
    music_path = music.generate_background_music(total_duration)
    print(f"  -> {music_path}")

    print("\n== STEP 5/5: Final assembly ==")
    final_path = assemble.assemble_final_video(shot_videos, shot_voices, music_path, out_name)
    print(f"\nDone. Final demo video: {final_path}")
    return final_path


def main():
    parser = argparse.ArgumentParser(description="Generate an AI-cartoon demo scene end-to-end.")
    parser.add_argument("--character", required=True, help="Character description")
    parser.add_argument("--story", required=True, help="One-line story idea for the scene")
    parser.add_argument("--language", default="english", help="Voiceover language/voice preset key")
    parser.add_argument("--out", default="demo_scene.mp4", help="Output file name")
    parser.add_argument("--seed", type=int, default=42, help="Seed for repeatable visuals")
    args = parser.parse_args()
    run(args.character, args.story, args.language, args.out, args.seed)


if __name__ == "__main__":
    main()
