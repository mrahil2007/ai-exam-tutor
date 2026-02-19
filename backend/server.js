import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import { extractText } from "unpdf";
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
    if (!req.file) return res.status(400).json({ error: "File required" });

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Only JPEG/PNG/WEBP/PDF allowed" });
    }

    // PDF handling
    if (req.file.mimetype === "application/pdf") {
      try {
        const buffer = new Uint8Array(req.file.buffer);
        const { text } = await extractText(buffer, { mergePages: true });

        if (text?.trim()) {
          // Text-based PDF ✅
          const answer = await askAI(text.slice(0, 3000), req.body.exam);
          return res.json({ answer });
        }
      } catch (e) {
        console.log("PDF text extraction failed:", e.message);
      }

      // Scanned/image-based PDF ❌
      return res.json({
        answer:
          "⚠️ This appears to be a scanned PDF. Please use **Take a Photo** option instead — it works much better for scanned documents and handwritten notes.",
      });
    }

    // Image → Groq vision
    const answer = await askAIWithImage(
      req.file.buffer,
      req.file.mimetype,
      req.body.exam
    );
    res.json({ answer });
  } catch (err) {
    console.error("File error:", err.message);
    res.status(500).json({ error: "File processing failed" });
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
