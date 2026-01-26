import fetch from "node-fetch";

const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";

export async function askAI(question) {
    const prompt = `
  You are an expert UPSC exam tutor.
  
  Answer the question in a COMPLETE and WELL-STRUCTURED manner.
  - Use headings
  - Cover all major periods
  - Do NOT cut the answer midway
  - End with a short summary
  
  Question:
  ${question}
  `;
  
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.HF_TOKEN}`
      },
      body: JSON.stringify({
        model: "meta-llama/Meta-Llama-3-8B-Instruct",
        messages: [
          { role: "system", content: "You are a helpful exam tutor." },
          { role: "user", content: prompt }
        ],
        max_tokens: 1200,
        temperature: 0.7
      })
    });
  
    const data = await response.json();
  
    return data.choices[0].message.content;
  }
  
