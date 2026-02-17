import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import Tesseract from "tesseract.js";
import { askAI } from "./aiService.js";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer();

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing!");
  process.exit(1);
}

// Routes
app.get("/", (req, res) => res.send("✅ Backend running"));
app.get("/health", (req, res) => res.send("Server alive"));

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
    res.status(500).json({ error: err.message });
  }
});

app.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Image required" });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Only JPEG/PNG/WEBP allowed" });
    }

    const {
      data: { text },
    } = await Tesseract.recognize(req.file.buffer, "eng");

    if (!text || !text.trim()) {
      return res.json({ answer: "⚠️ Could not detect text in image." });
    }

    const answer = await askAI(text, req.body.exam);
    res.json({ answer });
  } catch (err) {
    console.error("OCR error:", err.message);
    res.status(500).json({ error: "Image processing failed" });
  }
});

// 404 & error handlers
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) =>
  res.status(500).json({ error: "Internal server error" })
);

app.listen(5050, () =>
  console.log("✅ Backend running on http://localhost:5050")
);
