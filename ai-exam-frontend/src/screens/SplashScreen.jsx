import { useEffect } from "react";
import { G } from "../theme";

export default function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: G.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Figtree', sans-serif",
      }}
    >
      <style>{`
        @keyframes splashPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        @keyframes splashRing  { 0%{transform:scale(0.6);opacity:0.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes splashBar   { 0%{width:0%} 100%{width:100%} }
        @keyframes splashFade  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Logo ring animation */}
      <div
        style={{
          position: "relative",
          width: 100,
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
        }}
      >
        {[0, 300, 600].map((d) => (
          <div
            key={d}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `2px solid ${G.gold}80`,
              animation: `splashRing 1.6s ease-out ${d}ms infinite`,
            }}
          />
        ))}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 22,
            background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 38,
            animation: "splashPulse 1.6s ease-in-out infinite",
            boxShadow: `0 0 40px ${G.glow}`,
          }}
        >
          🎓
        </div>
      </div>

      {/* App name */}
      <div
        style={{
          animation: "splashFade 0.5s ease 0.3s both",
          fontFamily: "'Playfair Display',serif",
          fontSize: "2rem",
          fontWeight: 900,
          color: G.text,
          letterSpacing: -1,
        }}
      >
        Exam<span style={{ color: G.gold }}>AI</span>
      </div>

      {/* Tagline */}
      <div
        style={{
          animation: "splashFade 0.5s ease 0.6s both",
          fontSize: "0.7rem",
          color: G.muted,
          letterSpacing: 3,
          textTransform: "uppercase",
          marginTop: 6,
          marginBottom: 40,
        }}
      >
        Your Smart Study Partner
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: 120,
          height: 2,
          background: G.surface,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            background: `linear-gradient(90deg,${G.gold},${G.saffron})`,
            borderRadius: 2,
            animation: "splashBar 1.8s ease forwards",
          }}
        />
      </div>
    </div>
  );
}
