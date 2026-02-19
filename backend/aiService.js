import dotenv from "dotenv";
dotenv.config();

import fetch from "node-fetch";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = (exam) => `You are an expert ${exam} exam tutor.
- Give clear, accurate, and complete answers
- Keep answers concise — max 9-10 key points
- For theory/concepts: explain simply with 1 example if needed
- For MCQs: state correct option + short reason
- For math/numerical: show step-by-step solution
- No greetings or filler text`;

// Text questions → Groq (free, fast)
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
        max_tokens: 1024,
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

// Image questions → Groq Llama 4 Scout (free + sees images!)
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
                text: `You are an expert ${exam} exam tutor.
- Read the image carefully
- Answer or explain what is written/asked in the image
- For MCQs: state correct option + short reason
- For math/numerical: show step-by-step solution
- Be clear and concise`,
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
        max_tokens: 1024,
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
