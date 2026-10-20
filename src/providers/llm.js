/**
 * Script + shot-breakdown generation.
 *
 * Tries, in order: Gemini (free tier) -> Groq (free tier) -> a built-in
 * offline template writer that needs no key at all, so the pipeline never
 * hard-fails just because no LLM key is configured yet.
 */
import * as config from "../config.js";

const SYSTEM_PROMPT = `You are a children's cartoon scriptwriter. Given a character
description and a one-line story idea, write ONE short scene (30-60 seconds
of screen time) broken into 3-5 shots. Reply with ONLY valid JSON, no markdown
fences, in this exact shape:

{
  "title": "short scene title",
  "voice_line_language": "English",
  "shots": [
    {
      "shot_number": 1,
      "description": "visual description of the shot, for an image generator",
      "camera": "e.g. wide shot / close-up / pan left",
      "dialogue": "line of dialogue spoken by the character, or empty string",
      "duration_seconds": 6
    }
  ]
}`;

async function callGemini(character, story, language) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `gemini-flash-latest:generateContent?key=${config.GEMINI_API_KEY}`;
  const prompt = `${SYSTEM_PROMPT}\n\nCharacter: ${character}\nStory idea: ${story}\nVoiceover language: ${language}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
  const data = await resp.json();
  return data.candidates[0].content.parts[0].text;
}

async function callGroq(character, story, language) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const prompt = `Character: ${character}\nStory idea: ${story}\nVoiceover language: ${language}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`Groq HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content;
}

function offlineTemplate(character, story, language) {
  // No-key fallback: a simple deterministic 4-shot scene so the pipeline
  // still produces a real demo even with zero LLM configured.
  return {
    title: "A Small Discovery",
    voice_line_language: language,
    shots: [
      {
        shot_number: 1,
        description: `${character}, standing in a bright open field, looking curiously off-screen.`,
        camera: "wide shot",
        dialogue: `So... ${story}`,
        duration_seconds: 6,
      },
      {
        shot_number: 2,
        description: `${character}, close up, eyes widening with surprise and excitement.`,
        camera: "close-up",
        dialogue: "Wait... is that really happening?",
        duration_seconds: 5,
      },
      {
        shot_number: 3,
        description: `${character}, walking forward confidently, determined expression.`,
        camera: "tracking shot",
        dialogue: "Okay. Let's find out.",
        duration_seconds: 6,
      },
      {
        shot_number: 4,
        description: `${character}, smiling warmly at the camera, arms open.`,
        camera: "medium shot",
        dialogue: "This is just the beginning.",
        duration_seconds: 5,
      },
    ],
  };
}

function parseJson(raw) {
  const cleaned = raw.trim().replace(/^```(json)?|```$/gm, "").trim();
  return JSON.parse(cleaned);
}

export async function generateScene(character, story, language = "English") {
  if (config.GEMINI_API_KEY) {
    try {
      return parseJson(await callGemini(character, story, language));
    } catch (e) {
      console.log(`[llm] Gemini failed (${e.message}), retrying once in case it was a transient overload...`);
      try {
        await new Promise((r) => setTimeout(r, 3000));
        return parseJson(await callGemini(character, story, language));
      } catch (e2) {
        console.log(`[llm] Gemini failed again (${e2.message}), trying next provider...`);
      }
    }
  }

  if (config.GROQ_API_KEY) {
    try {
      return parseJson(await callGroq(character, story, language));
    } catch (e) {
      console.log(`[llm] Groq failed (${e.message}), falling back to offline template...`);
    }
  }

  console.log("[llm] No working LLM key configured — using built-in offline scene template.");
  return offlineTemplate(character, story, language);
}
