import { useState, useEffect, useRef } from "react";
import { G } from "../theme";

export default function JobsScreen({ exam, API_URL, onAskAI }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef(null);

  const fetchJobs = async (pg = 1, f = filter, q = search) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: pg,
        limit: 20,
        ...(f === "govt" ? { category: "government" } : {}),
        ...(f === "pvt" ? { category: "private" } : {}),
        ...(f === "international" ? { category: "international" } : {}),
        ...(q.trim() ? { search: q.trim() } : {}),
      });
      if (exam && exam !== "General") params.set("exam", exam);

      const r = await fetch(`${API_URL}/jobs?${params}`);
      if (!r.ok) throw new Error("Failed to load jobs");
      const d = await r.json();
      if (pg === 1) setJobs(d.jobs || []);
      else setJobs((prev) => [...prev, ...(d.jobs || [])]);
      setTotal(d.total || 0);
      setPage(pg);
    } catch {
      setError("Could not load jobs. Check your connection.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs(1, filter, search);
  }, [filter, exam]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchJobs(1, filter, val), 500);
  };

  const handleAskAI = (job) => {
    const isIntl = job.category === "international";
    const prompt = isIntl
      ? `I want complete information about this international job:

📌 **${job.title}**
🏢 Organization: ${job.organization}
📍 Location: ${job.location || "N/A"}
🌍 Country: ${job.country || "N/A"}
💰 Salary: ${job.salary}

Please provide:
1. ✅ **Eligibility Criteria** — qualifications, experience, skills
2. 📚 **Role & Responsibilities** — day-to-day work
3. 💰 **Salary & Benefits** — pay, perks, growth
4. 📅 **How to Apply** — step-by-step process
5. 📖 **Preparation Tips** — skills, certifications to get
6. 🎯 **Selection Process** — interview rounds, assessments`
      : `I want complete information about this government job:

📌 **${job.title}**
🏢 Organization: ${job.organization}

Please provide:
1. ✅ **Eligibility Criteria** — age limit, education, nationality
2. 📚 **Complete Syllabus** — subject-wise topics & exam pattern
3. 💰 **Salary & Benefits** — pay scale, HRA, DA, allowances
4. 📅 **Study Plan** — week-by-week preparation roadmap
5. 📖 **Best Books** — top recommended books & free resources
6. 🎯 **Selection Process** — all stages (Prelims/Mains/Interview/Physical)`;
    onAskAI(prompt);
  };

  // Tag config per category
  const getCategoryTag = (job) => {
    if (job.category === "government")
      return {
        label: "GOVT",
        bg: "rgba(240,165,0,0.1)",
        color: G.gold,
        border: G.border,
      };
    if (job.category === "private")
      return {
        label: "PVT",
        bg: "rgba(99,102,241,0.1)",
        color: "#818cf8",
        border: "rgba(99,102,241,0.25)",
      };
    if (job.category === "international")
      return {
        label: "INTL",
        bg: "rgba(20,184,166,0.1)",
        color: G.teal,
        border: "rgba(20,184,166,0.25)",
      };
    return null;
  };

  const FILTERS = [
    ["all", "All Jobs"],
    ["govt", "Govt"],
    ["pvt", "Pvt"],
    ["international", "🌍 International"],
  ];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: G.bg,
        color: G.text,
        fontFamily: "'Figtree',sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${G.border2}`,
          flexShrink: 0,
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.98rem",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>💼</span>Job Alerts
          </div>
          <div style={{ fontSize: "0.7rem", color: G.muted }}>
            {total} jobs found
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="🔍 Search jobs or organization..."
          value={search}
          onChange={handleSearchChange}
          style={{
            width: "100%",
            padding: "9px 14px",
            marginBottom: 10,
            background: G.surface,
            border: `1px solid ${search ? G.gold : G.border2}`,
            borderRadius: 10,
            color: G.text,
            fontSize: "0.82rem",
            outline: "none",
            fontFamily: "'Figtree',sans-serif",
            boxSizing: "border-box",
            transition: "border-color 0.2s",
          }}
        />

        {/* Filter pills */}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "7px 16px",
                borderRadius: 100,
                background:
                  filter === f
                    ? `linear-gradient(135deg,${G.gold},${G.saffron})`
                    : G.surface,
                border: `1px solid ${filter === f ? G.gold : G.border2}`,
                color: filter === f ? "#000" : G.muted,
                fontSize: "0.78rem",
                fontWeight: filter === f ? 700 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontFamily: "'Figtree',sans-serif",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {/* Loading spinner */}
        {loading && jobs.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "50vh",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                border: `3px solid ${G.border2}`,
                borderTopColor: G.gold,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <div style={{ color: G.muted, fontSize: "0.85rem" }}>
              Loading job alerts...
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              background: `${G.error}15`,
              border: `1px solid ${G.error}40`,
              borderRadius: 12,
              padding: "14px 16px",
              color: G.error,
              fontSize: "0.84rem",
              margin: "8px 0",
              textAlign: "center",
            }}
          >
            ⚠️ {error}
            <br />
            <button
              onClick={() => fetchJobs(1, filter, search)}
              style={{
                marginTop: 8,
                background: "transparent",
                border: `1px solid ${G.error}`,
                borderRadius: 6,
                color: G.error,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: "0.78rem",
                fontFamily: "'Figtree',sans-serif",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* No results */}
        {!loading && !error && jobs.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: search ? "40px 20px" : "60px 20px",
            }}
          >
            <div style={{ fontSize: search ? 36 : 40, marginBottom: 12 }}>
              {search ? "🔍" : filter === "international" ? "🌍" : "💼"}
            </div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "0.95rem",
                color: G.text,
                marginBottom: 6,
              }}
            >
              {search
                ? `No results for "${search}"`
                : filter === "international"
                ? "No international jobs yet"
                : "No jobs found"}
            </div>
            <div
              style={{ fontSize: "0.82rem", color: G.muted, lineHeight: 1.6 }}
            >
              {search
                ? "Try a different keyword or clear the search"
                : filter === "international"
                ? "International jobs are fetched from Adzuna every 6 hours. Check back soon!"
                : "Job alerts are fetched every 6 hours from official sources."}
            </div>
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  fetchJobs(1, filter, "");
                }}
                style={{
                  marginTop: 12,
                  background: "transparent",
                  border: `1px solid ${G.border2}`,
                  borderRadius: 8,
                  color: G.muted,
                  padding: "6px 14px",
                  cursor: "pointer",
                  fontSize: "0.78rem",
                  fontFamily: "'Figtree',sans-serif",
                }}
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* Job cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {jobs.map((job) => {
            const catTag = getCategoryTag(job);
            return (
              <div
                key={job._id}
                style={{
                  background: G.surface,
                  border: `1px solid ${job.isNew ? G.border : G.border2}`,
                  borderRadius: 14,
                  padding: "16px 14px",
                  transition: "all 0.2s",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Gold top bar for new jobs */}
                {job.isNew && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: `linear-gradient(90deg,${G.gold},${G.saffron})`,
                    }}
                  />
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  {/* Left */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        color: G.text,
                        marginBottom: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {job.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.76rem",
                        color: G.muted,
                        marginBottom: 4,
                      }}
                    >
                      {job.organization}
                    </div>

                    {/* Location for international */}
                    {job.category === "international" && job.location && (
                      <div
                        style={{
                          fontSize: "0.74rem",
                          color: G.teal,
                          marginBottom: 6,
                        }}
                      >
                        📍 {job.location}
                      </div>
                    )}

                    {/* Tags */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      {job.isNew && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            padding: "2px 8px",
                            borderRadius: 100,
                            background: "rgba(20,184,166,0.12)",
                            color: G.teal,
                            border: "1px solid rgba(20,184,166,0.25)",
                            fontWeight: 600,
                            fontFamily: "monospace",
                          }}
                        >
                          NEW
                        </span>
                      )}
                      {catTag && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            padding: "2px 8px",
                            borderRadius: 100,
                            background: catTag.bg,
                            color: catTag.color,
                            border: `1px solid ${catTag.border}`,
                            fontWeight: 600,
                            fontFamily: "monospace",
                          }}
                        >
                          {catTag.label}
                        </span>
                      )}
                      {job.salary &&
                        job.salary !== "As per govt norms" &&
                        job.salary !== "As per company norms" && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              padding: "2px 8px",
                              borderRadius: 100,
                              background: G.surf2,
                              color: G.muted,
                              border: `1px solid ${G.border2}`,
                              fontFamily: "monospace",
                            }}
                          >
                            💰 {job.salary}
                          </span>
                        )}
                      {job.vacancies && job.vacancies !== "N/A" && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            padding: "2px 8px",
                            borderRadius: 100,
                            background: G.surf2,
                            color: G.muted,
                            border: `1px solid ${G.border2}`,
                            fontFamily: "monospace",
                          }}
                        >
                          {job.vacancies}
                        </span>
                      )}
                      {job.lastDate && job.lastDate !== "See official site" && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            padding: "2px 8px",
                            borderRadius: 100,
                            background: G.surf2,
                            color: G.muted,
                            border: `1px solid ${G.border2}`,
                          }}
                        >
                          📅 {job.lastDate}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: "0.72rem", color: G.muted }}>
                      Source: {job.source}
                    </div>
                  </div>

                  {/* Right: buttons */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={() => handleAskAI(job)}
                      style={{
                        background: `linear-gradient(135deg,rgba(240,165,0,0.15),rgba(255,107,43,0.15))`,
                        border: `1px solid ${G.border}`,
                        color: G.goldL,
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "7px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        fontFamily: "'Figtree',sans-serif",
                      }}
                    >
                      🤖 Ask AI
                    </button>
                    <button
                      onClick={() => window.open(job.applyLink, "_blank")}
                      style={{
                        background: "transparent",
                        border: `1px solid ${G.border2}`,
                        color: G.muted,
                        fontSize: "0.72rem",
                        padding: "7px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        fontFamily: "'Figtree',sans-serif",
                      }}
                    >
                      Apply →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Load more */}
        {jobs.length < total && !loading && (
          <button
            onClick={() => fetchJobs(page + 1, filter, search)}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "12px",
              background: G.surface,
              border: `1px solid ${G.border2}`,
              borderRadius: 10,
              color: G.muted,
              fontSize: "0.85rem",
              cursor: "pointer",
              fontFamily: "'Figtree',sans-serif",
            }}
          >
            Load More
          </button>
        )}
        {loading && jobs.length > 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "16px",
              color: G.muted,
              fontSize: "0.82rem",
            }}
          >
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
}
