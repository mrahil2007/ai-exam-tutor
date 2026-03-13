import { G } from "../theme";

const TABS = [
  {
    id: "askAI",
    label: "Ask AI",
    icon: (active) => (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? G.gold : G.muted}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="10" r="1" fill={active ? G.gold : G.muted} />
        <circle cx="8" cy="10" r="1" fill={active ? G.gold : G.muted} />
        <circle cx="16" cy="10" r="1" fill={active ? G.gold : G.muted} />
      </svg>
    ),
  },
  {
    id: "news",
    label: "News",
    icon: (active) => (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? G.gold : G.muted}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" />
        <path d="M15 18h-5" />
        <path d="M10 6h8v4h-8V6Z" />
      </svg>
    ),
  },
  {
    id: "mockTest",
    label: "Quiz",
    icon: (active) => (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? G.gold : G.muted}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: (active) => (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? G.gold : G.muted}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        <line x1="12" y1="12" x2="12" y2="16" />
        <line x1="10" y1="14" x2="14" y2="14" />
      </svg>
    ),
  },
  {
    id: "resume",
    label: "Resume",
    icon: (active) => (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? G.gold : G.muted}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
];

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <div
      style={{
        display: "flex",
        background: G.surface || "#111827",
        borderTop: `1px solid ${G.border || "rgba(255,255,255,0.07)"}`,
        paddingBottom: "env(safe-area-inset-bottom)",
        flexShrink: 0,
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: "8px 0 6px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              position: "relative",
            }}
          >
            {/* Active indicator dot */}
            {active && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 20,
                  height: 2,
                  borderRadius: "0 0 2px 2px",
                  background: G.gold,
                }}
              />
            )}

            {tab.icon(active)}

            <span
              style={{
                fontSize: "0.62rem",
                fontWeight: active ? 700 : 500,
                color: active ? G.gold : G.muted,
                fontFamily: "'Figtree', sans-serif",
                letterSpacing: "0.02em",
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
