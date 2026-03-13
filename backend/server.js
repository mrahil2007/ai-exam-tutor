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
import cron from "node-cron";
import createJobRouter from "./JobRouter.js";
import createResumeRouter from "./ResumeBuilder.js";

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing!");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI missing!");
  process.exit(1);
}

// ── Firebase Admin init ───────────────────────────────────────────────────────
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

// ── All exams + languages to pre-generate daily ──────────────────────────────
const ALL_EXAMS = [
  "UPSC",
  "SSC CGL",
  "SSC CHSL",
  "Banking",
  "Railway",
  "Defence",
  "State PSC",
  "Teaching",
  "Police",
  "General",
];
const ALL_LANGS = ["english", "hinglish"];

// Pre-generate current affairs for one exam+lang combo
const pregenerateCA = async (exam, lang) => {
  const today = new Date().toISOString().split("T")[0];
  const cacheKey = `${exam}|${lang}|${today}`;

  // Skip if already generated today
  const existing = await db
    .collection("current_affairs")
    .findOne({ date: today, exam, lang });
  if (existing?.affairs?.length >= 15) {
    console.log(`[CRON] Already done: ${exam} | ${lang}`);
    return;
  }

  // Skip if another instance is generating
  if (caGenerating.has(cacheKey)) {
    console.log(`[CRON] Already in progress: ${exam} | ${lang}`);
    return;
  }

  caGenerating.add(cacheKey);
  console.log(`[CRON] Generating: ${exam} | ${lang}`);

  try {
    const isHinglish = lang === "hinglish";

    // Fetch Serper headlines
    const queries = isHinglish
      ? [
          `${exam} exam current affairs India today`,
          "India government news today hindi",
          "India economy science sports news",
        ]
      : [
          `${exam} exam current affairs India today`,
          "India government policy news today",
          "India economy science sports news",
        ];

    const fetchSerper = async (q) => {
      try {
        const r = await fetch("https://google.serper.dev/news", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": process.env.SERPER_API_KEY,
          },
          body: JSON.stringify({ q, num: 20, gl: "in", hl: "en" }),
        });
        const d = await r.json();
        return (d.news || []).map((n) => ({
          title: n.title,
          snippet: n.snippet,
          source: n.source,
        }));
      } catch {
        return [];
      }
    };

    const allResults = (await Promise.all(queries.map(fetchSerper))).flat();
    const seen = new Set();
    const unique = allResults.filter((n) => {
      if (!n.title || seen.has(n.title)) return false;
      seen.add(n.title);
      return true;
    });

    if (unique.length < 5) {
      console.warn(`[CRON] Not enough headlines for ${exam} | ${lang}`);
      caGenerating.delete(cacheKey);
      return;
    }

    console.log(
      `[CRON] ${unique.length} headlines → generating ${exam} | ${lang}`
    );

    // Build prompts (same as route)
    const buildHinglishPrompt = (
      headlines,
      pickCount
    ) => `⚠️ CRITICAL: You MUST write ALL output in Hinglish (Hindi words in Roman script). Writing in English = WRONG and USELESS.

BAD headline: "RBI holds repo rate at 6.25% for the third time"
GOOD headline: "RBI ne teesri baar repo rate 6.25% pe hold kiya"

BAD summary (REJECTED — too short, English): "The RBI held repo rate. This affects economy."
GOOD summary: "RBI ki Monetary Policy Committee ne April 2025 mein repo rate 6.25% pe hold kiya. Yeh teesri baar hua jab rate unchanged raha. Governor Sanjay Malhotra ne kaha ki inflation abhi bhi 4.9% hai jo target se zyada hai. India ki GDP growth 6.7% rehne ka anuman hai FY2026 mein. Analysts ka kehna hai ki rate cut tabhi hoga jab inflation 4.5% se neeche aaye, shayad June ya August mein."

Today is ${today}. Headlines for ${exam} exam students:

${headlines
  .map(
    (n, i) =>
      `${i + 1}. ${n.title}${n.snippet ? ` — ${n.snippet}` : ""} [${
        n.source || ""
      }]`
  )
  .join("\n")}

🚨 HINGLISH RULES:
- EVERY word in Hinglish (Hindi in Roman script)
- Proper nouns stay English: RBI, ISRO, Modi, India, GDP, Supreme Court, Parliament
- Numbers always as numerals: 6.25%, ₹1,300 crore, 47 seats
- summary: MINIMUM 120 words, 5-6 sentences with specific facts, numbers, names, dates

Pick ${pickCount} most exam-relevant items. Return ONLY a raw JSON array — no markdown:
[{
  "id": "ca_1",
  "category": "National",
  "headline": "Hinglish mein specific headline",
  "summary": "5-6 sentences Hinglish mein — kya hua, kab hua, kaun involved, kyun hua, numbers/facts zaroor, aage kya hoga — MINIMUM 120 words",
  "importance": "high",
  "examRelevance": "Konsa exam topic, konsa paper, kyun important — Hinglish mein",
  "tags": ["${exam}"]
}]

Rules: EVERY field Hinglish. category: National/International/Economy/Science & Tech/Sports/Environment/Awards/Defence/Health`;

    const buildEnglishPrompt = (
      headlines
    ) => `Today is ${today}. Generate current affairs for ${exam} exam students in India.

Headlines:
${headlines
  .map(
    (n, i) =>
      `${i + 1}. ${n.title}${n.snippet ? ` — ${n.snippet}` : ""} [${
        n.source || ""
      }]`
  )
  .join("\n")}

⚠️ SUMMARY RULES — STRICTLY FOLLOW:
- summary MUST be 5-6 full sentences, MINIMUM 120 words
- Include: what happened, when, who was involved, why it matters, what happens next
- Include specific facts: numbers, dates, names, places, percentages, amounts
- BAD summary (REJECTED): "The RBI held repo rate. This is important for economy."
- GOOD summary: "The Reserve Bank of India's Monetary Policy Committee, led by Governor Sanjay Malhotra, unanimously voted to hold the repo rate at 6.25% for the third consecutive time in its April 2025 meeting. The decision was driven by persistent inflation hovering around 4.9%, above the RBI's 4% target. India's GDP growth projection for FY2026 was revised to 6.7%, slightly lower than the earlier forecast of 6.9%. The MPC maintained its 'withdrawal of accommodation' stance to ensure liquidity remains in check. Analysts expect a rate cut only if CPI inflation drops below 4.5% in the coming months, potentially in the June or August policy review."

Pick 30-35 most exam-relevant items, spread across all 9 categories. Return ONLY a raw JSON array — no markdown, no backticks:
[{
  "id": "ca_1",
  "category": "National",
  "headline": "specific headline max 12 words",
  "summary": "5-6 sentences with real facts, numbers, names, dates — MINIMUM 120 words",
  "importance": "high",
  "examRelevance": "2-3 sentences on which exam topic this covers, which paper, why frequently asked",
  "tags": ["${exam}", "topic"]
}]

Rules:
- summary: MINIMUM 120 words, 5-6 sentences, specific facts only — no vague statements
- examRelevance: mention specific subject, paper number, and exam angle
- importance: "high" for top 10-15 items, "medium" for rest
- category: exactly one of: National, International, Economy, Science & Tech, Sports, Environment, Awards, Defence, Health
- Spread evenly across all 9 categories`;

    let raw = null;
    if (isHinglish) {
      raw = await callGeminiForHinglish(unique, buildHinglishPrompt);
      if (!raw) {
        raw = await callGroqWithFallback(
          buildHinglishPrompt(unique.slice(0, 25), 15),
          true
        );
      }
    } else {
      raw = await callGroqWithFallback(
        buildEnglishPrompt(unique.slice(0, 50)),
        true
      );
    }

    if (!raw) throw new Error("No AI response");

    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1)
      throw new Error("No JSON array in response");

    const affairs = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(affairs) || affairs.length < 10)
      throw new Error(`Too few: ${affairs?.length}`);

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

    console.log(`[CRON] ✅ Saved ${affairs.length} items — ${exam} | ${lang}`);
  } catch (err) {
    console.error(`[CRON] ❌ Failed ${exam} | ${lang}:`, err.message);
  } finally {
    caGenerating.delete(cacheKey);
  }
};

// Pre-generate all exams sequentially to avoid hammering APIs
// Runs at 6:00 AM IST (00:30 UTC) every day
const runDailyPregeneration = async () => {
  console.log(
    "[CRON] 🌅 Daily pre-generation started —",
    new Date().toISOString()
  );
  const combos = ALL_EXAMS.flatMap((exam) =>
    ALL_LANGS.map((lang) => ({ exam, lang }))
  );
  for (const { exam, lang } of combos) {
    await pregenerateCA(exam, lang);
    await new Promise((r) => setTimeout(r, 15000)); // 15s gap between each combo
  }
  console.log("[CRON] ✅ Daily pre-generation complete");
};

connectDB().then(() => {
  runJobFetcher(getJobs, getUsers);
  startJobCron(getJobs, getUsers);

  // Run daily at 6:00 AM IST = 00:30 UTC
  cron.schedule("30 0 * * *", runDailyPregeneration, { timezone: "UTC" });
  console.log("✅ Current affairs cron scheduled — 6:00 AM IST daily");

  // Delay CA startup by 3 mins so Adzuna job fetching finishes first
  // Adzuna runs 90 calls which takes ~2 mins — running both together causes Gemini RPM spikes
  setTimeout(async () => {
    const today = new Date().toISOString().split("T")[0];
    const sample = await db
      .collection("current_affairs")
      .findOne({ date: today, lang: "english" });
    if (!sample) {
      console.log(
        "[CRON] No data for today — starting CA pre-generation in 3 mins..."
      );
      setTimeout(() => {
        console.log("[CRON] 🌅 Starting delayed CA pre-generation now...");
        runDailyPregeneration();
      }, 3 * 60 * 1000); // 3 minutes
    } else {
      console.log("[CRON] Today's CA data already exists in DB ✅");
    }
  }, 5000);
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

// ── GROQ AGENT ROUTER ─────────────────────────────────────────────────────────
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
          max_tokens: 10,
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
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", maxTokens: 8000 },
  { id: "llama-3.3-70b-versatile", maxTokens: 8000 },
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

// ── Gemini for Hinglish (better Indian language understanding) ────────────────
// ── Gemini key rotation (3 keys = 45 RPM total) ──────────────────────────────
const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY, // fallback if old single-key setup
].filter(Boolean);

let geminiKeyIndex = 0;
const getNextGeminiKey = () => {
  const key = GEMINI_KEYS[geminiKeyIndex % GEMINI_KEYS.length];
  geminiKeyIndex++;
  return key;
};

// Single Gemini call with key rotation + retry on 429
const callGeminiOnce = async (prompt, maxOutputTokens = 4000) => {
  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const key = getNextGeminiKey();
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens },
          }),
        }
      );
      if (response.status === 429) {
        console.warn(
          `⚠️ Gemini key ${attempt + 1} rate limited, trying next...`
        );
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!response.ok) {
        console.warn(`⚠️ Gemini key ${attempt + 1} HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return text;
    } catch (err) {
      console.warn(`⚠️ Gemini key ${attempt + 1} error:`, err.message);
    }
  }
  return null;
};

// Sequential Gemini batches — 4 calls, 3s apart, different key each time
// Sequential (not parallel) avoids hammering all keys at once → no rate limit
// Each batch: ~25 headlines → 8-10 items → total 32-40 rich Hinglish items
const callGeminiForHinglish = async (headlines, buildPromptFn) => {
  if (!GEMINI_KEYS.length) {
    console.warn("⚠️ No Gemini keys set");
    return null;
  }

  const batchSize = Math.ceil(headlines.length / 4);
  const batches = [
    headlines.slice(0, batchSize),
    headlines.slice(batchSize, batchSize * 2),
    headlines.slice(batchSize * 2, batchSize * 3),
    headlines.slice(batchSize * 3),
  ].filter((b) => b.length > 0);

  console.log(
    `[CA] Gemini: ${batches.length} sequential batches of ~${batchSize} headlines, 8s apart`
  );

  const parse = (raw) => {
    if (!raw) return [];
    try {
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start === -1 || end === -1) return [];
      return JSON.parse(raw.slice(start, end + 1));
    } catch (e) {
      console.warn("⚠️ Gemini batch JSON parse failed:", e.message);
      return [];
    }
  };

  const merged = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `[CA] Gemini batch ${i + 1}/${batches.length} (${
        batch.length
      } headlines)...`
    );

    const result = await callGeminiOnce(buildPromptFn(batch, 8), 6000);
    const items = parse(result);
    console.log(`[CA] Batch ${i + 1} → ${items.length} items`);
    merged.push(...items);

    // Wait 8s between batches — Adzuna runs in parallel and can cause RPM spikes
    // 4 batches × 8s = 32s total, safely under 1 req per 4s per key
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 8000));
    }
  }

  if (merged.length === 0) {
    console.warn("⚠️ All Gemini batches returned empty");
    return null;
  }

  merged.forEach((item, i) => {
    item.id = `ca_${i + 1}`;
  });
  console.log(
    `✅ Gemini total: ${merged.length} Hinglish items from ${batches.length} batches`
  );
  return JSON.stringify(merged);
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
    const resolvedUserId = userId || anonId || null;
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

    const answer = await askAI(finalPrompt, exam, history, false, memory);

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

  if (userId) {
    const solvedResults = await getQuizResults()
      .find({ userId, exam, topic: finalTopic, quizId: { $ne: null } })
      .project({ quizId: 1 })
      .toArray();
    const solvedIds = solvedResults.map((r) => r.quizId).filter(Boolean);
    const existingQuiz = await getQuizzes().findOne({
      topic: finalTopic,
      exam,
      ...(solvedIds.length ? { _id: { $nin: solvedIds } } : {}),
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
      quizId: quizId ? new ObjectId(quizId) : null,
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

// ── In-progress lock to prevent simultaneous generation ──────────────────────
const caGenerating = new Set();

// ── Current affairs ───────────────────────────────────────────────────────────
app.get("/current-affairs/:exam", async (req, res) => {
  const { exam } = req.params;
  const lang = req.query.lang === "hinglish" ? "hinglish" : "english";
  const today = new Date().toISOString().split("T")[0];
  const cacheKey = `${exam}|${lang}|${today}`;

  try {
    // ── 1. Try today's data from DB ───────────────────────────────────────
    const cached = await db
      .collection("current_affairs")
      .findOne({ date: today, exam, lang });
    if (cached?.affairs?.length >= 10) {
      console.log(
        `[CA] ✅ DB hit: ${exam} | ${lang} | ${today} (${cached.affairs.length} items)`
      );
      return res.json({
        date: today,
        exam,
        lang,
        affairs: cached.affairs,
        cached: true,
      });
    }

    // ── 2. Cron is generating — poll DB for up to 90s ─────────────────────
    if (caGenerating.has(cacheKey)) {
      console.log(`[CA] Cron generating ${cacheKey} — polling...`);
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await db
          .collection("current_affairs")
          .findOne({ date: today, exam, lang });
        if (poll?.affairs?.length >= 10) {
          console.log(`[CA] Poll hit after ${(i + 1) * 3}s`);
          return res.json({
            date: today,
            exam,
            lang,
            affairs: poll.affairs,
            cached: true,
          });
        }
      }
    }

    // ── 3. No data yet — serve yesterday's data with stale flag ──────────
    const stale = await db
      .collection("current_affairs")
      .findOne({ exam, lang }, { sort: { date: -1 } });
    if (stale?.affairs?.length) {
      console.log(`[CA] Serving stale: ${exam} | ${lang} | ${stale.date}`);
      return res.json({
        date: stale.date,
        exam,
        lang,
        affairs: stale.affairs,
        cached: true,
        stale: true,
      });
    }

    // ── 4. Absolutely nothing in DB — trigger on-demand for this combo ────
    console.log(
      `[CA] No data at all for ${exam} | ${lang} — triggering on-demand generation`
    );
    pregenerateCA(exam, lang); // fire and forget
    res
      .status(202)
      .json({ error: "Generating fresh content, please retry in 30 seconds" });
  } catch (err) {
    console.error("[CA] ❌", err.message);
    res.status(500).json({ error: "Failed to fetch current affairs" });
  }
});

// ── Flashcards ────────────────────────────────────────────────────────────────
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
  try {
    let content = await generateAIContent(
      getFlashcardPrompt(exam, topic, safeCount)
    );
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
    console.error("Flashcard error:", err.message);
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

// ── Study planner ─────────────────────────────────────────────────────────────
app.post("/planner/generate", async (req, res) => {
  const { exam, examDate, hoursPerDay = 4, userId } = req.body;
  if (!exam || !examDate)
    return res.status(400).json({ error: "exam and examDate required" });
  const daysLeft = Math.max(
    1,
    Math.ceil((new Date(examDate) - new Date()) / 86400000)
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
    const plan = JSON.parse(
      data.choices?.[0]?.message?.content?.trim().replace(/```json|```/g, "")
    );
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
  "datasets": [{ "label": "Dataset name", "data": [10, 20, 30] }],
  "insight": "One line key insight from this data for exam preparation"
}

Rules:
- Pick the best chart type (pie for proportions, line for trends, bar for comparisons)
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
      getMemories().deleteMany({ userId }),
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
