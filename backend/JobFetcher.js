// ═══════════════════════════════════════════════════════════════════════════
// jobFetcher.js — Job ingestion: RSS · LinkedIn · FCM push · Cron scheduler
// ═══════════════════════════════════════════════════════════════════════════

import Parser from "rss-parser";
import cron from "node-cron";
import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const linkedIn = require("linkedin-jobs-api");

// ── Firebase Admin (FCM) ──────────────────────────────────────────────────────
let fcmEnabled = false;

export function initFirebase() {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (!admin.apps.length)
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      fcmEnabled = true;
      console.log("✅ Firebase Admin initialized — FCM enabled");
    } else {
      console.warn("⚠️  FIREBASE_SERVICE_ACCOUNT not set — FCM push disabled.");
    }
  } catch (err) {
    console.warn("⚠️  Firebase Admin init failed:", err.message);
  }
}

// ── RSS parser config ─────────────────────────────────────────────────────────
const rssParser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "ExamAI-JobBot/1.0" },
  customFields: { item: ["description", "pubDate", "link", "title"] },
  requestOptions: { rejectUnauthorized: false },
});

// ── RSS feed sources ──────────────────────────────────────────────────────────
const RSS_SOURCES = [
  // ── Indian Govt Jobs ────────────────────────────────────────────────────────
  {
    url: "https://www.freejobalert.com/feed/",
    organization: "Various Govt Organizations",
    exam: ["SSC", "UPSC", "Banking", "Railway", "State PSC", "General"],
    category: "government",
    source: "FreeJobAlert",
  },
  {
    url: "https://www.freejobalert.com/feed/?cat=latest-jobs",
    organization: "Various Govt Organizations",
    exam: ["SSC", "UPSC", "Banking", "Railway", "State PSC", "General"],
    category: "government",
    source: "FreeJobAlert Latest",
  },
  // ── International Remote Jobs ───────────────────────────────────────────────
  {
    url: "https://remoteok.com/remote-jobs.rss",
    organization: "Various Companies",
    exam: ["General"],
    category: "international",
    source: "RemoteOK",
  },
  {
    url: "https://weworkremotely.com/remote-jobs.rss",
    organization: "Various Companies",
    exam: ["General"],
    category: "international",
    source: "We Work Remotely",
  },
  {
    url: "https://jobicy.com/?feed=job_feed",
    organization: "Various Companies",
    exam: ["General"],
    category: "international",
    source: "Jobicy",
  },
];

// ── Text extraction helpers ───────────────────────────────────────────────────
export const extractLastDate = (text = "") => {
  const patterns = [
    /last date[:\s]+(\d{1,2}[\s\-\/]\w+[\s\-\/]\d{2,4})/i,
    /apply by[:\s]+(\d{1,2}[\s\-\/]\w+[\s\-\/]\d{2,4})/i,
    /closing date[:\s]+(\d{1,2}[\s\-\/]\w+[\s\-\/]\d{2,4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "See official site";
};

export const extractVacancies = (text = "") => {
  const match = text.match(
    /(\d[\d,]+)\s*(post|vacancy|vacancies|seat|opening)/i
  );
  return match ? match[1].replace(/,/g, "") + " posts" : "N/A";
};

export const mapToExams = (title = "", defaultExams = []) => {
  const lower = title.toLowerCase();
  const mapped = [];
  if (lower.includes("ssc")) mapped.push("SSC");
  if (lower.includes("upsc") || lower.includes("civil service"))
    mapped.push("UPSC");
  if (lower.includes("rrb") || lower.includes("railway"))
    mapped.push("Railway");
  if (lower.includes("ibps") || lower.includes("bank")) mapped.push("Banking");
  if (
    lower.includes("defence") ||
    lower.includes("army") ||
    lower.includes("navy")
  )
    mapped.push("Defence");
  if (lower.includes("psc")) mapped.push("State PCS");
  if (!mapped.includes("General")) mapped.push("General");
  return mapped.length > 0 ? mapped : [...defaultExams, "General"];
};

// ── FCM push notification ─────────────────────────────────────────────────────
export const sendJobPush = async (job) => {
  if (!fcmEnabled) return;
  try {
    const rawTopics = [...job.exam, "General"];
    const topics = [
      ...new Set(
        rawTopics.map(
          (e) =>
            "jobs_" +
            e
              .toLowerCase()
              .replace(/\s+/g, "_")
              .replace(/[^a-z0-9_]/g, "")
        )
      ),
    ];
    await Promise.all(
      topics.map((topic) =>
        admin
          .messaging()
          .send({
            topic,
            notification: {
              title: `🔔 New Job: ${job.title.substring(0, 55)}`,
              body: `${job.organization} · Apply by ${job.lastDate}`,
            },
            data: {
              type: "job_alert",
              jobId: job._id?.toString() || "",
              applyLink: job.applyLink,
            },
            android: {
              priority: "high",
              notification: {
                icon: "ic_notification",
                color: "#10b981",
                channelId: "job_alerts",
                clickAction: "OPEN_JOB_ALERTS",
              },
            },
          })
          .catch((err) =>
            console.warn(`FCM topic ${topic} failed:`, err.message)
          )
      )
    );
    console.log(`📲 FCM sent: ${job.title.substring(0, 50)}`);
  } catch (err) {
    console.error("FCM error:", err.message);
  }
};

// ── Titles to skip at ingestion ───────────────────────────────────────────────
const SKIP_TITLES = [
  // Junk/test posts
  "hello world",
  "dummy",
  "test post",
  "sample page",
  "ab dummy",
  "lorem ipsum",
  "untitled",
  // Results & notifications (not job postings)
  "result",
  "results",
  "answer key",
  "admit card",
  "call letter",
  "cut off",
  "cutoff",
  "merit list",
  "scorecard",
  "score card",
  "final answer",
  "provisional answer",
  "response sheet",
  "document verification",
  "dv schedule",
  "exam date",
  "exam schedule",
  "hall ticket",
  "interview schedule",
  "interview letter",
  "joining letter",
  "appointment letter",
  "selection list",
  "waiting list",
  "rank list",
  "marks released",
  "certificate verification",
];

// ── Fetch from a single RSS source ───────────────────────────────────────────
const fetchFromRSS = async (source, getJobs) => {
  try {
    console.log(`📡 RSS: ${source.source}`);
    const feed = await rssParser.parseURL(source.url);

    if (!feed?.items || !Array.isArray(feed.items)) {
      console.warn(`⚠️ No items: ${source.source}`);
      return 0;
    }

    const items = feed.items.slice(0, 20);
    let newCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      if (!item?.link || !item?.title) continue;

      const titleLower = item.title.toLowerCase();
      if (SKIP_TITLES.some((bad) => titleLower.includes(bad))) {
        skippedCount++;
        continue;
      }
      if (item.title.trim().length < 15) continue;

      const exists = await getJobs().findOne({ applyLink: item.link });
      if (exists) continue;

      const combined = `${item.title} ${item.description || ""}`;
      const job = {
        title: item.title.trim(),
        organization: source.organization,
        category: source.category,
        exam: mapToExams(item.title, source.exam),
        lastDate: extractLastDate(combined),
        vacancies: extractVacancies(combined),
        salary: "As per govt norms",
        applyLink: item.link,
        description: (item.description || "")
          .replace(/<[^>]*>/g, "")
          .substring(0, 500),
        source: source.source,
        postedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        isNew: true,
      };

      const result = await getJobs().insertOne(job);
      job._id = result.insertedId;
      await sendJobPush(job);
      newCount++;
    }

    console.log(
      `✅ ${source.source}: ${newCount} new jobs (${skippedCount} skipped)`
    );
    return newCount;
  } catch (err) {
    console.error(`❌ RSS [${source.source}]: ${err.message}`);
    return 0;
  }
};

// ── Fetch from LinkedIn ───────────────────────────────────────────────────────
const fetchFromLinkedIn = async (getJobs) => {
  try {
    console.log("📡 LinkedIn Jobs...");

    const queries = [
      { keyword: "government jobs India", category: "government" },
      {
        keyword: "SSC UPSC Banking Railway recruitment",
        category: "government",
      },
      { keyword: "private jobs India fresher", category: "private" },
      { keyword: "IT software jobs India", category: "private" },
    ];

    let newCount = 0;

    for (const q of queries) {
      const results = await linkedIn.query({
        keyword: q.keyword,
        location: "India",
        dateSincePosted: "past Week",
        limit: "10",
      });

      for (const item of results) {
        if (!item.jobUrl || !item.position) continue;

        const titleLower = item.position.toLowerCase();
        if (SKIP_TITLES.some((bad) => titleLower.includes(bad))) continue;

        const exists = await getJobs().findOne({ applyLink: item.jobUrl });
        if (exists) continue;

        const job = {
          title: item.position.trim(),
          organization: item.company || "Unknown",
          category: q.category,
          exam: mapToExams(item.position, ["General"]),
          lastDate: "See official site",
          vacancies: "N/A",
          salary: item.salary || "As per company norms",
          applyLink: item.jobUrl,
          description: "",
          companyLogo: item.companyLogo || "",
          location: item.location || "India",
          source: "LinkedIn",
          postedAt: item.date ? new Date(item.date) : new Date(),
          isNew: true,
        };

        const result = await getJobs().insertOne(job);
        job._id = result.insertedId;
        await sendJobPush(job);
        newCount++;
      }
    }

    console.log(`✅ LinkedIn: ${newCount} new jobs`);
    return newCount;
  } catch (err) {
    console.error(`❌ LinkedIn fetch failed: ${err.message}`);
    return 0;
  }
};

// ── Mark jobs older than 2 days as not-new ────────────────────────────────────
const markOldJobs = async (getJobs) => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await getJobs().updateMany(
    { isNew: true, postedAt: { $lt: twoDaysAgo } },
    { $set: { isNew: false } }
  );
};

// ── Main runner ───────────────────────────────────────────────────────────────
export const runJobFetcher = async (getJobs) => {
  console.log("\n🚀 Job fetcher started at", new Date().toISOString());
  let total = 0;

  const rssResults = await Promise.all(
    RSS_SOURCES.map((src) => fetchFromRSS(src, getJobs))
  );
  total += rssResults.reduce((a, b) => a + b, 0);
  total += await fetchFromLinkedIn(getJobs);

  await markOldJobs(getJobs);

  // Clean existing result-type posts from DB
  try {
    const skipRegex = SKIP_TITLES.join("|");
    const deleted = await getJobs().deleteMany({
      title: { $regex: skipRegex, $options: "i" },
    });
    if (deleted.deletedCount > 0)
      console.log(
        `🧹 Removed ${deleted.deletedCount} result/notification posts from DB`
      );
  } catch (err) {
    console.warn("⚠️ Result cleanup failed:", err.message);
  }

  // Keep only latest 500 jobs
  try {
    const keepIds = await getJobs()
      .find({})
      .sort({ postedAt: -1 })
      .limit(500)
      .project({ _id: 1 })
      .toArray()
      .then((docs) => docs.map((d) => d._id));

    const deleted = await getJobs().deleteMany({ _id: { $nin: keepIds } });
    if (deleted.deletedCount > 0)
      console.log(`🧹 Cleaned up ${deleted.deletedCount} old jobs`);
  } catch (err) {
    console.warn("⚠️ Job cleanup failed:", err.message);
  }

  console.log(`\n✅ Fetch done. New jobs today: ${total}`);
};

// ── Cron: every 6 hours ───────────────────────────────────────────────────────
export const startJobCron = (getJobs) => {
  cron.schedule("0 0,6,12,18 * * *", () => runJobFetcher(getJobs), {
    timezone: "Asia/Kolkata",
  });
  console.log("⏰ Job cron scheduled (every 6 h, IST)");
};
