import express from "express";
import cors from "cors";
import { askAI } from "./aiService.js";
import multer from "multer";
import fetch from "node-fetch";
const app = express();

app.use(cors());
app.use(express.json());
const upload = multer();


app.get("/", (req, res) => {
  res.send("✅ Backend root working");
});

app.get("/test", (req, res) => {
  res.send("✅ GET /test working");
});

app.get("/health", (req, res) => {
  res.send("Server alive");
});


app.post("/chat", async (req, res) => {
  const { question, exam } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }

  try {
    const answer = await askAI(question, exam);
    res.json({ answer });
  } catch (err) {
    console.error("AI error:", err.message);
    res.status(500).json({
      error: "AI service failed",
      details: err.message
    });
  }
});
app.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Image required" });
    }

    const imageBuffer = req.file.buffer;

    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/microsoft/trocr-base-handwritten",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: imageBuffer,
      }
    );

    const result = await response.json();

    const extractedText =
      result?.text || "Unable to read text from image.";

    const answer = await askAI(extractedText, req.body.exam);

    res.json({ answer });
  } catch (err) {
    console.error("Image API error:", err);
    res.status(500).json({ error: "Image processing failed" });
  }
});



console.log("HF TOKEN LOADED:", process.env.HF_TOKEN?.slice(0, 10));


app.listen(5050, () => {
  console.log("✅ Backend running on http://localhost:5050");
});
