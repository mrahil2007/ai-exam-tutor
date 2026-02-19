import dotenv from "dotenv";
dotenv.config();

import fetch from "node-fetch";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

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
          {
            role: "system",
            content: `You are an expert ${exam} exam tutor.
- Give clear, accurate, and complete answers
- Keep answers concise — max 9-10 key points
- For theory/concepts: explain simply with 1 example if needed
- For MCQs: state correct option + short reason
- For math/numerical: show step-by-step solution
- No greetings or filler text`,
          },
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

    if (!content?.trim()) {
      throw new Error("Invalid or empty AI response");
    }

    return content.trim();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
