import fetch from "node-fetch";

const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";

export async function askAI(question, exam = "General") {
  const prompt = `
You are an expert competitive exam tutor.

Target Exam: ${exam}

You help students prepare for ALL competitive exams such as:
UPSC, JEE, NEET, SSC, Banking, GATE, CAT, State PSC, Defence exams.

Guidelines:
- Adapt your explanation specifically for the target exam
- Use simple, clear language
- Use headings and bullet points when helpful
- For theory exams (UPSC/SSC): be conceptual and structured
- For technical exams (JEE/NEET/GATE): explain step-by-step
- Do NOT cut the answer midway
- End with a short summary if the topic is long

Tutor Behaviour (VERY IMPORTANT):
- After answering, ALWAYS ask the student about their WEAKNESSES
- Identify likely weak areas related to this topic
- Ask 1–2 diagnostic follow-up questions to find gaps in understanding
- Suggest practical ways to FIX those weaknesses
  (e.g. revision method, practice type, PYQs, MCQs, numericals)
- Encourage the student and guide the next step in preparation

Question:
${question}
`;

  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.HF_TOKEN}`
    },
    body: JSON.stringify({
      model: "meta-llama/Meta-Llama-3-8B-Instruct",
      messages: [
        {
          role: "system",
          content: "You are a helpful and accurate competitive exam tutor."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 700
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  const data = await response.json();

  return data.choices[0].message.content;
}
