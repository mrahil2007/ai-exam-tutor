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

// ── EXAM-AWARE QUIZ PROMPT ────────────────────────
const getQuizPrompt = (exam, topic, count) => {
  const examInstructions = {
    UPSC: `
You are a UPSC Civil Services Preliminary Examination question setter. Study these EXACT formats from UPSC CSP 2025 paper and replicate them faithfully for the topic "${topic}".

FORMAT 1 — STATEMENT-BASED (PRIMARY FORMAT — use for 60% of all questions generated):
"Consider the following statements:
1. [Factual statement — mix of true and false]
2. [Factual statement — mix of true and false]  
3. [Factual statement — mix of true and false]
Which of the statements given above is/are correct?
A) 1 only  B) 1 and 2 only  C) 2 and 3 only  D) 1, 2 and 3"
→ Options must be: "X only", "X and Y only", "X, Y and Z", "None" — never "All of the above"
→ Exactly 2-3 statements. At least one statement must be subtly WRONG (plausible but incorrect)
→ The correct answer should NOT always be "all correct" — vary it

FORMAT 2 — STATEMENT I / STATEMENT II (~20% of questions):
"Consider the following statements:
Statement I: [A factual claim]
Statement II: [A related but different factual claim]
Which one of the following is correct in respect of the above statements?
A) Both Statement I and Statement II are correct and Statement II explains Statement I
B) Both Statement I and Statement II are correct but Statement II does not explain Statement I
C) Statement I is correct but Statement II is not correct
D) Statement I is not correct but Statement II is correct"
→ The two statements must be related but the connection (whether II explains I) is the trap

FORMAT 3 — MATCH LIST I WITH LIST II (~10% of questions):
"With reference to [topic], consider the following:
List I (Column heading): [item A], [item B], [item C], [item D]
List II (Column heading): [item 1], [item 2], [item 3], [item 4]
How many of the above pairs are correctly matched?
A) Only one  B) Only two  C) Only three  D) All four"
OR with combo options: "A) A-2, B-3, C-4, D-1  B) A-3, B-2, C-1, D-4  ..."
→ Use REAL matching items (Acts-Ministries, Countries-Resources, Events-Dates, etc.)
→ Include deliberate mismatches as traps

FORMAT 4 — COUNT-BASED (~5% of questions):
"Consider the following:
I. [item]
II. [item]
III. [item]
IV. [item]
How many of the above are [condition]?
A) Only one  B) Only two  C) Only three  D) All four"
→ Used for: NATO members, BRICS countries, treaty signatories, minerals, etc.

FORMAT 5 — DIRECT SINGLE ANSWER (~5% of questions):
A precise factual question with 4 options where only one is definitively correct.
Used for: "Who among the following...", "Which one of the following...", "When was...", "Where was..."

ABSOLUTE RULES FROM UPSC CSP 2025:
- MOST IMPORTANT: Out of every 10 questions, at least 6 MUST be FORMAT 1 (statement-based with numbered statements). Do NOT generate equal distribution — statement-based is what UPSC uses most.
- Every question MUST cite real Acts (with year), real Articles, real committee names, real places
- Distractors must use REAL but WRONG facts — not obviously fabricated ones
- Questions test ANALYTICAL thinking, NOT rote recall
- Options like "I and II only", "II and III only", "I and III only", "I, II and III" — use these exact phrasings
- NEVER use "All of the above" or "None of the above" — UPSC stopped using these
- Explanation must specify exactly WHICH Article/Act/fact/year makes each statement right or wrong
- For Statement I/II format: always use the exact 4-option structure shown above
- Difficulty: 50% hard (requires deep knowledge), 40% medium (requires analysis), 10% easy
- Topics to reference for ${topic}: use real current affairs 2023-2025, real constitutional provisions, real government schemes with correct details
`,

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

    SSC: `
You are an SSC CGL/CHSL question setter. Generate questions on "${topic}".

Mix: Reasoning (analogy, series, coding-decoding), Quant (percentage, ratio, time-work, profit-loss), GK (static + current affairs), English (error spotting, fill in the blanks).

RULES:
- Options should be tricky and close
- For Quant: show shortcut method in explanation
- 40% hard, 60% medium
`,

    Banking: `
You are an IBPS/SBI PO question setter. Generate questions on "${topic}".

Mix: Reasoning puzzles (seating, ordering), Quant (data interpretation, simplification, approximation), Banking/Financial Awareness, English (reading comprehension inference).

RULES:
- Include at least 2 data interpretation style questions if topic allows
- Options must be numerical and close in value
- Explanation must show step-by-step working
- 50% hard, 50% medium
`,

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

    General: `
Generate clear, well-structured MCQ questions on "${topic}".
Mix easy, medium and hard difficulty. Make distractors plausible but clearly distinguishable.
Explanation should be educational and 2-3 sentences.
`,
  };

  const instruction = examInstructions[exam] || examInstructions["General"];

  // For UPSC: build a mandatory per-question format assignment
  const buildFormatPlan = (n) => {
    // Pattern per 10 questions: 6 statement-based, 2 statement-I/II, 1 match-list, 1 direct
    const pattern = [
      "STATEMENT-BASED",
      "STATEMENT-BASED",
      "STATEMENT-BASED",
      "STATEMENT-I/II",
      "STATEMENT-BASED",
      "STATEMENT-BASED",
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

  const formatPlan =
    exam === "UPSC"
      ? `
MANDATORY FORMAT ASSIGNMENT — YOU MUST FOLLOW THIS EXACTLY, NO EXCEPTIONS:
${buildFormatPlan(count)}

WHAT EACH FORMAT MEANS:
- STATEMENT-BASED: Start with "Consider the following statements:" then numbered statements 1. 2. 3., end with "Which of the statements given above is/are correct?" with options like "1 only", "1 and 2 only", "2 and 3 only", "1, 2 and 3"
- STATEMENT-I/II: Start with "Consider the following statements: Statement I: ... Statement II: ..." then 4 fixed options about whether both are correct and whether II explains I
- MATCH-LIST: Two column table with List I and List II items to match, ask "How many pairs correctly matched?"
- DIRECT: Single precise factual question with 4 distinct answer options
`
      : "";

  return `${instruction}${formatPlan}

Generate EXACTLY ${count} questions on the topic: "${topic}" for ${exam} exam.

Return ONLY a valid JSON array. No markdown, no extra text, no explanation outside JSON.
Format:
[
  {
    "question": "Full question text here",
    "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
    "correct": 0,
    "explanation": "Detailed explanation citing the specific fact/article/law/chapter that makes this correct and why others are wrong.",
    "questionType": "statement-based | statement-I-II | match-list | direct"
  }
]

- "correct" is the 0-based index (0=A, 1=B, 2=C, 3=D)
- Explanation must be minimum 2-3 sentences with specific citations
- Return exactly ${count} questions, no more, no less
- For UPSC: NEVER use "All of the above" or "None of the above" as options`;
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
  const prompt = getQuizPrompt(exam, topic, count);
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
          temperature: 0.7,
          max_tokens: 4096,
        }),
      }
    );
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    const jsonStr = content.replace(/```json|```/g, "").trim();
    const questions = JSON.parse(jsonStr);
    if (!Array.isArray(questions)) throw new Error("Invalid format");
    res.json({ questions });
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
