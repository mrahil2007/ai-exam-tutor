import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";

// ── Screens ───────────────────────────────────────────────────────────────────
import SplashScreen from "./screens/SplashScreen";
import LandingPage from "./screens/LandingPage";
import ExamSelectScreen from "./screens/ExamSelectScreen";
import AuthGateScreen from "./screens/AuthGateScreen";
import AskAIScreen from "./screens/AskAIScreen";
import MockTestScreen from "./screens/MockTestScreen";
import ResumeScreen from "./screens/Resumescreen";
import JobsScreen from "./screens/JobsScreen";
import CurrentAffairsScreen from "./screens/CurrentAffairsScreen";

// ── Components ────────────────────────────────────────────────────────────────
import TabBar from "./components/TabBar";

// ── Theme ─────────────────────────────────────────────────────────────────────
import { G, EXAM_META, GLOBAL_STYLES } from "./theme";

// ── Firebase ──────────────────────────────────────────────────────────────────
import { firebaseAuth } from "./firebase";

// ── Misc pages ────────────────────────────────────────────────────────────────
import DeleteAccount from "./pages/DeleteAccount";

// ── User ID (guest) ───────────────────────────────────────────────────────────
const getAnonId = () => {
  let id = localStorage.getItem("examai_anon_id");
  if (!id) {
    id = "anon_" + crypto.randomUUID();
    localStorage.setItem("examai_anon_id", id);
  }
  return id;
};
const GUEST_USER_ID = getAnonId();

export default function App() {
  if (window.location.pathname === "/delete-account") return <DeleteAccount />;

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5050";

  const [appState, setAppState] = useState("splash");
  const [exam, setExam] = useState(localStorage.getItem("examai_exam") || "");
  const [activeTab, setActiveTab] = useState("askAI");
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseAuth);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState(null);

  const userId = authUser?.uid || GUEST_USER_ID;

  useEffect(() => {
    if (!firebaseAuth) {
      setAuthReady(true);
      return;
    }
    return onAuthStateChanged(firebaseAuth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
  }, []);

  const handleExamSelect = (e) => {
    localStorage.setItem("examai_exam", e);
    setExam(e);
    setAppState("main");
  };

  const handleChangeExam = (e) => {
    localStorage.setItem("examai_exam", e);
    setExam(e);
  };

  const handleSignOut = async () => {
    if (!firebaseAuth || !authUser || signingOut) return;
    setSigningOut(true);
    try {
      await signOut(firebaseAuth);
    } catch {
    } finally {
      setSigningOut(false);
    }
  };

  const handleJobAskAI = (prompt) => {
    setPendingAiPrompt(prompt);
    setActiveTab("askAI");
  };

  const handlePromptUsed = () => setPendingAiPrompt(null);
  const handleTabChange = (tab) => setActiveTab(tab);
  const goToLanding = () => setAppState("landing");
  const goToExamSelect = () => setAppState("exam-select");

  if (appState === "splash")
    return (
      <>
        <style>{GLOBAL_STYLES}</style>
        <SplashScreen
          onDone={() => {
            const saved = localStorage.getItem("examai_exam");
            if (saved) {
              setExam(saved);
              setAppState("main");
            } else setAppState("landing");
          }}
        />
      </>
    );

  if (appState === "landing")
    return (
      <>
        <style>{GLOBAL_STYLES}</style>
        <div
          style={{
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
            background: G.bg,
          }}
        >
          <LandingPage
            onTryApp={() => {
              const saved = localStorage.getItem("examai_exam");
              if (saved) {
                setExam(saved);
                setAppState("main");
              } else setAppState("exam-select");
            }}
          />
        </div>
      </>
    );

  if (appState === "exam-select")
    return (
      <>
        <style>{GLOBAL_STYLES}</style>
        <ExamSelectScreen
          onSelect={handleExamSelect}
          currentExam={exam || null}
        />
      </>
    );

  return (
    <div
      style={{
        height: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: G.bg,
        color: G.text,
        fontFamily: "'Figtree',system-ui,sans-serif",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <style>{GLOBAL_STYLES}</style>

      {/* ── TOP BAR ─────────────────────────────────────────────────────────
          3-column layout: [left spacer] [center logo] [right controls]
          The left spacer mirrors the right controls width so the logo
          stays truly centered without overlapping anything.
      ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "6px 14px 0",
          flexShrink: 0,
          minHeight: 40,
        }}
      >
        {/* Left — invisible spacer that matches right side width */}
        <div style={{ flex: 1 }} />

        {/* Center — ExamAI logo */}
        <button
          onClick={goToLanding}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "'Playfair Display',serif",
            fontSize: "1.1rem",
            fontWeight: 900,
            color: G.text,
            whiteSpace: "nowrap",
            flexShrink: 0,
            padding: "0 8px",
          }}
        >
          Exam<span style={{ color: G.gold }}>AI</span>
        </button>

        {/* Right — exam switcher + sign in/out */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 6,
          }}
        >
          {/* Exam selector */}
          <button
            onClick={goToExamSelect}
            style={{
              background: "transparent",
              border: `1px solid ${G.border2}`,
              borderRadius: 8,
              padding: "4px 8px",
              color: G.muted,
              fontSize: "0.72rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "'Figtree',sans-serif",
              maxWidth: 110,
              overflow: "hidden",
            }}
          >
            <span style={{ flexShrink: 0 }}>{EXAM_META[exam]?.icon}</span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {exam}
            </span>
            <svg
              width="8"
              height="5"
              viewBox="0 0 10 6"
              fill="none"
              style={{ flexShrink: 0 }}
            >
              <path
                d="M1 1L5 5L9 1"
                stroke={G.muted}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Sign in / out */}
          {authUser ? (
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              style={{
                background: "transparent",
                border: `1px solid rgba(229,62,62,0.35)`,
                borderRadius: 8,
                padding: "5px 10px",
                color: "#e07070",
                fontSize: "0.72rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Figtree',sans-serif",
                opacity: signingOut ? 0.6 : 1,
                display: "flex",
                alignItems: "center",
                gap: 4,
                whiteSpace: "nowrap",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {signingOut ? "Leaving..." : "Sign Out"}
            </button>
          ) : (
            <button
              onClick={() => setActiveTab("mockTest")}
              style={{
                background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
                border: "none",
                borderRadius: 8,
                padding: "5px 10px",
                color: "#000",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "'Figtree',sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 4,
                whiteSpace: "nowrap",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {activeTab === "askAI" && (
          <AskAIScreen
            exam={exam}
            onChangeExam={handleChangeExam}
            API_URL={API_URL}
            userId={authUser?.uid || null}
            anonId={GUEST_USER_ID}
            initialPrompt={pendingAiPrompt}
            onPromptUsed={handlePromptUsed}
          />
        )}

        {activeTab === "mockTest" &&
          (authUser ? (
            <MockTestScreen
              exam={exam}
              API_URL={API_URL}
              userId={authUser.uid}
            />
          ) : (
            <AuthGateScreen />
          ))}

        {activeTab === "news" && (
          <CurrentAffairsScreen exam={exam} API_URL={API_URL} />
        )}

        {activeTab === "jobs" && (
          <JobsScreen exam={exam} API_URL={API_URL} onAskAI={handleJobAskAI} />
        )}

        {activeTab === "resume" && (
          <ResumeScreen API_URL={API_URL} userId={userId} />
        )}
      </div>

      {/* ── BOTTOM TAB BAR ── */}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
