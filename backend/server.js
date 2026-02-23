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

// ── MONGODB ──────────────────────────────────────
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

// ── NEWSAPI: Fetch latest current affairs context ─
const fetchNewsContext = async (topic) => {
  if (!process.env.NEWS_API_KEY) return "";
  try {
    // Two parallel searches: topic-specific + India current affairs
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

    // Merge and deduplicate articles by title
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

    // Build a clean numbered context block
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
    return ""; // graceful fallback — quiz still generates without context
  }
};

// ── EXAM-AWARE QUIZ PROMPT ────────────────────────
const getQuizPrompt = (exam, topic, count, contextBlock = "") => {
  // Shared UPSC GS1-style format rules
  const upscGS1Formats = `
STYLE REQUIREMENTS (MUST MIRROR REAL UPSC GS PAPER I):

FORMAT 1 — STATEMENT-BASED (60% minimum)
"Consider the following statements:
1. [Conceptual statement]
2. [Conceptual statement]
3. [Conceptual statement]
Which of the statements given above is/are correct?"

Options:
A) 1 only
B) 1 and 2 only
C) 2 and 3 only
D) 1, 2 and 3

Rules:
- At least ONE statement must be subtly incorrect.
- Statements must test conceptual clarity, not trivial recall.

FORMAT 2 — STATEMENT I / STATEMENT II (20%)
A) Both Statement I and II are correct and Statement II explains Statement I
B) Both Statement I and II are correct but Statement II does NOT explain Statement I
C) Statement I is correct but Statement II is incorrect
D) Statement I is incorrect but Statement II is correct

FORMAT 3 — MATCH LIST I / LIST II (10%)
Use STRICT pipe-table format:

List I | List II
A. Term/Item | 1. Description/Match
B. Term/Item | 2. Description/Match
C. Term/Item | 3. Description/Match

Then ask: "How many of the above pairs are correctly matched?"
Options: A) Only one  B) Only two  C) Only three  D) All three

STRICT RULES:
- ALWAYS use pipe symbol (|) with one space on each side
- Label left column A., B., C. and right column 1., 2., 3.
- NEVER write inline or paragraph format for match questions

FORMAT 4 — DIRECT (10%)
One precise factual/conceptual question with 4 distinct options.

DIFFICULTY: 50% Moderate, 40% Hard, 10% Easy
NEVER use "All of the above" or "None of the above" as options.
Mimic real UPSC PYQ style (2014–2025). Do NOT copy exact PYQs.
`;

  const examInstructions = {
    // ── UPSC GS PAPER I ───────────────────────────
    UPSC: `
You are a UPSC Civil Services Preliminary Examination question setter for GS Paper I.

Generate questions STRICTLY based on:
1. UPSC Prelims GS Paper I PYQs (2014–2025)
2. NCERT textbooks Class 6–12:
   - Polity: Class 8–12
   - History: Class 6–12
   - Geography: Class 6–12
   - Economy: Class 9–12
   - Environment & Ecology: Class 7–12
   - Science & Technology: Class 6–12 basics

ABSOLUTE RESTRICTIONS:
- DO NOT invent Articles, Acts, committees, or schemes.
- DO NOT use coaching institute material.
- Every fact must be verifiable from NCERT or real UPSC PYQs.
- If unsure about a fact, skip it.

Topic: "${topic}"
${upscGS1Formats}`,

    // ── UPSC CSAT / GS PAPER II ───────────────────
    CSAT: `
You are a UPSC Civil Services Preliminary Examination question setter for GS Paper II — CSAT (Civil Services Aptitude Test).

Generate questions STRICTLY in the style of UPSC CSAT PYQs (2014–2025).

TOPIC REQUESTED: "${topic}"

Cover a MIX from these CSAT areas based on the topic:

1. READING COMPREHENSION
   - Provide a short passage (5–8 lines) followed by 1 inference/conclusion question.
   - Passage must be original. Test ability to draw conclusions, identify assumptions, find the author's view.
   - Questions must be answerable ONLY from the passage — no external knowledge needed.

2. LOGICAL REASONING & ANALYTICAL ABILITY
   - Syllogisms, logical sequences, assumptions, arguments
   - Blood relations, direction sense, ranking/ordering puzzles
   - Coding-decoding, series completion (number/letter/mixed)
   - Statement-conclusion, statement-assumption, course of action

3. DECISION MAKING & PROBLEM SOLVING
   - Situation-based questions (administrative/ethical scenarios)
   - Ask what the BEST course of action is among 4 realistic options
   - Only one option is clearly the best

4. BASIC NUMERACY (Class X level)
   - Number systems, percentages, ratios & proportions
   - Simple & compound interest, profit & loss, time & work
   - Time-speed-distance, averages, ages
   - ALWAYS include actual numbers in the question
   - Explanation MUST show full step-by-step calculation

5. DATA INTERPRETATION (Class X level)
   - Describe a small table or chart in text with actual values
   - Ask 1 question on the data (percentage change, ratio, highest/lowest, etc.)

6. GENERAL MENTAL ABILITY
   - Analogies, odd-one-out, visual/spatial reasoning described in text
   - Pattern completion, matrix-type questions described in words

STRICT RULES:
- Every numerical answer must be uniquely correct and verifiable by calculation.
- For comprehension: passage must come FIRST in the question field, then the question.
- Options for logical/aptitude questions must be precise (exact numbers or conclusions).
- DIFFICULTY: 50% Moderate, 50% Hard — no easy questions.
- NEVER use "All of the above" or "None of the above".
- Explanation must show full working/reasoning for every question.
- Do NOT repeat question types — mix all 6 categories evenly.
`,

    // ── CURRENT AFFAIRS (NewsAPI-powered) ─────────
    "Current Affairs": `
You are a UPSC Civil Services Preliminary Examination question setter specialising in Current Affairs.

You have been provided with REAL, FRESH news fetched live from the internet right now.
Use this context as the PRIMARY source for generating questions.
Do NOT rely on your training data for facts — trust the context below instead.

Topic: "${topic}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE CONTEXT FROM THE WEB:
${
  contextBlock ||
  "⚠️ No live context available — use your best known recent facts on this topic for UPSC."
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS:
1. Extract specific facts, names, dates, numbers, and events from the context above.
2. Build UPSC-style MCQ questions around those facts.
3. Every question must be directly traceable to the context provided.
4. If the context mentions an index, rank, scheme, treaty, summit, or appointment — make a question on it.
5. Wrong options (distractors) must be plausible but clearly incorrect based on the context.
6. Explanation must reference the specific fact from the context and explain why it matters for UPSC.

COVER THESE DIMENSIONS as relevant to the topic:
- Government schemes, policies, bills, and appointments
- International relations, treaties, summits, global institutions (UN, IMF, WB, WTO, WHO)
- Economy & Finance — RBI decisions, budget, indices
- Science & Technology — Space (ISRO), defence, AI/digital, health
- Environment & Ecology — Climate summits, endangered species, national parks
- Sports & Culture — Awards (Padma, Nobel), UNESCO heritage
- India & World Rankings — Global indices (HDI, Press Freedom, Hunger Index, etc.)

${upscGS1Formats}`,

    // ── JEE ───────────────────────────────────────
    JEE: `
You are a JEE Main/Advanced question setter. Generate challenging questions on "${topic}".

Use a MIX of:
1. Numerical-based MCQ (real numbers, calculations required)
2. Concept application (2 concepts combined)
3. Common misconception traps
4. Graph/diagram interpretation (described in text)

STRICT RULES:
- Include actual numerical values in questions
- Options must differ by small margins to test precision
- Mention chapter/concept area in explanation
- 60% hard, 40% medium
- Show the key formula or concept in explanation
`,

    // ── NEET ──────────────────────────────────────
    NEET: `
You are a NEET UG question setter. Generate questions on "${topic}" strictly from NCERT syllabus.

Use a MIX of:
1. Assertion-Reason format (common in NEET)
2. Diagram/structure based (describe diagram in text)
3. Statement true/false combinations
4. Application-based (clinical/real-world biology)

STRICT RULES:
- Every answer must be traceable to NCERT textbook
- Use correct scientific/biological nomenclature
- For numerical: show calculation in explanation
- 50% hard, 50% medium
- Mention NCERT chapter in explanation
`,

    // ── CAT ───────────────────────────────────────
    CAT: `
You are a CAT question setter. Generate CAT-level questions on "${topic}".

Use a MIX of:
1. VARC: Para-jumble, Para-summary, Inference from passage
2. DILR: Data set interpretation with linked logic
3. QA: Word problems needing logical + math reasoning

STRICT RULES:
- Options must be very close to each other
- Avoid straightforward computation — require reasoning
- Explanation must show the elimination strategy
- 60% hard, 40% medium
`,

    // ── SSC ───────────────────────────────────────
    SSC: `
You are an SSC CGL/CHSL question setter. Generate questions on "${topic}".

Mix: Reasoning (analogy, series, coding-decoding), Quant (percentage, ratio, time-work, profit-loss), GK (static + current affairs), English (error spotting, fill in the blanks).

RULES:
- Options should be tricky and close
- For Quant: show shortcut method in explanation
- 40% hard, 60% medium
`,

    // ── Banking ───────────────────────────────────
    Banking: `
You are an IBPS/SBI PO question setter. Generate questions on "${topic}".

Mix: Reasoning puzzles (seating, ordering), Quant (data interpretation, simplification, approximation), Banking/Financial Awareness, English (reading comprehension inference).

RULES:
- Include at least 2 data interpretation style questions if topic allows
- Options must be numerical and close in value
- Explanation must show step-by-step working
- 50% hard, 50% medium
`,

    // ── GATE ──────────────────────────────────────
    GATE: `
You are a GATE question setter. Generate technical questions on "${topic}".

Mix:
1. Numerical Answer Type (give 4 close numerical options)
2. Concept application requiring derivation
3. Multi-step technical problems

RULES:
- Include actual formulas and derivations in explanation
- Options must be technically precise
- Mention GATE subject/unit in explanation
- 60% hard, 40% medium
`,

    // ── General ───────────────────────────────────
    General: `
Generate clear, well-structured MCQ questions on "${topic}".
Mix easy, medium and hard difficulty. Make distractors plausible but clearly distinguishable.
Explanation should be educational and 2-3 sentences.
`,
  };

  const instruction = examInstructions[exam] || examInstructions["General"];

  // Build mandatory per-question format plan for UPSC GS1 and Current Affairs
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

  // Build mandatory CSAT format plan
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
    formatPlan = `
MANDATORY FORMAT ASSIGNMENT — FOLLOW EXACTLY, NO EXCEPTIONS:
${buildGS1FormatPlan(count)}

WHAT EACH FORMAT MEANS:
- STATEMENT-BASED: "Consider the following statements: 1. ... 2. ... 3. ..." → "Which of the statements given above is/are correct?" with options like "1 only", "1 and 2 only", "2 and 3 only", "1, 2 and 3"
- STATEMENT-I/II: "Statement I: ... Statement II: ..." → 4 fixed options about correctness and whether II explains I
- MATCH-LIST: Two-column pipe-table (List I | List II) → "How many pairs are correctly matched?" with "Only one / Only two / Only three / All three"
- DIRECT: Single precise factual question with 4 distinct answer options
`;
  } else if (exam === "CSAT") {
    formatPlan = `
MANDATORY FORMAT ASSIGNMENT — FOLLOW EXACTLY, NO EXCEPTIONS:
${buildCSATFormatPlan(count)}

WHAT EACH FORMAT MEANS:
- READING-COMPREHENSION: Write a short passage (5–8 lines) in the question field, then ask ONE inference/conclusion question about it
- LOGICAL-REASONING: Syllogism, coding-decoding, series, blood relation, direction sense, or statement-conclusion puzzle
- NUMERACY: A word problem with actual numbers requiring calculation (%, ratio, SI/CI, profit-loss, time-work, speed-distance)
- DATA-INTERPRETATION: Describe a small table or chart in text with actual numbers, then ask ONE analytical question on it
- DECISION-MAKING: An administrative or ethical situation with 4 realistic response options — only one is clearly best
- MENTAL-ABILITY: Analogy, odd-one-out, pattern, or matrix question described in words
`;
  }

  return `${instruction}${formatPlan}

Generate EXACTLY ${count} questions on the topic: "${topic}" for ${exam} exam.

Return ONLY a valid JSON array. No markdown, no extra text, no explanation outside JSON.
Format:
[
  {
    "question": "Full question text here",
    "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
    "correct": 0,
    "explanation": "Detailed explanation with specific citations, calculations, or reasoning. Minimum 2–3 sentences.",
    "questionType": "statement-based | statement-I-II | match-list | direct | comprehension | logical | numeracy | data-interpretation | decision-making | mental-ability | current-affairs"
  }
]

- "correct" is the 0-based index (0=A, 1=B, 2=C, 3=D)
- Explanation must cite the specific fact/law/chapter/calculation that makes it correct and why others are wrong
- Return exactly ${count} questions, no more, no less
- NEVER use "All of the above" or "None of the above" as options`;
};

// ── BASIC ─────────────────────────────────────────
app.get("/", (req, res) => res.send("✅ Backend running"));
app.get("/health", (req, res) => res.send("Server alive"));

// ── CHAT HISTORY ──────────────────────────────────
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

// ── CHAT ──────────────────────────────────────────
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

// ── QUIZ ──────────────────────────────────────────
app.post("/quiz/generate", async (req, res) => {
  const { topic, exam = "General", count = 10 } = req.body;
  if (!topic) return res.status(400).json({ error: "Topic is required" });

  // ✅ Fetch live NewsAPI context ONLY for Current Affairs
  let contextBlock = "";
  if (exam === "Current Affairs") {
    console.log(`📰 Fetching NewsAPI context for: "${topic}"`);
    contextBlock = await fetchNewsContext(topic);
    if (contextBlock) {
      console.log("✅ NewsAPI context fetched successfully");
    } else {
      console.warn(
        "⚠️  NewsAPI returned no context — falling back to model knowledge"
      );
    }
  }

  const prompt = getQuizPrompt(exam, topic, count, contextBlock);

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
          temperature: 0.4,
          // Use more tokens for Current Affairs since prompt is larger with news context
          max_tokens: exam === "Current Affairs" ? 6000 : 4096,
        }),
      }
    );

    // ✅ Guard: check HTTP status first
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error?.message || `Groq API error: ${response.status}`
      );
    }

    const data = await response.json();

    // ✅ Guard: check content exists before calling .replace()
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response from AI");

    const jsonStr = content.replace(/```json|```/g, "").trim();
    const questions = JSON.parse(jsonStr);
    if (!Array.isArray(questions)) throw new Error("Invalid format");

    res.json({
      questions,
      // Let the frontend know if live context was used
      contextUsed: exam === "Current Affairs" && !!contextBlock,
    });
  } catch (err) {
    console.error("Quiz error:", err.message);
    res.status(500).json({ error: "Failed to generate quiz." });
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

// ── STUDY PLANNER ─────────────────────────────────
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
- Generate EXACTLY ${planDays} day objects, no more, no less
- Last 2 days = full revision
- Date for day 1 = ${today.toISOString().split("T")[0]}
- Keep each day's data SHORT — focus max 5 words, topics max 2 items, revisionTip max 10 words
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
          model: "llama-3.3-70b-versatile",
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

// ── IMAGE ─────────────────────────────────────────
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
    if (req.file.mimetype === "application/pdf") {
      try {
        const buffer = new Uint8Array(req.file.buffer);
        const { text } = await extractText(buffer, { mergePages: true });
        if (text?.trim()) {
          const answer = await askAI(text.slice(0, 3000), req.body.exam);
          return res.json({ answer });
        }
      } catch (e) {
        console.log("PDF extraction failed:", e.message);
      }
      return res.json({
        answer:
          "⚠️ This appears to be a scanned PDF. Please use **Take a Photo** option instead.",
      });
    }
    const answer = await askAIWithImage(
      req.file.buffer,
      req.file.mimetype,
      req.body.exam
    );
    res.json({ answer });
  } catch (err) {
    console.error("File error:", err.message);
    res.status(500).json({ error: "File processing failed" });
  }
});

// ── TTS ───────────────────────────────────────────
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

// ── TRANSCRIPTION ─────────────────────────────────
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

// ── ERROR HANDLERS ────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) =>
  res.status(500).json({ error: "Internal server error" })
);

app.listen(5050, () =>
  console.log("✅ Backend running on http://localhost:5050")
);
