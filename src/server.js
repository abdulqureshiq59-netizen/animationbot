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

const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
    max-width: 640px; margin: 48px auto; padding: 0 20px;
    color: #1a1a2e; background: #fafafa; line-height: 1.5;
  }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .sub { color: #666; margin-top: 0; margin-bottom: 2rem; }
  label { display: block; font-weight: 600; margin-bottom: 0.3rem; font-size: 0.9rem; }
  .field { margin-bottom: 1.25rem; }
  textarea, input[type=text], input:not([type]), select {
    width: 100%; box-sizing: border-box; padding: 10px 12px;
    border: 1px solid #ccc; border-radius: 8px; font-size: 1rem;
    font-family: inherit; background: #fff; color: #1a1a2e;
  }
  textarea:focus, input:focus, select:focus { outline: 2px solid #4f46e5; border-color: #4f46e5; }
  button {
    background: #4f46e5; color: #fff; border: none; border-radius: 8px;
    padding: 12px 24px; font-size: 1rem; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #4338ca; }
  .card {
    border: 1px solid #e5e5e5; border-radius: 12px; padding: 20px;
    background: #fff; margin-top: 1rem;
  }
  .status-badge {
    display: inline-block; padding: 4px 10px; border-radius: 999px;
    font-size: 0.85rem; font-weight: 600;
  }
  .status-running { background: #fef3c7; color: #92400e; }
  .status-done { background: #d1fae5; color: #065f46; }
  .status-failed { background: #fee2e2; color: #991b1b; }
  video { width: 100%; border-radius: 8px; margin-top: 1rem; }
  code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
`;

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AISA — AI Cartoon Demo</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <h1>AISA — AI Cartoon Demo</h1>
  <p class="sub">Turn a character + a story idea into a short AI-animated scene.</p>
  <form action="/generate" method="post">
    <div class="field">
      <label>Character description</label>
      <textarea name="character" rows="3" required>A small orange fox with big round glasses and a blue backpack</textarea>
    </div>
    <div class="field">
      <label>Story idea</label>
      <input name="story" required value="the fox finds a glowing map in the forest">
    </div>
    <div class="field">
      <label>Voice language</label>
      <select name="language">
        <option value="english">English</option>
        <option value="english-male">English (male)</option>
        <option value="urdu">Urdu</option>
        <option value="urdu-male">Urdu (male)</option>
        <option value="hindi">Hindi</option>
      </select>
    </div>
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
    const refresh = job.status === "running" ? `<meta http-equiv="refresh" content="5">` : "";
    const badgeClass =
      job.status === "done" ? "status-done" : job.status === "failed" ? "status-failed" : "status-running";

    let body;
    if (job.status === "done") {
      body = `
        <p><span class="status-badge ${badgeClass}">Done</span></p>
        <video controls src="/download/${job.outputFile}"></video>
        <p><a href="/download/${job.outputFile}" download>Download video</a></p>
        <p><a href="/">&larr; Generate another</a></p>`;
    } else if (job.status === "failed") {
      body = `
        <p><span class="status-badge ${badgeClass}">Failed</span></p>
        <p><code>${job.error || "unknown error"}</code></p>
        <p><a href="/">&larr; Try again</a></p>`;
    } else {
      body = `
        <p><span class="status-badge ${badgeClass}">Generating…</span></p>
        <p class="sub">This usually takes a minute or two. This page refreshes itself every 5 seconds.</p>`;
    }

    return res.type("html").send(`<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${refresh}
<title>AISA — Demo status</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <h1>AISA — AI Cartoon Demo</h1>
  <div class="card">${body}</div>
</body>
</html>`);
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
