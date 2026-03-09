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

// ── Fetch from a single RSS source ───────────────────────────────────────────
const SKIP_TITLES = [
  "hello world",
  "dummy",
  "test post",
  "sample page",
  "ab dummy",
  "lorem ipsum",
  "untitled",
];

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

    for (const item of items) {
      if (!item?.link || !item?.title) continue;
      if (SKIP_TITLES.some((bad) => item.title.toLowerCase().includes(bad)))
        continue;
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

    console.log(`✅ ${source.source}: ${newCount} new jobs`);
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

// ── Main runner (exported so server.js can call it on boot) ───────────────────
export const runJobFetcher = async (getJobs) => {
  console.log("\n🚀 Job fetcher started at", new Date().toISOString());
  let total = 0;

  const rssResults = await Promise.all(
    RSS_SOURCES.map((src) => fetchFromRSS(src, getJobs))
  );
  total += rssResults.reduce((a, b) => a + b, 0);
  total += await fetchFromLinkedIn(getJobs);

  await markOldJobs(getJobs);
  console.log(`\n✅ Fetch done. New jobs today: ${total}`);
};

// ── Cron: every 6 hours at 12 am · 6 am · 12 pm · 6 pm IST ──────────────────
export const startJobCron = (getJobs) => {
  cron.schedule("0 0,6,12,18 * * *", () => runJobFetcher(getJobs), {
    timezone: "Asia/Kolkata",
  });
  console.log("⏰ Job cron scheduled (every 6 h, IST)");
};
