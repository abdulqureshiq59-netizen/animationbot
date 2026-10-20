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
  const dir = path.dirname(outPath);
  const base = path.basename(outPath, path.extname(outPath));
  const { audioFilePath } = await tts.toFile(path.join(dir, base), text);
  return audioFilePath;
}

async function espeakFallback(text, outPath) {
  const wavPath = outPath.replace(/\.[^.]+$/, ".wav");
  await execFileAsync("espeak-ng", ["-s", "150", "-w", wavPath, text]);
  return wavPath;
}

export async function generateVoiceLine(text, shotNumber, voiceKey = "english") {
  const outPath = path.join(config.AUDIO_DIR, `voice_${String(shotNumber).padStart(2, "0")}.mp3`);
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
