/**
 * Thin web server around the pipeline, so this can run as a normal Render
 * "Web Service" (binds to $PORT, has a real HTTP endpoint) instead of a
 * one-shot CLI script. Good for showing the client a working demo link.
 *
 * Routes:
 *   GET  /                simple HTML form to kick off a generation
 *   POST /generate        { character, story, language } -> starts a job,
 *                          returns { jobId, statusUrl }
 *   GET  /status/:jobId    job status + download link once done
 *   GET  /download/:file   serves a finished video from assets/output
 */
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import * as config from "./config.js";
import { run } from "./runDemo.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const jobs = new Map(); // jobId -> { status, error, outputFile }

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head><title>AISA — AI Cartoon Demo</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto;">
  <h1>AISA — AI Cartoon Demo Pipeline</h1>
  <p>Generate a short AI-animated cartoon scene from a character description and a story idea.</p>
  <form action="/generate" method="post">
    <label>Character description<br>
      <textarea name="character" rows="3" style="width:100%" required>A small orange fox with big round glasses and a blue backpack</textarea>
    </label><br><br>
    <label>Story idea<br>
      <input name="story" style="width:100%" required value="the fox finds a glowing map in the forest">
    </label><br><br>
    <label>Voice language<br>
      <select name="language">
        <option value="english">English</option>
        <option value="english-male">English (male)</option>
        <option value="urdu">Urdu</option>
        <option value="urdu-male">Urdu (male)</option>
        <option value="hindi">Hindi</option>
      </select>
    </label><br><br>
    <button type="submit">Generate demo</button>
  </form>
</body>
</html>`);
});

app.post("/generate", async (req, res) => {
  const character = (req.body.character || "").trim();
  const story = (req.body.story || "").trim();
  const language = (req.body.language || "english").trim();

  if (!character || !story) {
    return res.status(400).json({ error: "character and story are required" });
  }

  const jobId = crypto.randomUUID();
  const outName = `${jobId}.mp4`;
  jobs.set(jobId, { status: "running", error: null, outputFile: null });

  // Run in the background; the client polls /status/:jobId.
  run(character, story, language, outName)
    .then((outPath) => {
      jobs.set(jobId, { status: "done", error: null, outputFile: path.basename(outPath) });
    })
    .catch((err) => {
      console.error(`[job ${jobId}] failed:`, err);
      jobs.set(jobId, { status: "failed", error: String(err.message || err), outputFile: null });
    });

  const statusUrl = `/status/${jobId}`;
  if (req.headers.accept && req.headers.accept.includes("text/html")) {
    res.redirect(statusUrl);
  } else {
    res.json({ jobId, statusUrl });
  }
});

app.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "unknown job id" });

  if (req.headers.accept && req.headers.accept.includes("text/html")) {
    if (job.status === "done") {
      return res.redirect(`/download/${job.outputFile}`);
    }
    return res.type("html").send(`<!doctype html><html><body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto;">
      <p>Status: <b>${job.status}</b>${job.error ? ` — ${job.error}` : ""}</p>
      <p>This page does not auto-refresh — reload it in a minute.</p>
    </body></html>`);
  }
  res.json(job);
});

app.get("/download/:file", (req, res) => {
  const filePath = path.join(config.OUTPUT_DIR, path.basename(req.params.file));
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: "file not found" });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AISA server listening on port ${PORT}`);
});
