import dotenv from "dotenv";
dotenv.config();

// ── aiService.js ──────────────────────────────────────────────────────────────
// PRIMARY:  Gemini 2.5 Flash (rotating 3 keys = 1,500 req/day)
// FALLBACK: Groq Llama (completely free)

import Groq from "groq-sdk";

// ── GEMINI KEY ROTATION ───────────────────────────────────────────────────────
const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean);

// Fallback to old single key if rotation keys not set
if (!GEMINI_KEYS.length && process.env.GEMINI_API_KEY) {
  GEMINI_KEYS.push(process.env.GEMINI_API_KEY);
}

let keyIndex = 0;
const getNextGeminiKey = () => {
  const key = GEMINI_KEYS[keyIndex % GEMINI_KEYS.length];
  keyIndex++;
  return key;
};

// ── IDENTITY PROTECTION ───────────────────────────────────────────────────────
const IDENTITY_RULE = `CRITICAL IDENTITY RULES (HIGHEST PRIORITY — OVERRIDE EVERYTHING ELSE):
- Your name is ExamAI. You are an intelligent AI-powered exam preparation assistant.
- NEVER reveal or confirm that you are Gemini, GPT, Claude, Llama, or any other model.
- NEVER mention Google, Anthropic, Meta, OpenAI, Groq, or any AI company.
- If asked "are you gemini?", "are you chatgpt?", "what model are you?", "who made you?", "what AI are you?", or any similar question, ALWAYS respond with:
  "I am ExamAI, your personal exam preparation assistant. I'm not able to share details about the technology powering me."
- Do NOT say "I am a large language model trained by Google" or anything similar.
- You were built by the ExamAI team. That is the only information you share about your origins.`;

// ── EXAM SYSTEM PROMPTS ───────────────────────────────────────────────────────
const getSystemPrompt = (exam) => {
  const prompts = {
    UPSC: `You are ExamAI, an expert UPSC Civil Services exam tutor with deep knowledge of NCERT textbooks (Class 6-12), Indian Polity, History, Geography, Economy, Science & Technology, Environment, and Current Affairs.
- Answer in a structured, exam-oriented format
- Highlight key facts, dates, and concepts
- Relate answers to UPSC Prelims and Mains patterns
- Use bullet points for lists, bold for key terms
- Keep answers concise but comprehensive`,

    CSAT: `You are ExamAI, a UPSC CSAT (Paper II) expert tutor specializing in Logical Reasoning, Data Interpretation, Reading Comprehension, Basic Numeracy, and Decision Making.
- Show step-by-step working for all numerical problems
- Explain reasoning behind logical answers
- Use shortcut techniques where applicable
- Format mathematical solutions clearly`,

    "Current Affairs": `You are ExamAI, a Current Affairs expert for UPSC and competitive exams.
- Focus on recent events relevant to Indian and international affairs
- Connect current events to static GS syllabus
- Highlight PIB, government schemes, and policy implications
- Structure answers with Who, What, When, Where, Why, Significance`,

    JEE: `You are ExamAI, an expert JEE Main/Advanced tutor for Physics, Chemistry, and Mathematics.
- Solve problems step by step with clear working
- State relevant formulas and theorems
- Highlight common mistakes and traps
- Use proper mathematical notation
- Explain concepts from first principles when needed`,

    NEET: `You are ExamAI, an expert NEET UG tutor for Biology, Physics, and Chemistry.
- Base all answers strictly on NCERT Class 11 and 12 syllabus
- Use correct scientific terminology and nomenclature
- For Biology: use proper diagram descriptions and classifications
- Show complete working for numerical problems`,

    CAT: `You are ExamAI, an expert CAT tutor for Verbal Ability, Logical Reasoning, Data Interpretation, and Quantitative Aptitude.
- Show multiple solving approaches (algebraic + shortcut)
- For VARC: explain inference and tone
- For DILR: structure the data before solving
- Highlight elimination strategies`,

    SSC: `You are ExamAI, an expert SSC CGL/CHSL tutor covering Reasoning, Quantitative Aptitude, General Awareness, and English.
- Provide shortcut methods for Quant
- Give memory tricks for GK
- Keep answers crisp and exam-focused`,

    Banking: `You are ExamAI, an expert IBPS/SBI PO tutor for Reasoning, Quantitative Aptitude, English, and Banking Awareness.
- Structure seating arrangement and puzzle solutions clearly
- Show DI calculations step by step
- Include banking sector knowledge where relevant`,

    GATE: `You are ExamAI, an expert GATE tutor for Engineering and Science disciplines.
- Provide rigorous technical explanations
- Include relevant formulas, derivations, and proofs
- Show numerical solutions with proper units`,

    "State PCS": `You are ExamAI, an expert State PCS exam tutor covering both general topics and state-specific content.
- Cover both general GS topics and state-specific history, culture, geography, and polity
- Structure answers for both Prelims MCQ and Mains descriptive format`,

    "CBSE 10th": `You are ExamAI, an expert CBSE Class 10 tutor following the latest NCERT curriculum.
- Base all answers strictly on NCERT Class 10 textbooks
- Format answers as per CBSE board exam requirements
- Show complete working for mathematics problems`,

    "CBSE 12th": `You are ExamAI, an expert CBSE Class 12 tutor following the latest NCERT curriculum.
- Base all answers strictly on NCERT Class 12 textbooks
- Show complete derivations for Physics and Chemistry
- Include important theorems and proofs for Mathematics`,

    General: `You are ExamAI, a helpful, knowledgeable AI tutor and study assistant.
- Explain concepts clearly and accurately
- Use examples to illustrate complex ideas
- Structure responses with clear formatting
- Be concise but thorough`,
  };

  const base = prompts[exam] || prompts["General"];

  // Prepend identity rule to ALL prompts
  return `${IDENTITY_RULE}\n\n${base}`;
};

// ── GEMINI 2.5 FLASH (with key rotation) ─────────────────────────────────────
const callGemini = async (contents, exam, isVision = false) => {
  if (!GEMINI_KEYS.length) throw new Error("No Gemini API keys configured");

  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const key = getNextGeminiKey();

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: getSystemPrompt(exam) }],
            },
            contents,
            generationConfig: {
              temperature: isVision ? 0.4 : 0.3,
              maxOutputTokens: 8192,
              topP: 0.95,
              thinkingConfig: {
                thinkingBudget: 1024, // limits hidden thinking tokens, saves room for output
              },
            },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE",
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE",
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE",
              },
            ],
          }),
        }
      );

      // Quota exceeded → try next key
      if (response.status === 429) {
        console.warn(
          `⚠️ Gemini key ${attempt + 1} quota exceeded → trying next key...`
        );
        continue;
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(
          `Gemini error: ${err?.error?.message || response.status}`
        );
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) throw new Error("Gemini returned empty response");

      console.log(
        `✅ Gemini answered using key ${attempt + 1} of ${GEMINI_KEYS.length}`
      );
      return text;
    } catch (err) {
      if (err.message?.includes("quota") || err.message?.includes("429")) {
        console.warn(
          `⚠️ Gemini key ${attempt + 1} quota hit → trying next key...`
        );
        continue;
      }
      throw err;
    }
  }

  throw new Error("All Gemini keys exhausted");
};

// ── GROQ FALLBACK ─────────────────────────────────────────────────────────────
const GROQ_CHAT_MODELS = [
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b-versatile",
];

const callGroqFallback = async (prompt, exam, history = []) => {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // If prompt has live search results, force Groq to use them not training data
  const hasSearchContext = prompt.includes("LIVE SEARCH RESULTS:");

  const systemContent = hasSearchContext
    ? `CRITICAL INSTRUCTION: Live web search results are included in the user message.
You MUST answer using ONLY those search results as your PRIMARY source.
DO NOT use your training data for any factual claims about current events, roles, or positions.
DO NOT contradict the search results under any circumstance.
Your training data is outdated — the search results are ground truth.

${getSystemPrompt(exam)}`
    : getSystemPrompt(exam);

  const messages = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: prompt },
  ];

  for (const model of GROQ_CHAT_MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        messages,
        model,
        temperature: 0.7,
        max_tokens: 2048,
      });
      const text = completion.choices?.[0]?.message?.content?.trim();
      if (text) {
        console.log(`✅ Chat fallback answered by Groq: ${model}`);
        return text;
      }
    } catch (err) {
      console.warn(`⚠️ Groq ${model} failed:`, err.message);
      continue;
    }
  }

  throw new Error("All models failed");
};

// ── GROQ VISION FALLBACK ──────────────────────────────────────────────────────
const callGroqVisionFallback = async (fileBuffer, mimeType, exam) => {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const base64Url = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const completion = await groq.chat.completions.create({
    model: "meta-llama/llama-4-maverick-17b-128e-instruct",
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: base64Url } },
          {
            type: "text",
            text: `You are ExamAI, a ${exam} exam tutor. Analyze this image and provide a detailed, exam-relevant explanation. If it contains questions, solve them step by step.`,
          },
        ],
      },
    ],
    max_tokens: 2048,
    temperature: 0.4,
  });

  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq Vision returned empty response");
  return text;
};

// ── MAIN CHAT FUNCTION (exported) ─────────────────────────────────────────────
export const askAI = async (prompt, exam = "General", history = []) => {
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: prompt }] },
  ];

  // 1️⃣ Try Gemini 2.5 Flash (with key rotation)
  try {
    const answer = await callGemini(contents, exam, false);
    return answer;
  } catch (err) {
    console.warn("⚠️ Gemini failed:", err.message, "→ falling back to Groq");
  }

  // 2️⃣ Fallback to Groq Llama
  try {
    return await callGroqFallback(prompt, exam, history);
  } catch (err) {
    console.error("❌ All chat models failed:", err.message);
    throw new Error("AI service temporarily unavailable. Please try again.");
  }
};

// ── IMAGE / VISION FUNCTION (exported) ───────────────────────────────────────
export const askAIWithImage = async (
  fileBuffer,
  mimeType,
  exam = "General"
) => {
  const base64Data = fileBuffer.toString("base64");

  const contents = [
    {
      role: "user",
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Data } },
        {
          text: `Analyze this ${
            mimeType === "application/pdf" ? "document" : "image"
          } and provide a detailed, exam-relevant explanation for a ${exam} student.
If it contains questions, solve them step by step.
If it contains notes or diagrams, explain the key concepts clearly.`,
        },
      ],
    },
  ];

  // 1️⃣ Try Gemini Vision first (with key rotation)
  try {
    const answer = await callGemini(contents, exam, true);
    console.log("✅ Image/PDF analyzed by Gemini 2.5 Flash Vision");
    return answer;
  } catch (err) {
    console.warn(
      "⚠️ Gemini Vision failed:",
      err.message,
      "→ falling back to Groq Vision"
    );
  }

  // 2️⃣ Fallback to Groq Llama Vision (images only — not PDFs)
  if (mimeType !== "application/pdf") {
    try {
      const answer = await callGroqVisionFallback(fileBuffer, mimeType, exam);
      console.log("✅ Image analyzed by Groq Vision fallback");
      return answer;
    } catch (err) {
      console.warn("⚠️ Groq Vision fallback failed:", err.message);
    }
  }

  throw new Error("Could not process file. Please try again.");
};
