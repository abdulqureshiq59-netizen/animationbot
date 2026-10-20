/**
 * Character reference sheet + per-shot image generation.
 *
 * Default: Pollinations.ai — free, no API key, a simple HTTP GET that
 * returns an image. Good enough for a first stylised-cartoon demo. If
 * STABILITY_API_KEY is set later, wire that path in the same way without
 * changing the rest of the pipeline.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { Jimp, loadFont, rgbaToInt } from "jimp";
import { SANS_32_WHITE, SANS_16_BLACK } from "jimp/fonts";
import * as config from "../config.js";

const STYLE_SUFFIX =
  ", 3D rendered cartoon style, Pixar-like stylised animation, clean lighting, " +
  "vibrant colors, consistent character design, high quality render";

async function pollinationsFetch(prompt, outPath, seed, width = 768, height = 576) {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${width}&height=${height}&seed=${seed}&nologo=true`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!resp.ok) throw new Error(`Pollinations HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(outPath, buf);
  return outPath;
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxCharsPerLine) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

async function offlinePlaceholder(prompt, outPath, seed, width = 768, height = 576) {
  // Last-resort fallback when no image-generation network is reachable at
  // all (e.g. a locked-down sandbox). Draws a simple labelled card so the
  // rest of the pipeline (video/voice/assembly) can still be tested
  // end-to-end. On a normal server (e.g. Render) Pollinations will be
  // reachable and this is never used.
  let r = seed;
  const rand = () => {
    r = (r * 1103515245 + 12345) % 2147483648;
    return r / 2147483648;
  };
  const bg = rgbaToInt(
    60 + Math.floor(rand() * 140),
    60 + Math.floor(rand() * 140),
    60 + Math.floor(rand() * 140),
    255
  );
  const img = new Jimp({ width, height, color: bg });

  const font = await loadFont(SANS_32_WHITE);
  const smallFont = await loadFont(SANS_16_BLACK);
  img.print({ font, x: 20, y: 20, text: wrapText(prompt, 40), maxWidth: width - 40 });
  img.print({
    font: smallFont,
    x: 20,
    y: height - 40,
    text: "[placeholder image - image-gen network unreachable]",
  });

  await img.write(outPath);
  return outPath;
}

async function fetchImage(prompt, outPath, seed, width = 768, height = 576) {
  try {
    return await pollinationsFetch(prompt, outPath, seed, width, height);
  } catch (e) {
    console.log(`[imageGen] Pollinations unreachable (${e.message}); using offline placeholder image.`);
    return offlinePlaceholder(prompt, outPath, seed, width, height);
  }
}

export async function generateCharacterSheet(characterDescription, seed = 42) {
  const angles = [
    ["front", "front view, full body, neutral expression"],
    ["threequarter", "three-quarter view, full body, slight smile"],
    ["side", "side profile view, full body"],
    ["expression", "close-up portrait, happy excited expression"],
  ];
  const paths = [];
  for (const [key, angleDesc] of angles) {
    const prompt = `${characterDescription}, ${angleDesc}${STYLE_SUFFIX}`;
    const outPath = path.join(config.CHARACTERS_DIR, `reference_${key}.png`);
    await fetchImage(prompt, outPath, seed, 768, 768);
    paths.push(outPath);
  }
  return paths;
}

export async function generateShotImage(shotDescription, characterDescription, seed, shotNumber) {
  const prompt = `${characterDescription}, ${shotDescription}${STYLE_SUFFIX}`;
  const outPath = path.join(config.CHARACTERS_DIR, `shot_${String(shotNumber).padStart(2, "0")}.png`);
  await fetchImage(prompt, outPath, seed + shotNumber, 1024, 576);
  return outPath;
}
