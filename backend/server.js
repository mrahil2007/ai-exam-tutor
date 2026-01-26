import express from "express";
import cors from "cors";

import { askAI } from "./aiService.js";








const app = express();

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
  res.send("✅ Backend root working");
});

app.get("/test", (req, res) => {
  res.send("✅ GET /test working");
});


app.post("/chat", async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }

  try {
    const answer = await askAI(question);
    res.json({ answer });
  } catch (err) {
    console.error("AI error:", err.message);
    res.status(500).json({
      error: "AI service failed",
      details: err.message
    });
  }
});

console.log("HF TOKEN LOADED:", process.env.HF_TOKEN?.slice(0, 10));



app.listen(5050, () => {
  console.log("✅ Backend running on http://localhost:5050");
});
