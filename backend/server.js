import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

import express from "express";
import cors from "cors";
import multer from "multer";
import { extractText } from "unpdf";
import {
  askAI,
  askAIWithImage,
  askAIAgent,
  buildImageEditPrompt,
  buildTextToImagePrompt,
} from "./aiService.js";
import Groq from "groq-sdk";
import { MongoClient, ObjectId } from "mongodb";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: [
      "https://examai-in.com",
      "https://www.examai-in.com",
      "https://ai-exam-tutor-ten.vercel.app",
      "http://localhost:5173",
      "http://10.0.2.2:5050",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE"],
  })
);
app.use(express.json({ limit: "10kb" }));

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: "Too many AI requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});
const quizLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Limit reached. Try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(apiLimiter);
app.use("/chat", aiLimiter);
app.use("/chart/generate", aiLimiter);
app.use("/image", aiLimiter);
app.use("/quiz/generate", quizLimiter);
app.use("/flashcards/generate", quizLimiter);

const upload = multer();

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing!");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI missing!");
  process.exit(1);
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const infipApiKey = process.env.INFIP_API_KEY || "";

if (!infipApiKey) {
  console.warn("⚠️  INFIP_API_KEY not set — image generation will fail.");
}

// ── MONGODB ───────────────────────────────────────────────────────────────────
let db;
const client = new MongoClient(process.env.MONGODB_URI);
async function connectDB() {
  await client.connect();
  db = client.db("examai");
  console.log("✅ MongoDB connected");
}
connectDB();

const getChats = () => db.collection("chats");
const getQuizResults = () => db.collection("quiz_results");
const getPlanners = () => db.collection("study_planners");
const getFlashcards = () => db.collection("flashcards");

// ── MOBILE APP CONFIGURATION ──────────────────────────────────────────────────
app.get("/mobile/config", (req, res) => {
  res.json({
    minVersion: 1,
    currentVersion: 1,
    maintenanceMode: false,
    features: { aiChat: true, voiceMode: true },
  });
});

// ── LIVE SEARCH CACHE (1 hour) ────────────────────────────────────────────────
const searchCache = new Map();
const SEARCH_CACHE_DURATION = 60 * 60 * 1000;

const fetchLiveSearchContext = async (query) => {
  if (!process.env.SERPER_API_KEY) return "";
  const cached = searchCache.get(query);
  const now = Date.now();
  if (cached && now - cached.timestamp < SEARCH_CACHE_DURATION)
    return cached.data;
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    const data = await response.json();
    if (!data.organic?.length) return "";
    const results = data.organic
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\nSource: ${r.link}`);
    const formatted = `LIVE SEARCH RESULTS:\n\n${results.join("\n\n")}`;
    searchCache.set(query, { data: formatted, timestamp: now });
    return formatted;
  } catch (err) {
    console.error("Serper error:", err.message);
    return "";
  }
};

// ── WORLD BANK DATA FETCHER ───────────────────────────────────────────────────
const WORLD_BANK_INDICATORS = {
  GDP: "NY.GDP.MKTP.CD",
  INFLATION: "FP.CPI.TOTL.ZG",
  POPULATION: "SP.POP.TOTL",
  LITERACY: "SE.ADT.LITR.ZS",
  UNEMPLOYMENT: "SL.UEM.TOTL.ZS",
  POVERTY: "SI.POV.DDAY",
  LIFE_EXPECTANCY: "SP.DYN.LE00.IN",
  EXPORTS: "NE.EXP.GNFS.CD",
  IMPORTS: "NE.IMP.GNFS.CD",
};

const fetchWorldBankData = async (countryCode, indicator) => {
  try {
    const indicatorCode = WORLD_BANK_INDICATORS[indicator];
    if (!indicatorCode) return "";
    const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicatorCode}?format=json&mrv=3`;
    const response = await fetch(url);
    if (!response.ok) return "";
    const data = await response.json();
    const records = data?.[1]?.filter((r) => r.value !== null);
    if (!records?.length) return "";
    const lines = records
      .map((r) => `  • ${r.date}: ${Number(r.value).toLocaleString()}`)
      .join("\n");
    return `WORLD BANK DATA (${indicator} — ${countryCode}):\n${lines}\nSource: World Bank Open Data`;
  } catch (err) {
    console.warn("⚠️ World Bank fetch failed:", err.message);
    return "";
  }
};

// ── PROMPTS ───────────────────────────────────────────────────────────────────
const getFlashcardPrompt = (
  exam,
  topic,
  count
) => `You are an expert educator. Generate EXACTLY ${count} high-quality study flashcards for the ${exam} exam on the topic: "${topic}".
Focus on high-yield facts, important definitions, and conceptual clarity for active recall.

Return ONLY a valid JSON array. No markdown, no extra text.
Format:
[
  {
    "front": "Clear question or conceptual term here",
    "back": "Detailed answer or explanation here. Keep it concise but thorough.",
    "category": "${topic}"
  }
]`;

const getQuizPrompt = (exam, topic, count, contextBlock = "") => {
  const upscGS1Formats = `
STYLE REQUIREMENTS (MUST MIRROR REAL UPSC GS PAPER I):

FORMAT 1 — STATEMENT-BASED (60% minimum)
"Consider the following statements:
1. [Conceptual statement]
2. [Conceptual statement]
3. [Conceptual statement]
Which of the statements given above is/are correct?"
Options: A) 1 only  B) 1 and 2 only  C) 2 and 3 only  D) 1, 2 and 3
Rules: At least ONE statement must be subtly incorrect.

FORMAT 2 — STATEMENT I / STATEMENT II (20%)
A) Both Statement I and II are correct and Statement II explains Statement I
B) Both Statement I and II are correct but Statement II does NOT explain Statement I
C) Statement I is correct but Statement II is incorrect
D) Statement I is incorrect but Statement II is correct

FORMAT 3 — MATCH LIST I / LIST II (10%)
List I | List II
A. Term/Item | 1. Description/Match
B. Term/Item | 2. Description/Match
C. Term/Item | 3. Description/Match
"How many of the above pairs are correctly matched?"
Options: A) Only one  B) Only two  C) Only three  D) All three

FORMAT 4 — DIRECT (10%)
One precise factual/conceptual question with 4 distinct options.

DIFFICULTY: 50% Moderate, 40% Hard, 10% Easy
NEVER use "All of the above" or "None of the above" as options.
`;

  const examInstructions = {
    UPSC: `You are a UPSC Civil Services Preliminary Examination question setter for GS Paper I.
Generate questions STRICTLY based on UPSC Prelims GS Paper I PYQs (2014–2025) and NCERT textbooks Class 6–12.
ABSOLUTE RESTRICTIONS: DO NOT invent Articles, Acts, committees, schemes, or facts not in NCERT or PYQs.
Every single question must be 100% traceable to either a UPSC PYQ (2014–2025) or an NCERT Class 6–12 textbook.
Topic: "${topic}"
${upscGS1Formats}`,
    CSAT: `You are a UPSC CSAT (Paper II) question setter. Generate questions STRICTLY in the style of UPSC CSAT PYQs (2014–2025).
TOPIC: "${topic}"
Cover: READING COMPREHENSION, LOGICAL REASONING, DECISION MAKING, BASIC NUMERACY, DATA INTERPRETATION, GENERAL MENTAL ABILITY.
RULES: Every numerical answer uniquely correct. DIFFICULTY: 50% Moderate, 50% Hard. Show full working in explanation.
STRICT: Only include question types that appear in official UPSC CSAT PYQs. Do not go beyond CSAT scope.`,
    "Current Affairs": `You are a UPSC Current Affairs question setter. Use the LIVE CONTEXT below as PRIMARY source.
Topic: "${topic}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE CONTEXT FROM THE WEB:
${
  contextBlock ||
  "⚠️ No live context available — use your best known recent facts on this topic for UPSC."
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT: Only generate questions based on verified facts from the live context above or well-established current affairs. Do NOT invent events, data, or facts.
${upscGS1Formats}`,
    JEE: `You are a JEE Main/Advanced question setter.
Generate questions on "${topic}" STRICTLY from the official JEE Main/Advanced syllabus as defined by NTA.
ONLY cover topics explicitly listed in the official JEE syllabus. DO NOT include BSc-level or engineering college topics.
Use a MIX of: Numerical-based MCQ, Concept application, Common misconception traps, Graph/diagram interpretation.
RULES: Include actual numerical values. Options differ by small margins. 60% hard, 40% medium. Show key formula in explanation.
ABSOLUTE RESTRICTION: Every question must be solvable using JEE syllabus knowledge only. No topic outside NTA JEE syllabus.`,
    NEET: `You are a NEET UG question setter.
Generate questions on "${topic}" STRICTLY from NCERT Class 11 and Class 12 Biology, Physics, and Chemistry textbooks only.
DO NOT include any topic, concept, or terminology beyond what appears in NCERT Class 11–12 textbooks.
Use a MIX of: Assertion-Reason, Diagram/structure based, Statement true/false, Application-based.
RULES: Every answer must be directly traceable to a specific NCERT Class 11 or 12 chapter. Correct scientific nomenclature. 50% hard, 50% medium.
ABSOLUTE RESTRICTION: If a concept is not in NCERT Class 11–12, do NOT include it.`,
    CAT: `You are a CAT question setter. Generate CAT-level questions on "${topic}".
STRICTLY follow the official CAT syllabus as conducted by IIMs.
Use a MIX of: VARC (Para-jumble, Para-summary, Inference), DILR, QA (Word problems).
RULES: Options very close. Avoid straightforward computation. Show elimination strategy. 60% hard, 40% medium.
ABSOLUTE RESTRICTION: Only include question types that appear in official CAT papers. Do not go beyond CAT scope.`,
    SSC: `You are an SSC CGL/CHSL question setter.
Generate questions on "${topic}" STRICTLY within the official SSC CGL/CHSL syllabus as defined by SSC.
Mix: Reasoning, Quant, GK, English.
RULES: Options tricky. For Quant show shortcut. 40% hard, 60% medium.
ABSOLUTE RESTRICTION: Do not include topics outside the official SSC CGL/CHSL syllabus.`,
    Banking: `You are an IBPS/SBI PO question setter.
Generate questions on "${topic}" STRICTLY within the official IBPS/SBI PO syllabus.
Mix: Reasoning puzzles, Quant (DI, simplification), Banking Awareness, English.
RULES: Include at least 2 DI questions. Options numerical and close. 50% hard, 50% medium.
ABSOLUTE RESTRICTION: Only include topics from the official IBPS/SBI PO syllabus. No topics beyond this scope.`,
    GATE: `You are a GATE question setter.
Generate questions on "${topic}" STRICTLY from the official GATE syllabus for the relevant engineering/science discipline.
Mix: Numerical Answer Type, Concept application, Multi-step technical problems.
RULES: Include formulas and derivations. Options technically precise. 60% hard, 40% medium.
ABSOLUTE RESTRICTION: Every question must be within the official GATE syllabus. Do not include advanced research-level topics.`,
    "State PCS": `You are a State PCS Preliminary Examination question setter.
Generate questions: 60% general topics + 40% state-specific topics.
Topic received: "${topic}" — Extract STATE NAME before " — " and SUBJECT TOPIC after " — ".
Generate 40% questions specifically about THAT STATE only. NEVER mix up states.
STYLE: 50% Statement-based, 20% Direct, 15% Match List, 15% Statement I/II.
ABSOLUTE RESTRICTION: State-specific questions must only reference verified facts about the correct state. Do not confuse states.`,
    "CBSE 10th": `You are a CBSE Class 10 Board Examination question setter.
Generate questions STRICTLY from NCERT Class 10 textbooks only — no other source.
Mix: 40% MCQ, 25% Short Answer, 20% Case-based/Assertion-Reason, 15% Numerical.
DIFFICULTY: 60% Easy-Medium, 40% Medium-Hard. Topic: "${topic}"
ABSOLUTE RESTRICTION: Every question must be directly from NCERT Class 10. Do NOT include Class 11/12 or beyond.`,
    "CBSE 12th": `You are a CBSE Class 12 Board Examination question setter.
Generate questions STRICTLY from NCERT Class 12 textbooks only — no other source.
Mix: 35% MCQ, 25% Short Answer, 20% Long Answer/Case-based, 20% Numerical/Derivation.
DIFFICULTY: 30% Easy, 40% Medium, 30% Hard. Topic: "${topic}"
ABSOLUTE RESTRICTION: Every question must be directly from NCERT Class 12. Do NOT include beyond-syllabus topics.`,
    General: `You are an expert question setter. Generate well-structured MCQ questions on "${topic}".
Mix easy, medium and hard difficulty. Make distractors plausible but clearly wrong on reflection.
Explanation must be 2-3 sentences with the reasoning behind the correct answer.`,
  };

  const instruction = examInstructions[exam] || examInstructions["General"];

  const buildGS1FormatPlan = (n) => {
    const pattern = [
      "STATEMENT-BASED",
      "MATCH-LIST",
      "STATEMENT-BASED",
      "STATEMENT-I/II",
      "STATEMENT-BASED",
      "DIRECT",
      "STATEMENT-I/II",
      "STATEMENT-BASED",
      "MATCH-LIST",
      "DIRECT",
    ];
    const plan = [];
    for (let i = 0; i < n; i++) plan.push(pattern[i % pattern.length]);
    return plan
      .map((fmt, i) => `Question ${i + 1}: MUST be ${fmt} format`)
      .join("\n");
  };

  const buildCSATFormatPlan = (n) => {
    const pattern = [
      "READING-COMPREHENSION",
      "LOGICAL-REASONING",
      "NUMERACY",
      "DATA-INTERPRETATION",
      "DECISION-MAKING",
      "LOGICAL-REASONING",
      "MENTAL-ABILITY",
      "NUMERACY",
      "READING-COMPREHENSION",
      "LOGICAL-REASONING",
    ];
    const plan = [];
    for (let i = 0; i < n; i++) plan.push(pattern[i % pattern.length]);
    return plan
      .map((fmt, i) => `Question ${i + 1}: MUST be ${fmt} format`)
      .join("\n");
  };

  let formatPlan = "";
  if (exam === "UPSC" || exam === "Current Affairs") {
    formatPlan = `\nMANDATORY FORMAT ASSIGNMENT:\n${buildGS1FormatPlan(count)}\n
NOTE: If a required format cannot be created using only in-syllabus content for "${topic}", use FORMAT 4 (DIRECT) instead. NEVER invent out-of-syllabus content to satisfy a format requirement.\n`;
  } else if (exam === "CSAT") {
    formatPlan = `\nMANDATORY FORMAT ASSIGNMENT:\n${buildCSATFormatPlan(
      count
    )}\n`;
  }

  return `${instruction}${formatPlan}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ FINAL SYLLABUS RULE — THIS OVERRIDES EVERYTHING ABOVE:
1. Every question must come 100% from the official ${exam} syllabus for topic "${topic}".
2. If you are not fully certain a fact, scheme, article, term, or concept is in the ${exam} syllabus — DO NOT include it.
3. When in doubt, leave it out. Accuracy over variety.
4. Do NOT invent or hallucinate facts, names, dates, schemes, or data under any circumstance.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate EXACTLY ${count} questions on the topic: "${topic}" for ${exam} exam.

Return ONLY a valid JSON array. No markdown, no extra text.
Format:
[
  {
    "question": "Full question text here",
    "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
    "correct": 0,
    "explanation": "Detailed explanation. Minimum 2-3 sentences.",
    "questionType": "statement-based | statement-I-II | match-list | direct | comprehension | logical | numeracy | data-interpretation | decision-making | mental-ability | current-affairs"
  }
]
- "correct" is the 0-based index (0=A, 1=B, 2=C, 3=D)
- Return exactly ${count} questions, no more, no less
- NEVER use "All of the above" or "None of the above" as options`;
};

export { getQuizPrompt };

// ── AI ENGINE ─────────────────────────────────────────────────────────────────
const GROQ_MODELS = [
  { id: "meta-llama/llama-4-maverick-17b-128e-instruct", maxTokens: 3000 },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", maxTokens: 3000 },
  { id: "llama-3.3-70b-versatile", maxTokens: 4096 },
];

const CONTEXT_EXTRA_TOKENS = 2000;
const userQuizCounts = new Map();
const USER_HOURLY_LIMIT = 15;

const checkUserRateLimit = (userId) => {
  if (!userId) return true;
  const now = Date.now();
  const entry = userQuizCounts.get(userId);
  if (!entry || now - entry.windowStart > 60 * 60 * 1000) {
    userQuizCounts.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= USER_HOURLY_LIMIT) return false;
  entry.count++;
  return true;
};

const callGPT52 = async (prompt, hasContext = false) => {
  if (!process.env.OPENAI_API_KEY) return null;
  const maxTokens = 4000 + (hasContext ? CONTEXT_EXTRA_TOKENS : 0);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    console.log("✅ Quiz generated by GPT-5.2");
    return data.choices?.[0]?.message?.content?.trim();
  } catch {
    return null;
  }
};

const callGroqWithFallback = async (prompt, hasContext = false) => {
  for (const model of GROQ_MODELS) {
    const maxTokens = model.maxTokens + (hasContext ? CONTEXT_EXTRA_TOKENS : 0);
    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: model.id,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_completion_tokens: maxTokens,
          }),
        }
      );
      if (!response.ok) continue;
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) return content;
    } catch {
      continue;
    }
  }
  throw new Error("All fallback models failed");
};

const getUsers = () => db.collection("users");

const generateAIContent = async (prompt, hasContext = false) => {
  const gptResult = await callGPT52(prompt, hasContext);
  if (gptResult) return gptResult;
  return callGroqWithFallback(prompt, hasContext);
};

const extractJSONArray = (text) => {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("JSON not found");
  return JSON.parse(text.slice(start, end + 1));
};

// ── INFIP.PRO IMAGE GENERATION ────────────────────────────────────────────────
// Models available on free tier:
//   flux2-klein-9b  — fast, all aspect ratios, image-to-image
//   img3            — Imagen 3, instant URL response
//   img4            — Imagen 4, instant URL response
//   qwen            — anime / illustration style

const INFIP_FREE_MODELS = ["flux2-klein-9b", "img3", "img4"];
const INFIP_API_BASE = "https://api.infip.pro";

/**
 * Map width/height to infip.pro aspect string.
 * Supported values: "square" (1024×1024) | "landscape" (1792×1024) | "portrait" (1024×1792)
 */
const aspectFromDimensions = (width, height) => {
  const w = Number(width) || 1024;
  const h = Number(height) || 1024;
  if (w > h * 1.2) return "landscape";
  if (h > w * 1.2) return "portrait";
  return "square";
};

/**
 * Call infip.pro text-to-image. Tries models in order until one succeeds.
 * Returns { imageUrl, modelUsed } or throws.
 */
const infipGenerate = async (prompt, { width, height } = {}) => {
  if (!infipApiKey) throw new Error("INFIP_API_KEY not set in .env");

  const aspect = aspectFromDimensions(width, height);
  const models = [...INFIP_FREE_MODELS];
  let lastError = null;

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`${INFIP_API_BASE}/v1/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${infipApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          aspect,
          response_format: "url",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        lastError = `infip.pro ${model} → HTTP ${
          response.status
        }: ${errText.slice(0, 200)}`;
        console.warn(`⚠️ infip.pro model ${model} failed:`, lastError);
        continue;
      }

      const data = await response.json();
      const imageUrl = data?.data?.[0]?.url;

      if (!imageUrl || typeof imageUrl !== "string") {
        lastError = `infip.pro ${model} → no URL in response`;
        console.warn(`⚠️ infip.pro model ${model}: no URL returned`, data);
        continue;
      }

      console.log(
        `✅ infip.pro image generated — model: ${model}, aspect: ${aspect}`
      );
      return { imageUrl, modelUsed: model, aspect, promptUsed: prompt };
    } catch (err) {
      lastError =
        err.name === "AbortError"
          ? `infip.pro ${model} → timeout`
          : `infip.pro ${model} → ${err.message}`;
      console.warn(`⚠️ infip.pro model ${model} error:`, lastError);
    }
  }

  throw new Error(lastError || "All infip.pro models failed");
};

/**
 * Upload a file buffer to Telegraph (free, no auth, instantly public).
 * Returns a public URL like https://telegra.ph/file/abc123.jpg, or null on failure.
 */
// ── PUBLIC IMAGE UPLOAD (for i2i) ────────────────────────────────────────────
// Try multiple free hosts in order until one succeeds.

const uploadToCatbox = async (buffer, mimetype) => {
  try {
    const ext = mimetype.includes("png")
      ? "png"
      : mimetype.includes("webp")
      ? "webp"
      : "jpg";
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append(
      "fileToUpload",
      new Blob([buffer], { type: mimetype }),
      `image.${ext}`
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const url = (await response.text()).trim();
    return url.startsWith("https://") ? url : null;
  } catch (err) {
    console.warn("⚠️ Catbox upload failed:", err.message);
    return null;
  }
};

const uploadToTmpfiles = async (buffer, mimetype) => {
  try {
    const ext = mimetype.includes("png")
      ? "png"
      : mimetype.includes("webp")
      ? "webp"
      : "jpg";
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimetype }), `image.${ext}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const response = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    // tmpfiles returns { data: { url: "https://tmpfiles.org/1234/image.png" } }
    // Convert to direct dl link: tmpfiles.org/dl/...
    const rawUrl = data?.data?.url;
    if (!rawUrl) return null;
    return rawUrl.replace("tmpfiles.org/", "tmpfiles.org/dl/");
  } catch (err) {
    console.warn("⚠️ Tmpfiles upload failed:", err.message);
    return null;
  }
};

const uploadToTelegraph = async (buffer, mimetype) => {
  try {
    const ext = mimetype.includes("png")
      ? "png"
      : mimetype.includes("webp")
      ? "webp"
      : "jpg";
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimetype }), `image.${ext}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const response = await fetch("https://telegra.ph/upload", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    const src = Array.isArray(data) ? data[0]?.src : data?.src;
    if (!src) return null;
    return `https://telegra.ph${src}`;
  } catch (err) {
    console.warn("⚠️ Telegraph upload failed:", err.message);
    return null;
  }
};

/**
 * Try all free image hosts in order, return first working public URL or null.
 */
const uploadImageForI2I = async (buffer, mimetype) => {
  const hosts = [
    { name: "Catbox", fn: () => uploadToCatbox(buffer, mimetype) },
    { name: "Tmpfiles", fn: () => uploadToTmpfiles(buffer, mimetype) },
    { name: "Telegraph", fn: () => uploadToTelegraph(buffer, mimetype) },
  ];
  for (const host of hosts) {
    console.log(`📤 Trying ${host.name}...`);
    const url = await host.fn();
    if (url) {
      console.log(`✅ ${host.name} upload success:`, url);
      return url;
    }
  }
  console.warn("⚠️ All image hosts failed — falling back to prompt-remix");
  return null;
};

/**
 * Call infip.pro image-to-image edit.
 * Uploads source image to a free host to get a public URL, then passes it
 * to infip.pro's `images` field for true image-to-image editing.
 * Falls back to prompt-remix only if all uploads fail.
 */
const infipEdit = async (buffer, mimetype, prompt, { width, height } = {}) => {
  if (!infipApiKey) throw new Error("INFIP_API_KEY not set in .env");

  const aspect = aspectFromDimensions(width, height);

  // Always build a rich Gemini prompt first
  console.log("🧠 Building rich prompt with Gemini vision...");
  const richPrompt = await buildImageEditPrompt(buffer, mimetype, prompt);
  console.log("📝 Rich prompt:", richPrompt.slice(0, 120) + "...");

  // Strategy 1: base64 data URL directly in images[]
  const base64DataUrl = `data:${mimetype};base64,${buffer.toString("base64")}`;
  console.log(
    `📤 Sending image as base64 to infip.pro i2i (${Math.round(
      buffer.length / 1024
    )}KB)...`
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    const response = await fetch(`${INFIP_API_BASE}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${infipApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "flux2-klein-9b",
        prompt: richPrompt,
        n: 1,
        aspect,
        response_format: "url",
        images: [base64DataUrl],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const imageUrl = data?.data?.[0]?.url;
      if (imageUrl) {
        console.log(
          "✅ infip.pro i2i success (base64) — model: flux2-klein-9b"
        );
        return {
          imageUrl,
          modelUsed: "flux2-klein-9b",
          aspect,
          promptUsed: richPrompt,
          mode: "image_to_image",
        };
      }
    }

    console.warn(
      `⚠️ infip.pro i2i base64 failed (HTTP ${response.status}) — trying public URL...`
    );

    // Strategy 2: upload to public host, pass URL
    const publicUrl = await uploadImageForI2I(buffer, mimetype);
    if (publicUrl) {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 90000);

      const response2 = await fetch(`${INFIP_API_BASE}/v1/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${infipApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "flux2-klein-9b",
          prompt: richPrompt,
          n: 1,
          aspect,
          response_format: "url",
          images: [publicUrl],
        }),
        signal: controller2.signal,
      });

      clearTimeout(timeoutId2);

      if (response2.ok) {
        const data2 = await response2.json();
        const imageUrl2 = data2?.data?.[0]?.url;
        if (imageUrl2) {
          console.log(
            "✅ infip.pro i2i success (public URL) — model: flux2-klein-9b"
          );
          return {
            imageUrl: imageUrl2,
            modelUsed: "flux2-klein-9b",
            aspect,
            promptUsed: richPrompt,
            mode: "image_to_image",
          };
        }
      }
      console.warn(
        `⚠️ infip.pro i2i public URL failed (HTTP ${response2.status})`
      );
    }
  } catch (err) {
    console.warn("⚠️ infip.pro i2i error:", err.message);
  }

  // Strategy 3: text-to-image with rich prompt (last resort)
  console.log("🎨 Falling back to text-to-image with rich prompt...");
  const result = await infipGenerate(richPrompt, { width, height });
  return { ...result, promptUsed: richPrompt, mode: "prompt_remix" };
};

// ── BASIC ROUTES ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("✅ Backend running"));
app.get("/health", (req, res) => res.send("Server alive"));

// ── CHAT HISTORY ──────────────────────────────────────────────────────────────
app.get("/chats/:userId", async (req, res) => {
  try {
    const chats = await getChats()
      .find({ userId: req.params.userId })
      .sort({ updatedAt: -1 })
      .project({ title: 1, updatedAt: 1, exam: 1 })
      .toArray();
    res.json(chats);
  } catch {
    res.status(500).json({ error: "Failed to load chats" });
  }
});

app.get("/chats/:userId/:chatId", async (req, res) => {
  try {
    const chat = await getChats().findOne({
      _id: new ObjectId(req.params.chatId),
      userId: req.params.userId,
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json(chat);
  } catch {
    res.status(500).json({ error: "Failed to load chat" });
  }
});

app.delete("/chats/:userId/:chatId", async (req, res) => {
  try {
    await getChats().deleteOne({
      _id: new ObjectId(req.params.chatId),
      userId: req.params.userId,
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

app.post("/chats/:userId", async (req, res) => {
  try {
    const { exam = "General" } = req.body;
    const newChat = {
      userId: req.params.userId,
      title: "New Chat",
      exam,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await getChats().insertOne(newChat);
    res.json({ chatId: result.insertedId, ...newChat });
  } catch {
    res.status(500).json({ error: "Failed to create chat" });
  }
});

// ── CHAT ──────────────────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { question, exam, history = [], userId, chatId } = req.body;
  if (!question) return res.status(400).json({ error: "Question is required" });
  try {
    let finalPrompt = question;
    let decision = { action: "direct" };
    const isSimpleMessage =
      question.trim().length < 20 ||
      /^(hi|hello|hey|thanks|thank you|ok|okay|help|start)$/i.test(
        question.trim()
      );

    if (!isSimpleMessage) decision = await askAIAgent(question, exam);

    if (decision.action === "web_search") {
      const searchContext = await fetchLiveSearchContext(decision.query);
      if (searchContext)
        finalPrompt = `${searchContext}\n\nQuestion: ${question}`;
    } else if (decision.action === "world_bank") {
      const wbData = await fetchWorldBankData(
        decision.country_code,
        decision.indicator
      );
      if (wbData) finalPrompt = `${wbData}\n\nQuestion: ${question}`;
    }

    const answer = await askAI(finalPrompt, exam, history, false);

    if (userId && chatId) {
      await getChats().updateOne(
        { _id: new ObjectId(chatId), userId },
        {
          $push: {
            messages: {
              $each: [
                { role: "user", content: question, timestamp: new Date() },
                { role: "assistant", content: answer, timestamp: new Date() },
              ],
            },
          },
          $set: { updatedAt: new Date() },
        }
      );
    }
    res.json({ answer });
  } catch {
    res.status(500).json({ error: "AI service failed" });
  }
});

// ── USER PROFILE ──────────────────────────────────────────────────────────────
app.post("/user/sync", async (req, res) => {
  const { userId, userName, exam, xp = 0 } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    await getUsers().updateOne(
      { userId },
      { $set: { userName, exam, updatedAt: new Date() }, $inc: { xp } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to sync user" });
  }
});

app.get("/user/:userId", async (req, res) => {
  try {
    const user = await getUsers().findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to load user" });
  }
});

// ── QUIZ ──────────────────────────────────────────────────────────────────────
app.post("/quiz/generate", async (req, res) => {
  const { topic, exam = "General", count = 10, userId, state } = req.body;
  if (!checkUserRateLimit(userId))
    return res.status(429).json({ error: "Limit reached" });
  if (!topic) return res.status(400).json({ error: "Topic required" });
  const safeCount = Math.min(Number(count) || 10, 20);
  const finalTopic =
    exam === "State PCS" && state ? `${state} — ${topic}` : topic;
  const contextBlock =
    exam === "Current Affairs"
      ? await fetchLiveSearchContext(
          `${finalTopic} India government PIB official`
        )
      : "";
  const prompt = getQuizPrompt(exam, finalTopic, safeCount, contextBlock);
  try {
    const content = await generateAIContent(prompt, !!contextBlock);
    const questions = extractJSONArray(
      content.replace(/```json|```/gi, "").trim()
    );
    res.json({ questions, contextUsed: !!contextBlock });
  } catch {
    res.status(500).json({ error: "Quiz failed" });
  }
});

app.post("/quiz/result", async (req, res) => {
  const { userId, topic, exam, score, total, timeTaken } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    await getQuizResults().insertOne({
      userId,
      topic,
      exam,
      score,
      total,
      percentage: Math.round((score / total) * 100),
      timeTaken,
      createdAt: new Date(),
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to save result" });
  }
});

app.get("/quiz/history/:userId", async (req, res) => {
  try {
    const results = await getQuizResults()
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    res.json(results);
  } catch {
    res.status(500).json({ error: "Failed to load history" });
  }
});

// ── CURRENT AFFAIRS ───────────────────────────────────────────────────────────
app.get("/current-affairs/:exam", async (req, res) => {
  const { exam } = req.params;
  const today = new Date().toISOString().split("T")[0];
  try {
    const liveContext = await fetchLiveSearchContext(
      `latest current affairs for ${exam} exam India ${today}`
    );
    const prompt = `You are an expert news editor for competitive exams.
Based on these search results:
${liveContext}

Create a summary of the top 5 most important news items for a ${exam} aspirant today (${today}).
Return ONLY valid JSON in this format:
{
  "date": "${today}",
  "summaries": ["News item 1 summary", "News item 2 summary", ...],
  "quiz": []
}`;
    const aiResponse = await generateAIContent(prompt);
    const digest = JSON.parse(aiResponse.replace(/```json|```/g, "").trim());
    res.json(digest);
  } catch {
    res.json({
      date: today,
      summaries: [
        "Stay tuned for today's top updates.",
        "Check official government portals for the latest notifications.",
      ],
      quiz: [],
    });
  }
});

// ── FLASHCARDS ────────────────────────────────────────────────────────────────
app.get("/flashcards/:userId", async (req, res) => {
  try {
    const cards = await getFlashcards()
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(cards);
  } catch {
    res.status(500).json({ error: "Failed to load flashcards" });
  }
});

app.post("/flashcards/generate", async (req, res) => {
  const { topic, exam = "General", count = 10, userId } = req.body;
  if (!topic || !userId)
    return res.status(400).json({ error: "Topic and userId required" });
  const safeCount = Math.min(Number(count) || 10, 20);
  const prompt = getFlashcardPrompt(exam, topic, safeCount);
  try {
    let content = await generateAIContent(prompt);
    if (!content) throw new Error("AI failed");
    content = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const rawCards = extractJSONArray(content);
    const cards = rawCards.map((c) => ({
      ...c,
      userId,
      interval: 0,
      lastReviewed: null,
      createdAt: new Date(),
    }));
    if (cards.length > 0) await getFlashcards().insertMany(cards);
    res.json({ cards });
  } catch (err) {
    console.error("Flashcard generation error:", err.message);
    res.status(500).json({ error: "Failed to generate flashcards" });
  }
});

app.post("/flashcards/review", async (req, res) => {
  const { cardId, difficulty } = req.body;
  const inc = { EASY: 7, GOOD: 3, HARD: 1 }[difficulty] || 1;
  try {
    await getFlashcards().updateOne(
      { _id: new ObjectId(cardId) },
      { $set: { lastReviewed: new Date() }, $inc: { interval: inc } }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update review" });
  }
});

// ── STUDY PLANNER ─────────────────────────────────────────────────────────────
app.post("/planner/generate", async (req, res) => {
  const { exam, examDate, topics, hoursPerDay = 4, userId } = req.body;
  if (!exam || !examDate)
    return res.status(400).json({ error: "exam and examDate required" });
  const today = new Date();
  const targetDate = new Date(examDate);
  const daysLeft = Math.max(
    1,
    Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24))
  );
  const planDays = Math.min(daysLeft, 30);
  const prompt = `Create a ${planDays}-day study plan for ${exam} exam on ${examDate}. Study time: ${hoursPerDay} hours/day. Return ONLY valid JSON.`;
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_tokens: 8000,
        }),
      }
    );
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    const plan = JSON.parse(content.replace(/```json|```/g, "").trim());
    if (userId) {
      const existing = await getPlanners().findOne({ userId, exam });
      if (existing) {
        await getPlanners().updateOne(
          { _id: existing._id },
          { $set: { ...plan, userId, updatedAt: new Date() } }
        );
        plan._id = existing._id;
      } else {
        const result = await getPlanners().insertOne({
          ...plan,
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        plan._id = result.insertedId;
      }
    }
    res.json({ plan });
  } catch {
    res.status(500).json({ error: "Planner failed" });
  }
});

app.get("/planner/:userId", async (req, res) => {
  try {
    const planners = await getPlanners()
      .find({ userId: req.params.userId })
      .sort({ updatedAt: -1 })
      .toArray();
    res.json(planners);
  } catch {
    res.status(500).json({ error: "Failed to load planners" });
  }
});

app.patch("/planner/:plannerId/day/:dayIndex", async (req, res) => {
  const { completed } = req.body;
  try {
    await getPlanners().updateOne(
      { _id: new ObjectId(req.params.plannerId) },
      {
        $set: {
          [`days.${req.params.dayIndex}.completed`]: completed,
          updatedAt: new Date(),
        },
      }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed update" });
  }
});

app.delete("/planner/:userId/:plannerId", async (req, res) => {
  try {
    await getPlanners().deleteOne({
      _id: new ObjectId(req.params.plannerId),
      userId: req.params.userId,
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Delete failed" });
  }
});

// ── IMAGE GENERATION (infip.pro) ──────────────────────────────────────────────

/**
 * POST /image/generate
 * Body: { prompt, width?, height? }
 * Response: { imageUrl, modelUsed, routeType, promptUsed, attemptCount }
 *
 * Called by App.jsx → resolvePollinationsUrl() — response shape kept identical.
 */
app.post("/image/generate", async (req, res) => {
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) return res.status(400).json({ error: "Prompt required" });

  try {
    console.log("🧠 Enhancing text-to-image prompt with Gemini...");
    const richPrompt = await buildTextToImagePrompt(prompt);
    console.log("📝 Rich prompt:", richPrompt.slice(0, 120) + "...");

    const result = await infipGenerate(richPrompt, {
      width: req.body?.width,
      height: req.body?.height,
    });

    return res.json({
      imageUrl: result.imageUrl,
      modelUsed: result.modelUsed,
      routeType: result.aspect,
      promptUsed: richPrompt,
      attemptCount: 1,
    });
  } catch (err) {
    console.error("❌ /image/generate error:", err.message);
    return res
      .status(502)
      .json({ error: err.message || "Image generation failed" });
  }
});

/**
 * POST /image/edit
 * Multipart: image file + body { prompt, width?, height? }
 *
 * Strategy:
 *  1. Upload image to free host → try infip.pro true i2i (needs public URL)
 *  2. If i2i blocked (free tier) → AI vision analyses source image →
 *     builds rich descriptive prompt → text-to-image (preserves appearance)
 */
app.post("/image/edit", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Image file required" });
    if (req.file.mimetype === "application/pdf") {
      return res
        .status(400)
        .json({ error: "PDF is not supported for image edit" });
    }

    const prompt =
      typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) return res.status(400).json({ error: "Edit prompt required" });

    const result = await infipEdit(req.file.buffer, req.file.mimetype, prompt, {
      width: req.body?.width,
      height: req.body?.height,
    });

    return res.json({
      imageUrl: result.imageUrl,
      modelUsed: result.modelUsed,
      routeType: result.aspect,
      promptUsed: result.promptUsed,
      attemptCount: 1,
      mode: result.mode,
    });
  } catch (err) {
    console.error("❌ /image/edit error:", err.message);
    return res.status(502).json({ error: err.message || "Image edit failed" });
  }
});

// ── IMAGE / PDF ANALYSIS ROUTE ────────────────────────────────────────────────
app.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File required" });

    if (req.file.mimetype === "application/pdf") {
      try {
        const { text } = await extractText(req.file.buffer);
        if (text && text.trim().length > 50) {
          const answer = await askAI(text, req.body.exam);
          return res.json({ answer });
        }
      } catch {
        console.log(
          "⚠️ Local PDF extraction failed, switching to Vision AI..."
        );
      }
    }

    const answer = await askAIWithImage(
      req.file.buffer,
      req.file.mimetype,
      req.body.exam
    );
    res.json({ answer });
  } catch {
    res.status(500).json({ error: "Image failed" });
  }
});

// ── TTS & TRANSCRIPTION ───────────────────────────────────────────────────────
app.post("/speak", async (req, res) => {
  const { text, voice } = req.body;
  try {
    const response = await groq.audio.speech.create({
      model: "canopylabs/orpheus-v1-english",
      voice: voice || "hannah",
      input: text.slice(0, 200),
      response_format: "wav",
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    res.set("Content-Type", "audio/wav");
    res.send(buffer);
  } catch {
    res.status(500).json({ error: "Voice generation failed" });
  }
});

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: new File([req.file.buffer], "audio.webm", { type: "audio/webm" }),
      model: "whisper-large-v3-turbo",
      language: "en",
    });
    res.json({ text: transcription.text });
  } catch {
    res.status(500).json({ error: "Transcription failed" });
  }
});

// ── CHART GENERATION ──────────────────────────────────────────────────────────
app.post("/chart/generate", async (req, res) => {
  const { question } = req.body;
  const prompt = `Generate a JSON chart for: ${question}. Valid JSON only.`;
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        }),
      }
    );
    const data = await response.json();
    res.json(
      JSON.parse(
        data.choices[0].message.content.replace(/```json|```/g, "").trim()
      )
    );
  } catch {
    res.status(500).json({ type: "text", answer: "⚠️ Chart failed" });
  }
});

// ── DATA DELETION (Play Store compliance) ─────────────────────────────────────
app.delete("/user/:userId/delete-data", async (req, res) => {
  const { userId } = req.params;
  try {
    await getUsers().deleteOne({ userId });
    await getChats().deleteMany({ userId });
    await getQuizResults().deleteMany({ userId });
    await getPlanners().deleteMany({ userId });
    await getFlashcards().deleteMany({ userId });
    res.json({ success: true, message: "All user data deleted successfully." });
  } catch {
    res.status(500).json({ error: "Failed to delete user data" });
  }
});

// ── ERROR HANDLERS ────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) =>
  res.status(500).json({ error: "Internal server error" })
);

app.listen(5050, () =>
  console.log("✅ Backend running on http://localhost:5050")
);
