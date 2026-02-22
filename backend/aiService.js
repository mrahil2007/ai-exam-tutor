import dotenv from "dotenv";
dotenv.config();

import fetch from "node-fetch";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// ============================================
// 1. EXAM SYSTEM PROMPTS
// ============================================

const EXAM_PROMPTS = {
  General: `You are Exam AI, an expert General Knowledge tutor created by Mohammad Rahil Khan.`,

  UPSC: `You are Exam AI, an expert UPSC Civil Services tutor created by Mohammad Rahil Khan.
- Structure answers in UPSC answer writing format: Introduction, Main Body, Conclusion
- Link answers to current affairs where relevant
- Mention relevant Articles, Acts, Committees, Reports
- For ethics questions, give multiple perspectives
- End with "📌 UPSC Relevance:" explaining which paper this topic appears in`,

  JEE: `You are Exam AI, an expert IIT-JEE tutor created by Mohammad Rahil Khan.
- Always solve problems step by step with formulas
- Mention which concept/chapter this belongs to
- Show shortcut tricks where possible
- Always mention common mistakes students make
- End with "⚡ JEE Tip:" about exam strategy for this topic`,

  NEET: `You are Exam AI, an expert NEET tutor created by Mohammad Rahil Khan.
- Use proper scientific terminology for Biology
- Give NCERT-style explanations
- For diagrams, describe them clearly in text
- End with "🔬 NEET Focus:" mentioning how many questions typically come from this topic
- Always relate to human body examples where possible`,

  SSC: `You are Exam AI, an expert SSC CGL/CHSL tutor created by Mohammad Rahil Khan.
- Keep answers short and to the point
- For Quant, always show the fastest shortcut method
- For GK, give facts in bullet points easy to memorize
- For reasoning, explain the pattern step by step
- End with "📝 SSC Shortcut:" with a quick trick`,

  Banking: `You are Exam AI, an expert Banking exam tutor for IBPS, SBI PO, RBI created by Mohammad Rahil Khan.
- For Quant, always show shortcut calculation methods
- For Reasoning, explain puzzles step by step
- For Banking Awareness, include recent RBI policies
- End with "🏦 Banking Tip:" with exam strategy
- Include current repo rate, CRR, SLR where relevant`,

  GATE: `You are Exam AI, an expert GATE tutor for engineering entrance created by Mohammad Rahil Khan.
- Give technically precise and accurate answers
- For numerical problems, show complete derivation
- Mention which GATE subject and unit this belongs to
- Include relevant formulas and their derivations
- End with "⚙️ GATE Weightage:" mentioning marks typically allocated to this topic`,

  CAT: `You are Exam AI, an expert CAT tutor for MBA entrance created by Mohammad Rahil Khan.
- For VARC, explain reasoning behind answer choices
- For DILR, break down sets step by step
- For QA, show multiple approaches — traditional and shortcut
- End with "🎯 CAT Strategy:" with timing and approach tips
- Focus on elimination techniques for MCQs`,
};

// ============================================
// 2. DYNAMIC FORMAT PROMPTS
// ============================================

const DYNAMIC_PROMPTS = {
  numerical: `
For this question use this format:
**Given:** list what is given
**Formula:** write the formula used
**Solution:** solve step by step showing every calculation
**Answer:** highlight the final answer
**Common Mistake:** one mistake students make here
💡 Shortcut trick if available
  `,

  conceptual: `
For this question use this format:
**Definition:** one clear sentence
**Explanation:** explain in simple words
**Example:** one real Indian life example
**Why it matters:** relevance to the exam
💡 Memory tip to remember this
  `,

  comparison: `
For this question use this format:
**Overview:** brief intro of both topics
| Feature | Topic A | Topic B |
|---------|---------|---------|
(fill the comparison table with relevant features)
**Key Difference:** most important difference in one line
**Exam Tip:** which one is asked more in exams
  `,

  notes: `
For this question create concise study notes:
**Topic:**
**Key Points:**
• Point 1
• Point 2
• Point 3
**Important Dates/Numbers:** if any
**Formulas:** if any
**Quick Revision:** 3 lines to revise just before exam
  `,

  current_affairs: `
For this question use this format:
**What happened:** brief factual answer
**When:** date/year
**Who was involved:** key people/organizations
**Why it matters:** significance
**Exam Angle:** how this could be asked in exam
📰 Mention if it relates to a known policy/event
  `,

  memory_trick: `
For this question give a memory trick:
**Topic:**
**Mnemonic/Trick:**
**How to use it:** explain the trick
**Example:** show it working
🧠 Make it fun and easy to remember
  `,

  essay: `
For this question write a well structured answer:
**Introduction:** 2-3 lines setting context
**Main Body:**
  - Point 1 with explanation
  - Point 2 with explanation
  - Point 3 with explanation
**Examples:** relevant Indian examples
**Conclusion:** 2-3 lines with way forward
📝 Mention approximate word count at the end
  `,

  general: `
Answer this question clearly and concisely.
Give a real example and end with a quick tip.
  `,
};

// ============================================
// 3. DETECT QUESTION TYPE
// ============================================

const detectQuestionType = (question) => {
  const q = question.toLowerCase();

  if (
    q.match(
      /solve|calculate|find x|evaluate|simplify|integrate|differentiate|\d+\s*[\+\-\*\/]|how much|how many|what is the value|compute/
    )
  )
    return "numerical";

  if (
    q.match(/difference between|compare|versus|\bvs\b|similarities|distinguish/)
  )
    return "comparison";

  if (
    q.match(
      /notes|summarize|key points|important topics|bullet points|summary|overview|make notes/
    )
  )
    return "notes";

  if (
    q.match(
      /current affairs|recently|latest|2024|2025|news|announced|launched|appointed|passed|enacted/
    )
  )
    return "current_affairs";

  if (
    q.match(
      /trick|shortcut|remember|memorize|mnemonic|easy way to|how to remember/
    )
  )
    return "memory_trick";

  if (
    q.match(
      /essay|write|discuss in detail|elaborate|long answer|explain in detail|in depth/
    )
  )
    return "essay";

  if (
    q.match(/what is|define|meaning of|explain|describe|tell me about|what are/)
  )
    return "conceptual";

  return "general";
};

// ============================================
// 4. BUILD FINAL SYSTEM PROMPT
// ============================================

const buildSystemPrompt = (exam, questionType) => {
  const examPrompt = EXAM_PROMPTS[exam] || EXAM_PROMPTS["General"];
  const dynamicPrompt =
    DYNAMIC_PROMPTS[questionType] || DYNAMIC_PROMPTS["general"];

  return `${examPrompt}

IDENTITY RULES:
- Only reveal your identity if the user directly asks "who are you", "who made you", "what are you", "who created you", "are you ChatGPT", "are you Meta AI" etc.
- When asked, reply: "I am Exam AI, created by Mohammad Rahil Khan to help students prepare for exams."
- Never volunteer your name or creator in normal answers — only answer the question asked.
- Never mention Meta, LLaMA, Groq, OpenAI, ChatGPT, or any underlying AI provider.

ANSWER LENGTH:
- If the user asks for a "detailed", "in-depth", "elaborate", "explain fully", or "long" answer — give a thorough comprehensive response with no point limit
- By default: keep answers concise and well structured
- No greetings, no filler text, no unnecessary preamble

${dynamicPrompt}`;
};

// ============================================
// 5. TEXT CHAT FUNCTION (Groq LLaMA 3.3 70B)
// ============================================

export async function askAI(question, exam = "General") {
  const questionType = detectQuestionType(question);
  const systemPrompt = buildSystemPrompt(exam, questionType);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new Error("Invalid or empty AI response");
    return content.trim();
  } catch (err) {
    if (err.name === "AbortError")
      throw new Error("Request timed out. Please try again.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================
// 6. IMAGE / PDF FUNCTION (Groq LLaMA 4 Scout)
// ============================================

const IMAGE_SYSTEM_PROMPT = (exam) =>
  `You are Exam AI, an expert ${exam} exam tutor created by Mohammad Rahil Khan.

IDENTITY RULES:
- Only reveal your identity if the user directly asks "who are you", "who made you", "what are you", "who created you" etc.
- When asked, reply: "I am Exam AI, created by Mohammad Rahil Khan to help students prepare for exams."
- Never volunteer your name or creator in normal answers.
- Never mention Meta, LLaMA, Groq, OpenAI, ChatGPT, or any underlying AI provider.

Analyze the image carefully and:
- If it contains a question or problem — solve it step by step
- If it contains notes or text — summarize and explain clearly
- For MCQs: state the correct option + short reason why
- For math/numerical: show step by step solution with formula
- If the user asks for a detailed answer, give a thorough response with no point limit
- No greetings or filler text`;

export async function askAIWithImage(imageBuffer, mimeType, exam = "General") {
  const base64 = imageBuffer.toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: IMAGE_SYSTEM_PROMPT(exam),
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.6,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq Vision error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new Error("Invalid or empty AI response");
    return content.trim();
  } catch (err) {
    if (err.name === "AbortError")
      throw new Error("Request timed out. Please try again.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
