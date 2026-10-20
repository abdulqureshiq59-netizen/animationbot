/**
 * Background music / ambience.
 *
 * Default: a synthesised soft ambient pad generated locally in pure JS —
 * no download, no API key, no licensing to worry about. It's simple (not
 * a real composed track) but it's free, safe to use, and good enough to
 * give the demo a "produced" feel instead of dead silence.
 *
 * If SUNO_API_KEY is set later, swap in a real AI-music call here.
 */
import fs from "node:fs";
import path from "node:path";
import * as config from "../config.js";

const SAMPLE_RATE = 44100;

// A gentle, warm chord progression (Cmaj7 -> Fmaj7 -> Cmaj7 -> G) in Hz,
// low enough in the mix to sit under dialogue.
const CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // C major 7
  [349.23, 440.0, 523.25, 659.25], // F major 7
  [261.63, 329.63, 392.0, 493.88], // C major 7
  [392.0, 493.88, 587.33, 739.99], // G major 7
];

async function sunoGenerate(_duration, _outPath) {
  // TODO: wire up Suno's music-generation API once you have a key.
  throw new Error("Suno provider not wired up yet");
}

function writeWav(outPath, samples, sampleRate) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // audio format = PCM
  buffer.writeUInt16LE(1, 22); // channels = mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  fs.writeFileSync(outPath, buffer);
  return outPath;
}

function synthPad(duration, outPath) {
  const nSamples = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float64Array(nSamples);
  const chordLen = duration / CHORDS.length;

  CHORDS.forEach((chord, i) => {
    const start = Math.floor(i * chordLen * SAMPLE_RATE);
    const end = Math.min(nSamples, Math.floor((i + 1) * chordLen * SAMPLE_RATE));
    for (const freq of chord) {
      for (let n = start; n < end; n++) {
        const t = n / SAMPLE_RATE;
        samples[n] += 0.04 * Math.sin(2 * Math.PI * freq * t);
      }
    }
  });

  // Gentle fade in/out so loops/cuts don't click.
  const fadeSamples = Math.min(Math.floor(0.5 * SAMPLE_RATE), nSamples);
  for (let n = 0; n < fadeSamples; n++) {
    const g = n / fadeSamples;
    samples[n] *= g;
    samples[nSamples - 1 - n] *= g;
  }

  return writeWav(outPath, samples, SAMPLE_RATE);
}

export async function generateBackgroundMusic(duration) {
  const outPath = path.join(config.AUDIO_DIR, "music_bed.wav");

  if (config.SUNO_API_KEY) {
    try {
      return await sunoGenerate(duration, outPath);
    } catch (e) {
      console.log(`[music] Suno failed (${e.message}), falling back to synthesised pad...`);
    }
  }

  console.log("[music] Using free synthesised ambient pad (no key needed).");
  return synthPad(Math.max(duration, 1.0), outPath);
}
