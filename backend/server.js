// ═══════════════════════════════════════════════════════════════════════════
// server.js — Main Express server
// ═══════════════════════════════════════════════════════════════════════════

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
import admin from "firebase-admin";

// ── Separated modules ─────────────────────────────────────────────────────────
import { initFirebase, runJobFetcher, startJobCron } from "./JobFetcher.js";
import createJobRouter from "./JobRouter.js";
import createResumeRouter from "./ResumeBuilder.js";

// ─────────────────────────────────────────────────────────────────────────────

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing!");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI missing!");
  process.exit(1);
}

// ── Firebase Admin init (ESM-safe) ────────────────────────────────────────────
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized");
    }
  } catch (e) {
    console.warn("⚠️ Firebase Admin init failed:", e.message);
  }
} else {
  console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT not set — FCM push disabled.");
}
// ── FCM helper ────────────────────────────────────────────────────────────────
export const sendPushNotification = async (
  token,
  title,
  body,
  type = "general"
) => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return;
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: { type },
      android: {
        priority: "high",
        notification: {
          channelId:
            type === "job"
              ? "job_alerts"
              : type === "current_affairs"
              ? "current_affairs"
              : "general",
        },
      },
    });
  } catch (e) {
    console.warn("⚠️ FCM send failed:", e.message);
  }
};

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
const getCurrentAffairs = () => db.collection("current_affairs");
// ── Rate limiting ─────────────────────────────────────────────────────────────
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

// ── Misc init ─────────────────────────────────────────────────────────────────
const upload = multer();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const infipApiKey = process.env.INFIP_API_KEY || "";
if (!infipApiKey)
  console.warn("⚠️  INFIP_API_KEY not set — image generation will fail.");

initFirebase();

// ── MongoDB ───────────────────────────────────────────────────────────────────
let db;
const client = new MongoClient(process.env.MONGODB_URI);

async function connectDB() {
  await client.connect();
  db = client.db("examai");
  await db.collection("quizzes").createIndex({ topic: 1, exam: 1 });
  await db
    .collection("quiz_results")
    .createIndex({ userId: 1, exam: 1, topic: 1, quizId: 1 });

  console.log("✅ MongoDB connected");
}

const getChats = () => db.collection("chats");
const getQuizResults = () => db.collection("quiz_results");
const getPlanners = () => db.collection("study_planners");
const getFlashcards = () => db.collection("flashcards");
const getJobs = () => db.collection("jobs");
const getUsers = () => db.collection("users");
const getResumes = () => db.collection("resumes");
const getMemories = () => db.collection("memories");
const getQuizzes = () => db.collection("quizzes");

app.use("/jobs", createJobRouter(getJobs));
app.use("/resume", createResumeRouter(getResumes));

connectDB().then(() => {
  runJobFetcher(getJobs);
  startJobCron(getJobs);
});

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const loadMemory = async (userId) => {
  if (!userId) return [];
  try {
    const doc = await getMemories().findOne({ userId });
    return doc?.facts || [];
  } catch (err) {
    console.warn("⚠️ Memory load failed:", err.message);
    return [];
  }
};

const saveMemory = async (userId, conversation, exam) => {
  if (!userId || !conversation?.length) return;
  try {
    const existing = await loadMemory(userId);

    const extractPrompt = `
You are a memory extraction system for an exam prep app.
Analyze this conversation and extract key facts about the student.

EXISTING MEMORY (already known):
${existing.length ? existing.map((f) => `- ${f}`).join("\n") : "None yet"}

NEW CONVERSATION:
${conversation.map((m) => `${m.role}: ${m.content}`).join("\n")}

Extract and return a JSON array of short fact strings. Include:
- Their name (if mentioned)
- Exam they are preparing for
- Weak topics or subjects
- Strong topics or subjects
- Preferred language (Hindi/English/Hinglish)
- Study goals or targets
- Any personal context (job, background, etc.)

Rules:
- Merge with existing memory, don't duplicate facts
- Update outdated facts (e.g. new exam goal replaces old)
- Max 10 facts total, each fact max 15 words
- Return ONLY a valid JSON array of strings, nothing else
- Example: ["Preparing for UPSC 2026", "Weak in Economy", "Prefers Hindi"]
`;

    const raw = await callGroqForMemory(extractPrompt);
    if (!raw) return;
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const facts = JSON.parse(cleaned);

    if (Array.isArray(facts) && facts.length) {
      await getMemories().updateOne(
        { userId },
        {
          $set: {
            facts,
            exam,
            updatedAt: new Date(),
            isAnon: userId.startsWith("anon_"),
          },
        },
        { upsert: true }
      );
      console.log(`✅ Memory saved for ${userId}: ${facts.length} facts`);
    }
  } catch (err) {
    console.warn("⚠️ Memory save failed:", err.message);
  }
};

const mergeGuestMemory = async (anonId, realUserId) => {
  if (!anonId || !realUserId) return;
  try {
    const guestDoc = await getMemories().findOne({ userId: anonId });
    if (!guestDoc?.facts?.length) return;

    const realDoc = await getMemories().findOne({ userId: realUserId });
    const existingFacts = realDoc?.facts || [];

    const merged = [
      ...existingFacts,
      ...guestDoc.facts.filter((f) => !existingFacts.includes(f)),
    ].slice(0, 10);

    await getMemories().updateOne(
      { userId: realUserId },
      { $set: { facts: merged, updatedAt: new Date(), isAnon: false } },
      { upsert: true }
    );

    await getMemories().deleteOne({ userId: anonId });
    console.log(`✅ Guest memory merged: ${anonId} → ${realUserId}`);
  } catch (err) {
    console.warn("⚠️ Memory merge failed:", err.message);
  }
};

// Add this helper in server.js
const callGroqForMemory = async (prompt) => {
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
        max_tokens: 500,
      }),
    }
  );
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim();
};
// ── GROQ AGENT ROUTER (saves Gemini quota) ────────────────────────────────────
const askAIAgentGroq = async (question) => {
  try {
    const prompt = `You are a routing agent for an exam prep app.
Decide the best source to answer this question: "${question}"

Reply with ONLY one of these exact words:
- "web_search" → for current events, news, recent appointments, results, notifications
- "direct" → for concepts, history, science, math, syllabus, general knowledge

Reply with just the single word, nothing else.`;

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
          max_tokens: 10, // only needs one word
        }),
      }
    );

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase();

    if (answer?.includes("web_search"))
      return { action: "web_search", query: question };
    return { action: "direct" };
  } catch (err) {
    console.warn("⚠️ Groq agent routing failed:", err.message);
    return { action: "direct" };
  }
};
// ── Mobile config ─────────────────────────────────────────────────────────────
app.get("/mobile/config", (req, res) => {
  res.json({
    minVersion: 1,
    currentVersion: 1,
    maintenanceMode: false,
    features: {
      aiChat: true,
      voiceMode: true,
      jobAlerts: true,
      resumeBuilder: true,
    },
  });
});

// ── Live search cache (1 hour) ────────────────────────────────────────────────
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

// ── World Bank data fetcher ───────────────────────────────────────────────────
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

// ── AI engine helpers ─────────────────────────────────────────────────────────
const GROQ_MODELS = [
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
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 4000 + (hasContext ? CONTEXT_EXTRA_TOKENS : 0),
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    console.log("✅ Quiz generated by GPT-4o");
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

import { getQuizPrompt } from "./Quizprompts.js";

const getFlashcardPrompt = (exam, topic, count) =>
  `You are an expert educator. Generate EXACTLY ${count} high-quality study flashcards for the ${exam} exam on the topic: "${topic}".
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

// ── INFIP image helpers ───────────────────────────────────────────────────────
const INFIP_FREE_MODELS = ["flux2-klein-9b", "img3", "img4"];
const INFIP_API_BASE = "https://api.infip.pro";

const aspectFromDimensions = (width, height) => {
  const w = Number(width) || 1024,
    h = Number(height) || 1024;
  if (w > h * 1.2) return "landscape";
  if (h > w * 1.2) return "portrait";
  return "square";
};

const infipGenerate = async (prompt, { width, height } = {}) => {
  if (!infipApiKey) throw new Error("INFIP_API_KEY not set in .env");
  const aspect = aspectFromDimensions(width, height);
  let lastError = null;
  for (const model of INFIP_FREE_MODELS) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 60000);
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
      clearTimeout(tid);
      if (!response.ok) {
        lastError = `${model} → HTTP ${response.status}`;
        continue;
      }
      const data = await response.json();
      const imageUrl = data?.data?.[0]?.url;
      if (!imageUrl) {
        lastError = `${model} → no URL`;
        continue;
      }
      console.log(`✅ infip.pro — model: ${model}, aspect: ${aspect}`);
      return { imageUrl, modelUsed: model, aspect, promptUsed: prompt };
    } catch (err) {
      lastError =
        err.name === "AbortError"
          ? `${model} → timeout`
          : `${model} → ${err.message}`;
    }
  }
  throw new Error(lastError || "All infip.pro models failed");
};

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
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!r.ok) return null;
    const url = (await r.text()).trim();
    return url.startsWith("https://") ? url : null;
  } catch {
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
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!r.ok) return null;
    const data = await r.json();
    return (
      data?.data?.url?.replace("tmpfiles.org/", "tmpfiles.org/dl/") || null
    );
  } catch {
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
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch("https://telegra.ph/upload", {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!r.ok) return null;
    const data = await r.json();
    const src = Array.isArray(data) ? data[0]?.src : data?.src;
    return src ? `https://telegra.ph${src}` : null;
  } catch {
    return null;
  }
};

const uploadImageForI2I = async (buffer, mimetype) => {
  for (const { name, fn } of [
    { name: "Catbox", fn: () => uploadToCatbox(buffer, mimetype) },
    { name: "Tmpfiles", fn: () => uploadToTmpfiles(buffer, mimetype) },
    { name: "Telegraph", fn: () => uploadToTelegraph(buffer, mimetype) },
  ]) {
    console.log(`📤 Trying ${name}...`);
    const url = await fn();
    if (url) {
      console.log(`✅ ${name} upload success:`, url);
      return url;
    }
  }
  console.warn("⚠️ All image hosts failed — falling back to prompt-remix");
  return null;
};

const infipEdit = async (buffer, mimetype, prompt, { width, height } = {}) => {
  if (!infipApiKey) throw new Error("INFIP_API_KEY not set in .env");
  const aspect = aspectFromDimensions(width, height);
  console.log("🧠 Building rich prompt with Gemini vision...");
  const richPrompt = await buildImageEditPrompt(buffer, mimetype, prompt);
  const base64DataUrl = `data:${mimetype};base64,${buffer.toString("base64")}`;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 90000);
    const r = await fetch(`${INFIP_API_BASE}/v1/images/generations`, {
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
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (r.ok) {
      const data = await r.json();
      const imageUrl = data?.data?.[0]?.url;
      if (imageUrl)
        return {
          imageUrl,
          modelUsed: "flux2-klein-9b",
          aspect,
          promptUsed: richPrompt,
          mode: "image_to_image",
        };
    }
    const publicUrl = await uploadImageForI2I(buffer, mimetype);
    if (publicUrl) {
      const ctrl2 = new AbortController();
      const tid2 = setTimeout(() => ctrl2.abort(), 90000);
      const r2 = await fetch(`${INFIP_API_BASE}/v1/images/generations`, {
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
        signal: ctrl2.signal,
      });
      clearTimeout(tid2);
      if (r2.ok) {
        const data2 = await r2.json();
        const imageUrl2 = data2?.data?.[0]?.url;
        if (imageUrl2)
          return {
            imageUrl: imageUrl2,
            modelUsed: "flux2-klein-9b",
            aspect,
            promptUsed: richPrompt,
            mode: "image_to_image",
          };
      }
    }
  } catch (err) {
    console.warn("⚠️ infip.pro i2i error:", err.message);
  }
  const result = await infipGenerate(richPrompt, { width, height });
  return { ...result, promptUsed: richPrompt, mode: "prompt_remix" };
};

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get("/", (req, res) => res.send("✅ Backend running"));
app.get("/health", (req, res) => res.send("Server alive"));

// ── Chat history ──────────────────────────────────────────────────────────────
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

// ── Chat ──────────────────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { question, exam, history = [], userId, chatId, anonId } = req.body;

  if (!question) return res.status(400).json({ error: "Question is required" });

  try {
    // 1. Resolve identity — real user or guest
    const resolvedUserId = userId || anonId || null;

    // 2. Load memory for this user
    const memory = await loadMemory(resolvedUserId);

    let finalPrompt = question;
    let decision = { action: "direct" };

    const isSimple =
      question.trim().length < 20 ||
      /^(hi|hello|hey|thanks|thank you|ok|okay|help|start)$/i.test(
        question.trim()
      );

    if (!isSimple) decision = await askAIAgentGroq(question, exam);

    if (decision.action === "web_search") {
      const ctx = await fetchLiveSearchContext(decision.query);
      if (ctx) finalPrompt = `${ctx}\n\nQuestion: ${question}`;
    } else if (decision.action === "world_bank") {
      const wb = await fetchWorldBankData(
        decision.country_code,
        decision.indicator
      );
      if (wb) finalPrompt = `${wb}\n\nQuestion: ${question}`;
    }

    // 3. Pass memory into askAI
    const answer = await askAI(finalPrompt, exam, history, false, memory);

    // 4. Save chat to DB (logged-in users only)
    if (chatId && (userId || anonId)) {
      await getChats().updateOne(
        { _id: new ObjectId(chatId), userId: userId || anonId },
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

    // 5. Save memory in background — fire & forget, doesn't slow response
    if (resolvedUserId) {
      const updatedHistory = [
        ...history,
        { role: "user", content: question },
        { role: "assistant", content: answer },
      ];
      saveMemory(resolvedUserId, updatedHistory, exam).catch((err) =>
        console.warn("⚠️ Memory save failed:", err.message)
      );
    }

    res.json({ answer });
  } catch (err) {
    console.error("❌ Chat error:", err.message);
    res.status(500).json({ error: "AI service failed" });
  }
});

// ── User profile ──────────────────────────────────────────────────────────────
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

// ── Save FCM token ────────────────────────────────────────────────────────────
app.post("/user/fcm-token", async (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token)
    return res.status(400).json({ error: "userId and token required" });
  try {
    await getUsers().updateOne(
      { userId },
      { $set: { fcmToken: token, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to save FCM token" });
  }
});

// ── Merge guest memory on login/signup ────────────────────────────────────────
// Call this from your auth flow when a guest signs up or logs in
app.post("/user/merge-memory", async (req, res) => {
  const { anonId, userId } = req.body;
  if (!anonId || !userId)
    return res.status(400).json({ error: "anonId and userId required" });
  try {
    await mergeGuestMemory(anonId, userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Memory merge failed" });
  }
});

// ── Quiz ──────────────────────────────────────────────────────────────────────
app.post("/quiz/generate", async (req, res) => {
  const { topic, exam = "General", count = 10, userId, state } = req.body;

  if (!checkUserRateLimit(userId))
    return res.status(429).json({ error: "Limit reached" });

  if (!topic) return res.status(400).json({ error: "Topic required" });

  const safeCount = Math.min(Number(count) || 10, 20);
  const finalTopic =
    exam === "State PCS" && state ? `${state} — ${topic}` : topic;

  // ── 1. Find quizzes on this topic/exam this user hasn't solved yet ──────
  if (userId) {
    const solvedResults = await getQuizResults()
      .find({ userId, exam, topic: finalTopic, quizId: { $ne: null } })
      .project({ quizId: 1 })
      .toArray();

    const solvedIds = solvedResults.map((r) => r.quizId).filter(Boolean);

    const existingQuiz = await getQuizzes().findOne({
      topic: finalTopic,
      exam,
      // Exclude quizzes this user already solved
      ...(solvedIds.length ? { _id: { $nin: solvedIds } } : {}),
      // Only reuse quizzes solved by at least 1 other user (they're "validated")
      // OR any quiz if there's nothing solved yet
      createdAt: { $exists: true },
    });

    if (existingQuiz) {
      console.log(`♻️ Serving pooled quiz ${existingQuiz._id} to ${userId}`);
      return res.json({
        quizId: existingQuiz._id,
        questions: existingQuiz.questions,
        contextUsed: false,
        reused: true,
      });
    }
  }

  // ── 2. No suitable pooled quiz — generate a new one ────────────────────
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

    const quizDoc = {
      topic: finalTopic,
      exam,
      questions,
      createdAt: new Date(),
    };

    const result = await getQuizzes().insertOne(quizDoc);

    res.json({
      quizId: result.insertedId,
      questions,
      contextUsed: !!contextBlock,
      reused: false,
    });
  } catch (err) {
    console.error("❌ Quiz generation error:", err.message);
    res.status(500).json({ error: "Quiz failed" });
  }
});
app.post("/quiz/result", async (req, res) => {
  const { userId, topic, exam, score, total, timeTaken, quizId } = req.body;
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
      quizId: quizId ? new ObjectId(quizId) : null, // ← track which shared quiz
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

// ── Current affairs ───────────────────────────────────────────────────────────

app.get("/current-affairs/:exam", async (req, res) => {
  const { exam } = req.params;
  const lang = req.query.lang === "hinglish" ? "hinglish" : "english";
  const today = new Date().toISOString().split("T")[0];

  try {
    // ── 1. Check cache (exam + date + lang) ───────────────────────────────
    const cached = await db
      .collection("current_affairs")
      .findOne({ date: today, exam, lang });
    if (cached?.affairs?.length >= 20) {
      console.log(`[CA] Cache hit: ${exam} | ${lang} | ${today}`);
      return res.json({
        date: today,
        exam,
        lang,
        affairs: cached.affairs,
        cached: true,
      });
    }

    console.log(`[CA] Generating: ${exam} | ${lang} | ${today}`);

    // ── 2. Parallel Serper fetches ────────────────────────────────────────
    const queries = [
      `India government policy news today ${today}`,
      `India current affairs ${exam} exam ${today}`,
      `India economy RBI budget markets news today`,
      `India international relations diplomacy today`,
      `India science technology ISRO space news today`,
      `India sports cricket achievements news today`,
      `India environment climate wildlife news today`,
      `India defence military border news today`,
      `India health ministry news today`,
      `India awards appointments news today`,
    ];

    const newsResults = [];
    await Promise.allSettled(
      queries.map(async (q) => {
        try {
          const r = await fetch("https://google.serper.dev/news", {
            method: "POST",
            headers: {
              "X-API-KEY": process.env.SERPER_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ q, num: 10, gl: "in", hl: "en" }),
          });
          const data = await r.json();
          if (data.news?.length) newsResults.push(...data.news);
        } catch (e) {
          console.warn(`[CA] Serper failed: "${q}"`, e.message);
        }
      })
    );

    // Deduplicate by title
    const seen = new Set();
    const unique = newsResults.filter((n) => {
      if (!n.title || seen.has(n.title)) return false;
      seen.add(n.title);
      return true;
    });

    console.log(`[CA] ${unique.length} unique headlines from Serper`);
    if (unique.length < 5) throw new Error("Not enough Serper results");

    // ── 3. Language instruction ───────────────────────────────────────────
    const langInstruction =
      lang === "hinglish"
        ? `Sab kuch Hinglish mein likho — Hindi words Roman script mein likhna.
         Style: ek young Indian dost jo news explain kar raha ho, casual but informative.
         Example headline: "RBI ne repo rate 6.25% pe hold kiya, teesri baar!"
         Example summary: "Aaj cabinet ne ek bada faisla liya — 1,400 naye projects
         roads aur railways ke liye approve hue. Tier-2 cities ko sabse zyada faayda hoga."
         Example examRelevance: "Yeh topic Economy aur Fiscal Policy ke liye important hai —
         UPSC aur SSC mein government schemes frequently pooche jaate hain."
         Rules:
         - Proper nouns English mein: RBI, ISRO, GDP, Modi, India, Pakistan
         - Numbers hamesha numerals mein: 1,300 (not "ek hazar teen sau")
         - Headline max 12 words, punchy aur direct
         - Summary 2-3 sentences only
         - examRelevance bhi Hinglish mein likho`
        : `Write everything in clear, simple English.
         Style: professional news anchor — factual, concise, no fluff.
         Headline: max 12 words, specific and informative.
         Summary: 2-3 sentences — what happened, key facts, why it matters.
         examRelevance: which subject/topic this relates to for ${exam} exam preparation.`;

    // ── 4. Single Groq call — summarize + language in one shot ───────────
    const prompt = `Today is ${today}. Here are Google News headlines for ${exam} exam students in India:

${unique
  .map(
    (n, i) =>
      `${i + 1}. ${n.title}${n.snippet ? ` — ${n.snippet}` : ""} [${
        n.source || ""
      }]`
  )
  .join("\n")}

LANGUAGE INSTRUCTION:
${langInstruction}

Pick the 40-50 most exam-relevant items from the list above.
Return ONLY a raw JSON array — no markdown, no backticks, no explanation before or after.

[
  {
    "id": "ca_1",
    "category": "National",
    "headline": "...",
    "summary": "...",
    "importance": "high",
    "examRelevance": "...",
    "tags": ["${exam}", "relevant topic"]
  }
]

Rules:
- category must be exactly one of: National, International, Economy, Science & Tech, Sports, Environment, Awards, Defence, Health
- importance: "high" for 15-20 most critical items, "medium" for the rest
- Spread items across all 9 categories — do not skip any
- Follow the language instruction strictly for ALL text fields`;

    const raw = await callGroqWithFallback(prompt, true);
    if (!raw) throw new Error("Groq returned empty response");

    // Safe JSON extract
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1)
      throw new Error("No JSON array found in response");

    const affairs = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(affairs) || affairs.length < 10) {
      throw new Error(`Too few items returned: ${affairs?.length}`);
    }

    // ── 5. Cache result ───────────────────────────────────────────────────
    await db.collection("current_affairs").updateOne(
      { date: today, exam, lang },
      {
        $set: {
          date: today,
          exam,
          lang,
          affairs,
          generatedAt: new Date(),
          sourceCount: unique.length,
        },
      },
      { upsert: true }
    );

    console.log(
      `[CA] ✅ ${affairs.length} items saved — ${exam} | ${lang} | ${today}`
    );
    res.json({ date: today, exam, lang, affairs });
  } catch (err) {
    console.error("[CA] ❌", err.message);

    // Fallback: return stale cache rather than blank screen
    const stale = await db
      .collection("current_affairs")
      .findOne({ exam, lang }, { sort: { date: -1 } });

    if (stale?.affairs?.length) {
      console.log(
        `[CA] Stale cache fallback: ${exam} | ${lang} | ${stale.date}`
      );
      return res.json({
        date: stale.date,
        exam,
        lang,
        affairs: stale.affairs,
        cached: true,
        stale: true,
      });
    }

    res
      .status(500)
      .json({ error: "Failed to fetch current affairs", details: err.message });
  }
});

// ── Image generation ──────────────────────────────────────────────────────────
app.post("/image/generate", async (req, res) => {
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) return res.status(400).json({ error: "Prompt required" });
  try {
    console.log("🧠 Enhancing prompt with Gemini...");
    const richPrompt = await buildTextToImagePrompt(prompt);
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
    console.error("❌ /image/generate:", err.message);
    return res
      .status(502)
      .json({ error: err.message || "Image generation failed" });
  }
});

app.post("/image/edit", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Image file required" });
    if (req.file.mimetype === "application/pdf")
      return res
        .status(400)
        .json({ error: "PDF not supported for image edit" });
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
    console.error("❌ /image/edit:", err.message);
    return res.status(502).json({ error: err.message || "Image edit failed" });
  }
});

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

// ── TTS & transcription ───────────────────────────────────────────────────────
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

// ── Chart generation ──────────────────────────────────────────────────────────
app.post("/chart/generate", async (req, res) => {
  const { question, exam = "General" } = req.body;
  if (!question) return res.status(400).json({ error: "Question required" });

  const prompt = `You are a data visualization expert for Indian competitive exams.
Generate a chart for this topic: "${question}" for a ${exam} student.

Return ONLY a valid JSON object in exactly this format — no markdown, no explanation:
{
  "type": "bar" | "line" | "pie" | "doughnut",
  "title": "Chart title here",
  "labels": ["Label1", "Label2", "Label3"],
  "datasets": [
    {
      "label": "Dataset name",
      "data": [10, 20, 30]
    }
  ],
  "insight": "One line key insight from this data for exam preparation"
}

Rules:
- Pick the best chart type for the data (pie for proportions, line for trends, bar for comparisons)
- Use real, accurate data relevant to India and the ${exam} exam
- Max 8 data points for readability
- Return ONLY the JSON object, nothing else`;

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
          max_tokens: 1000,
        }),
      }
    );

    if (!response.ok) throw new Error(`Groq error: ${response.status}`);

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Empty response");

    const cleaned = raw.replace(/```json|```/g, "").trim();

    // ✅ Safe parse — extract JSON object even if extra text slips through
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON found");

    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    res.json(parsed);
  } catch (err) {
    console.error("❌ Chart error:", err.message);
    res.status(500).json({ error: "Chart generation failed" });
  }
});
// ── Data deletion ─────────────────────────────────────────────────────────────
app.delete("/user/:userId/delete-data", async (req, res) => {
  const { userId } = req.params;
  try {
    await Promise.all([
      getUsers().deleteOne({ userId }),
      getChats().deleteMany({ userId }),
      getQuizResults().deleteMany({ userId }),
      getPlanners().deleteMany({ userId }),
      getFlashcards().deleteMany({ userId }),
      getResumes().deleteMany({ userId }),
      getMemories().deleteMany({ userId }), // 👈 also delete memories
    ]);
    res.json({ success: true, message: "All user data deleted successfully." });
  } catch {
    res.status(500).json({ error: "Failed to delete user data" });
  }
});

// ── Error handlers ────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) =>
  res.status(500).json({ error: "Internal server error" })
);

app.listen(5050, () =>
  console.log("✅ Backend running on http://localhost:5050")
);
