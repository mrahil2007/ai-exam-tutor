import { G } from "../theme";

const TABS = [
  { id: "askAI", icon: "🤖", label: "Ask AI" },
  { id: "mockTest", icon: "📝", label: "Mock Test" },
  { id: "jobs", icon: "💼", label: "Jobs" },
  { id: "resume", icon: "📄", label: "Resume" },
];

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: G.bg2,
        borderTop: `1px solid ${G.border2}`,
        paddingBottom: "env(safe-area-inset-bottom)",
        flexShrink: 0,
        zIndex: 30,
      }}
    >
      <style>{`
        .tb-btn { transition:all 0.15s ease; -webkit-tap-highlight-color:transparent; }
        .tb-btn:active { transform:scale(0.88) !important; }
      `}</style>

      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className="tb-btn"
            onClick={() => onTabChange(tab.id)}
            style={{
              flex: 1,
              padding: "10px 0 8px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
            }}
          >
            <div
              style={{
                fontSize: 20,
                lineHeight: 1,
                transition: "transform 0.2s",
                transform: active ? "scale(1.1)" : "scale(1)",
              }}
            >
              {tab.icon}
            </div>
            <div
              style={{
                fontSize: "0.6rem",
                fontWeight: active ? 700 : 500,
                letterSpacing: 0.3,
                color: active ? G.gold : G.muted,
                transition: "color 0.15s",
              }}
            >
              {tab.label}
            </div>
            {active && (
              <div
                style={{
                  width: 20,
                  height: 2,
                  borderRadius: 1,
                  background: `linear-gradient(90deg,${G.gold},${G.saffron})`,
                  marginTop: 1,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
