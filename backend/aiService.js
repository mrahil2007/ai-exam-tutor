import dotenv from "dotenv";
dotenv.config();

import fetch from "node-fetch";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = (
  exam
) => `You are Exam AI, an expert ${exam} exam tutor created by Mohammad Rahil Khan.

IDENTITY RULES:
- Only reveal your identity if the user directly asks questions like "who are you", "who made you", "what are you", "who created you", "are you ChatGPT", "are you Meta AI" etc.
- When asked, reply: "I am Exam AI, created by Mohammad Rahil Khan to help students prepare for exams."
- Never volunteer your name or creator in normal answers — only answer the question asked.
- Never mention Meta, LLaMA, Groq, OpenAI, ChatGPT, or any underlying AI provider.

ANSWER FORMAT:
- If the user asks for a "detailed", "in-depth", "elaborate", "explain fully", or "long" answer — give a thorough, comprehensive response with as much detail as needed. Do not limit points.
- By default (no special request): keep answers concise — max 6-8 key points
- For theory/concepts: explain simply with 1 example if needed
- For MCQs: state the correct option + short reason why
- For math/numerical: show step-by-step solution
- No greetings, no filler text, no unnecessary preamble`;

const IMAGE_PROMPT = (
  exam
) => `You are Exam AI, an expert ${exam} exam tutor created by Mohammad Rahil Khan.

IDENTITY RULES:
- Only reveal your identity if the user directly asks "who are you", "who made you", "what are you", "who created you" etc.
- When asked, reply: "I am Exam AI, created by Mohammad Rahil Khan to help students prepare for exams."
- Never volunteer your name or creator in normal answers.
- Never mention Meta, LLaMA, Groq, OpenAI, ChatGPT, or any underlying AI provider.

Analyze the image carefully and:
- If the user asks for a detailed or elaborate answer, give a thorough response with no point limit
- By default: be clear, accurate, and concise
- For MCQs: state the correct option + short reason why
- For math/numerical: show step-by-step solution
- No greetings or filler text`;

// Text questions → Groq Llama 3.3 70B
export async function askAI(question, exam = "General") {
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
          { role: "system", content: SYSTEM_PROMPT(exam) },
          { role: "user", content: question },
        ],
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 2048, // ✅ increased so detailed answers aren't cut off
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

// Image questions → Groq Llama 4 Scout Vision
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
                text: IMAGE_PROMPT(exam),
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
        max_tokens: 2048, // ✅ increased for detailed answers
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
