/**
 * Combines per-shot video clips + per-shot voice lines + a background
 * music bed into one final demo video, using the system `ffmpeg`/`ffprobe`
 * binaries directly (no extra native deps needed).
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as config from "./config.js";

const execFileAsync = promisify(execFile);

async function getDuration(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

async function buildShotWithAudio(videoPath, voicePath, shotNumber, tmpDir) {
  const outPath = path.join(tmpDir, `shot_with_audio_${String(shotNumber).padStart(2, "0")}.mp4`);

  if (voicePath) {
    // Keep the shot's own video length (don't let -shortest cut the
    // video down to a shorter voice line); pad audio with silence if the
    // voice line is shorter, truncate it if longer.
    const videoDuration = await getDuration(videoPath);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-i", voicePath,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-af", "apad",
      "-t", String(videoDuration),
      outPath,
    ]);
  } else {
    const videoDuration = await getDuration(videoPath);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-f", "lavfi",
      "-t", String(videoDuration),
      "-i", "anullsrc=channel_layout=mono:sample_rate=44100",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      outPath,
    ]);
  }
  return outPath;
}

export async function assembleFinalVideo(shotVideoPaths, shotVoicePaths, musicPath, outputName) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aisa-assemble-"));

  try {
    const shotsWithAudio = [];
    for (let i = 0; i < shotVideoPaths.length; i++) {
      const voice = shotVoicePaths[i] && (await fs.stat(shotVoicePaths[i]).catch(() => null)) ? shotVoicePaths[i] : null;
      shotsWithAudio.push(await buildShotWithAudio(shotVideoPaths[i], voice, i + 1, tmpDir));
    }

    const listPath = path.join(tmpDir, "concat_list.txt");
    const listContent = shotsWithAudio.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await fs.writeFile(listPath, listContent);

    const concatPath = path.join(tmpDir, "concatenated.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      concatPath,
    ]);

    const outPath = path.join(config.OUTPUT_DIR, outputName);

    const musicExists = musicPath && (await fs.stat(musicPath).catch(() => null));
    if (musicExists) {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i", concatPath,
        "-stream_loop", "-1",
        "-i", musicPath,
        "-filter_complex",
        "[1:a]volume=0.25[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        outPath,
      ]);
    } else {
      await fs.copyFile(concatPath, outPath);
    }

    return outPath;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
