import { useState, useEffect } from "react";
import { G, PLAY_STORE } from "../theme";

const LP_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Figtree:wght@300;400;500;600;700;800&display=swap');
  .lp-btn-primary {
    background: linear-gradient(135deg,#f0a500,#ff6b2b);
    color:#000; font-weight:700; font-size:0.95rem;
    padding:13px 26px; border-radius:8px; border:none;
    cursor:pointer; text-decoration:none;
    display:inline-flex; align-items:center; gap:8px;
    transition:all 0.25s; letter-spacing:0.01em;
    font-family:'Figtree',sans-serif;
  }
  .lp-btn-primary:hover { transform:translateY(-2px); box-shadow:0 8px 28px rgba(240,165,0,0.22); }
  .lp-btn-sec {
    background:transparent; color:#f0ede8;
    font-weight:500; font-size:0.95rem;
    padding:13px 26px; border-radius:8px;
    border:1px solid rgba(255,255,255,0.06);
    cursor:pointer; text-decoration:none;
    display:inline-flex; align-items:center; gap:8px;
    transition:all 0.25s; font-family:'Figtree',sans-serif;
  }
  .lp-btn-sec:hover { border-color:rgba(240,165,0,0.14); background:rgba(255,255,255,0.04); transform:translateY(-2px); }
  .lp-feature-card {
    background:#12141f; border:1px solid rgba(255,255,255,0.06);
    border-radius:14px; padding:24px; transition:all 0.3s;
  }
  .lp-feature-card:hover { border-color:rgba(240,165,0,0.14); transform:translateY(-3px); box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .lp-exam-card {
    background:#12141f; border:1px solid rgba(255,255,255,0.06);
    border-radius:12px; padding:18px 14px;
    cursor:pointer; transition:all 0.25s; text-align:center;
  }
  .lp-exam-card:hover, .lp-exam-card.active {
    border-color:#f0a500; background:rgba(240,165,0,0.06); transform:translateY(-2px);
  }
  @media(max-width:768px) {
    .lp-hero-grid { grid-template-columns:1fr !important; }
    .lp-features-grid { grid-template-columns:1fr 1fr !important; }
    .lp-footer-grid { grid-template-columns:1fr !important; }
    .lp-hero-card { display:none !important; }
  }
  @media(max-width:480px) {
    .lp-features-grid { grid-template-columns:1fr !important; }
    .lp-exams-grid { grid-template-columns:repeat(3,1fr) !important; }
  }
`;

const FEATURES = [
  {
    icon: "🤖",
    name: "Ask AI",
    desc: "Instant answers, concept breakdowns & study guidance for any exam topic.",
    tag: "POWERED BY GROQ",
  },
  {
    icon: "📝",
    name: "Mock Tests",
    desc: "Authentic PYQ-style MCQs — UPSC statements, JEE numericals, NEET assertion-reason.",
    tag: "20+ EXAM TYPES",
  },
  {
    icon: "💼",
    name: "Job Alerts",
    desc: "Live govt job notifications from SSC, UPSC, Railways, IBPS — updated every 6 hours.",
    tag: "REAL-TIME RSS",
  },
  {
    icon: "🃏",
    name: "Flashcards",
    desc: "AI-generated flashcards with spaced repetition that adapts to your recall performance.",
    tag: "ACTIVE RECALL",
  },
];

const EXAMS_GRID = [
  { emoji: "🏛️", name: "UPSC CSE" },
  { emoji: "📐", name: "JEE" },
  { emoji: "🧬", name: "NEET" },
  { emoji: "🏦", name: "Banking" },
  { emoji: "📋", name: "SSC CGL" },
  { emoji: "🚂", name: "Railway" },
  { emoji: "📊", name: "CAT" },
  { emoji: "🗺️", name: "State PCS" },
];

export default function LandingPage({ onTryApp }) {
  const [scrolled, setScrolled] = useState(false);
  const [activeExam, setActiveExam] = useState(0);
  const [msgStep, setMsgStep] = useState(0);

  useEffect(() => {
    const el = document.getElementById("lp-scroll");
    if (!el) return;
    const fn = () => setScrolled(el.scrollTop > 20);
    el.addEventListener("scroll", fn);
    return () => el.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setMsgStep((s) => (s + 1) % 3), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      id="lp-scroll"
      style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        background: G.bg,
        color: G.text,
        fontFamily: "'Figtree',sans-serif",
      }}
    >
      <style>{LP_STYLES}</style>

      {/* ── NAV ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          padding: "0 5%",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: scrolled ? "rgba(8,9,16,0.95)" : "transparent",
          backdropFilter: "blur(20px)",
          borderBottom: scrolled ? `1px solid ${G.border2}` : "none",
          transition: "all 0.3s",
        }}
      >
        <div
          style={{
            fontFamily: "'Playfair Display',serif",
            fontSize: "1.4rem",
            fontWeight: 900,
            color: G.text,
          }}
        >
          Exam<span style={{ color: G.gold }}>AI</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a
            href={PLAY_STORE}
            target="_blank"
            rel="noreferrer"
            className="lp-btn-sec"
            style={{ fontSize: "0.8rem", padding: "8px 16px" }}
          >
            ▶ Play Store
          </a>
          <button
            onClick={onTryApp}
            className="lp-btn-primary"
            style={{ fontSize: "0.8rem", padding: "8px 16px" }}
          >
            Try Web App →
          </button>
        </div>
      </div>

      {/* ── HERO ── */}
      <div
        style={{
          position: "relative",
          padding: "80px 5% 60px",
          overflow: "hidden",
        }}
      >
        {/* BG effects */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse 80% 60% at 60% 30%,${G.glow} 0%,transparent 60%),radial-gradient(ellipse 40% 40% at 20% 80%,rgba(255,107,43,0.05) 0%,transparent 50%)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `linear-gradient(${G.border2} 1px,transparent 1px),linear-gradient(90deg,${G.border2} 1px,transparent 1px)`,
            backgroundSize: "60px 60px",
            maskImage:
              "radial-gradient(ellipse 80% 80% at 50% 50%,black 20%,transparent 100%)",
            pointerEvents: "none",
          }}
        />

        <div
          className="lp-hero-grid"
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "3rem",
            alignItems: "center",
          }}
        >
          {/* Left text */}
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(240,165,0,0.1)",
                border: `1px solid ${G.border}`,
                padding: "5px 14px",
                borderRadius: 100,
                fontSize: "0.75rem",
                fontFamily: "monospace",
                color: G.gold,
                letterSpacing: "0.05em",
                marginBottom: "1.2rem",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: G.gold,
                  borderRadius: "50%",
                  animation: "pulse 2s infinite",
                  display: "inline-block",
                }}
              />
              🇮🇳 Built for Indian Exam Aspirants
            </div>
            <h1
              style={{
                fontFamily: "'Playfair Display',serif",
                fontSize: "clamp(2.4rem,4vw,3.6rem)",
                fontWeight: 900,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                marginBottom: "1rem",
              }}
            >
              Your AI Tutor for
              <br />
              <span
                style={{
                  background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Every Competitive
              </span>
              <br />
              Exam in India
            </h1>
            <p
              style={{
                fontSize: "1rem",
                color: "rgba(240,237,232,0.6)",
                lineHeight: 1.75,
                marginBottom: "1.8rem",
                maxWidth: 440,
              }}
            >
              Ask AI tutors, take authentic mock tests, get live govt job alerts
              — all in one app, built for serious Indian exam aspirants.
            </p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button onClick={onTryApp} className="lp-btn-primary">
                🚀 Try Web App Free
              </button>
              <a
                href={PLAY_STORE}
                target="_blank"
                rel="noreferrer"
                className="lp-btn-sec"
              >
                ▶ Download Android App
              </a>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: "1.5rem",
              }}
            >
              {[
                "UPSC",
                "SSC CGL",
                "JEE",
                "NEET",
                "Banking",
                "Railway",
                "CAT",
                "State PCS",
              ].map((t) => (
                <span
                  key={t}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${G.border2}`,
                    color: G.muted,
                    padding: "4px 12px",
                    borderRadius: 100,
                    fontSize: "0.75rem",
                    fontWeight: 500,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right card */}
          <div className="lp-hero-card" style={{ position: "relative" }}>
            <div
              style={{
                background: G.surface,
                border: `1px solid ${G.border2}`,
                borderRadius: 16,
                padding: 22,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(135deg,rgba(240,165,0,0.05) 0%,transparent 60%)",
                  pointerEvents: "none",
                }}
              />
              {/* Chat header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom: `1px solid ${G.border2}`,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    background:
                      "linear-gradient(135deg,rgba(240,165,0,0.2),rgba(255,107,43,0.2))",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1rem",
                  }}
                >
                  🤖
                </div>
                <div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                    Ask AI
                  </div>
                  <div style={{ fontSize: "0.7rem", color: G.muted }}>
                    UPSC · Active session
                  </div>
                </div>
              </div>
              {/* Demo chat */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <div
                  style={{
                    background: `rgba(240,165,0,0.1)`,
                    border: `1px solid rgba(240,165,0,0.2)`,
                    borderRadius: "10px 10px 3px 10px",
                    padding: "9px 12px",
                    alignSelf: "flex-end",
                    maxWidth: "85%",
                    fontSize: "0.82rem",
                    color: G.goldL,
                    lineHeight: 1.5,
                  }}
                >
                  What is the significance of the Preamble?
                </div>
                {msgStep >= 0 && (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${G.border2}`,
                      borderRadius: "10px 10px 10px 3px",
                      padding: "9px 12px",
                      alignSelf: "flex-start",
                      maxWidth: "90%",
                      fontSize: "0.82rem",
                      color: "rgba(240,237,232,0.85)",
                      lineHeight: 1.5,
                    }}
                  >
                    The Preamble is the{" "}
                    <strong style={{ color: G.goldL }}>
                      constitutional compass
                    </strong>{" "}
                    — declares India as Sovereign, Socialist, Secular,
                    Democratic Republic.
                  </div>
                )}
                {msgStep >= 1 && (
                  <div
                    style={{
                      background: `rgba(240,165,0,0.1)`,
                      border: `1px solid rgba(240,165,0,0.2)`,
                      borderRadius: "10px 10px 3px 10px",
                      padding: "9px 12px",
                      alignSelf: "flex-end",
                      maxWidth: "85%",
                      fontSize: "0.82rem",
                      color: G.goldL,
                      lineHeight: 1.5,
                    }}
                  >
                    Can Parliament amend it?
                  </div>
                )}
                {msgStep >= 2 ? (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${G.border2}`,
                      borderRadius: "10px 10px 10px 3px",
                      padding: "9px 12px",
                      alignSelf: "flex-start",
                      maxWidth: "90%",
                      fontSize: "0.82rem",
                      color: "rgba(240,237,232,0.85)",
                      lineHeight: 1.5,
                    }}
                  >
                    Yes — upheld in{" "}
                    <strong style={{ color: G.goldL }}>
                      Kesavananda Bharati (1973)
                    </strong>
                    . Cannot alter the basic structure doctrine.
                  </div>
                ) : msgStep >= 1 ? (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${G.border2}`,
                      borderRadius: "10px 10px 10px 3px",
                      padding: "9px 12px",
                      alignSelf: "flex-start",
                      width: 60,
                    }}
                  >
                    <div style={{ display: "flex", gap: 4 }}>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: G.gold,
                            display: "inline-block",
                            animation: `dotPulse 1s ease-in-out ${
                              i * 0.15
                            }s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {/* Floating badges */}
            <div
              style={{
                position: "absolute",
                top: -16,
                right: -16,
                background: G.bg2,
                border: `1px solid ${G.border2}`,
                borderRadius: 12,
                padding: "10px 14px",
                animation: "float 4s ease-in-out infinite",
                backdropFilter: "blur(20px)",
              }}
            >
              <div
                style={{
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  color: G.teal,
                  lineHeight: 1,
                }}
              >
                94%
              </div>
              <div
                style={{ fontSize: "0.65rem", color: G.muted, marginTop: 2 }}
              >
                Avg. Quiz Accuracy
              </div>
            </div>
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: -24,
                background: G.bg2,
                border: `1px solid ${G.border2}`,
                borderRadius: 12,
                padding: "10px 14px",
                animation: "float 4s ease-in-out 2s infinite",
                backdropFilter: "blur(20px)",
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  color: G.teal,
                  fontWeight: 600,
                  marginBottom: 3,
                }}
              >
                🔔 New Job Alert
              </div>
              <div
                style={{ fontSize: "0.78rem", color: G.text, fontWeight: 500 }}
              >
                SSC CGL 2025 Notified
              </div>
              <div style={{ fontSize: "0.68rem", color: G.muted }}>
                17,727 vacancies
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STATS ── */}
      <div
        style={{
          background: G.bg2,
          borderTop: `1px solid ${G.border2}`,
          borderBottom: `1px solid ${G.border2}`,
          padding: "24px 5%",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: "1rem",
            textAlign: "center",
          }}
        >
          {[
            ["50K+", "Active Students"],
            ["1M+", "Questions Generated"],
            ["20+", "Exam Categories"],
            ["4.8★", "App Rating"],
          ].map(([n, l]) => (
            <div key={l}>
              <div
                style={{
                  fontFamily: "'Playfair Display',serif",
                  fontSize: "1.8rem",
                  fontWeight: 700,
                  color: G.gold,
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {n}
              </div>
              <div
                style={{ fontSize: "0.78rem", color: G.muted, fontWeight: 500 }}
              >
                {l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <div style={{ padding: "80px 5%", background: G.bg2 }} id="features">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            style={{
              marginBottom: "0.8rem",
              fontFamily: "monospace",
              fontSize: "0.72rem",
              color: G.gold,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            // WHAT WE OFFER
          </div>
          <h2
            style={{
              fontFamily: "'Playfair Display',serif",
              fontSize: "clamp(1.8rem,3vw,2.6rem)",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              marginBottom: "0.8rem",
            }}
          >
            Everything to <span style={{ color: G.gold }}>crack your exam</span>
          </h2>
          <p
            style={{
              color: "rgba(240,237,232,0.5)",
              fontSize: "0.95rem",
              lineHeight: 1.75,
              marginBottom: "2.5rem",
              maxWidth: 480,
            }}
          >
            Four powerful AI tools built from the ground up for serious Indian
            exam aspirants.
          </p>
          <div
            className="lp-features-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 14,
            }}
          >
            {FEATURES.map((f, i) => (
              <div key={i} className="lp-feature-card">
                <div style={{ fontSize: "1.6rem", marginBottom: 12 }}>
                  {f.icon}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    marginBottom: 8,
                  }}
                >
                  {f.name}
                </div>
                <div
                  style={{
                    fontSize: "0.82rem",
                    color: G.muted,
                    lineHeight: 1.65,
                    marginBottom: 10,
                  }}
                >
                  {f.desc}
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.65rem",
                    color: G.gold,
                    letterSpacing: "0.08em",
                    opacity: 0.7,
                  }}
                >
                  {f.tag}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── EXAMS ── */}
      <div style={{ padding: "80px 5%" }} id="exams">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            style={{
              marginBottom: "0.8rem",
              fontFamily: "monospace",
              fontSize: "0.72rem",
              color: G.gold,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            // EXAM COVERAGE
          </div>
          <h2
            style={{
              fontFamily: "'Playfair Display',serif",
              fontSize: "clamp(1.8rem,3vw,2.6rem)",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              marginBottom: "2rem",
            }}
          >
            One app for <span style={{ color: G.gold }}>every exam</span>
          </h2>
          <div
            className="lp-exams-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 12,
            }}
          >
            {EXAMS_GRID.map((e, i) => (
              <div
                key={i}
                className={`lp-exam-card ${activeExam === i ? "active" : ""}`}
                onClick={() => setActiveExam(i)}
              >
                <div style={{ fontSize: "1.6rem", marginBottom: 8 }}>
                  {e.emoji}
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                  {e.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div
        style={{
          background: G.bg2,
          padding: "80px 5%",
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse 60% 60% at 50% 50%,rgba(240,165,0,0.08) 0%,transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 620,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "0.72rem",
              color: G.gold,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "1rem",
            }}
          >
            // START TODAY — FREE
          </div>
          <h2
            style={{
              fontFamily: "'Playfair Display',serif",
              fontSize: "clamp(2rem,3.5vw,3rem)",
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginBottom: "1rem",
            }}
          >
            Your rank is waiting.
            <br />
            <span style={{ color: G.gold }}>Start preparing smarter.</span>
          </h2>
          <p
            style={{
              color: "rgba(240,237,232,0.5)",
              fontSize: "0.95rem",
              marginBottom: "2rem",
              lineHeight: 1.75,
            }}
          >
            Free to use. No subscription needed. Ask AI, mock tests, and live
            job alerts — right in your browser or on Android.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={onTryApp}
              className="lp-btn-primary"
              style={{ fontSize: "1rem", padding: "14px 30px" }}
            >
              🚀 Try Web App Free
            </button>
            <a
              href={PLAY_STORE}
              target="_blank"
              rel="noreferrer"
              className="lp-btn-sec"
              style={{ fontSize: "1rem", padding: "14px 30px" }}
            >
              ▶ Download on Android
            </a>
          </div>
          <p
            style={{ fontSize: "0.75rem", color: G.muted, marginTop: "1.2rem" }}
          >
            Free · No credit card · Android & Web
          </p>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div
        style={{
          background: G.bg,
          borderTop: `1px solid ${G.border2}`,
          padding: "32px 5%",
        }}
      >
        <div
          className="lp-footer-grid"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr",
            gap: "2rem",
            marginBottom: "2rem",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Playfair Display',serif",
                fontSize: "1.3rem",
                fontWeight: 900,
                marginBottom: 10,
              }}
            >
              Exam<span style={{ color: G.gold }}>AI</span>
            </div>
            <p
              style={{
                fontSize: "0.82rem",
                color: G.muted,
                lineHeight: 1.7,
                maxWidth: 260,
              }}
            >
              AI-powered exam prep for every aspirant in India. Built with ❤️
              for IAS, JEE, NEET, Banking & more.
            </p>
          </div>
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "0.82rem",
                marginBottom: 12,
                color: G.text,
              }}
            >
              Product
            </div>
            {["Ask AI", "Mock Tests", "Job Alerts", "Download App"].map((l) => (
              <div
                key={l}
                style={{
                  fontSize: "0.8rem",
                  color: G.muted,
                  marginBottom: 8,
                  cursor: "pointer",
                }}
                onClick={onTryApp}
              >
                {l}
              </div>
            ))}
          </div>
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "0.82rem",
                marginBottom: 12,
                color: G.text,
              }}
            >
              Legal
            </div>
            {[
              "Privacy Policy",
              "Terms of Service",
              "Data Deletion",
              "Contact Us",
            ].map((l) => (
              <div
                key={l}
                style={{
                  fontSize: "0.8rem",
                  color: G.muted,
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                {l}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            borderTop: `1px solid ${G.border2}`,
            paddingTop: 20,
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.76rem",
            color: G.muted,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <span>© 2025 ExamAI. All rights reserved.</span>
          <span>Made in India 🇮🇳</span>
        </div>
      </div>
    </div>
  );
}
