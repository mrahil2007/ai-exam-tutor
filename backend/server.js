import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import { extractText } from "unpdf";
import { askAI, askAIWithImage } from "./aiService.js";
import Groq from "groq-sdk";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer();

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing!");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI missing!");
  process.exit(1);
}
if (!process.env.NEWS_API_KEY) {
  console.warn(
    "⚠️  NEWS_API_KEY missing — Current Affairs quiz will use model knowledge only."
  );
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

// ── GOOGLE CLOUD VISION OCR ───────────────────────────────────────────────────
// Free tier: 1,000 pages/month
// Setup: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/gcp-key.json in .env
//        run: npm install @google-cloud/vision
// No pdfjs or canvas needed — Vision API accepts raw PDF bytes directly!

let visionClient = null;
try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const vision = await import("@google-cloud/vision");
    visionClient = new vision.default.ImageAnnotatorClient();
    console.log(
      "✅ Google Cloud Vision OCR ready (free tier: 1,000 pages/month)"
    );
  } else {
    console.warn(
      "⚠️  GOOGLE_APPLICATION_CREDENTIALS not set — Google Vision OCR disabled.\n" +
        "   To enable free OCR: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/gcp-key.json in .env"
    );
  }
} catch (e) {
  console.warn(
    "⚠️  @google-cloud/vision not installed — run: npm install @google-cloud/vision"
  );
}

// Accepts any buffer (PDF or image) — Google Vision handles both natively
const ocrWithGoogleVision = async (fileBuffer) => {
  if (!visionClient) return null;
  try {
    const [result] = await visionClient.documentTextDetection({
      image: { content: fileBuffer.toString("base64") },
    });
    const text = result.fullTextAnnotation?.text?.trim() || "";
    if (text) {
      console.log(`✅ Google Vision OCR: extracted ${text.length} characters`);
      return text;
    }
    console.log("ℹ️  Google Vision OCR: no text detected");
    return null;
  } catch (err) {
    console.warn("⚠️  Google Vision OCR error:", err.message);
    return null;
  }
};

// ── NEWSAPI ───────────────────────────────────────────────────────────────────
const fetchNewsContext = async (topic) => {
  if (!process.env.NEWS_API_KEY) return "";
  try {
    const [topicRes, indiaRes] = await Promise.all([
      fetch(
        `https://newsapi.org/v2/everything?` +
          new URLSearchParams({
            q: `${topic} India`,
            sortBy: "publishedAt",
            pageSize: 8,
            language: "en",
            apiKey: process.env.NEWS_API_KEY,
          })
      ),
      fetch(
        `https://newsapi.org/v2/everything?` +
          new URLSearchParams({
            q: `${topic} government policy scheme`,
            sortBy: "relevancy",
            pageSize: 5,
            language: "en",
            apiKey: process.env.NEWS_API_KEY,
          })
      ),
    ]);

    const [topicData, indiaData] = await Promise.all([
      topicRes.json(),
      indiaRes.json(),
    ]);

    const seen = new Set();
    const allArticles = [
      ...(topicData.articles || []),
      ...(indiaData.articles || []),
    ].filter((a) => {
      if (!a.title || a.title === "[Removed]") return false;
      if (seen.has(a.title)) return false;
      seen.add(a.title);
      return true;
    });

    if (!allArticles.length) return "";

    const lines = allArticles
      .slice(0, 10)
      .map((a, i) => {
        const date = a.publishedAt ? `[${a.publishedAt.slice(0, 10)}] ` : "";
        const desc = (a.description || a.content || "")
          .slice(0, 200)
          .replace(/\n/g, " ")
          .trim();
        return `${i + 1}. ${date}${a.title}${desc ? " — " + desc : ""}`;
      })
      .join("\n");

    return `RECENT NEWS ITEMS (fetched live from the internet):\n${lines}`;
  } catch (err) {
    console.warn("NewsAPI error:", err.message);
    return "";
  }
};

// ── QUIZ PROMPT ───────────────────────────────────────────────────────────────
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
Generate questions STRICTLY based on UPSC Prelims GS Paper I PYQs (2014–2023) and NCERT textbooks Class 6–12.
ABSOLUTE RESTRICTIONS: DO NOT invent Articles, Acts, committees, or schemes.
Topic: "${topic}"
${upscGS1Formats}`,

    CSAT: `You are a UPSC CSAT (Paper II) question setter. Generate questions STRICTLY in the style of UPSC CSAT PYQs (2014–2023).
TOPIC: "${topic}"
Cover: READING COMPREHENSION, LOGICAL REASONING, DECISION MAKING, BASIC NUMERACY, DATA INTERPRETATION, GENERAL MENTAL ABILITY.
RULES: Every numerical answer uniquely correct. DIFFICULTY: 50% Moderate, 50% Hard. Show full working in explanation.`,

    "Current Affairs": `You are a UPSC Current Affairs question setter. Use the LIVE CONTEXT below as PRIMARY source.
Topic: "${topic}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE CONTEXT FROM THE WEB:
${
  contextBlock ||
  "⚠️ No live context available — use your best known recent facts on this topic for UPSC."
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${upscGS1Formats}`,

    JEE: `You are a JEE Main/Advanced question setter. Generate challenging questions on "${topic}".
Use a MIX of: Numerical-based MCQ, Concept application, Common misconception traps, Graph/diagram interpretation.
RULES: Include actual numerical values. Options differ by small margins. 60% hard, 40% medium. Show key formula in explanation.`,

    NEET: `You are a NEET UG question setter. Generate questions on "${topic}" strictly from NCERT syllabus.
Use a MIX of: Assertion-Reason, Diagram/structure based, Statement true/false, Application-based.
RULES: Every answer traceable to NCERT. Correct scientific nomenclature. 50% hard, 50% medium.`,

    CAT: `You are a CAT question setter. Generate CAT-level questions on "${topic}".
Use a MIX of: VARC (Para-jumble, Para-summary, Inference), DILR, QA (Word problems).
RULES: Options very close. Avoid straightforward computation. Show elimination strategy. 60% hard, 40% medium.`,

    SSC: `You are an SSC CGL/CHSL question setter. Generate questions on "${topic}".
Mix: Reasoning, Quant, GK, English.
RULES: Options tricky. For Quant show shortcut. 40% hard, 60% medium.`,

    Banking: `You are an IBPS/SBI PO question setter. Generate questions on "${topic}".
Mix: Reasoning puzzles, Quant (DI, simplification), Banking Awareness, English.
RULES: Include at least 2 DI questions. Options numerical and close. 50% hard, 50% medium.`,

    GATE: `You are a GATE question setter. Generate technical questions on "${topic}".
Mix: Numerical Answer Type, Concept application, Multi-step technical problems.
RULES: Include formulas and derivations. Options technically precise. 60% hard, 40% medium.`,

    "State PCS": `You are a State PCS Preliminary Examination question setter.
Generate questions: 60% general topics + 40% state-specific topics.
Topic received: "${topic}" — Extract STATE NAME before " — " and SUBJECT TOPIC after " — ".
Generate 40% questions specifically about THAT STATE only. NEVER mix up states.
STYLE: 50% Statement-based, 20% Direct, 15% Match List, 15% Statement I/II.`,

    "CBSE 10th": `You are a CBSE Class 10 Board Examination question setter.
Generate questions STRICTLY from NCERT Class 10 textbooks only.
Mix: 40% MCQ, 25% Short Answer, 20% Case-based/Assertion-Reason, 15% Numerical.
DIFFICULTY: 60% Easy-Medium, 40% Medium-Hard. Topic: "${topic}"`,

    "CBSE 12th": `You are a CBSE Class 12 Board Examination question setter.
Generate questions STRICTLY from NCERT Class 12 textbooks only.
Mix: 35% MCQ, 25% Short Answer, 20% Long Answer/Case-based, 20% Numerical/Derivation.
DIFFICULTY: 30% Easy, 40% Medium, 30% Hard. Topic: "${topic}"`,

    General: `Generate clear, well-structured MCQ questions on "${topic}". Mix easy, medium and hard. Make distractors plausible. Explanation 2-3 sentences.`,
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
    formatPlan = `\nMANDATORY FORMAT ASSIGNMENT:\n${buildGS1FormatPlan(
      count
    )}\n`;
  } else if (exam === "CSAT") {
    formatPlan = `\nMANDATORY FORMAT ASSIGNMENT:\n${buildCSATFormatPlan(
      count
    )}\n`;
  }

  return `${instruction}${formatPlan}

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

// ── BASIC ─────────────────────────────────────────────────────────────────────
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
  } catch (err) {
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
  } catch (err) {
    res.status(500).json({ error: "Failed to load chat" });
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
  } catch (err) {
    res.status(500).json({ error: "Failed to create chat" });
  }
});

app.delete("/chats/:userId/:chatId", async (req, res) => {
  try {
    await getChats().deleteOne({
      _id: new ObjectId(req.params.chatId),
      userId: req.params.userId,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// ── CHAT ──────────────────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { question, exam, history = [], userId, chatId } = req.body;
  if (!question) return res.status(400).json({ error: "Question is required" });
  try {
    const answer = await askAI(question, exam, history);
    if (userId && chatId) {
      const userMessage = {
        role: "user",
        content: question,
        timestamp: new Date(),
      };
      const aiMessage = {
        role: "assistant",
        content: answer,
        timestamp: new Date(),
      };
      const chat = await getChats().findOne({ _id: new ObjectId(chatId) });
      const isFirstMessage = !chat?.messages?.length;
      const title = isFirstMessage
        ? question.slice(0, 50) + (question.length > 50 ? "..." : "")
        : chat.title;
      await getChats().updateOne(
        { _id: new ObjectId(chatId), userId },
        {
          $push: { messages: { $each: [userMessage, aiMessage] } },
          $set: { updatedAt: new Date(), title, exam },
        }
      );
    }
    res.json({ answer });
  } catch (err) {
    console.error("AI error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GROQ FALLBACK CHAIN ───────────────────────────────────────────────────────
// ── MODEL CONFIG ─────────────────────────────────────────────────────────────
// GPT-4o = primary (best accuracy for UPSC/exam questions)
// Groq models = free fallback chain

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

// GPT-4o — primary, best accuracy
// GPT-5.2 — Primary Model
const callGPT52 = async (prompt, hasContext = false) => {
  if (!process.env.OPENAI_API_KEY) return null;

  const maxTokens = 3000 + (hasContext ? CONTEXT_EXTRA_TOKENS : 0);

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
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    });

    if (response.status === 429) {
      console.warn("⚠️ GPT-5.2 rate limited — falling back to Groq...");
      return null;
    }

    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      console.warn("⚠️ GPT-5.2 error:", e.error?.message);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    console.log("✅ Quiz generated using model: gpt-5.2");
    return content;
  } catch (err) {
    console.warn("⚠️ GPT-5.2 failed:", err.message);
    return null;
  }
};

// Groq fallback chain — free models
const callGroqWithFallback = async (prompt, hasContext = false) => {
  let lastError = null;
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
            temperature: 0.4,
            max_tokens: maxTokens,
          }),
        }
      );
      if (response.status === 429) {
        const e = await response.json().catch(() => ({}));
        console.warn(`⚠️  ${model.id} rate limited — trying next model...`);
        lastError = e.error?.message;
        continue;
      }
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        throw new Error(e.error?.message || `Groq error: ${response.status}`);
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Empty response from AI");
      console.log(`✅ Quiz generated using model: ${model.id}`);
      return content;
    } catch (err) {
      if (!err.message?.includes("Rate limit")) throw err;
      lastError = err.message;
    }
  }
  throw new Error(
    `All models are currently rate limited. Please wait a few minutes. (${lastError})`
  );
};

// Main entry — GPT-4o first, Groq fallback
const generateQuizContent = async (prompt, hasContext = false) => {
  const gptResult = await callGPT52(prompt, hasContext);
  if (gptResult) return gptResult;
  return callGroqWithFallback(prompt, hasContext);
};

// ── QUIZ ──────────────────────────────────────────────────────────────────────
app.post("/quiz/generate", async (req, res) => {
  const { topic, exam = "General", count = 10, userId, state } = req.body;
  if (!topic) return res.status(400).json({ error: "Topic is required" });

  if (exam === "State PCS" && !state) {
    return res
      .status(400)
      .json({ error: "Please select a state for State PCS quiz." });
  }

  if (!checkUserRateLimit(userId)) {
    return res.status(429).json({
      error: `You've generated ${USER_HOURLY_LIMIT} quizzes this hour. Please wait.`,
    });
  }

  const safeCount = Math.min(Number(count) || 10, 10);
  const finalTopic =
    exam === "State PCS" && state ? `${state} — ${topic}` : topic;

  let contextBlock = "";
  if (exam === "Current Affairs") {
    console.log(`📰 Fetching NewsAPI context for: "${finalTopic}"`);
    contextBlock = await fetchNewsContext(finalTopic);
    console.log(
      contextBlock
        ? "✅ NewsAPI context fetched"
        : "⚠️  No NewsAPI context — using model knowledge"
    );
  }

  const prompt = getQuizPrompt(exam, finalTopic, safeCount, contextBlock);

  try {
    let content = await generateQuizContent(prompt, !!contextBlock);

    content = content
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    content = content.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
      const fixed = inner
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
      return `"${fixed}"`;
    });

    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error("No JSON array found in response");

    let questions;
    try {
      questions = JSON.parse(arrayMatch[0]);
    } catch (e) {
      const cleaned = arrayMatch[0].replace(/[\u0000-\u001F\u007F]/g, (c) => {
        if (c === "\n") return "\\n";
        if (c === "\t") return "\\t";
        if (c === "\r") return "\\r";
        return "";
      });
      questions = JSON.parse(cleaned);
    }

    if (!Array.isArray(questions)) throw new Error("Invalid format");
    res.json({
      questions,
      contextUsed: exam === "Current Affairs" && !!contextBlock,
    });
  } catch (err) {
    console.error("Quiz error:", err.message);
    const isRateLimit =
      err.message.toLowerCase().includes("rate limit") ||
      err.message.toLowerCase().includes("tpd") ||
      err.message.toLowerCase().includes("429");
    res.status(isRateLimit ? 429 : 500).json({
      error: isRateLimit
        ? "The AI service is temporarily busy. Please wait a few minutes and try again."
        : "Failed to generate quiz. Please try again.",
    });
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
  } catch (err) {
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
  } catch (err) {
    res.status(500).json({ error: "Failed to load history" });
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

  const prompt = `Create a ${planDays}-day study plan for ${exam} exam on ${examDate}.
${
  topics
    ? `Topics to cover: ${topics}`
    : `Use standard ${exam} syllabus topics.`
}
Study time: ${hoursPerDay} hours/day.

Return ONLY valid JSON, no markdown, no extra text:
{
  "title": "Plan title here",
  "exam": "${exam}",
  "examDate": "${examDate}",
  "totalDays": ${planDays},
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "focus": "Main topic",
      "topics": ["Topic 1", "Topic 2"],
      "timeAllocation": "${hoursPerDay} hours",
      "practiceQuestions": "20 MCQs on topic",
      "revisionTip": "Quick tip",
      "completed": false
    }
  ]
}
Rules:
- Generate EXACTLY ${planDays} day objects
- Last 2 days = full revision
- Date for day 1 = ${today.toISOString().split("T")[0]}
- Keep each day's data SHORT
- Return only the JSON object, nothing else`;

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
    let content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty AI response");

    content = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    content = jsonMatch[0];

    let plan;
    try {
      plan = JSON.parse(content);
    } catch (parseErr) {
      const lastGood = content.lastIndexOf(',"completed":false}');
      if (lastGood === -1) throw new Error("Cannot repair JSON");
      const repaired = content.slice(0, lastGood + 19) + "]}";
      const fixed =
        repaired.endsWith("]}") && !repaired.endsWith("}}")
          ? repaired + "}"
          : repaired;
      plan = JSON.parse(fixed);
    }

    if (!plan.days || !Array.isArray(plan.days))
      throw new Error("Invalid plan format");

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
  } catch (err) {
    console.error("Planner error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to generate study plan. Please try again." });
  }
});

app.get("/planner/:userId", async (req, res) => {
  try {
    const planners = await getPlanners()
      .find({ userId: req.params.userId })
      .sort({ updatedAt: -1 })
      .toArray();
    res.json(planners);
  } catch (err) {
    res.status(500).json({ error: "Failed to load planners" });
  }
});

app.patch("/planner/:plannerId/day/:dayIndex", async (req, res) => {
  const { completed } = req.body;
  const dayIndex = parseInt(req.params.dayIndex);
  try {
    await getPlanners().updateOne(
      { _id: new ObjectId(req.params.plannerId) },
      {
        $set: {
          [`days.${dayIndex}.completed`]: completed,
          updatedAt: new Date(),
        },
      }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update day" });
  }
});

app.delete("/planner/:userId/:plannerId", async (req, res) => {
  try {
    await getPlanners().deleteOne({
      _id: new ObjectId(req.params.plannerId),
      userId: req.params.userId,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete planner" });
  }
});

// ── IMAGE / PDF ROUTE ─────────────────────────────────────────────────────────
// Pipeline:
//   PDF (digital)  → unpdf text extraction → askAI
//   PDF (scanned)  → Google Vision OCR     → askAI
//   PDF (fallback) → Llama vision          → askAI
//   Image          → Llama vision          → askAI
app.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File required" });

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(req.file.mimetype))
      return res.status(400).json({ error: "Only JPEG/PNG/WEBP/PDF allowed" });

    // ── PDF ───────────────────────────────────────────────────────────────────
    if (req.file.mimetype === "application/pdf") {
      // Step 1: Digital PDF — fast text extraction via unpdf
      try {
        const uint8 = new Uint8Array(req.file.buffer);
        const { text } = await extractText(uint8, { mergePages: true });
        if (text?.trim()) {
          console.log("✅ Digital PDF — text extracted via unpdf");
          const answer = await askAI(text.slice(0, 4000), req.body.exam);
          return res.json({ answer, source: "text-extraction" });
        }
      } catch (e) {
        console.log("📄 Text extraction failed:", e.message);
      }

      // Step 2: Scanned PDF — Google Vision (no canvas/pdfjs needed, accepts raw PDF bytes)
      if (visionClient) {
        console.log("🔍 Sending scanned PDF to Google Vision OCR...");
        const visionText = await ocrWithGoogleVision(req.file.buffer);
        if (visionText) {
          console.log("✅ Scanned PDF answered via Google Vision OCR");
          const answer = await askAI(visionText.slice(0, 4000), req.body.exam);
          return res.json({ answer, source: "google-vision-ocr" });
        }
      }

      // Step 3: Fallback — Llama vision
      try {
        console.log("↩️  Falling back to Llama vision...");
        const answer = await askAIWithImage(
          req.file.buffer,
          "application/pdf",
          req.body.exam
        );
        return res.json({ answer, source: "vision-ocr" });
      } catch (err) {
        console.error("❌ Llama vision fallback failed:", err.message);
        return res.json({
          answer:
            "📸 Could not read this scanned PDF. Please take a clear photo of the document using the camera button for best results!",
        });
      }
    }

    // ── IMAGE (JPEG / PNG / WEBP) ─────────────────────────────────────────────
    const answer = await askAIWithImage(
      req.file.buffer,
      req.file.mimetype,
      req.body.exam
    );
    res.json({ answer, source: "vision" });
  } catch (err) {
    console.error("File error:", err.message);
    res.status(500).json({ error: "File processing failed" });
  }
});

// ── TTS ───────────────────────────────────────────────────────────────────────
const VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
app.post("/speak", async (req, res) => {
  const { text, voice } = req.body;
  if (!text) return res.status(400).json({ error: "Text required" });
  const selectedVoice = VOICES.includes(voice) ? voice : "hannah";
  try {
    const response = await groq.audio.speech.create({
      model: "canopylabs/orpheus-v1-english",
      voice: selectedVoice,
      input: text.slice(0, 200),
      response_format: "wav",
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    res.set("Content-Type", "audio/wav");
    res.send(buffer);
  } catch (err) {
    console.error("TTS error:", err.message);
    res.status(500).json({ error: "Voice generation failed" });
  }
});

// ── TRANSCRIPTION ─────────────────────────────────────────────────────────────
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Audio required" });
    const mimeType = req.file.mimetype || "audio/webm";
    const ext = mimeType.includes("mp4")
      ? "mp4"
      : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("m4a")
      ? "m4a"
      : "webm";
    const transcription = await groq.audio.transcriptions.create({
      file: new File([req.file.buffer], `audio.${ext}`, { type: mimeType }),
      model: "whisper-large-v3-turbo",
      language: "en",
    });
    res.json({ text: transcription.text });
  } catch (err) {
    console.error("Transcription error:", err.message);
    res.status(500).json({ error: "Transcription failed" });
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
