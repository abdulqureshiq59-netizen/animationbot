import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function get(name) {
  return (process.env[name] || "").trim();
}

export const OPENAI_API_KEY = get("OPENAI_API_KEY");
export const OPENAI_MODEL = get("OPENAI_MODEL") || "gpt-4o-mini";
export const OPENAI_IMAGE_MODEL = get("OPENAI_IMAGE_MODEL") || "gpt-image-1";
export const GEMINI_API_KEY = get("GEMINI_API_KEY");
export const GROQ_API_KEY = get("GROQ_API_KEY");
export const STABILITY_API_KEY = get("STABILITY_API_KEY");
export const CLOUDFLARE_ACCOUNT_ID = get("CLOUDFLARE_ACCOUNT_ID");
export const CLOUDFLARE_API_TOKEN = get("CLOUDFLARE_API_TOKEN");
export const KLING_API_KEY = get("KLING_API_KEY");
export const RUNWAY_API_KEY = get("RUNWAY_API_KEY");
export const ELEVENLABS_API_KEY = get("ELEVENLABS_API_KEY");
export const SUNO_API_KEY = get("SUNO_API_KEY");

export const OUTPUT_DIR = path.join(ROOT, "assets", "output");
export const JOBS_DIR = path.join(ROOT, "assets", "jobs");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(JOBS_DIR, { recursive: true });

/**
 * Every generation job gets its OWN subfolder for intermediate files
 * (character images, shot videos, voice lines). Without this, two jobs
 * running around the same time would overwrite each other's fixed
 * filenames (shot_01.png, voice_01.mp3, ...) mid-write — which is exactly
 * what corrupted a shot's mp4 and crashed assembly with "moov atom not
 * found" the first time this ran on Render with two requests close
 * together.
 */
export function createJobDirs(jobId) {
  const base = path.join(JOBS_DIR, jobId);
  const dirs = {
    base,
    charactersDir: path.join(base, "characters"),
    audioDir: path.join(base, "audio"),
    videoDir: path.join(base, "video"),
  };
  for (const dir of [dirs.charactersDir, dirs.audioDir, dirs.videoDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dirs;
}
