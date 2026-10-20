/**
 * Shot (image-to-video) generation.
 *
 * Default fallback (no key needed): animates a still image with a Ken
 * Burns pan/zoom using ffmpeg's `zoompan` filter directly (constant output
 * resolution, no moviepy/Python needed).
 *
 * If KLING_API_KEY or RUNWAY_API_KEY is set, those are tried first for
 * actual AI-generated motion; both are stubbed with clear TODOs since
 * their public APIs/auth flows change often — fill in the request shape
 * for whichever service you sign up for.
 */
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as config from "../config.js";

const execFileAsync = promisify(execFile);

async function klingGenerate(_imagePath, _outPath, _duration) {
  // TODO: wire up Kling's image-to-video endpoint once you have a key.
  throw new Error("Kling provider not wired up yet");
}

async function runwayGenerate(_imagePath, _outPath, _duration) {
  // TODO: wire up Runway's image-to-video endpoint once you have a key.
  throw new Error("Runway provider not wired up yet");
}

async function kenBurnsFallback(imagePath, outPath, duration) {
  const fps = 24;
  const frames = Math.max(1, Math.round(duration * fps));
  const zoomIn = Math.random() < 0.5;
  const zoomExpr = zoomIn
    ? `zoom+0.0015`
    : `if(eq(on,0),1.15,max(1.0,zoom-0.0015))`;

  const width = 1024;
  const height = 576;

  const args = [
    "-y",
    "-loop", "1",
    "-i", imagePath,
    "-vf",
    `scale=${width * 2}:${height * 2},zoompan=z='${zoomExpr}':d=${frames}:s=${width}x${height}:fps=${fps}`,
    "-t", String(duration),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outPath,
  ];

  await execFileAsync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 64 });
  return outPath;
}

export async function generateShotVideo(imagePath, shotNumber, duration) {
  const outPath = path.join(config.VIDEO_DIR, `shot_${String(shotNumber).padStart(2, "0")}.mp4`);

  if (config.KLING_API_KEY) {
    try {
      return await klingGenerate(imagePath, outPath, duration);
    } catch (e) {
      console.log(`[videoGen] Kling failed (${e.message}), trying next provider...`);
    }
  }

  if (config.RUNWAY_API_KEY) {
    try {
      return await runwayGenerate(imagePath, outPath, duration);
    } catch (e) {
      console.log(`[videoGen] Runway failed (${e.message}), falling back to Ken Burns...`);
    }
  }

  console.log(`[videoGen] Using free Ken Burns pan/zoom fallback for shot ${shotNumber}.`);
  return kenBurnsFallback(imagePath, outPath, duration);
}
