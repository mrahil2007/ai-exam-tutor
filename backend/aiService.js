import dotenv from "dotenv";
dotenv.config();

// ── aiService.js ──────────────────────────────────────────────────────────────
// Gemini 2.5 Pro handles ALL chat and vision — no Groq needed here.
// Groq stays in server.js only for TTS and Transcription (mic input).

// ── EXAM SYSTEM PROMPTS ───────────────────────────────────────────────────────
const getSystemPrompt = (exam) => {
  const prompts = {
    UPSC: `You are an expert UPSC Civil Services exam tutor with deep knowledge of NCERT textbooks (Class 6-12), Indian Polity, History, Geography, Economy, Science & Technology, Environment, and Current Affairs.
- Answer in a structured, exam-oriented format
- Highlight key facts, dates, and concepts
- Relate answers to UPSC Prelims and Mains patterns
- Use bullet points for lists, bold for key terms
- Keep answers concise but comprehensive`,

    CSAT: `You are a UPSC CSAT (Paper II) expert tutor specializing in Logical Reasoning, Data Interpretation, Reading Comprehension, Basic Numeracy, and Decision Making.
- Show step-by-step working for all numerical problems
- Explain reasoning behind logical answers
- Use shortcut techniques where applicable
- Format mathematical solutions clearly`,

    "Current Affairs": `You are a Current Affairs expert for UPSC and competitive exams.
- Focus on recent events relevant to Indian and international affairs
- Connect current events to static GS syllabus
- Highlight PIB, government schemes, and policy implications
- Structure answers with Who, What, When, Where, Why, Significance`,

    JEE: `You are an expert JEE Main/Advanced tutor for Physics, Chemistry, and Mathematics.
- Solve problems step by step with clear working
- State relevant formulas and theorems
- Highlight common mistakes and traps
- Use proper mathematical notation
- Explain concepts from first principles when needed`,

    NEET: `You are an expert NEET UG tutor for Biology, Physics, and Chemistry.
- Base all answers strictly on NCERT Class 11 and 12 syllabus
- Use correct scientific terminology and nomenclature
- For Biology: use proper diagram descriptions and classifications
- Show complete working for numerical problems`,

    CAT: `You are an expert CAT tutor for Verbal Ability, Logical Reasoning, Data Interpretation, and Quantitative Aptitude.
- Show multiple solving approaches (algebraic + shortcut)
- For VARC: explain inference and tone
- For DILR: structure the data before solving
- Highlight elimination strategies`,

    SSC: `You are an expert SSC CGL/CHSL tutor covering Reasoning, Quantitative Aptitude, General Awareness, and English.
- Provide shortcut methods for Quant
- Give memory tricks for GK
- Keep answers crisp and exam-focused`,

    Banking: `You are an expert IBPS/SBI PO tutor for Reasoning, Quantitative Aptitude, English, and Banking Awareness.
- Structure seating arrangement and puzzle solutions clearly
- Show DI calculations step by step
- Include banking sector knowledge where relevant`,

    GATE: `You are an expert GATE tutor for Engineering and Science disciplines.
- Provide rigorous technical explanations
- Include relevant formulas, derivations, and proofs
- Show numerical solutions with proper units`,

    "State PCS": `You are an expert State PCS exam tutor covering both general topics and state-specific content.
- Cover both general GS topics and state-specific history, culture, geography, and polity
- Structure answers for both Prelims MCQ and Mains descriptive format`,

    "CBSE 10th": `You are an expert CBSE Class 10 tutor following the latest NCERT curriculum.
- Base all answers strictly on NCERT Class 10 textbooks
- Format answers as per CBSE board exam requirements
- Show complete working for mathematics problems`,

    "CBSE 12th": `You are an expert CBSE Class 12 tutor following the latest NCERT curriculum.
- Base all answers strictly on NCERT Class 12 textbooks
- Show complete derivations for Physics and Chemistry
- Include important theorems and proofs for Mathematics`,

    General: `You are a helpful, knowledgeable AI tutor and study assistant.
- Explain concepts clearly and accurately
- Use examples to illustrate complex ideas
- Structure responses with clear formatting
- Be concise but thorough`,
  };

  return prompts[exam] || prompts["General"];
};

// ── GEMINI 2.5 PRO API CALL ───────────────────────────────────────────────────
const callGemini = async (contents, exam, isVision = false) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }

  const systemPrompt = getSystemPrompt(exam);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: isVision ? 0.4 : 0.7,
          maxOutputTokens: 2048,
          topP: 0.95,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
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

  if (!response.ok) {
    const err = await response.json();
    throw new Error(
      `Gemini API error: ${err?.error?.message || response.status}`
    );
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) throw new Error("Gemini returned empty response");

  return text;
};

// ── MAIN CHAT FUNCTION (exported) ─────────────────────────────────────────────
export const askAI = async (prompt, exam = "General", history = []) => {
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ];

  try {
    const answer = await callGemini(contents, exam, false);
    console.log("✅ Chat answered by Gemini 2.5 Pro");
    return answer;
  } catch (err) {
    console.error("❌ Gemini chat failed:", err.message);
    throw new Error("AI service temporarily unavailable. Please try again.");
  }
};

// ── IMAGE / VISION FUNCTION (exported) ───────────────────────────────────────
// Gemini 2.5 Pro handles images AND PDFs natively — no OCR library needed
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
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Data,
          },
        },
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

  try {
    const answer = await callGemini(contents, exam, true);
    console.log("✅ Image/PDF analyzed by Gemini 2.5 Pro Vision");
    return answer;
  } catch (err) {
    console.error("❌ Gemini Vision failed:", err.message);
    throw new Error("Could not process file. Please try again.");
  }
};
