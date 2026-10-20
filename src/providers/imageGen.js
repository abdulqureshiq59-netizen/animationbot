/**
 * Character reference sheet + per-shot image generation.
 *
 * Default: Cloudflare Workers AI running FLUX.1 [schnell] — genuinely
 * free, recurring daily quota (10,000 "neurons"/day, ~170 images at
 * 1024x1024, resets 00:00 UTC), no credit card. Needs a free Cloudflare
 * account: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
 *
 * (Pollinations.ai, previously used here, started requiring a paid API
 * key/budget in 2026 — anonymous requests now 402. Left out of the
 * fallback chain for that reason; Cloudflare replaces it as the
 * no-cost-forever default.)
 *
 * If STABILITY_API_KEY is set later, wire that path in the same way
 * without changing the rest of the pipeline.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { Jimp, loadFont, rgbaToInt } from "jimp";
import { SANS_32_WHITE, SANS_16_BLACK } from "jimp/fonts";
import * as config from "../config.js";

const STYLE_SUFFIX =
  ", 3D rendered cartoon style, Pixar-like stylised animation, clean lighting, " +
  "vibrant colors, consistent character design, high quality render";

async function cloudflareFetch(prompt, outPath, seed) {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}` +
    `/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: prompt.slice(0, 2048), seed, steps: 8 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!resp.ok) throw new Error(`Cloudflare Workers AI HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data.success || !data.result || !data.result.image) {
    throw new Error(`Cloudflare Workers AI returned no image (${JSON.stringify(data.errors || data)})`);
  }
  await fs.writeFile(outPath, Buffer.from(data.result.image, "base64"));
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
  if (config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_API_TOKEN) {
    try {
      return await cloudflareFetch(prompt, outPath, seed);
    } catch (e) {
      console.log(`[imageGen] Cloudflare Workers AI failed (${e.message}); using offline placeholder image.`);
      return offlinePlaceholder(prompt, outPath, seed, width, height);
    }
  }

  console.log("[imageGen] No CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN configured; using offline placeholder image.");
  return offlinePlaceholder(prompt, outPath, seed, width, height);
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
