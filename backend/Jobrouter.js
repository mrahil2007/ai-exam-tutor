// ═══════════════════════════════════════════════════════════════════════════
// jobRouter.js — Express router: GET /jobs · GET /jobs/:id · POST /jobs/subscribe
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from "express";
import { ObjectId } from "mongodb";

/**
 * @param {() => import('mongodb').Collection} getJobs  — db collection accessor
 */
export default function createJobRouter(getJobs) {
  const router = Router();

  // ── GET /jobs — paginated list with optional filters ──────────────────────
  router.get("/", async (req, res) => {
    try {
      const { exam, category, page = 1, limit = 20, isNew } = req.query;

      const filter = {};
      if (exam) filter.exam = { $in: [exam] };
      if (category) filter.category = category;
      if (isNew !== undefined) filter.isNew = isNew === "true";

      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(100, Math.max(1, Number(limit)));

      const [jobs, total] = await Promise.all([
        getJobs()
          .find(filter)
          .sort({ postedAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .toArray(),
        getJobs().countDocuments(filter),
      ]);

      res.json({
        jobs,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      });
    } catch (err) {
      console.error("GET /jobs error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /jobs/subscribe — must come BEFORE /:id to avoid ObjectId cast ────
  router.post("/subscribe", (req, res) => {
    const { exam } = req.body;
    if (!exam) return res.status(400).json({ error: "exam required" });

    const topic =
      "jobs_" +
      exam
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

    res.json({
      topic,
      message: `Subscribe your device to FCM topic: ${topic}`,
    });
  });

  // ── GET /jobs/:id — single job detail ────────────────────────────────────
  router.get("/:id", async (req, res) => {
    try {
      const job = await getJobs().findOne({ _id: new ObjectId(req.params.id) });
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.json(job);
    } catch (err) {
      console.error("GET /jobs/:id error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /jobs/:id/ask-ai — pre-built AI prompt for the chat screen ────────
  router.get("/:id/ask-ai", async (req, res) => {
    try {
      const job = await getJobs().findOne({ _id: new ObjectId(req.params.id) });
      if (!job) return res.status(404).json({ error: "Job not found" });

      const prompt = `I want complete information about this job:

📌 **${job.title}**
🏢 Organization: ${job.organization}
📅 Last Date: ${job.lastDate}
💼 Vacancies: ${job.vacancies}
💰 Salary: ${job.salary}

Please give me:
1. ✅ **Eligibility Criteria** — age limit, education, nationality
2. 📚 **Complete Syllabus** — subject-wise topics & exam pattern
3. 💰 **Salary & Benefits** — pay scale, HRA, DA, allowances, job perks
4. 📅 **Study Plan** — week-by-week preparation roadmap
5. 📖 **Best Books** — top recommended books & free resources
6. 🎯 **Selection Process** — all stages (Prelims / Mains / Interview / Physical)`;

      res.json({ prompt, job });
    } catch (err) {
      console.error("GET /jobs/:id/ask-ai error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
