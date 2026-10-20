#!/usr/bin/env node
/**
 * End-to-end demo runner.
 *
 * Usage:
 *   node src/runDemo.js \
 *     --character "A small orange fox with big round glasses and a blue backpack" \
 *     --story "the fox finds a glowing map in the forest" \
 *     --language english \
 *     --out demo_scene.mp4
 *
 * Every stage has a free, no-API-key fallback, so this runs out of the
 * box. Add keys to .env later to swap in higher-quality providers without
 * touching this file.
 */
import fs from "node:fs/promises";
import path from "node:path";
import * as config from "./config.js";
import * as llm from "./providers/llm.js";
import * as imageGen from "./providers/imageGen.js";
import * as videoGen from "./providers/videoGen.js";
import * as tts from "./providers/tts.js";
import * as music from "./providers/music.js";
import { assembleFinalVideo } from "./assemble.js";

function parseArgs(argv) {
  const args = {
    character: null,
    story: null,
    language: "english",
    out: "demo_scene.mp4",
    seed: 42,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--character") args.character = argv[++i];
    else if (a === "--story") args.story = argv[++i];
    else if (a === "--language") args.language = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--seed") args.seed = parseInt(argv[++i], 10);
  }
  if (!args.character || !args.story) {
    console.error("Usage: node src/runDemo.js --character \"...\" --story \"...\" [--language english] [--out demo.mp4] [--seed 42]");
    process.exit(1);
  }
  return args;
}

export async function run(character, story, language, outName, seed = 42) {
  console.log("== STEP 1/5: Script + shot breakdown ==");
  const scene = await llm.generateScene(character, story, language);
  console.log(JSON.stringify(scene, null, 2));

  await fs.writeFile(
    path.join(config.OUTPUT_DIR, "scene_script.json"),
    JSON.stringify(scene, null, 2)
  );

  console.log("\n== STEP 2/5: Character reference sheet ==");
  const refSheet = await imageGen.generateCharacterSheet(character, seed);
  for (const p of refSheet) console.log(`  -> ${p}`);

  const shotVideos = [];
  const shotVoices = [];

  for (const shot of scene.shots) {
    const n = shot.shot_number;

    console.log(`\n== STEP 3/5: Shot ${n} — image ==`);
    const imgPath = await imageGen.generateShotImage(shot.description, character, seed, n);
    console.log(`  -> ${imgPath}`);

    console.log(`== STEP 3/5: Shot ${n} — video ==`);
    const videoPath = await videoGen.generateShotVideo(imgPath, n, Number(shot.duration_seconds || 5));
    console.log(`  -> ${videoPath}`);
    shotVideos.push(videoPath);

    console.log(`== STEP 4/5: Shot ${n} — voice ==`);
    const voicePath = await tts.generateVoiceLine(shot.dialogue || "", n, language);
    console.log(`  -> ${voicePath || "(no dialogue in this shot)"}`);
    shotVoices.push(voicePath);
  }

  const totalDuration = scene.shots.reduce((sum, s) => sum + Number(s.duration_seconds || 5), 0);

  console.log("\n== STEP 4/5: Background music ==");
  const musicPath = await music.generateBackgroundMusic(totalDuration);
  console.log(`  -> ${musicPath}`);

  console.log("\n== STEP 5/5: Final assembly ==");
  const finalPath = await assembleFinalVideo(shotVideos, shotVoices, musicPath, outName);
  console.log(`\nDone. Final demo video: ${finalPath}`);
  return finalPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await run(args.character, args.story, args.language, args.out, args.seed);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
