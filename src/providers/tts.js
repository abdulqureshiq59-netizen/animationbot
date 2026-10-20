/**
 * Voice generation.
 *
 * Default: msedge-tts (wraps Microsoft Edge's free read-aloud service) —
 * no API key, many languages, and the same voice name gives a consistent
 * "locked" voice across shots and episodes (matches the proposal's "one
 * locked voice model per character" requirement).
 *
 * If ELEVENLABS_API_KEY is set, that path is tried first for higher-
 * quality cloned voices; stubbed with a TODO since voice cloning needs a
 * sample-upload step specific to your account.
 *
 * Last resort (no network at all, e.g. a locked-down sandbox): espeak-ng,
 * fully offline, robotic but keeps the pipeline runnable everywhere.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import * as config from "../config.js";

const execFileAsync = promisify(execFile);

// A few good free msedge-tts voices per language. Pick one and keep using
// the SAME voice name across every shot/episode to keep the character's
// voice identical throughout, per the proposal's requirement.
export const VOICE_PRESETS = {
  english: "en-US-AriaNeural",
  "english-male": "en-US-GuyNeural",
  urdu: "ur-PK-UzmaNeural",
  "urdu-male": "ur-PK-AsadNeural",
  hindi: "hi-IN-SwaraNeural",
};

async function elevenlabsGenerate(_text, _outPath, _voice) {
  // TODO: wire up ElevenLabs TTS once you have a key + a cloned voice id.
  throw new Error("ElevenLabs provider not wired up yet");
}

async function edgeTtsGenerate(text, outPath, voice) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  // NOTE: msedge-tts's toFile() takes a DIRECTORY, not a file path — it
  // always writes "audio.mp3" (+ a metadata file) inside that directory.
  // We give it our own per-job audio dir, then move the result to our
  // own per-shot filename so concurrent/sequential shots don't overwrite
  // each other before each one is renamed.
  const dir = path.dirname(outPath);
  const { audioFilePath } = await tts.toFile(dir, text);
  await fs.rename(audioFilePath, outPath);
  return outPath;
}

async function espeakFallback(text, outPath) {
  const wavPath = outPath.replace(/\.[^.]+$/, ".wav");
  try {
    await execFileAsync("espeak-ng", ["-s", "150", "-w", wavPath, text]);
    return wavPath;
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log("[tts] espeak-ng is not installed on this host either — using Google Translate's free unofficial TTS endpoint as a last resort.");
      return googleTranslateTtsFallback(text, wavPath);
    }
    throw e;
  }
}

async function googleTranslateTtsFallback(text, outPath) {
  // Last-resort, fully free, no-key fallback that needs no system binary at
  // all: Google Translate's unofficial "say it" endpoint. Undocumented and
  // rate-limited (~200 chars per request), but works anywhere with
  // outbound internet and keeps the pipeline from hard-failing.
  const mp3Path = outPath.replace(/\.[^.]+$/, ".mp3");
  const url =
    "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en" +
    `&q=${encodeURIComponent(text.slice(0, 200))}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`Google Translate TTS HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(mp3Path, buf);
  return mp3Path;
}

export async function generateVoiceLine(text, shotNumber, voiceKey = "english", audioDir) {
  const outPath = path.join(audioDir, `voice_${String(shotNumber).padStart(2, "0")}.mp3`);
  if (!text || !text.trim()) return "";

  const voiceName = VOICE_PRESETS[voiceKey.toLowerCase()] || VOICE_PRESETS.english;

  if (config.ELEVENLABS_API_KEY) {
    try {
      return await elevenlabsGenerate(text, outPath, voiceName);
    } catch (e) {
      console.log(`[tts] ElevenLabs failed (${e.message}), falling back to msedge-tts...`);
    }
  }

  try {
    return await edgeTtsGenerate(text, outPath, voiceName);
  } catch (e) {
    console.log(`[tts] msedge-tts unreachable (${e.message}); using offline espeak-ng fallback.`);
    return espeakFallback(text, outPath);
  }
}
