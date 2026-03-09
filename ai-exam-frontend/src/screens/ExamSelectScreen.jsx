import { useState } from "react";
import { G, EXAMS, EXAM_META } from "../theme";

export default function ExamSelectScreen({ onSelect, currentExam }) {
  const [selected, setSelected] = useState(
    localStorage.getItem("examai_exam") || null
  );
  const [leaving, setLeaving] = useState(false);

  const handleSelect = (e) => {
    setSelected(e);
    setTimeout(() => {
      setLeaving(true);
      setTimeout(() => onSelect(e), 350);
    }, 120);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: G.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "'Figtree',sans-serif",
        overflowY: "auto",
        padding: "env(safe-area-inset-top) 0 env(safe-area-inset-bottom)",
        opacity: leaving ? 0 : 1,
        transform: leaving ? "scale(0.96)" : "scale(1)",
        transition: "all 0.35s ease",
      }}
    >
      <style>{`
        @keyframes cardIn {
          from { opacity:0; transform:translateY(20px) scale(0.95); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .exc-card { transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1); }
        .exc-card:active { transform:scale(0.92) !important; }
      `}</style>

      {/* Background glow */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "30%",
            width: 300,
            height: 300,
            background: `radial-gradient(circle,${G.glow},transparent 70%)`,
            filter: "blur(80px)",
          }}
        />
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 500,
          padding: "40px 20px 30px",
          position: "relative",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              margin: "0 auto 14px",
              boxShadow: `0 8px 30px ${G.glow}`,
            }}
          >
            🎓
          </div>
          <div
            style={{
              fontFamily: "'Playfair Display',serif",
              fontSize: "1.7rem",
              fontWeight: 900,
              color: G.text,
              letterSpacing: -0.5,
            }}
          >
            Choose Your <span style={{ color: G.gold }}>Exam</span>
          </div>
          <div style={{ fontSize: "0.82rem", color: G.muted, marginTop: 6 }}>
            {currentExam
              ? `Currently: ${currentExam} · Switch exam`
              : "Select your target exam to begin"}
          </div>
        </div>

        {/* Exam grid */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          {EXAMS.map((e, i) => {
            const meta = EXAM_META[e];
            const isSelected = selected === e || currentExam === e;
            return (
              <button
                key={e}
                className="exc-card"
                onClick={() => handleSelect(e)}
                style={{
                  padding: "14px 12px",
                  borderRadius: 14,
                  background: isSelected
                    ? `${meta.color}18`
                    : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${isSelected ? meta.color : G.border2}`,
                  cursor: "pointer",
                  textAlign: "left",
                  animation: `cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) ${
                    i * 50 + 150
                  }ms both`,
                  transform: isSelected ? "scale(1.02)" : "scale(1)",
                  boxShadow: isSelected ? `0 8px 24px ${meta.color}25` : "none",
                  position: "relative",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6, lineHeight: 1 }}>
                  {meta.icon}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: G.text,
                    marginBottom: 2,
                  }}
                >
                  {e}
                </div>
                <div style={{ fontSize: "0.67rem", color: G.muted }}>
                  {meta.desc}
                </div>
                {isSelected && (
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: meta.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Continue button */}
        {currentExam && (
          <button
            onClick={() => handleSelect(currentExam)}
            style={{
              width: "100%",
              marginTop: 14,
              padding: 14,
              borderRadius: 14,
              background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
              border: "none",
              color: "#000",
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: `0 8px 24px ${G.glow}`,
              fontFamily: "'Figtree',sans-serif",
            }}
          >
            Continue with {currentExam} →
          </button>
        )}
      </div>
    </div>
  );
}
