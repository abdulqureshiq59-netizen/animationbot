import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function get(name) {
  return (process.env[name] || "").trim();
}

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
export const CHARACTERS_DIR = path.join(ROOT, "assets", "characters");
export const AUDIO_DIR = path.join(ROOT, "assets", "audio");
export const VIDEO_DIR = path.join(ROOT, "assets", "video");

for (const dir of [OUTPUT_DIR, CHARACTERS_DIR, AUDIO_DIR, VIDEO_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
