import { useState, useEffect, useRef, useCallback } from "react";

// ── Category config ───────────────────────────────────────────────────────────
const CAT_CONFIG = {
  National: { icon: "🇮🇳", color: "#f97316" },
  International: { icon: "🌍", color: "#3b82f6" },
  Economy: { icon: "📈", color: "#22c55e" },
  "Science & Tech": { icon: "🔬", color: "#a855f7" },
  Sports: { icon: "🏆", color: "#eab308" },
  Environment: { icon: "🌿", color: "#10b981" },
  Awards: { icon: "🎖️", color: "#f59e0b" },
  Defence: { icon: "🛡️", color: "#6366f1" },
  Health: { icon: "💊", color: "#ec4899" },
};

// ── Quiz component shown at bottom of each card ───────────────────────────────
function QuizBanner({ item }) {
  const [answered, setAnswered] = useState(null);
  const q = item.quizQuestion;
  if (!q) return null;

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <p
        style={{
          margin: "0 0 10px",
          fontSize: "0.78rem",
          color: "#94a3b8",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        🧠 Quick Quiz
      </p>
      <p
        style={{
          margin: "0 0 10px",
          fontSize: "0.88rem",
          color: "#e2e8f0",
          lineHeight: 1.5,
        }}
      >
        {q.question}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correct;
          const isChosen = answered === i;
          let bg = "rgba(255,255,255,0.05)";
          let border = "rgba(255,255,255,0.1)";
          let color = "#cbd5e1";
          if (answered !== null) {
            if (isCorrect) {
              bg = "rgba(34,197,94,0.15)";
              border = "#22c55e";
              color = "#86efac";
            } else if (isChosen) {
              bg = "rgba(239,68,68,0.15)";
              border = "#ef4444";
              color = "#fca5a5";
            }
          }
          return (
            <button
              key={i}
              onClick={() => answered === null && setAnswered(i)}
              style={{
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: 8,
                padding: "8px 12px",
                color,
                fontSize: "0.82rem",
                textAlign: "left",
                cursor: answered === null ? "pointer" : "default",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 700, opacity: 0.6 }}>
                {String.fromCharCode(65 + i)}.
              </span>
              {opt}
              {answered !== null && isCorrect && (
                <span style={{ marginLeft: "auto" }}>✓</span>
              )}
              {answered !== null && isChosen && !isCorrect && (
                <span style={{ marginLeft: "auto" }}>✗</span>
              )}
            </button>
          );
        })}
      </div>
      {answered !== null && (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: "0.78rem",
            color: "#94a3b8",
            lineHeight: 1.5,
          }}
        >
          💡 {q.explanation}
        </p>
      )}
    </div>
  );
}

// ── Single news card ──────────────────────────────────────────────────────────
function NewsCard({ item, isActive, style }) {
  const cat = CAT_CONFIG[item.category] || { icon: "📌", color: "#64748b" };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        transition:
          "transform 0.45s cubic-bezier(0.32,0.72,0,1), opacity 0.35s ease",
        willChange: "transform",
        ...style,
      }}
    >
      {/* Card */}
      <div
        style={{
          flex: 1,
          margin: "0 0 12px",
          background:
            "linear-gradient(160deg, #0f172a 0%, #111827 60%, #0c1628 100%)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Accent line top */}
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, ${cat.color}, transparent)`,
            flexShrink: 0,
          }}
        />

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "18px 20px 20px",
            scrollbarWidth: "none",
          }}
        >
          {/* Category + importance */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: `${cat.color}18`,
                border: `1px solid ${cat.color}30`,
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
                color: cat.color,
              }}
            >
              {cat.icon} {item.category}
            </span>
            {item.importance === "high" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 20,
                  padding: "3px 8px",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: "#f87171",
                }}
              >
                🔴 MUST READ
              </span>
            )}
          </div>

          {/* Headline */}
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: "clamp(1.05rem, 3vw, 1.25rem)",
              fontWeight: 800,
              color: "#f1f5f9",
              lineHeight: 1.35,
              letterSpacing: "-0.01em",
            }}
          >
            {item.headline}
          </h2>

          {/* Summary */}
          <p
            style={{
              margin: "0 0 16px",
              fontSize: "0.88rem",
              color: "#94a3b8",
              lineHeight: 1.7,
            }}
          >
            {item.summary}
          </p>

          {/* Exam relevance */}
          {item.examRelevance && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(77,140,122,0.08)", // was rgba(99,102,241,0.08)
                border: "1px solid rgba(77,140,122,0.2)", // was rgba(99,102,241,0.2)
                borderRadius: 10,
                marginBottom: 12,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "0.78rem",
                  color: "#4d8c7a", // was #818cf8
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                📚 Exam Relevance
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.82rem",
                  color: "#8dd5c0", // was #a5b4fc
                  lineHeight: 1.5,
                }}
              >
                {item.examRelevance}
              </p>
            </div>
          )}

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 4,
              }}
            >
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: "0.7rem",
                    color: "#64748b",
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <QuizBanner item={item} />
        </div>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CurrentAffairsScreen({ exam, API_URL }) {
  const [affairs, setAffairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lang, setLang] = useState("english");
  const [current, setCurrent] = useState(0);
  const [animDir, setAnimDir] = useState(null); // "up" | "down"
  const [isAnimating, setIsAnim] = useState(false);
  const [filter, setFilter] = useState("All");

  const touchStartY = useRef(null);
  const containerRef = useRef(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_URL}/current-affairs/${encodeURIComponent(exam)}?lang=${lang}`
        );
        if (res.status === 429) {
          if (attempt < 3 && !cancelled) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            if (!cancelled) load(attempt + 1);
          } else if (!cancelled) {
            setError("Server busy. Please try again in a moment.");
            setLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setAffairs(data.affairs || []);
          setCurrent(0);
        }
      } catch (e) {
        if (!cancelled) setError("Could not load news. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    // Small delay so all tabs do not fire simultaneously on first mount
    const t = setTimeout(() => {
      if (!cancelled) load();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [exam, lang, API_URL]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered =
    filter === "All" ? affairs : affairs.filter((a) => a.category === filter);
  const categories = [
    "All",
    ...Object.keys(CAT_CONFIG).filter((c) =>
      affairs.some((a) => a.category === c)
    ),
  ];

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = useCallback(
    (dir) => {
      if (isAnimating) return;
      const next = dir === "up" ? current + 1 : current - 1;
      if (next < 0 || next >= filtered.length) return;
      setAnimDir(dir);
      setIsAnim(true);
      setTimeout(() => {
        setCurrent(next);
        setAnimDir(null);
        setIsAnim(false);
      }, 420);
    },
    [isAnimating, current, filtered.length]
  );

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") navigate("up");
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") navigate("down");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // ── Touch swipe ───────────────────────────────────────────────────────────
  const onTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (touchStartY.current === null) return;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 40) navigate(dy > 0 ? "up" : "down");
    touchStartY.current = null;
  };

  // ── Wheel scroll ─────────────────────────────────────────────────────────
  const wheelTimeout = useRef(null);
  const onWheel = (e) => {
    if (wheelTimeout.current) return;
    navigate(e.deltaY > 0 ? "up" : "down");
    wheelTimeout.current = setTimeout(() => {
      wheelTimeout.current = null;
    }, 600);
  };

  // ── Card transform ───────────────────────────────────────────────────────
  const getCardStyle = (idx) => {
    const offset = idx - current;
    if (Math.abs(offset) > 1) return { display: "none" };
    let translateY = offset * 100;
    let opacity = 1;
    if (animDir === "up") {
      if (offset === 0) translateY = -30;
      if (offset === 1) translateY = 100;
    }
    if (animDir === "down") {
      if (offset === 0) translateY = 30;
      if (offset === -1) translateY = -100;
    }
    if (offset !== 0) opacity = 0.3;
    return { transform: `translateY(${translateY}%)`, opacity };
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#080e1a",
        overflow: "hidden",
        fontFamily: "'Figtree', system-ui, sans-serif",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 16px 10px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
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
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 800,
                color: "#f1f5f9",
              }}
            >
              📰 Daily Digest
            </h1>
            <p style={{ margin: 0, fontSize: "0.72rem", color: "#475569" }}>
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>

          {/* Lang toggle */}
          <div
            style={{
              display: "flex",
              background: "rgba(255,255,255,0.05)",
              borderRadius: 20,
              padding: 3,
              gap: 2,
            }}
          >
            {[
              ["english", "🇬🇧 EN"],
              ["hinglish", "🤝 HI"],
            ].map(([l, label]) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  background:
                    lang === l
                      ? "linear-gradient(135deg,#4d8c7a,#3a7a6a)" // was #3b82f6,#6366f1
                      : "transparent",
                  border: "none",
                  borderRadius: 16,
                  padding: "4px 10px",
                  color: lang === l ? "#fff" : "#64748b",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Category filter pills */}
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            scrollbarWidth: "none",
            paddingBottom: 2,
          }}
        >
          {categories.map((cat) => {
            const cfg = CAT_CONFIG[cat];
            const isActive = filter === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setFilter(cat);
                  setCurrent(0);
                }}
                style={{
                  flexShrink: 0,
                  background: isActive
                    ? cfg
                      ? `${cfg.color}22`
                      : "rgba(77,140,122,0.15)" // was rgba(99,102,241,0.15)
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${
                    isActive
                      ? (cfg?.color || "#4d8c7a") + "50" // was #6366f1
                      : "rgba(255,255,255,0.07)"
                  }`,
                  borderRadius: 20,
                  padding: "4px 12px",
                  color: isActive ? cfg?.color || "#6abda3" : "#64748b", // was #818cf8
                  fontSize: "0.72rem",
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                {cfg ? `${cfg.icon} ` : ""}
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      {loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "3px solid rgba(77,140,122,0.15)", // was rgba(99,102,241,0.15)
              borderTop: "3px solid #4d8c7a", // was #6366f1
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ color: "#475569", fontSize: "0.82rem", margin: 0 }}>
            Fetching today's news...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : error ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
          }}
        >
          <span style={{ fontSize: "2.5rem" }}>📡</span>
          <p
            style={{
              color: "#64748b",
              fontSize: "0.88rem",
              margin: 0,
              textAlign: "center",
            }}
          >
            {error}
          </p>
          <button
            onClick={() => setLang((l) => l)}
            style={{
              background: "rgba(77,140,122,0.15)", // was rgba(99,102,241,0.15)
              border: "1px solid rgba(77,140,122,0.3)", // was rgba(99,102,241,0.3)
              borderRadius: 10,
              padding: "8px 20px",
              color: "#6abda3", // was #818cf8
              fontSize: "0.82rem",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p style={{ color: "#475569", fontSize: "0.88rem" }}>
            No news found for this filter.
          </p>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Cards area */}
          <div
            ref={containerRef}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
            style={{
              flex: 1,
              position: "relative",
              padding: "10px 14px 0",
              userSelect: "none",
            }}
          >
            {filtered.map((item, idx) => {
              const dist = Math.abs(idx - current);
              if (dist > 1) return null;
              return (
                <NewsCard
                  key={item.id || idx}
                  item={item}
                  isActive={idx === current}
                  style={getCardStyle(idx)}
                />
              );
            })}
          </div>

          {/* ── Right nav strip ────────────────────────────────────────── */}
          <div
            style={{
              width: 44,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              paddingRight: 8,
            }}
          >
            {/* Up arrow */}
            <button
              onClick={() => navigate("down")}
              disabled={current === 0}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background:
                  current === 0
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(77,140,122,0.12)", // was rgba(99,102,241,0.12)
                border: `1px solid ${
                  current === 0
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(77,140,122,0.3)" // was rgba(99,102,241,0.3)
                }`,
                color: current === 0 ? "#334155" : "#6abda3", // was #818cf8
                fontSize: "1rem",
                cursor: current === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
            >
              ▲
            </button>

            {/* Progress indicator */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                maxHeight: 120,
                overflowY: "hidden",
              }}
            >
              {filtered
                .slice(Math.max(0, current - 2), current + 5)
                .map((_, i) => {
                  const realIdx = Math.max(0, current - 2) + i;
                  const isActive = realIdx === current;
                  return (
                    <div
                      key={realIdx}
                      onClick={() => !isAnimating && setCurrent(realIdx)}
                      style={{
                        width: isActive ? 6 : 4,
                        height: isActive ? 18 : 6,
                        borderRadius: 3,
                        background: isActive
                          ? "#4d8c7a" // was #6366f1
                          : "rgba(255,255,255,0.12)",
                        cursor: "pointer",
                        transition: "all 0.25s",
                        flexShrink: 0,
                      }}
                    />
                  );
                })}
            </div>

            {/* Down arrow */}
            <button
              onClick={() => navigate("up")}
              disabled={current >= filtered.length - 1}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background:
                  current >= filtered.length - 1
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(77,140,122,0.12)", // was rgba(99,102,241,0.12)
                border: `1px solid ${
                  current >= filtered.length - 1
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(77,140,122,0.3)" // was rgba(99,102,241,0.3)
                }`,
                color: current >= filtered.length - 1 ? "#334155" : "#6abda3", // was #818cf8
                fontSize: "1rem",
                cursor:
                  current >= filtered.length - 1 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
            >
              ▼
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom counter ──────────────────────────────────────────────── */}
      {!loading && !error && filtered.length > 0 && (
        <div
          style={{
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderTop: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "0.72rem", color: "#334155" }}>
            {current + 1} / {filtered.length}
          </span>
          <div
            style={{
              flex: 1,
              maxWidth: 180,
              height: 2,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${((current + 1) / filtered.length) * 100}%`,
                background: "linear-gradient(90deg, #4d8c7a, #3a7a6a)", // was #6366f1, #3b82f6
                borderRadius: 1,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span style={{ fontSize: "0.72rem", color: "#334155" }}>
            {filtered.length} stories
          </span>
        </div>
      )}
    </div>
  );
}
