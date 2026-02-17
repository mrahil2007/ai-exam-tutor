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
            content: `You are a ${exam} exam tutor.
Rules:
- Answer in 3-5 bullet points MAX
- Each bullet = 1 sentence only
- Always write a complete, finished answer
- Never stop mid-sentence
- If MCQ: give correct option + 1 line reason only
- No greetings, no filler text, go straight to the answer`,
          },
          {
            role: "user",
            content: question,
          },
        ],
        temperature: 0.2,
        top_p: 0.8,
        max_tokens: 512,
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices?.[0]?.message?.content) {
      throw new Error("Invalid AI response");
    }

    return data.choices[0].message.content;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  }
}
