import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import Tesseract from "tesseract.js";
import { askAI, askAIWithImage } from "./aiService.js";

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
    if (!req.file) return res.status(400).json({ error: "Image required" });

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Only JPEG/PNG/WEBP allowed" });
    }

    // Gemini directly reads the image — no OCR needed!
    const answer = await askAIWithImage(
      req.file.buffer,
      req.file.mimetype,
      req.body.exam
    );
    res.json({ answer });
  } catch (err) {
    console.error("Image error:", err.message);
    res.status(500).json({ error: err.message });
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
