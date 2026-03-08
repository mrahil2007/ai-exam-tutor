import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
} from "firebase/auth";
import DeleteAccount from "./pages/DeleteAccount";
import { firebaseAuth, hasFirebaseConfig } from "./firebase";

// ── TYPING ANIMATION ──────────────────────────────────────────────────────────
const typeText = (text, setMessages, onDone) => {
  if (!text || typeof text !== "string") {
    onDone?.();
    return;
  }
  const words = text.split(" ");
  let index = 0;
  const interval = setInterval(() => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated.length - 1;
      if (last < 0 || updated[last].role !== "assistant") {
        clearInterval(interval);
        onDone?.();
        return prev;
      }
      updated[last] = {
        ...updated[last],
        content: words.slice(0, index + 1).join(" "),
      };
      return updated;
    });
    index++;
    if (index >= words.length) {
      clearInterval(interval);
      onDone?.();
    }
  }, 55);
};

const getUserId = () => {
  let userId = localStorage.getItem("examai_userId");
  if (!userId) {
    userId = "user_" + Math.random().toString(36).slice(2, 11);
    localStorage.setItem("examai_userId", userId);
  }
  return userId;
};

const sanitizeCountryCode = (value = "+91") => {
  const digits = String(value).replace(/\D/g, "");
  return digits ? `+${digits}` : "+91";
};

const DEFAULT_PHONE_COUNTRY_CODE = sanitizeCountryCode(
  import.meta.env.VITE_DEFAULT_PHONE_COUNTRY_CODE || "+91"
);

const normalizePhoneToE164 = (input = "") => {
  const value = input.trim();
  if (!value) return null;

  if (value.startsWith("+")) {
    const cleaned = `+${value.slice(1).replace(/\D/g, "")}`;
    return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  }

  const localDigits = value.replace(/\D/g, "").replace(/^0+/, "");
  if (!localDigits) return null;

  const e164 = `${DEFAULT_PHONE_COUNTRY_CODE}${localDigits}`;
  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
};

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const EXAMS = [
  "General",
  "UPSC",
  "CSAT",
  "Current Affairs",
  "State PCS",
  "CBSE 10th",
  "CBSE 12th",
  "JEE",
  "NEET",
  "SSC",
  "Banking",
  "GATE",
  "CAT",
];

const STATE_PCS_LIST = [
  "Uttar Pradesh (UPPSC)",
  "Bihar (BPSC)",
  "Madhya Pradesh (MPPSC)",
  "Rajasthan (RPSC)",
  "Jharkhand (JPSC)",
  "Uttarakhand (UKPSC)",
  "Haryana (HPSC)",
  "Punjab (PPSC)",
  "Maharashtra (MPSC)",
  "Karnataka (KPSC)",
  "Tamil Nadu (TNPSC)",
  "Andhra Pradesh (APPSC)",
  "Telangana (TSPSC)",
  "Odisha (OPSC)",
  "West Bengal (WBPSC)",
  "Gujarat (GPSC)",
  "Himachal Pradesh (HPPSC)",
  "Chhattisgarh (CGPSC)",
];

const TOPIC_PLACEHOLDERS = {
  General: "e.g. Photosynthesis, Indian History...",
  UPSC: "e.g. Indian Polity, Medieval History, Geography...",
  CSAT: "e.g. Logical Reasoning, Data Interpretation...",
  "Current Affairs": "e.g. India-China Relations, Union Budget 2025...",
  "State PCS": "e.g. History, Geography, Economy, Art & Culture...",
  "CBSE 10th": "e.g. Triangles, Chemical Reactions, Nationalism...",
  "CBSE 12th": "e.g. Integration, Electrochemistry, Genetics...",
  JEE: "e.g. Kinematics, Organic Chemistry, Calculus...",
  NEET: "e.g. Cell Biology, Human Physiology, Genetics...",
  SSC: "e.g. Reasoning, Profit & Loss, English Grammar...",
  Banking: "e.g. Seating Arrangement, Data Interpretation...",
  GATE: "e.g. Data Structures, Control Systems...",
  CAT: "e.g. Reading Comprehension, Percentages...",
};

const VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
const USER_ID = getUserId();

const EXAM_META = {
  General: { icon: "💬", color: "#10a37f", desc: "All subjects" },
  UPSC: { icon: "🏛️", color: "#f59e0b", desc: "Civil Services" },
  CSAT: { icon: "🧮", color: "#a78bfa", desc: "GS Paper II" },
  "Current Affairs": { icon: "📰", color: "#38bdf8", desc: "Latest events" },
  "State PCS": { icon: "🗺️", color: "#fb923c", desc: "State exams" },
  "CBSE 10th": { icon: "📗", color: "#34d399", desc: "Class 10 Board" },
  "CBSE 12th": { icon: "📘", color: "#60a5fa", desc: "Class 12 Board" },
  JEE: { icon: "⚡", color: "#3b82f6", desc: "Engineering" },
  NEET: { icon: "🧬", color: "#ec4899", desc: "Medical" },
  SSC: { icon: "📋", color: "#8b5cf6", desc: "Staff Selection" },
  Banking: { icon: "🏦", color: "#06b6d4", desc: "Bank exams" },
  GATE: { icon: "🔬", color: "#f97316", desc: "Tech & Science" },
  CAT: { icon: "📊", color: "#ef4444", desc: "Management" },
};

// ── POLLINATIONS IMAGE HELPERS ───────────────────────────────────────────────
const resolvePollinationsUrl = async (prompt, apiUrl) => {
  const emptyResult = {
    url: null,
    modelUsed: null,
    routeType: null,
    promptUsed: null,
    attemptCount: 0,
  };
  if (!apiUrl) return emptyResult;

  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(`${apiUrl}/image/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => null);
    if (!res.ok) return emptyResult;

    const imageUrl =
      typeof data?.imageUrl === "string" && data.imageUrl.trim()
        ? data.imageUrl.trim()
        : null;
    if (!imageUrl) return emptyResult;

    return {
      ...emptyResult,
      url: imageUrl,
      modelUsed: data?.modelUsed || null,
      routeType: data?.routeType || null,
      promptUsed: data?.promptUsed || null,
      attemptCount:
        Number.isFinite(data?.attemptCount) && data.attemptCount > 0
          ? data.attemptCount
          : 1,
    };
  } catch (e) {
    return emptyResult;
  } finally {
    clearTimeout(timeoutId);
  }
};

const isImageGenerationVerb = (token = "") => {
  const t = token.toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return false;
  if (["generate", "create", "draw", "make", "imagine"].includes(t))
    return true;
  // Accept common typos like "genrate", "generrate", "genmerate"
  if (/^gen[a-z]{0,8}rate$/.test(t)) return true;
  return false;
};

const extractImagePrompt = (text = "") => {
  const value = text.trim();
  if (!value) return null;

  const slashMatch = value.match(/^\/(?:image|img|imagine)\s+(.+)$/i);
  if (slashMatch?.[1]?.trim()) return slashMatch[1].trim();

  const chainedVerbMatch = value.match(
    /^(?:please\s+)?(?:(?:create|generate|draw|make|imagine)\s+)+(?:an?\s+)?image(?:\s+(?:of|for))?\s*[:,-]?\s*(.+)$/i
  );
  if (chainedVerbMatch?.[1]?.trim()) return chainedVerbMatch[1].trim();

  const politeMatch = value.match(
    /^(?:can|could|would)\s+you\s+(?:(?:create|generate|draw|make|imagine)\s+)+(?:an?\s+)?image(?:\s+(?:of|for))?\s*[:,-]?\s*(.+)$/i
  );
  if (politeMatch?.[1]?.trim()) return politeMatch[1].trim();

  // Fallback parser: tolerate typoed generation verb but require explicit "image".
  const imageWithPromptMatch = value.match(
    /\bimage\b\s*(?:of|for)?\s*[:,-]?\s*(.+)$/i
  );
  if (imageWithPromptMatch?.[1]?.trim()) {
    const beforeImage = value.slice(0, imageWithPromptMatch.index || 0).trim();
    const tokens = beforeImage.split(/\s+/).filter(Boolean);
    if (tokens.some(isImageGenerationVerb)) {
      return imageWithPromptMatch[1].trim();
    }
  }

  return null;
};

const isImageEditIntent = (text = "") => {
  const value = text.trim().toLowerCase();
  if (!value) return false;
  if (/\?$/.test(value)) return false;
  if (/^(what|which|who|where|when|why|how)\b/.test(value)) return false;

  return /\b(edit|change|modify|make|turn|replace|remove|add|swap|recolor|re-colou?r|color|colour|background|bg|retouch|enhance|transform|convert)\b/.test(
    value
  );
};

const markdownUrlTransform = (url) => {
  if (typeof url !== "string") return "";
  const value = url.trim();
  if (!value) return "";
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) return value;
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  return "";
};

// ── SPLASH SCREEN ─────────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0a0a0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Figtree', sans-serif",
      }}
    >
      <style>{`
        @keyframes splashPulse{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.12);filter:brightness(1.3)}}
        @keyframes splashRing{0%{transform:scale(0.6);opacity:0.8}100%{transform:scale(2.2);opacity:0}}
        @keyframes splashText{0%{opacity:0;transform:translateY(16px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes splashTagline{0%{opacity:0;letter-spacing:6px}100%{opacity:0.5;letter-spacing:2px}}
        @keyframes splashBar{0%{width:0%}100%{width:100%}}
      `}</style>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 400,
            height: 400,
            background:
              "radial-gradient(circle,rgba(16,163,127,0.2) 0%,transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>
      <div
        style={{
          position: "relative",
          width: 120,
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 28,
        }}
      >
        {[0, 300, 600].map((d) => (
          <div
            key={d}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid rgba(16,163,127,0.5)",
              animation: `splashRing 1.6s ease-out ${d}ms infinite`,
            }}
          />
        ))}
        <div
          style={{
            width: 90,
            height: 90,
            borderRadius: 24,
            background: "linear-gradient(135deg,#10a37f,#0d6b5e)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 42,
            animation: "splashPulse 1.6s ease-in-out infinite",
            boxShadow: "0 0 40px rgba(16,163,127,0.4)",
          }}
        >
          🎓
        </div>
      </div>
      <div style={{ animation: "splashText 0.5s ease 0.3s both" }}>
        <div
          style={{
            fontSize: "2.2rem",
            fontWeight: 800,
            color: "#fff",
            letterSpacing: -1,
            textAlign: "center",
          }}
        >
          Exam<span style={{ color: "#10a37f" }}>AI</span>
        </div>
      </div>
      <div
        style={{
          animation: "splashTagline 0.8s ease 0.7s both",
          fontSize: "0.72rem",
          color: "#888",
          letterSpacing: 2,
          textTransform: "uppercase",
          marginTop: 6,
          marginBottom: 48,
        }}
      >
        Your Smart Study Partner
      </div>
      <div
        style={{
          width: 140,
          height: 2,
          background: "#1e1e1e",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            background: "linear-gradient(90deg,#10a37f,#0dd9a7)",
            borderRadius: 2,
            animation: "splashBar 1.8s ease forwards",
          }}
        />
      </div>
    </div>
  );
}

// ── EXAM SELECT SCREEN ────────────────────────────────────────────────────────
function ExamSelectScreen({ onSelect, currentExam }) {
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
        background: "#0a0a0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "'Figtree', sans-serif",
        overflowY: "auto",
        overflowX: "hidden",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        opacity: leaving ? 0 : 1,
        transform: leaving ? "scale(0.96)" : "scale(1)",
        transition: "opacity 0.35s ease, transform 0.35s ease",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800&display=swap');
        html, body { overflow-x: hidden; overscroll-behavior: none; }
        @keyframes examCardIn{from{opacity:0;transform:translateY(24px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes examTitleIn{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glowPulse{0%,100%{opacity:0.4}50%{opacity:0.7}}
        .exam-card-btn{transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);position:relative;}
        .exam-card-btn:active{transform:scale(0.92)!important;}
      `}</style>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "30%",
            width: 300,
            height: 300,
            background:
              "radial-gradient(circle,rgba(16,163,127,0.15),transparent 70%)",
            filter: "blur(80px)",
            animation: "glowPulse 3s ease infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "20%",
            right: "20%",
            width: 250,
            height: 250,
            background:
              "radial-gradient(circle,rgba(99,102,241,0.1),transparent 70%)",
            filter: "blur(80px)",
            animation: "glowPulse 4s ease 1s infinite",
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
        <div
          style={{
            textAlign: "center",
            marginBottom: 32,
            animation: "examTitleIn 0.6s ease 0.1s both",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(135deg,#10a37f,#0d6b5e)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              margin: "0 auto 16px",
              boxShadow: "0 8px 32px rgba(16,163,127,0.3)",
            }}
          >
            🎓
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              color: "#fff",
              letterSpacing: -0.5,
            }}
          >
            Choose Your <span style={{ color: "#10a37f" }}>Exam</span>
          </div>
          <div style={{ fontSize: "0.85rem", color: "#555", marginTop: 6 }}>
            {currentExam
              ? `Currently: ${currentExam} · Select to switch`
              : "Select your target exam to begin"}
          </div>
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          {EXAMS.map((e, i) => {
            const meta = EXAM_META[e];
            const isSelected = selected === e || currentExam === e;
            return (
              <button
                key={e}
                className="exam-card-btn"
                onClick={() => handleSelect(e)}
                style={{
                  padding: "16px 14px",
                  borderRadius: 14,
                  background: isSelected
                    ? `${meta.color}18`
                    : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${
                    isSelected ? meta.color : "rgba(255,255,255,0.07)"
                  }`,
                  cursor: "pointer",
                  textAlign: "left",
                  animation: `examCardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) ${
                    i * 50 + 150
                  }ms both`,
                  transform: isSelected ? "scale(1.02)" : "scale(1)",
                  boxShadow: isSelected ? `0 8px 24px ${meta.color}25` : "none",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 6, lineHeight: 1 }}>
                  {meta.icon}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.92rem",
                    color: "#fff",
                    marginBottom: 2,
                  }}
                >
                  {e}
                </div>
                <div style={{ fontSize: "0.68rem", color: "#555" }}>
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
        {currentExam && (
          <button
            onClick={() => handleSelect(currentExam)}
            style={{
              width: "100%",
              marginTop: 14,
              padding: "14px",
              borderRadius: 14,
              background: "linear-gradient(135deg,#10a37f,#0d6b5e)",
              border: "none",
              color: "#fff",
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: "pointer",
              animation: "examCardIn 0.5s ease 700ms both",
              boxShadow: "0 8px 24px rgba(16,163,127,0.3)",
            }}
          >
            Continue with {currentExam} →
          </button>
        )}
      </div>
    </div>
  );
}

// ── SWIPE TRANSITION WRAPPER ───────────────────────────────────────────────────
function SwipeView({ activeTab, tabs }) {
  const [prevTab, setPrevTab] = useState(activeTab);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState(0);
  const tabOrder = ["chat", "quiz", "planner", "chart"];
  useEffect(() => {
    if (activeTab !== prevTab) {
      const from = tabOrder.indexOf(prevTab),
        to = tabOrder.indexOf(activeTab);
      setDirection(to > from ? 1 : -1);
      setAnimating(true);
      const t = setTimeout(() => {
        setPrevTab(activeTab);
        setAnimating(false);
      }, 320);
      return () => clearTimeout(t);
    }
  }, [activeTab]);
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes slideInFromRight{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes slideInFromLeft{from{transform:translateX(-60px);opacity:0}to{transform:translateX(0);opacity:1}}
      `}</style>
      {tabs[activeTab] && (
        <div
          key={activeTab}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: animating
              ? `${
                  direction > 0 ? "slideInFromRight" : "slideInFromLeft"
                } 0.32s cubic-bezier(0.25,0.46,0.45,0.94) both`
              : "none",
          }}
        >
          {tabs[activeTab]}
        </div>
      )}
    </div>
  );
}

// ── BOTTOM TAB BAR ─────────────────────────────────────────────────────────────
function TabBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: "chat", icon: "💬", label: "Chat" },
    { id: "quiz", icon: "🧠", label: "Quiz" },
    { id: "planner", icon: "📅", label: "Planner" },
    { id: "chart", icon: "📊", label: "Charts" },
  ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "#171717",
        borderTop: "1px solid #2a2a2a",
        paddingBottom: "env(safe-area-inset-bottom)",
        flexShrink: 0,
        zIndex: 30,
      }}
    >
      <style>{`
        @keyframes tabPop{0%{transform:scale(1)}40%{transform:scale(1.3)}70%{transform:scale(0.92)}100%{transform:scale(1)}}
        .tab-btn{transition:all 0.15s ease;-webkit-tap-highlight-color:transparent;}
        .tab-btn:active{transform:scale(0.9)!important;}
      `}</style>
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className="tab-btn"
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
              color: active ? "#10a37f" : "#555",
              animation: active ? "tabPop 0.3s ease" : "none",
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
                fontSize: "0.62rem",
                fontWeight: active ? 700 : 500,
                letterSpacing: 0.3,
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
                  background: "#10a37f",
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

const getAuthErrorMessage = (error) => {
  const code = error?.code || "";
  if (code === "auth/invalid-credential") return "Invalid email or password.";
  if (code === "auth/email-already-in-use")
    return "This email is already registered. Sign in instead.";
  if (code === "auth/weak-password")
    return "Password should be at least 6 characters.";
  if (code === "auth/invalid-email") return "Please enter a valid email.";
  if (code === "auth/popup-closed-by-user")
    return "Google sign-in was closed before completion.";
  if (code === "auth/popup-blocked")
    return "Popup was blocked. Allow popups and try again.";
  if (code === "auth/invalid-app-credential") {
    return "Phone verification needs manual reCAPTCHA. Complete the checkbox and send OTP again.";
  }
  if (code === "auth/invalid-phone-number")
    return `Enter a valid phone number. Country code is auto-added (default ${DEFAULT_PHONE_COUNTRY_CODE}).`;
  if (code === "auth/too-many-requests")
    return "Too many attempts. Please wait and try again.";
  if (code === "auth/invalid-verification-code")
    return "Invalid OTP. Please check and retry.";
  if (code === "auth/missing-verification-code") return "Please enter the OTP.";
  if (code === "auth/quota-exceeded")
    return "SMS quota reached for now. Try again later.";
  if (
    code === "auth/invalid-api-key" ||
    code === "auth/api-key-not-valid.-please-pass-a-valid-api-key."
  ) {
    return "Firebase API key is invalid. Check VITE_FIREBASE_API_KEY in ai-exam-frontend/.env and restart Vite.";
  }
  if (typeof error?.message === "string" && error.message.includes("api-key")) {
    return "Firebase API key looks invalid. Update VITE_FIREBASE_API_KEY and restart the frontend server.";
  }
  if (typeof error?.message === "string" && /timeout/i.test(error.message)) {
    return "Verification timed out. Complete reCAPTCHA and retry sending OTP.";
  }
  return error?.message || "Authentication failed. Please try again.";
};

function AuthGateScreen({ tabId, authReady }) {
  const [authMethod, setAuthMethod] = useState("google");
  const [emailMode, setEmailMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loadingAction, setLoadingAction] = useState("");
  const [error, setError] = useState("");
  const [showManualRecaptcha, setShowManualRecaptcha] = useState(false);

  const recaptchaContainerRef = useRef(null);
  const recaptchaVerifierRef = useRef(null);
  const tabLabel = tabId === "chart" ? "Charts" : "Quiz";

  const clearRecaptcha = useCallback(() => {
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearRecaptcha();
    };
  }, [clearRecaptcha]);

  const getRecaptchaVerifier = useCallback(() => {
    if (!firebaseAuth) throw new Error("Firebase authentication is not ready.");
    if (recaptchaVerifierRef.current) return recaptchaVerifierRef.current;
    if (!recaptchaContainerRef.current) {
      throw new Error("reCAPTCHA failed to initialize. Reload and try again.");
    }

    recaptchaVerifierRef.current = new RecaptchaVerifier(
      firebaseAuth,
      recaptchaContainerRef.current,
      {
        size: showManualRecaptcha ? "normal" : "invisible",
        callback: () => setError(""),
        "expired-callback": () =>
          setError("Verification expired. Please retry."),
      }
    );

    return recaptchaVerifierRef.current;
  }, [showManualRecaptcha]);

  useEffect(() => {
    if (authMethod !== "phone" || confirmationResult) return;
    (async () => {
      try {
        const verifier = getRecaptchaVerifier();
        await verifier.render();
      } catch {
        // keep silent; user gets explicit error on send
      }
    })();
  }, [authMethod, confirmationResult, getRecaptchaVerifier]);

  const withLoading = async (action, task) => {
    try {
      setError("");
      setLoadingAction(action);
      await task();
    } catch (e) {
      setError(getAuthErrorMessage(e));
    } finally {
      setLoadingAction("");
    }
  };

  const switchMethod = (method) => {
    setAuthMethod(method);
    setError("");
    setShowManualRecaptcha(false);
  };

  const handleGoogleSignIn = async () => {
    if (!firebaseAuth) {
      setError("Firebase authentication is not configured.");
      return;
    }

    await withLoading("google", async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(firebaseAuth, provider);
    });
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!firebaseAuth) {
      setError("Firebase authentication is not configured.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    await withLoading("email", async () => {
      if (emailMode === "signup") {
        await createUserWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password
        );
        return;
      }
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    });
  };

  const handleSendOtp = async () => {
    if (!firebaseAuth) {
      setError("Firebase authentication is not configured.");
      return;
    }

    const normalizedPhone = normalizePhoneToE164(phoneNumber);
    if (!normalizedPhone) {
      setError(
        `Enter a valid phone number. You can type without country code (default ${DEFAULT_PHONE_COUNTRY_CODE}).`
      );
      return;
    }

    await withLoading("otp-send", async () => {
      try {
        const verifier = getRecaptchaVerifier();
        const widgetId = await verifier.render();
        if (showManualRecaptcha) {
          const captchaResponse =
            window.grecaptcha?.getResponse(widgetId) || "";
          if (!captchaResponse) {
            throw new Error("Please complete the reCAPTCHA checkbox.");
          }
        }

        const result = await signInWithPhoneNumber(
          firebaseAuth,
          normalizedPhone,
          verifier
        );
        setConfirmationResult(result);
        setOtpCode("");
      } catch (e) {
        const code = e?.code || "";
        const message = String(e?.message || "");
        if (
          !showManualRecaptcha &&
          (code === "auth/invalid-app-credential" || /timeout/i.test(message))
        ) {
          setShowManualRecaptcha(true);
        }
        clearRecaptcha();
        throw e;
      }
    });
  };

  const handleVerifyOtp = async () => {
    if (!confirmationResult) {
      setError("Request OTP first.");
      return;
    }

    await withLoading("otp-verify", async () => {
      await confirmationResult.confirm(otpCode.trim());
      setConfirmationResult(null);
      setOtpCode("");
      setPhoneNumber("");
    });
  };

  const disabled = Boolean(loadingAction);

  const AUTH_STYLES = `
    @keyframes authOrbDrift {
      0%, 100% { transform: translateY(0px) scale(1); }
      50% { transform: translateY(-16px) scale(1.04); }
    }
    .auth-shell {
      position: relative;
      flex: 1;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background:
        radial-gradient(900px 420px at -10% -25%, rgba(16,163,127,0.22), transparent 60%),
        radial-gradient(760px 360px at 120% -20%, rgba(56,189,248,0.16), transparent 65%),
        linear-gradient(180deg, #17191d 0%, #101114 100%);
    }
    .auth-orb {
      position: absolute;
      border-radius: 999px;
      filter: blur(18px);
      pointer-events: none;
      animation: authOrbDrift 9s ease-in-out infinite;
    }
    .auth-orb-one {
      width: 190px;
      height: 190px;
      background: rgba(16,163,127,0.2);
      top: 8%;
      right: 10%;
    }
    .auth-orb-two {
      width: 140px;
      height: 140px;
      background: rgba(56,189,248,0.16);
      bottom: 12%;
      left: 9%;
      animation-delay: 1.3s;
    }
    .auth-card {
      position: relative;
      z-index: 2;
      width: min(560px, 100%);
      border-radius: 22px;
      border: 1px solid #2b3935;
      background: linear-gradient(160deg, rgba(20,23,26,0.97), rgba(13,15,18,0.97));
      box-shadow: 0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05);
      padding: 22px;
    }
    .auth-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      border: 1px solid #2d5148;
      background: #12221f;
      color: #75d9be;
      padding: 4px 10px;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .auth-title {
      margin-top: 11px;
      color: #f4f8f7;
      font-size: clamp(1.15rem, 1.3vw, 1.34rem);
      font-weight: 700;
      letter-spacing: -0.2px;
    }
    .auth-subtitle {
      margin-top: 6px;
      color: #9aa7a3;
      font-size: 0.86rem;
      line-height: 1.5;
    }
    .auth-method-row {
      margin-top: 16px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .auth-method-btn {
      border: 1px solid #2a3131;
      border-radius: 11px;
      background: #171c1f;
      color: #9aa6a5;
      font-size: 0.77rem;
      font-weight: 600;
      padding: 8px 6px;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .auth-method-btn.active {
      border-color: #1d6653;
      background: linear-gradient(135deg, #153830, #133129);
      color: #d8fef3;
      box-shadow: 0 6px 20px rgba(16,163,127,0.2);
    }
    .auth-method-btn:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }
    .auth-panel {
      margin-top: 14px;
      border-radius: 14px;
      border: 1px solid #283131;
      background: rgba(12,15,17,0.74);
      padding: 13px;
    }
    .auth-input {
      width: 100%;
      border-radius: 10px;
      border: 1px solid #2f3837;
      background: #171c1f;
      color: #f3f7f7;
      padding: 11px 12px;
      font-size: 0.86rem;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .auth-input::placeholder { color: #6d7877; }
    .auth-input:focus {
      outline: none;
      border-color: #2aa987;
      box-shadow: 0 0 0 3px rgba(16,163,127,0.16);
    }
    .auth-google-btn,
    .auth-primary-btn,
    .auth-secondary-btn {
      width: 100%;
      margin-top: 10px;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 0.86rem;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .auth-google-btn {
      border: 1px solid #2f3a3a;
      background: linear-gradient(135deg, #1b2024, #161b1f);
      color: #ecf0ef;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .auth-google-dot {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.73rem;
      font-weight: 800;
      color: #111;
      background: linear-gradient(135deg, #fde047, #f97316);
    }
    .auth-primary-btn {
      border: none;
      background: linear-gradient(135deg, #0fa57f, #0b8768);
      color: #fff;
      box-shadow: 0 10px 24px rgba(16,163,127,0.24);
    }
    .auth-secondary-btn {
      border: 1px solid #1d6653;
      background: #11231f;
      color: #82e9cd;
    }
    .auth-google-btn:disabled,
    .auth-primary-btn:disabled,
    .auth-secondary-btn:disabled {
      opacity: 0.58;
      cursor: not-allowed;
      transform: none;
    }
    .auth-link-btn {
      margin-top: 8px;
      border: none;
      background: transparent;
      color: #8cc5f8;
      font-size: 0.79rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
    }
    .auth-link-btn:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }
    .auth-help {
      margin-top: 8px;
      color: #73807d;
      font-size: 0.76rem;
      line-height: 1.45;
    }
    .auth-footnote {
      margin-top: 12px;
      color: #7a8884;
      font-size: 0.73rem;
      line-height: 1.45;
      text-align: center;
    }
    .auth-error {
      margin-top: 12px;
      border: 1px solid #6d2f35;
      border-radius: 10px;
      background: #31151a;
      color: #f7a6b0;
      padding: 9px 10px;
      font-size: 0.8rem;
      line-height: 1.45;
    }
    .auth-status {
      color: #9cb4ae;
      font-size: 0.88rem;
      text-align: center;
      line-height: 1.55;
      padding: 8px 2px;
    }
    .auth-panel-grid {
      display: grid;
      gap: 8px;
    }
    @media (max-width: 680px) {
      .auth-card {
        border-radius: 18px;
        padding: 16px;
      }
      .auth-method-row {
        gap: 6px;
      }
      .auth-method-btn {
        font-size: 0.72rem;
      }
      .auth-shell {
        align-items: flex-start;
        padding-top: 24px;
      }
    }
  `;

  const renderShell = (content) => (
    <div className="auth-shell">
      <style>{AUTH_STYLES}</style>
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <div className="auth-card">{content}</div>
    </div>
  );

  if (!hasFirebaseConfig) {
    return renderShell(
      <>
        <div className="auth-badge">Secure Access</div>
        <div className="auth-title">Firebase configuration missing</div>
        <div className="auth-status">
          Add all `VITE_FIREBASE_*` variables in `ai-exam-frontend/.env`, then
          restart your frontend server.
        </div>
      </>
    );
  }

  if (!authReady) {
    return renderShell(
      <>
        <div className="auth-badge">Secure Access</div>
        <div className="auth-title">Checking sign-in status</div>
        <div className="auth-status">Please wait...</div>
      </>
    );
  }

  return renderShell(
    <>
      <div className="auth-badge">Secure Access</div>
      <div className="auth-title">Sign in to unlock {tabLabel}</div>
      <div className="auth-subtitle">
        Login is required for {tabLabel}. Chat and Planner stay available
        without sign in.
      </div>

      <div className="auth-method-row">
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchMethod("google")}
          className={`auth-method-btn ${
            authMethod === "google" ? "active" : ""
          }`}
        >
          Google
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchMethod("email")}
          className={`auth-method-btn ${
            authMethod === "email" ? "active" : ""
          }`}
        >
          Email
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchMethod("phone")}
          className={`auth-method-btn ${
            authMethod === "phone" ? "active" : ""
          }`}
        >
          Phone
        </button>
      </div>

      {authMethod === "google" && (
        <div className="auth-panel">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={disabled}
            className="auth-google-btn"
          >
            <span className="auth-google-dot">G</span>
            {loadingAction === "google"
              ? "Connecting Google..."
              : "Continue with Google"}
          </button>
          <div className="auth-help">
            Fastest option if your device already has a Google account signed
            in.
          </div>
        </div>
      )}

      {authMethod === "email" && (
        <form className="auth-panel auth-panel-grid" onSubmit={handleEmailAuth}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            className="auth-input"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={
              emailMode === "signup" ? "new-password" : "current-password"
            }
            className="auth-input"
          />
          <button
            type="submit"
            disabled={disabled}
            className="auth-primary-btn"
          >
            {loadingAction === "email"
              ? emailMode === "signup"
                ? "Creating account..."
                : "Signing in..."
              : emailMode === "signup"
              ? "Create account"
              : "Sign in"}
          </button>
          <button
            type="button"
            disabled={disabled}
            className="auth-link-btn"
            onClick={() =>
              setEmailMode((prev) => (prev === "signup" ? "login" : "signup"))
            }
          >
            {emailMode === "signup"
              ? "Already have an account? Sign in"
              : "Need an account? Sign up"}
          </button>
        </form>
      )}

      {authMethod === "phone" && (
        <div className="auth-panel auth-panel-grid">
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="9876543210"
            autoComplete="tel"
            className="auth-input"
          />

          {!confirmationResult ? (
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={disabled}
              className="auth-secondary-btn"
            >
              {loadingAction === "otp-send" ? "Sending OTP..." : "Send OTP"}
            </button>
          ) : (
            <>
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="Enter OTP code"
                autoComplete="one-time-code"
                className="auth-input"
              />
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={disabled}
                className="auth-primary-btn"
              >
                {loadingAction === "otp-verify" ? "Verifying..." : "Verify OTP"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmationResult(null);
                  setOtpCode("");
                }}
                className="auth-link-btn"
              >
                Change number / resend
              </button>
            </>
          )}
          <div className="auth-help">
            Enter mobile number only. Country code will auto-apply as{" "}
            <code>{DEFAULT_PHONE_COUNTRY_CODE}</code>.
          </div>
          <div
            ref={recaptchaContainerRef}
            style={{
              minHeight:
                authMethod === "phone" &&
                !confirmationResult &&
                showManualRecaptcha
                  ? 78
                  : 1,
              width:
                authMethod === "phone" &&
                !confirmationResult &&
                showManualRecaptcha
                  ? "100%"
                  : 1,
              opacity:
                authMethod === "phone" &&
                !confirmationResult &&
                showManualRecaptcha
                  ? 1
                  : 0,
              marginTop:
                authMethod === "phone" &&
                !confirmationResult &&
                showManualRecaptcha
                  ? 8
                  : 0,
              overflow: "hidden",
              pointerEvents:
                authMethod === "phone" &&
                !confirmationResult &&
                showManualRecaptcha
                  ? "auto"
                  : "none",
            }}
          />
        </div>
      )}

      <div className="auth-footnote">
        Sign in once and we will keep you logged in on this device.
      </div>

      {error && <div className="auth-error">{error}</div>}
    </>
  );
}

// ── QUESTION TYPE DETECTOR & RENDERER ────────────────────────────────────────
const isPipeTable = (text) => text.includes(" | ") && /[A-D]\.\s/.test(text);
const isMatchingQuestion = (text) =>
  /list[\s-]?i\b/i.test(text) && /list[\s-]?ii\b/i.test(text);

const parsePipeTable = (text) => {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let header1 = "List I",
    header2 = "List II";
  const rows = [];
  let questionLine = "";
  for (const line of lines) {
    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim());
      if (/^[A-D]\.\s/i.test(parts[0]) || /^\d+\.\s/.test(parts[0])) {
        const left = parts[0].replace(/^[A-D]\.\s*/i, "").trim(),
          right = parts[1]?.replace(/^\d+\.\s*/, "").trim() || "";
        const leftLabel =
            parts[0].match(/^([A-D])\./i)?.[1]?.toUpperCase() || "",
          rightLabel = parts[1]?.match(/^(\d+)\./)?.[1] || "";
        rows.push({ leftLabel, left, rightLabel, right });
      } else {
        header1 = parts[0] || "List I";
        header2 = parts[1] || "List II";
      }
    } else if (/how many|which of|select the|correctly matched/i.test(line))
      questionLine = line;
  }
  return { header1, header2, rows, questionLine };
};

const parseInlineLists = (text) => {
  const list1Match = text.match(/list[\s-]?i[:\s]+([^.]*?)(?=list[\s-]?ii)/i);
  const list2Match = text.match(
    /list[\s-]?ii[:\s]+([^.]*?)(?=which|how many|$)/i
  );
  const parseItems = (str) => {
    if (!str) return [];
    const items = [],
      regex =
        /([A-Da-d1-4])[).]\s*([^,A-Da-d1-4)]+?)(?=[,;]?\s*[A-Da-d1-4][).]|$)/g;
    let match;
    while ((match = regex.exec(str)) !== null)
      items.push({ label: match[1].toUpperCase(), text: match[2].trim() });
    return items;
  };
  return {
    list1Items: parseItems(list1Match?.[1] || ""),
    list2Items: parseItems(list2Match?.[1] || ""),
  };
};

function SmartQuestionDisplay({ question }) {
  const lines = question
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const preambleLines = [];
  let tableStarted = false,
    bottomLine = "";
  for (const line of lines) {
    if (
      !tableStarted &&
      !line.includes("|") &&
      !/^[A-D]\.\s/i.test(line) &&
      !/list[\s-]?i\b/i.test(line)
    ) {
      if (/how many|which of|select the|correctly matched/i.test(line))
        bottomLine = line;
      else preambleLines.push(line);
    } else tableStarted = true;
  }
  if (isPipeTable(question)) {
    const { header1, header2, rows, questionLine } = parsePipeTable(question);
    return (
      <div>
        {preambleLines.length > 0 && (
          <div
            style={{
              fontSize: "0.9rem",
              color: "#fff",
              lineHeight: 1.6,
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            {preambleLines.join(" ")}
          </div>
        )}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: 10,
            fontSize: "0.82rem",
          }}
        >
          <thead>
            <tr>
              <td
                style={{
                  background: "#1a3a2a",
                  color: "#10a37f",
                  padding: "7px 10px",
                  border: "1px solid #10a37f40",
                  fontWeight: 700,
                  fontSize: "0.72rem",
                  letterSpacing: 0.8,
                }}
              >
                {header1}
              </td>
              <td
                style={{
                  background: "#1a2a3a",
                  color: "#60a5fa",
                  padding: "7px 10px",
                  border: "1px solid #60a5fa40",
                  fontWeight: 700,
                  fontSize: "0.72rem",
                  letterSpacing: 0.8,
                }}
              >
                {header2}
              </td>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td
                  style={{
                    padding: "8px 10px",
                    border: "1px solid #2a2a2a",
                    color: "#ddd",
                    background: "#1e2e24",
                    verticalAlign: "top",
                  }}
                >
                  <span
                    style={{
                      color: "#10a37f",
                      fontWeight: 700,
                      marginRight: 6,
                    }}
                  >
                    {row.leftLabel}.
                  </span>
                  {row.left}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    border: "1px solid #2a2a2a",
                    color: "#ddd",
                    background: "#1e242e",
                    verticalAlign: "top",
                  }}
                >
                  <span
                    style={{
                      color: "#60a5fa",
                      fontWeight: 700,
                      marginRight: 6,
                    }}
                  >
                    {row.rightLabel}.
                  </span>
                  {row.right}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(questionLine || bottomLine) && (
          <div
            style={{ fontSize: "0.85rem", color: "#bbb", fontStyle: "italic" }}
          >
            {questionLine || bottomLine}
          </div>
        )}
      </div>
    );
  }
  const formatQuestion = (text) =>
    text
      .replace(/(Consider the following statements?:?\s*)/gi, "$1\n")
      .replace(/(Statement\s+I{1,3}:)/gi, "\n$1")
      .replace(/(\d+\.\s)/g, "\n\n$1")
      .replace(
        /(Which of the statements?|How many of the above|Which one of the following)/gi,
        "\n$1"
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  return (
    <div
      style={{
        fontSize: "0.9rem",
        color: "#fff",
        lineHeight: 1.75,
        fontWeight: 500,
        whiteSpace: "pre-wrap",
      }}
    >
      {formatQuestion(question)}
    </div>
  );
}

// ── QUIZ SCREEN ───────────────────────────────────────────────────────────────
function QuizScreen({ exam, API_URL, userId = USER_ID }) {
  const [screen, setScreen] = useState("setup");
  const [topic, setTopic] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [showExplanation, setShowExplanation] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedState("");
    setTopic("");
    setError("");
  }, [exam]);

  const startQuiz = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }
    if (exam === "State PCS" && !selectedState) {
      setError("Please select your state");
      return;
    }
    setError("");
    setScreen("loading");
    try {
      const res = await fetch(`${API_URL}/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          exam,
          count,
          userId,
          ...(exam === "State PCS" && selectedState
            ? { state: selectedState }
            : {}),
        }),
      });
      const data = await res.json();
      if (!data.questions) throw new Error(data.error || "Failed");
      setQuestions(data.questions);
      setAnswers([]);
      setCurrent(0);
      setSelected(null);
      setShowExplanation(false);
      setStartTime(Date.now());
      setScreen("playing");
    } catch (err) {
      setError(err.message || "Failed to generate quiz. Try again.");
      setScreen("setup");
    }
  };

  const selectAnswer = (idx) => {
    if (selected !== null) return;
    setSelected(idx);
    setShowExplanation(true);
    setAnswers((a) => [
      ...a,
      { selected: idx, correct: questions[current].correct },
    ]);
  };

  const nextQuestion = () => {
    if (current + 1 >= questions.length) finishQuiz();
    else {
      setCurrent((c) => c + 1);
      setSelected(null);
      setShowExplanation(false);
    }
  };

  const finishQuiz = async () => {
    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    setAnswers((a) => {
      const finalAnswers =
        selected !== null
          ? [
              ...a.slice(0, -1),
              { selected, correct: questions[current].correct },
            ]
          : a;
      const finalScore = finalAnswers.filter(
        (ans) => ans.selected === ans.correct
      ).length;
      fetch(`${API_URL}/quiz/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          topic,
          exam,
          score: finalScore,
          total: questions.length,
          timeTaken,
        }),
      }).catch(() => {});
      setScreen("result");
      return finalAnswers;
    });
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    setScreen("history");
    try {
      const res = await fetch(`${API_URL}/quiz/history/${userId}`);
      setHistory(await res.json());
    } catch (e) {}
    setLoadingHistory(false);
  };

  const score = answers.filter((a) => a.selected === a.correct).length;
  const percentage = questions.length
    ? Math.round((score / questions.length) * 100)
    : 0;
  const getScoreColor = (pct) =>
    pct >= 80 ? "#10a37f" : pct >= 50 ? "#f59e0b" : "#e53e3e";
  const getGrade = (pct) =>
    pct >= 90
      ? "Excellent! 🏆"
      : pct >= 80
      ? "Great! 🎉"
      : pct >= 60
      ? "Good 👍"
      : pct >= 40
      ? "Keep Practicing 📚"
      : "Need More Study 💪";
  const q = questions[current];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#212121",
        color: "#ececec",
        fontFamily: "'Figtree', sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid #2a2a2a",
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
          🧠 Quiz Mode
        </div>
        <div style={{ fontSize: "0.72rem", color: "#666" }}>
          {exam}
          {selectedState ? ` · ${selectedState.split(" ")[0]}` : ""}
        </div>
        <button
          onClick={loadHistory}
          style={{
            background: "transparent",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: "0.78rem",
          }}
        >
          📊 History
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {screen === "setup" && (
          <div
            style={{
              maxWidth: 420,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🧠</div>
              <div
                style={{ fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}
              >
                Start a Quiz
              </div>
              <div style={{ fontSize: "0.82rem", color: "#666", marginTop: 4 }}>
                Test your knowledge with AI-generated questions
              </div>
            </div>
            {exam === "State PCS" && (
              <div>
                <label
                  style={{
                    fontSize: "0.82rem",
                    color: "#999",
                    marginBottom: 6,
                    display: "block",
                  }}
                >
                  Select State <span style={{ color: "#e53e3e" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: "#2a2a2a",
                      border: `1px solid ${
                        selectedState ? "#10a37f" : "#3a3a3a"
                      }`,
                      borderRadius: 10,
                      color: selectedState ? "#ececec" : "#666",
                      fontSize: "0.9rem",
                      outline: "none",
                      fontFamily: "'Figtree', sans-serif",
                      appearance: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">— Choose your state —</option>
                    {STATE_PCS_LIST.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <svg
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                    }}
                    width="12"
                    height="8"
                    viewBox="0 0 12 8"
                    fill="none"
                  >
                    <path
                      d="M1 1L6 7L11 1"
                      stroke="#888"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            )}
            <div>
              <label
                style={{
                  fontSize: "0.82rem",
                  color: "#999",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                Topic
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startQuiz()}
                placeholder={
                  TOPIC_PLACEHOLDERS[exam] || "e.g. Photosynthesis..."
                }
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 10,
                  color: "#ececec",
                  fontSize: "0.9rem",
                  outline: "none",
                  fontFamily: "'Figtree', sans-serif",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "0.82rem",
                  color: "#999",
                  marginBottom: 10,
                  display: "block",
                }}
              >
                Number of Questions
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 8,
                      background: count === n ? "#10a37f" : "#2a2a2a",
                      border: `1px solid ${
                        count === n ? "#10a37f" : "#3a3a3a"
                      }`,
                      color: count === n ? "#fff" : "#aaa",
                      fontSize: "0.88rem",
                      fontWeight: count === n ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <div
                style={{
                  background: "#e53e3e20",
                  border: "1px solid #e53e3e",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#e53e3e",
                  fontSize: "0.84rem",
                }}
              >
                {error}
              </div>
            )}
            <button
              onClick={startQuiz}
              style={{
                width: "100%",
                padding: 14,
                background: "#10a37f",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontSize: "1rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Start Quiz
            </button>
          </div>
        )}
        {screen === "loading" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "60vh",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                border: "3px solid #2a2a2a",
                borderTopColor: "#10a37f",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <div
              style={{ color: "#888", fontSize: "0.9rem", textAlign: "center" }}
            >
              Generating {count} questions on "{topic}"...
            </div>
          </div>
        )}
        {screen === "playing" && q && (
          <div
            style={{
              maxWidth: 560,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: "0.8rem", color: "#888" }}>
                  Question {current + 1} of {questions.length}
                </span>
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "#10a37f",
                    fontWeight: 600,
                  }}
                >
                  {answers.filter((a) => a.selected === a.correct).length}{" "}
                  correct
                </span>
              </div>
              <div
                style={{ height: 4, background: "#2a2a2a", borderRadius: 2 }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 2,
                    background: "#10a37f",
                    width: `${((current + 1) / questions.length) * 100}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                background: "#2a2a2a",
                borderRadius: 14,
                padding: "18px 16px",
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "#10a37f",
                  fontWeight: 600,
                  marginBottom: 10,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Question {current + 1}
              </div>
              <SmartQuestionDisplay question={q.question} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.options.map((opt, idx) => {
                const isSelected = selected === idx,
                  isCorrect = idx === q.correct;
                let bg = "#2a2a2a",
                  border = "#3a3a3a",
                  color = "#ddd";
                if (selected !== null) {
                  if (isCorrect) {
                    bg = "#10a37f20";
                    border = "#10a37f";
                    color = "#10a37f";
                  } else if (isSelected) {
                    bg = "#e53e3e20";
                    border = "#e53e3e";
                    color = "#e53e3e";
                  }
                }
                return (
                  <button
                    key={idx}
                    onClick={() => selectAnswer(idx)}
                    style={{
                      padding: "13px 16px",
                      borderRadius: 10,
                      background: bg,
                      border: `1px solid ${border}`,
                      color,
                      fontSize: "0.9rem",
                      textAlign: "left",
                      cursor: selected !== null ? "default" : "pointer",
                      transition: "all 0.2s",
                      fontFamily: "'Figtree', sans-serif",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background:
                          selected !== null && isCorrect
                            ? "#10a37f"
                            : selected !== null && isSelected
                            ? "#e53e3e"
                            : "#333",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#fff",
                      }}
                    >
                      {selected !== null && isCorrect
                        ? "✓"
                        : selected !== null && isSelected
                        ? "✗"
                        : ["A", "B", "C", "D"][idx]}
                    </span>
                    {opt.replace(/^[A-D]\)\s*/, "")}
                  </button>
                );
              })}
            </div>
            {showExplanation && (
              <div
                style={{
                  background: "#10a37f15",
                  border: "1px solid #10a37f40",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#10a37f",
                    fontWeight: 700,
                    marginBottom: 5,
                  }}
                >
                  💡 Explanation
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "#ccc",
                    lineHeight: 1.6,
                  }}
                >
                  {q.explanation}
                </div>
              </div>
            )}
            {selected !== null && (
              <button
                onClick={nextQuestion}
                style={{
                  width: "100%",
                  padding: 13,
                  background: "#10a37f",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {current + 1 >= questions.length
                  ? "See Results 🏁"
                  : "Next Question →"}
              </button>
            )}
          </div>
        )}
        {screen === "result" && (
          <div
            style={{
              maxWidth: 420,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 56 }}>
              {percentage >= 80
                ? "🏆"
                : percentage >= 60
                ? "🎉"
                : percentage >= 40
                ? "📚"
                : "💪"}
            </div>
            <div>
              <div
                style={{
                  fontSize: "2.5rem",
                  fontWeight: 800,
                  color: getScoreColor(percentage),
                }}
              >
                {percentage}%
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  color: "#fff",
                  marginTop: 4,
                }}
              >
                {getGrade(percentage)}
              </div>
              <div style={{ fontSize: "0.82rem", color: "#666", marginTop: 6 }}>
                {score} out of {questions.length} correct
              </div>
            </div>
            <div
              style={{
                background: "#2a2a2a",
                borderRadius: 14,
                padding: 16,
                display: "flex",
                justifyContent: "space-around",
              }}
            >
              {[
                ["Correct", score, "#10a37f"],
                ["Wrong", questions.length - score, "#e53e3e"],
                ["Total", questions.length, "#f59e0b"],
              ].map(([label, val, color]) => (
                <div key={label}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color }}>
                    {val}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#666" }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  setScreen("setup");
                  setTopic("");
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 10,
                  color: "#ddd",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                New Quiz
              </button>
              <button
                onClick={() => {
                  setScreen("playing");
                  setCurrent(0);
                  setSelected(null);
                  setAnswers([]);
                  setShowExplanation(false);
                  setStartTime(Date.now());
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#10a37f",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retry 🔁
              </button>
            </div>
          </div>
        )}
        {screen === "history" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
                📊 Quiz History
              </div>
              <button
                onClick={() => setScreen("setup")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#10a37f",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                + New Quiz
              </button>
            </div>
            {loadingHistory ? (
              <div style={{ textAlign: "center", color: "#666", padding: 40 }}>
                Loading...
              </div>
            ) : history.length === 0 ? (
              <div style={{ textAlign: "center", color: "#555", padding: 40 }}>
                No quiz history yet.
              </div>
            ) : (
              history.map((h, i) => (
                <div
                  key={i}
                  style={{
                    background: "#2a2a2a",
                    borderRadius: 12,
                    padding: "14px 16px",
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: `${getScoreColor(h.percentage)}20`,
                      border: `2px solid ${getScoreColor(h.percentage)}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: "0.9rem",
                      color: getScoreColor(h.percentage),
                    }}
                  >
                    {h.percentage}%
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.88rem",
                        color: "#fff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {h.topic}
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "#666",
                        marginTop: 2,
                      }}
                    >
                      {h.score}/{h.total} correct · {h.exam} ·{" "}
                      {new Date(h.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── STUDY PLANNER SCREEN ──────────────────────────────────────────────────────
function PlannerScreen({ exam, API_URL }) {
  const [screen, setScreen] = useState("setup");
  const [examDate, setExamDate] = useState("");
  const [topics, setTopics] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(4);
  const [plan, setPlan] = useState(null);
  const [savedPlans, setSavedPlans] = useState([]);
  const [viewMode, setViewMode] = useState("list");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(0);

  useEffect(() => {
    loadSavedPlans();
  }, []);

  const loadSavedPlans = async () => {
    try {
      const res = await fetch(`${API_URL}/planner/${USER_ID}`);
      const data = await res.json();
      setSavedPlans(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  const generatePlan = async () => {
    if (!examDate) {
      setError("Please select your exam date");
      return;
    }
    setError("");
    setLoading(true);
    setScreen("loading");
    try {
      const res = await fetch(`${API_URL}/planner/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam,
          examDate,
          topics: topics.trim() || null,
          hoursPerDay,
          userId: USER_ID,
        }),
      });
      const data = await res.json();
      if (!data.plan) throw new Error(data.error || "Failed");
      setPlan(data.plan);
      setScreen("view");
      loadSavedPlans();
    } catch (err) {
      setError("Failed to generate plan. Please try again.");
      setScreen("setup");
    }
    setLoading(false);
  };

  const toggleDay = async (dayIndex) => {
    if (!plan?._id) return;
    const updated = {
      ...plan,
      days: plan.days.map((d, i) =>
        i === dayIndex ? { ...d, completed: !d.completed } : d
      ),
    };
    setPlan(updated);
    try {
      await fetch(`${API_URL}/planner/${plan._id}/day/${dayIndex}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: updated.days[dayIndex].completed }),
      });
    } catch (e) {}
  };

  const deletePlan = async (plannerId) => {
    try {
      await fetch(`${API_URL}/planner/${USER_ID}/${plannerId}`, {
        method: "DELETE",
      });
      loadSavedPlans();
      if (plan?._id?.toString() === plannerId) {
        setPlan(null);
        setScreen("setup");
      }
    } catch (e) {}
  };

  const completedCount = plan?.days?.filter((d) => d.completed).length || 0;
  const totalDays = plan?.days?.length || 0;
  const progressPct = totalDays
    ? Math.round((completedCount / totalDays) * 100)
    : 0;
  const daysInWeek =
    plan?.days?.slice(currentWeek * 7, currentWeek * 7 + 7) || [];
  const totalWeeks = plan ? Math.ceil(plan.days.length / 7) : 0;
  const today = new Date().toISOString().split("T")[0];
  const daysLeft = plan?.examDate
    ? Math.max(0, Math.ceil((new Date(plan.examDate) - new Date()) / 86400000))
    : 0;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#212121",
        color: "#ececec",
        fontFamily: "'Figtree', sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid #2a2a2a",
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
          📅 Study Planner
        </div>
        <div style={{ fontSize: "0.72rem", color: "#666" }}>{exam}</div>
        <button
          onClick={() => setScreen("list")}
          style={{
            background: "transparent",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: "0.78rem",
          }}
        >
          📋 Saved
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {screen === "setup" && (
          <div
            style={{
              maxWidth: 440,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>📅</div>
              <div
                style={{ fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}
              >
                Create Study Plan
              </div>
              <div style={{ fontSize: "0.82rem", color: "#666", marginTop: 4 }}>
                AI will build a personalized day-by-day schedule
              </div>
            </div>
            <div>
              <label
                style={{
                  fontSize: "0.82rem",
                  color: "#999",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                Exam Date *
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 10,
                  color: "#ececec",
                  fontSize: "0.9rem",
                  outline: "none",
                  fontFamily: "'Figtree', sans-serif",
                  colorScheme: "dark",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "0.82rem",
                  color: "#999",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                Topics to Cover{" "}
                <span style={{ color: "#555" }}>(optional)</span>
              </label>
              <textarea
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="e.g. Indian History, Polity, Geography..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 10,
                  color: "#ececec",
                  fontSize: "0.88rem",
                  outline: "none",
                  fontFamily: "'Figtree', sans-serif",
                  resize: "none",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "0.82rem",
                  color: "#999",
                  marginBottom: 10,
                  display: "block",
                }}
              >
                Daily Study Hours
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[2, 4, 6, 8].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHoursPerDay(h)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 8,
                      background: hoursPerDay === h ? "#10a37f" : "#2a2a2a",
                      border: `1px solid ${
                        hoursPerDay === h ? "#10a37f" : "#3a3a3a"
                      }`,
                      color: hoursPerDay === h ? "#fff" : "#aaa",
                      fontSize: "0.88rem",
                      fontWeight: hoursPerDay === h ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <div
                style={{
                  background: "#e53e3e20",
                  border: "1px solid #e53e3e",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#e53e3e",
                  fontSize: "0.84rem",
                }}
              >
                {error}
              </div>
            )}
            <button
              onClick={generatePlan}
              style={{
                width: "100%",
                padding: 14,
                background: "#10a37f",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontSize: "1rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Generate My Plan
            </button>
          </div>
        )}
        {screen === "loading" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "60vh",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                border: "3px solid #2a2a2a",
                borderTopColor: "#10a37f",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <div
              style={{ color: "#888", fontSize: "0.9rem", textAlign: "center" }}
            >
              AI is building your personalized
              <br />
              study schedule...
            </div>
          </div>
        )}
        {screen === "view" && plan && (
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <div
              style={{
                background: "linear-gradient(135deg,#10a37f20,#0d8a6a10)",
                border: "1px solid #10a37f30",
                borderRadius: 14,
                padding: "16px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "1.05rem",
                  color: "#fff",
                  marginBottom: 8,
                }}
              >
                {plan.title}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ fontSize: "0.78rem", color: "#888" }}>
                  📅 Exam:{" "}
                  <span style={{ color: "#ddd" }}>
                    {new Date(plan.examDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#888" }}>
                  ⏰ Days left:{" "}
                  <span
                    style={{
                      color: daysLeft <= 7 ? "#e53e3e" : "#10a37f",
                      fontWeight: 600,
                    }}
                  >
                    {daysLeft}
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#888" }}>
                  ✅ Progress:{" "}
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                    {completedCount}/{totalDays} days
                  </span>
                </div>
              </div>
              <div
                style={{
                  marginTop: 12,
                  height: 6,
                  background: "#2a2a2a",
                  borderRadius: 3,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 3,
                    background: "linear-gradient(90deg,#10a37f,#0d8a6a)",
                    width: `${progressPct}%`,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.72rem", color: "#666", marginTop: 4 }}>
                {progressPct}% complete
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                ["list", "📋 Day List"],
                ["week", "📆 Weekly View"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 8,
                    background: viewMode === mode ? "#10a37f" : "#2a2a2a",
                    border: `1px solid ${
                      viewMode === mode ? "#10a37f" : "#3a3a3a"
                    }`,
                    color: viewMode === mode ? "#fff" : "#aaa",
                    fontSize: "0.82rem",
                    fontWeight: viewMode === mode ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {viewMode === "list" && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {plan.days.map((day, i) => {
                  const isToday = day.date === today,
                    isPast = day.date < today;
                  return (
                    <div
                      key={i}
                      style={{
                        background: day.completed
                          ? "#10a37f10"
                          : isToday
                          ? "#f59e0b10"
                          : "#2a2a2a",
                        border: `1px solid ${
                          day.completed
                            ? "#10a37f40"
                            : isToday
                            ? "#f59e0b40"
                            : "#3a3a3a"
                        }`,
                        borderRadius: 12,
                        padding: "14px 16px",
                        opacity: isPast && !day.completed ? 0.7 : 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                        }}
                      >
                        <button
                          onClick={() => toggleDay(i)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: `2px solid ${
                              day.completed ? "#10a37f" : "#444"
                            }`,
                            background: day.completed
                              ? "#10a37f"
                              : "transparent",
                            flexShrink: 0,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginTop: 2,
                          }}
                        >
                          {day.completed && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                              strokeLinecap="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                color: "#fff",
                              }}
                            >
                              Day {day.day}
                            </span>
                            <span
                              style={{ fontSize: "0.72rem", color: "#666" }}
                            >
                              {new Date(
                                day.date + "T00:00:00"
                              ).toLocaleDateString("en-IN", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                            {isToday && (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  background: "#f59e0b20",
                                  color: "#f59e0b",
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  fontWeight: 600,
                                }}
                              >
                                TODAY
                              </span>
                            )}
                            {day.completed && (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  background: "#10a37f20",
                                  color: "#10a37f",
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  fontWeight: 600,
                                }}
                              >
                                DONE ✓
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "0.9rem",
                              color: "#fff",
                              marginBottom: 8,
                            }}
                          >
                            {day.focus}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 5,
                              marginBottom: 8,
                            }}
                          >
                            {day.topics?.map((t, ti) => (
                              <span
                                key={ti}
                                style={{
                                  fontSize: "0.72rem",
                                  background: "#333",
                                  color: "#ccc",
                                  padding: "3px 8px",
                                  borderRadius: 4,
                                }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#888" }}>
                            ⏱{" "}
                            <span style={{ color: "#ddd" }}>
                              {day.timeAllocation}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#888" }}>
                            📝{" "}
                            <span style={{ color: "#ddd" }}>
                              {day.practiceQuestions}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#888" }}>
                            💡{" "}
                            <span style={{ color: "#aaa" }}>
                              {day.revisionTip}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => setScreen("setup")}
                style={{
                  width: "100%",
                  padding: 12,
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 10,
                  color: "#ddd",
                  fontSize: "0.88rem",
                  cursor: "pointer",
                }}
              >
                New Plan
              </button>
            </div>
          </div>
        )}
        {screen === "list" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
                📋 Saved Plans
              </div>
              <button
                onClick={() => setScreen("setup")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#10a37f",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                + New Plan
              </button>
            </div>
            {savedPlans.length === 0 ? (
              <div style={{ textAlign: "center", color: "#555", padding: 40 }}>
                No saved plans yet.
              </div>
            ) : (
              savedPlans.map((p) => {
                const completed =
                    p.days?.filter((d) => d.completed).length || 0,
                  total = p.days?.length || 0,
                  pct = total ? Math.round((completed / total) * 100) : 0;
                return (
                  <div
                    key={p._id}
                    onClick={() => {
                      setPlan(p);
                      setScreen("view");
                    }}
                    style={{
                      background: "#2a2a2a",
                      borderRadius: 12,
                      padding: "14px 16px",
                      marginBottom: 10,
                      cursor: "pointer",
                      border: "1px solid #3a3a3a",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.9rem",
                          color: "#fff",
                        }}
                      >
                        {p.title || `${p.exam} Plan`}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePlan(p._id);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#555",
                          cursor: "pointer",
                          padding: 4,
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#666",
                        marginBottom: 8,
                      }}
                    >
                      {p.exam} · Exam:{" "}
                      {new Date(p.examDate + "T00:00:00").toLocaleDateString(
                        "en-IN",
                        { day: "numeric", month: "short", year: "numeric" }
                      )}
                    </div>
                    <div
                      style={{ height: 4, background: "#333", borderRadius: 2 }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 2,
                          background: "#10a37f",
                          width: `${pct}%`,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "#555",
                        marginTop: 4,
                      }}
                    >
                      {completed}/{total} days complete · {pct}%
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── IMAGE COMPONENT ───────────────────────────────────────────────────────────
function ImageComponent({ src, alt, onRegenerate, onZoom }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const imgRef = useRef(null);
  const activeSrc = typeof src === "string" ? src.trim() : "";

  useEffect(() => {
    setLoading(true);
    setError(false);
  }, [src]);

  useEffect(() => {
    const imageElement = imgRef.current;
    if (!imageElement) return;
    // Handle cached/data URLs where onLoad might not fire in time.
    if (imageElement.complete && imageElement.naturalWidth > 0) {
      setLoading(false);
      setError(false);
      return;
    }
    if (!loading || error) return;
    const timer = setTimeout(() => {
      const current = imgRef.current;
      if (current && current.complete && current.naturalWidth > 0) {
        setLoading(false);
        setError(false);
        return;
      }
      setLoading(false);
      setError(true);
    }, 45000);
    return () => clearTimeout(timer);
  }, [loading, error, activeSrc]);

  const handleDownload = async () => {
    try {
      const response = await fetch(activeSrc);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `examai-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      window.open(activeSrc, "_blank");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "ExamAI Image",
          text: alt,
          url: activeSrc,
        });
      } catch (err) {}
    } else {
      try {
        await navigator.clipboard.writeText(activeSrc);
        alert("Image URL copied to clipboard!");
      } catch (e) {
        alert("Failed to copy URL");
      }
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) onRegenerate(alt);
  };

  return (
    <div style={{ margin: "12px 0", width: "100%", maxWidth: 360 }}>
      <div
        style={{
          position: "relative",
          minHeight: error ? 84 : 180,
          background: "#1a1a1a",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #333",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
        }}
      >
        {loading && !error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                border: "3px solid #444",
                borderTopColor: "#10a37f",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          </div>
        )}
        <img
          ref={imgRef}
          src={activeSrc}
          alt={alt}
          onLoad={() => setLoading(false)}
          onClick={() => onZoom?.(activeSrc)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          style={{
            maxWidth: "100%",
            maxHeight: 320,
            display: loading ? "none" : "block",
            borderRadius: 12,
            objectFit: "contain",
            cursor: onZoom ? "zoom-in" : "default",
          }}
        />
        {error && (
          <div
            style={{ color: "#e53e3e", fontSize: "0.85rem", padding: "0 12px" }}
          >
            ⚠️ Failed to load image
          </div>
        )}
      </div>
      {!loading && (
        <div
          style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}
        >
          <button
            onClick={handleDownload}
            title="Download"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#2a2a2a",
              border: "1px solid #3a3a3a",
              borderRadius: 8,
              width: 38,
              height: 38,
              color: "#ececec",
              cursor: "pointer",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            onClick={handleShare}
            title="Share"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#2a2a2a",
              border: "1px solid #3a3a3a",
              borderRadius: 8,
              width: 38,
              height: 38,
              color: "#ececec",
              cursor: "pointer",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
          <button
            onClick={handleRegenerate}
            title="Regenerate"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#2a2a2a",
              border: "1px solid #3a3a3a",
              borderRadius: 8,
              width: 38,
              height: 38,
              color: "#ececec",
              cursor: "pointer",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── CHAT SCREEN ───────────────────────────────────────────────────────────────
function ChatScreen({ exam, onChangeExam, API_URL }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voice, setVoice] = useState("hannah");
  const [showExamMenu, setShowExamMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [toast, setToast] = useState(null);
  const [chatList, setChatList] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [filePrompt, setFilePrompt] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);

  const messagesEndRef = useRef(null),
    textareaRef = useRef(null),
    fileInputRef = useRef(null),
    cameraInputRef = useRef(null),
    pdfInputRef = useRef(null),
    audioRef = useRef(null),
    mediaRecorderRef = useRef(null),
    voiceRef = useRef(voice),
    messagesRef = useRef(messages),
    currentChatIdRef = useRef(currentChatId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);
  useEffect(() => {
    loadChatList();
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadChatList = async () => {
    setLoadingChats(true);
    try {
      const res = await fetch(`${API_URL}/chats/${USER_ID}`);
      setChatList(await res.json());
    } catch (e) {}
    setLoadingChats(false);
  };

  const createNewChat = async (examType = exam) => {
    try {
      const res = await fetch(`${API_URL}/chats/${USER_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam: examType }),
      });
      const data = await res.json();
      setCurrentChatId(data._id || data.chatId);
      setMessages([]);
      setInput("");
      setShowSidebar(false);
      await loadChatList();
      return data._id || data.chatId;
    } catch (e) {
      return null;
    }
  };

  const loadChat = async (chatId) => {
    try {
      const res = await fetch(`${API_URL}/chats/${USER_ID}/${chatId}`);
      const data = await res.json();
      setCurrentChatId(chatId);
      setMessages(data.messages || []);
      setShowSidebar(false);
    } catch (e) {
      showToast("⚠️ Failed to load chat.");
    }
  };

  const deleteChat = async (chatId, e) => {
    e.stopPropagation();
    try {
      await fetch(`${API_URL}/chats/${USER_ID}/${chatId}`, {
        method: "DELETE",
      });
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setMessages([]);
      }
      await loadChatList();
    } catch (e) {}
  };

  const buildHistory = (msgs) =>
    msgs
      .filter((m) => m.content?.trim())
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

  const handleImageEdit = async (src) => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const file = new File([blob], "image_edit.png", { type: blob.type });
      setPendingFile(file);
      if (textareaRef.current) textareaRef.current.focus();
    } catch (e) {
      showToast("⚠️ Failed to load image for editing");
    }
  };

  const sendMessageWithText = async (text, withVoice = false) => {
    if (!text.trim() || loading) return;
    setInput("");
    setLoading(true);
    let activeChatId = currentChatIdRef.current;
    if (!activeChatId) {
      activeChatId = await createNewChat(exam);
      if (!activeChatId) {
        setLoading(false);
        return;
      }
    }
    const previousMessages = messagesRef.current;
    setMessages((p) => [
      ...p,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);

    // ── POLLINATIONS.AI IMAGE GENERATION ──────────────────────────────────────
    const imagePrompt = extractImagePrompt(text);
    if (imagePrompt) {
      const prompt = imagePrompt;
      const imageResult = await resolvePollinationsUrl(prompt, API_URL);
      const imageUrl = imageResult?.url || null;
      setMessages((p) => {
        const updated = [...p];
        updated[updated.length - 1] = imageUrl
          ? {
              ...updated[updated.length - 1],
              content: `🖼️ ${prompt}`,
              imageUrl,
              imagePrompt: prompt,
              imageModelUsed: imageResult?.modelUsed || null,
              imageRouteType: imageResult?.routeType || null,
              imagePromptUsed: imageResult?.promptUsed || null,
              imageAttemptCount: imageResult?.attemptCount || null,
            }
          : {
              ...updated[updated.length - 1],
              content:
                "⚠️ Could not generate image right now. Please try again.",
            };
        return updated;
      });
      setLoading(false);
      return;
    }

    const history = buildHistory([
      ...previousMessages,
      { role: "user", content: text },
    ]);
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          exam,
          history,
          userId: USER_ID,
          chatId: activeChatId,
        }),
      });
      const data = await res.json();
      const answer =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer.trim()
          : "⚠️ No response. Please try again.";
      typeText(answer, setMessages, () => {
        setLoading(false);
        if (withVoice) speakText(answer);
        loadChatList();
      });
    } catch {
      setMessages((p) => [
        ...p.slice(0, -1),
        { role: "assistant", content: "⚠️ Server error. Please try again." },
      ]);
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    await sendMessageWithText(input.trim(), false);
  };

  const handleFileUpload = useCallback(
    (file) => {
      if (!file || loading) return;
      setPendingFile(file);
      setShowAttachMenu(false);
    },
    [loading]
  );

  useEffect(() => {
    const handlePaste = (event) => {
      if (pendingFile || loading) return;
      const items = (event.clipboardData || window.clipboardData)?.items;
      if (!items) return;

      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            handleFileUpload(file);
            event.preventDefault();
            break;
          }
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handleFileUpload, pendingFile, loading]);

  const sendFileWithPrompt = async () => {
    if (!pendingFile || loading) return;
    const file = pendingFile,
      prompt = filePrompt.trim();
    const isPdf = file.type === "application/pdf";
    const imageUrl = isPdf ? null : URL.createObjectURL(file);
    setPendingFile(null);
    setFilePrompt("");
    setLoading(true);
    let activeChatId = currentChatIdRef.current;
    if (!activeChatId) {
      activeChatId = await createNewChat(exam);
      if (!activeChatId) {
        setLoading(false);
        return;
      }
    }
    setMessages((p) => [
      ...p,
      {
        role: "user",
        content: isPdf ? `📄 ${file.name}` : "",
        imageUrl,
        filePrompt: prompt || null,
      },
      { role: "assistant", content: "" },
    ]);
    try {
      if (!isPdf && prompt && isImageEditIntent(prompt)) {
        const editFormData = new FormData();
        editFormData.append("image", file);
        editFormData.append("prompt", prompt);
        editFormData.append("width", "1024");
        editFormData.append("height", "1024");

        const editRes = await fetch(`${API_URL}/image/edit`, {
          method: "POST",
          body: editFormData,
        });
        const editData = await editRes.json().catch(() => null);

        setMessages((p) => {
          const updated = [...p];
          updated[updated.length - 1] =
            editRes.ok &&
            typeof editData?.imageUrl === "string" &&
            editData.imageUrl
              ? {
                  ...updated[updated.length - 1],
                  content: `🖌️ ${prompt}`,
                  imageUrl: editData.imageUrl,
                  imagePrompt: prompt,
                  imageModelUsed: editData?.modelUsed || null,
                  imageRouteType: editData?.routeType || null,
                  imagePromptUsed: editData?.promptUsed || null,
                  imageAttemptCount: editData?.attemptCount || null,
                }
              : {
                  ...updated[updated.length - 1],
                  content:
                    editData?.error ||
                    "⚠️ Could not edit image right now. Please try again.",
                };
          return updated;
        });
        setLoading(false);
        loadChatList();
        return;
      }

      const formData = new FormData();
      formData.append("image", file);
      formData.append("exam", exam);
      formData.append("chatId", activeChatId);
      if (prompt) formData.append("prompt", prompt);
      const res = await fetch(`${API_URL}/image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      const answer =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer.trim()
          : "⚠️ Could not process file.";
      typeText(answer, setMessages, () => {
        setLoading(false);
        loadChatList();
      });
    } catch {
      setMessages((p) => [
        ...p.slice(0, -1),
        { role: "assistant", content: "⚠️ File processing failed." },
      ]);
      setLoading(false);
    }
  };

  const speakText = async (text) => {
    try {
      const chunks = text.match(/.{1,200}(?:\s|$)/g) || [text];
      setIsSpeaking(true);
      for (const chunk of chunks) {
        const res = await fetch(`${API_URL}/speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk, voice: voiceRef.current }),
        });
        if (!res.ok) {
          setIsSpeaking(false);
          return;
        }
        const audio = new Audio(URL.createObjectURL(await res.blob()));
        audioRef.current = audio;
        await new Promise((resolve) => {
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play();
        });
      }
    } catch (e) {
    } finally {
      setIsSpeaking(false);
      audioRef.current = null;
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  };

  const startListening = async () => {
    try {
      try {
        const p = await navigator.permissions.query({ name: "microphone" });
        if (p.state === "denied") {
          showToast("🎤 Mic blocked. Allow it in settings.");
          return;
        }
      } catch (e) {}
      setIsListening(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : null;
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const actualType = mediaRecorder.mimeType || mimeType || "audio/webm";
        const ext = actualType.includes("mp4")
          ? "mp4"
          : actualType.includes("ogg")
          ? "ogg"
          : "webm";
        const formData = new FormData();
        formData.append(
          "audio",
          new Blob(chunks, { type: actualType }),
          `audio.${ext}`
        );
        try {
          const res = await fetch(`${API_URL}/transcribe`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          const transcript = data.text?.trim();
          if (transcript) {
            setInput(transcript);
            setTimeout(() => sendMessageWithText(transcript, true), 300);
          }
        } catch (e) {
          showToast("⚠️ Transcription failed.");
        } finally {
          setIsListening(false);
        }
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch (e) {
      setIsListening(false);
      showToast("🎤 Mic access denied. Allow it in settings.");
    }
  };

  const stopListening = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  };

  // ✅ FIX: Override p tag to prevent <div> nested inside <p> error
  const markdownComponents = useMemo(
    () => ({
      p: ({ children }) => <div style={{ margin: "4px 0" }}>{children}</div>,
      img: ({ src, alt }) => (
        <ImageComponent
          src={src}
          alt={alt}
          onRegenerate={(prompt) =>
            sendMessageWithText(`Generate image of ${prompt}`)
          }
          onZoom={setSelectedImage}
        />
      ),
    }),
    [sendMessageWithText]
  );

  const formatDate = (dateStr) => {
    const date = new Date(dateStr),
      diff = new Date() - date,
      days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "row",
        minWidth: 0,
        overflow: "hidden",
      }}
      onClick={() => {
        setShowExamMenu(false);
        setShowAttachMenu(false);
      }}
    >
      {showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 49,
          }}
        />
      )}

      {/* SIDEBAR */}
      <div
        style={{
          width: showSidebar ? 260 : 0,
          minWidth: showSidebar ? 260 : 0,
          height: "100%",
          background: "#171717",
          borderRight: "1px solid #2a2a2a",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.25s ease,min-width 0.25s ease",
          flexShrink: 0,
          zIndex: 50,
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div
          style={{
            padding: "14px 12px 10px",
            borderBottom: "1px solid #2a2a2a",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "linear-gradient(135deg,#10a37f,#0d8a6a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
              }}
            >
              🎓
            </div>
            <span
              style={{ fontWeight: 600, fontSize: "0.9rem", color: "#fff" }}
            >
              ExamAI
            </span>
          </div>
          <button
            onClick={() => createNewChat()}
            style={{
              width: "100%",
              padding: "9px 14px",
              background: "#10a37f",
              border: "none",
              borderRadius: 9,
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>{" "}
            New Chat
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
          {loadingChats ? (
            <div
              style={{
                textAlign: "center",
                color: "#555",
                fontSize: "0.8rem",
                marginTop: 20,
              }}
            >
              Loading...
            </div>
          ) : chatList.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "#555",
                fontSize: "0.8rem",
                marginTop: 20,
                padding: "0 12px",
              }}
            >
              No chats yet. Start a conversation!
            </div>
          ) : (
            chatList.map((chat) => (
              <div
                key={chat._id}
                onClick={() => loadChat(chat._id)}
                style={{
                  padding: "9px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background:
                    currentChatId === chat._id ? "#2a2a2a" : "transparent",
                  marginBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  position: "relative",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#666"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "#ddd",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {chat.title || "New Chat"}
                  </div>
                  <div
                    style={{ fontSize: "0.7rem", color: "#555", marginTop: 2 }}
                  >
                    {formatDate(chat.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteChat(chat._id, e)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "#666",
                    padding: 3,
                    borderRadius: 4,
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
        <div
          style={{
            padding: "12px",
            borderTop: "1px solid #2a2a2a",
            flexShrink: 0,
          }}
        >
          <a
            href="/delete-account"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "#e53e3e",
              textDecoration: "none",
              fontSize: "0.85rem",
              padding: "8px 10px",
              borderRadius: 8,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Delete Account
          </a>
        </div>
      </div>

      {/* MAIN CHAT */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            background: "#212121",
            borderBottom: "1px solid #2a2a2a",
            flexShrink: 0,
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSidebar(!showSidebar);
              }}
              style={{
                width: 32,
                height: 32,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#888",
                borderRadius: 7,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "linear-gradient(135deg,#10a37f,#0d8a6a)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                }}
              >
                🎓
              </div>
              <span
                style={{ fontWeight: 600, fontSize: "0.95rem", color: "#fff" }}
              >
                ExamAI
              </span>
            </div>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              style={{
                background: "#2a2a2a",
                border: "1px solid #3a3a3a",
                borderRadius: 8,
                padding: "6px 8px",
                color: "#ececec",
                fontSize: "0.78rem",
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowExamMenu(!showExamMenu)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 8,
                  padding: "6px 9px",
                  color: "#ececec",
                  fontSize: "0.78rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  maxWidth: 120,
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {exam}
                </span>
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                  <path
                    d="M1 1L5 5L9 1"
                    stroke="#888"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {showExamMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    background: "#2a2a2a",
                    border: "1px solid #3a3a3a",
                    borderRadius: 10,
                    padding: 4,
                    zIndex: 100,
                    minWidth: 150,
                    maxHeight: 300,
                    overflowY: "auto",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  }}
                >
                  {EXAMS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        onChangeExam(e);
                        setShowExamMenu(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "9px 12px",
                        borderRadius: 7,
                        background: exam === e ? "#10a37f20" : "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: exam === e ? "#10a37f" : "#ddd",
                        fontSize: "0.85rem",
                        fontWeight: exam === e ? 600 : 400,
                      }}
                    >
                      {EXAM_META[e]?.icon} {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MESSAGES */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {isEmpty ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px 16px",
                gap: 20,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: "linear-gradient(135deg,#10a37f,#0d8a6a)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    margin: "0 auto 14px",
                  }}
                >
                  🎓
                </div>
                <div
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 600,
                    color: "#fff",
                    marginBottom: 5,
                  }}
                >
                  What can I help with?
                </div>
                <div style={{ fontSize: "0.82rem", color: "#666" }}>
                  Ask any {exam} question
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  width: "100%",
                  maxWidth: 380,
                }}
              >
                {[
                  "📚 Explain Newton's Laws of Motion",
                  "🇮🇳 What is the Preamble of Indian Constitution?",
                  "🎨 Generate image of a futuristic study room",
                  "🔢 Solve: If 2x + 3 = 11, find x",
                  "📝 Key topics I should study today",
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s.slice(3))}
                    style={{
                      background: "#2a2a2a",
                      border: "1px solid #333",
                      borderRadius: 10,
                      padding: "11px 14px",
                      color: "#ddd",
                      fontSize: "0.85rem",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "'Figtree', sans-serif",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "12px 0 4px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {messages.map((msg, i) => (
                <div key={i} style={{ animation: "fadeIn 0.18s ease" }}>
                  {msg.role === "user" ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        padding: "4px 14px",
                      }}
                    >
                      <div
                        style={{
                          background: "#2f2f2f",
                          borderRadius: "16px 16px 3px 16px",
                          padding: msg.imageUrl ? "6px" : "10px 14px",
                          maxWidth: "82%",
                          wordBreak: "break-word",
                        }}
                      >
                        {msg.imageUrl && (
                          <ImageComponent
                            src={msg.imageUrl}
                            alt="uploaded"
                            onZoom={setSelectedImage}
                            onEdit={handleImageEdit}
                          />
                        )}
                        {msg.filePrompt && (
                          <div
                            style={{
                              marginTop: msg.imageUrl ? 6 : 0,
                              padding: "4px 8px",
                              fontSize: "0.9rem",
                              color: "#ececec",
                              lineHeight: 1.5,
                            }}
                          >
                            {msg.filePrompt}
                          </div>
                        )}
                        {!msg.imageUrl && msg.content && (
                          <div
                            style={{
                              fontSize: "0.9rem",
                              lineHeight: 1.65,
                              color: "#ececec",
                            }}
                          >
                            {msg.content}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "6px 14px",
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          flexShrink: 0,
                          background: "linear-gradient(135deg,#10a37f,#0d8a6a)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          marginTop: 3,
                        }}
                      >
                        🎓
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                        {msg.content === "" && loading ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 5,
                              alignItems: "center",
                              height: 28,
                            }}
                          >
                            {["dot1", "dot2", "dot3"].map((c) => (
                              <div
                                key={c}
                                className={c}
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: "#10a37f",
                                }}
                              />
                            ))}
                          </div>
                        ) : msg.imageUrl ? (
                          <div
                            className="msg-content"
                            style={{
                              fontSize: "0.9rem",
                              lineHeight: 1.75,
                              color: "#ddd",
                              wordBreak: "break-word",
                            }}
                          >
                            <ImageComponent
                              src={msg.imageUrl}
                              alt={
                                msg.imagePrompt ||
                                (typeof msg.content === "string"
                                  ? msg.content.replace(/^🖼️\s*/, "").trim()
                                  : "") ||
                                "generated image"
                              }
                              onRegenerate={(prompt) =>
                                sendMessageWithText(
                                  `Generate image of ${
                                    prompt || msg.imagePrompt || "a new scene"
                                  }`
                                )
                              }
                              onZoom={setSelectedImage}
                              onEdit={handleImageEdit}
                            />
                          </div>
                        ) : (
                          <div
                            className="msg-content"
                            style={{
                              fontSize: "0.9rem",
                              lineHeight: 1.75,
                              color: "#ddd",
                              wordBreak: "break-word",
                            }}
                          >
                            <ReactMarkdown
                              components={markdownComponents}
                              urlTransform={markdownUrlTransform}
                            >
                              {msg.content}
                            </ReactMarkdown>
                            {loading &&
                              i === messages.length - 1 &&
                              msg.content !== "" && (
                                <span
                                  style={{
                                    animation: "blink 0.9s step-end infinite",
                                    color: "#10a37f",
                                  }}
                                >
                                  ▍
                                </span>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} style={{ height: 4 }} />
            </div>
          )}
        </div>

        {/* INPUT AREA */}
        <div
          style={{
            flexShrink: 0,
            padding: "8px 12px 10px",
            background: "#212121",
            borderTop: isEmpty ? "none" : "1px solid #2a2a2a",
          }}
        >
          {pendingFile && (
            <div
              style={{
                background: "#2a2a2a",
                border: "1px solid #10a37f40",
                borderRadius: 12,
                padding: "10px 12px",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>
                    {pendingFile.type === "application/pdf" ? "📄" : "📷"}
                  </span>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#aaa",
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pendingFile.name}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setPendingFile(null);
                    setFilePrompt("");
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#666",
                    cursor: "pointer",
                    fontSize: 18,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
              <textarea
                value={filePrompt}
                onChange={(e) => setFilePrompt(e.target.value)}
                placeholder="Ask something about this file... (optional)"
                rows={2}
                style={{
                  width: "100%",
                  background: "#1e1e1e",
                  border: "1px solid #3a3a3a",
                  borderRadius: 8,
                  padding: "8px 10px",
                  color: "#ececec",
                  fontSize: "0.88rem",
                  outline: "none",
                  resize: "none",
                  fontFamily: "'Figtree', sans-serif",
                  marginBottom: 8,
                }}
              />
              <button
                onClick={sendFileWithPrompt}
                style={{
                  width: "100%",
                  padding: "9px",
                  background: "#10a37f",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Send →
              </button>
            </div>
          )}
          {isListening && (
            <div
              style={{
                textAlign: "center",
                marginBottom: 6,
                fontSize: "0.75rem",
                color: "#10a37f",
              }}
            >
              🎤 Recording... release to send
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              background: "#2a2a2a",
              border: `1px solid ${isListening ? "#10a37f" : "#3a3a3a"}`,
              borderRadius: 14,
              padding: "6px 6px 6px 12px",
              transition: "border-color 0.2s",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAttachMenu(true);
              }}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#666",
                flexShrink: 0,
                marginBottom: 1,
                background: "transparent",
                border: "none",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                handleFileUpload(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                handleFileUpload(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => {
                handleFileUpload(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={(e) => {
                e.preventDefault();
                startListening();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopListening();
              }}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: isListening ? "#10a37f" : "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginBottom: 1,
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={isListening ? "#fff" : "#666"}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
            {isSpeaking && (
              <button
                onClick={stopSpeaking}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: "#e53e3e",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginBottom: 1,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "Listening..." : "Message ExamAI..."}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#ececec",
                lineHeight: 1.6,
                maxHeight: 160,
                minHeight: 26,
                paddingTop: 7,
                paddingBottom: 5,
                WebkitAppearance: "none",
                caretColor: "#10a37f",
                fontFamily: "'Figtree', sans-serif",
                fontSize: 16,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: loading || !input.trim() ? "#3a3a3a" : "#10a37f",
                border: "none",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.15s",
                marginBottom: 1,
              }}
            >
              {loading ? (
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,0.2)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
              ) : (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
          <div
            style={{
              textAlign: "center",
              marginTop: 6,
              fontSize: "0.65rem",
              color: "#444",
            }}
          >
            Hold mic to speak • ExamAI can make mistakes.
          </div>
        </div>
      </div>

      {/* ATTACH SHEET */}
      {showAttachMenu && (
        <>
          <style>{`
            @keyframes attachBackdropIn{from{opacity:0}to{opacity:1}}
            @keyframes attachSheetIn{from{transform:translateY(100%) scale(0.97);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
            @keyframes attachCardIn{from{opacity:0;transform:translateY(14px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}
            .attach-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:16px 14px 14px;border-radius:18px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.04);cursor:pointer;transition:transform 0.22s cubic-bezier(0.34,1.56,0.64,1),background 0.18s ease;-webkit-tap-highlight-color:transparent;overflow:hidden;backdrop-filter:blur(12px);}
            .attach-card:active{transform:scale(0.93)!important;}
            .attach-card:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.14);box-shadow:0 8px 32px rgba(0,0,0,0.35);transform:translateY(-2px);}
            .attach-icon-wrap{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
          `}</style>
          <div
            onClick={() => setShowAttachMenu(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              animation: "attachBackdropIn 0.25s ease both",
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 201,
              background: "linear-gradient(180deg,#1c1c1e 0%,#141416 100%)",
              borderRadius: "26px 26px 0 0",
              padding: "0 0 calc(28px + env(safe-area-inset-bottom))",
              animation: "attachSheetIn 0.35s cubic-bezier(0.32,0.72,0,1) both",
              boxShadow:
                "0 -1px 0 rgba(255,255,255,0.07),0 -24px 60px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ padding: "12px 20px 18px" }}>
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.15)",
                  margin: "0 auto 20px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      color: "#fff",
                      letterSpacing: -0.3,
                    }}
                  >
                    Add Attachment
                  </div>
                  <div
                    style={{ fontSize: "0.72rem", color: "#555", marginTop: 2 }}
                  >
                    Photo, gallery image, or PDF document
                  </div>
                </div>
                <button
                  onClick={() => setShowAttachMenu(false)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.08)",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#888",
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
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                padding: "0 14px",
              }}
            >
              {[
                {
                  label: "Camera",
                  desc: "Take a photo",
                  bg: "linear-gradient(135deg,#ff6b35,#ff3a6e)",
                  ref: cameraInputRef,
                  icon: (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  ),
                },
                {
                  label: "Gallery",
                  desc: "Pick image",
                  bg: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                  ref: fileInputRef,
                  icon: (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  ),
                },
                {
                  label: "PDF",
                  desc: "Upload doc",
                  bg: "linear-gradient(135deg,#059669,#10b981)",
                  ref: pdfInputRef,
                  icon: (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  ),
                },
              ].map(({ label, desc, bg, ref, icon }, idx) => (
                <button
                  key={label}
                  className="attach-card"
                  onClick={() => {
                    ref.current.click();
                    setShowAttachMenu(false);
                  }}
                  style={{
                    animation: `attachCardIn 0.38s cubic-bezier(0.34,1.56,0.64,1) ${
                      0.05 + idx * 0.06
                    }s both`,
                  }}
                >
                  <div className="attach-icon-wrap" style={{ background: bg }}>
                    {icon}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        color: "#fff",
                        lineHeight: 1.2,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        color: "#555",
                        marginTop: 3,
                        lineHeight: 1.3,
                      }}
                    >
                      {desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div
              style={{
                margin: "16px 14px 0",
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(16,163,127,0.07)",
                border: "1px solid rgba(16,163,127,0.14)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: "rgba(16,163,127,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#10a37f"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div
                style={{ fontSize: "0.7rem", color: "#555", lineHeight: 1.5 }}
              >
                After selecting, you can{" "}
                <span style={{ color: "#10a37f" }}>add a question</span> before
                sending
              </div>
            </div>
          </div>
        </>
      )}

      {/* IMAGE ZOOM */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 0.3s cubic-bezier(0.16,1,0.3,1)",
            cursor: "zoom-out",
          }}
        >
          <img
            src={selectedImage}
            alt="Full screen"
            style={{
              maxWidth: "95%",
              maxHeight: "95%",
              borderRadius: 8,
              boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
              objectFit: "contain",
              cursor: "default",
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setSelectedImage(null)}
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
              fontSize: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#e53e3e",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: "0.82rem",
            fontWeight: 500,
            zIndex: 999,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ── CHART RENDERER ────────────────────────────────────────────────────────────
function ChartRenderer({ chartData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !chartData || chartData.type === "text") return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    const COLORS = [
      "#10a37f",
      "#3b82f6",
      "#f59e0b",
      "#ec4899",
      "#8b5cf6",
      "#06b6d4",
      "#f97316",
      "#84cc16",
    ];
    const datasets = chartData.data.datasets.map((ds, i) => {
      const color = ds.color || COLORS[i % COLORS.length];
      const isPie = ["pie", "doughnut"].includes(chartData.chartType);
      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: isPie
          ? chartData.data.labels.map(
              (_, j) => COLORS[j % COLORS.length] + "cc"
            )
          : color + "33",
        borderColor: isPie
          ? chartData.data.labels.map((_, j) => COLORS[j % COLORS.length])
          : color,
        borderWidth: 2,
        borderRadius: chartData.chartType === "bar" ? 6 : 0,
        fill: chartData.chartType === "line",
        tension: 0.4,
        pointBackgroundColor: color,
        pointRadius: chartData.chartType === "line" ? 4 : 0,
        pointHoverRadius: 6,
      };
    });
    const ctx = canvasRef.current.getContext("2d");
    chartRef.current = new window.Chart(ctx, {
      type: chartData.chartType,
      data: { labels: chartData.data.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeInOutQuart" },
        plugins: {
          legend: {
            display:
              datasets.length > 1 ||
              ["pie", "doughnut"].includes(chartData.chartType),
            labels: {
              color: "#ccc",
              font: { family: "'Figtree', sans-serif", size: 11 },
              padding: 14,
              usePointStyle: true,
            },
          },
          tooltip: {
            backgroundColor: "#1e1e1e",
            titleColor: "#fff",
            bodyColor: "#ccc",
            borderColor: "#3a3a3a",
            borderWidth: 1,
            padding: 10,
          },
        },
        scales: ["pie", "doughnut"].includes(chartData.chartType)
          ? {}
          : {
              x: {
                ticks: {
                  color: "#888",
                  font: { family: "'Figtree', sans-serif", size: 10 },
                  maxRotation: 45,
                },
                grid: { color: "#2a2a2a" },
              },
              y: {
                ticks: {
                  color: "#888",
                  font: { family: "'Figtree', sans-serif", size: 10 },
                },
                grid: { color: "#2a2a2a" },
              },
            },
      },
    });
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartData]);

  if (!chartData || chartData.type === "text") return null;

  return (
    <div
      style={{
        background: "#2a2a2a",
        borderRadius: 16,
        padding: "16px",
        marginBottom: 16,
        border: "1px solid #3a3a3a",
      }}
    >
      <div
        style={{
          fontSize: "0.92rem",
          fontWeight: 700,
          color: "#fff",
          marginBottom: 4,
        }}
      >
        {chartData.title}
      </div>
      <div style={{ height: 280, position: "relative", marginBottom: 12 }}>
        <canvas ref={canvasRef} />
      </div>
      {chartData.description && (
        <div
          style={{
            fontSize: "0.8rem",
            color: "#999",
            lineHeight: 1.6,
            marginBottom: 8,
            padding: "10px 12px",
            background: "#10a37f10",
            borderRadius: 8,
            border: "1px solid #10a37f20",
          }}
        >
          💡 {chartData.description}
        </div>
      )}
      {chartData.source && (
        <div style={{ fontSize: "0.7rem", color: "#555", textAlign: "right" }}>
          Source: {chartData.source}
        </div>
      )}
    </div>
  );
}

// ── CHART SCREEN ──────────────────────────────────────────────────────────────
function ChartScreen({ exam, API_URL, userId = USER_ID }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  const SUGGESTIONS = {
    UPSC: [
      "India GDP growth rate 2015 to 2023",
      "Union Budget 2024 sector allocation",
      "Literacy rate of top 5 Indian states",
      "India's exports by category 2023",
      "BRICS countries GDP comparison",
    ],
    JEE: [
      "Velocity time graph for uniform acceleration",
      "Boyle's law pressure volume relationship",
      "Projectile motion trajectory",
      "Radioactive decay curve",
      "Carnot cycle efficiency vs temperature",
    ],
    NEET: [
      "Human population growth curve",
      "Enzyme activity vs pH graph",
      "Logistic vs exponential growth",
      "Absorption spectrum of chlorophyll",
      "Blood pressure in different vessels",
    ],
    "Current Affairs": [
      "India inflation rate 2022 to 2024",
      "Top 5 countries by renewable energy",
      "India FDI inflows 2020 to 2024",
      "Global temperature rise 1990 to 2024",
      "Digital India internet users growth",
    ],
    General: [
      "India GDP growth last 10 years",
      "Population of G7 countries",
      "Global CO2 emissions by country",
      "India's state wise population 2011",
      "Top 5 economies by GDP 2024",
    ],
  };
  const suggestions = SUGGESTIONS[exam] || SUGGESTIONS["General"];

  const generate = async (q) => {
    const question = q || query;
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    setChartData(null);
    setTextAnswer("");
    try {
      const res = await fetch(`${API_URL}/chart/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, exam, userId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.type === "text") {
        setTextAnswer(data.answer);
      } else {
        setChartData(data);
        setHistory((prev) => [
          { query: question, chartData: data },
          ...prev.slice(0, 4),
        ]);
      }
    } catch (err) {
      setError("Failed to generate chart. Try a different question.");
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#212121",
        color: "#ececec",
        fontFamily: "'Figtree', sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid #2a2a2a",
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
          📊 Charts & Graphs
        </div>
        <div style={{ fontSize: "0.72rem", color: "#666" }}>{exam}</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="e.g. India GDP growth 2015 to 2023..."
            style={{
              flex: 1,
              padding: "11px 14px",
              background: "#2a2a2a",
              border: "1px solid #3a3a3a",
              borderRadius: 10,
              color: "#ececec",
              fontSize: "0.9rem",
              outline: "none",
              fontFamily: "'Figtree', sans-serif",
            }}
          />
          <button
            onClick={() => generate()}
            disabled={loading || !query.trim()}
            style={{
              padding: "11px 16px",
              background: loading || !query.trim() ? "#2a2a2a" : "#10a37f",
              border: "none",
              borderRadius: 10,
              color: loading || !query.trim() ? "#555" : "#fff",
              fontWeight: 600,
              cursor: loading || !query.trim() ? "not-allowed" : "pointer",
              fontSize: "0.9rem",
              flexShrink: 0,
            }}
          >
            {loading ? "..." : "Go"}
          </button>
        </div>
        {!chartData && !textAnswer && !loading && (
          <>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#555",
                marginBottom: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Try these for {exam}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(s);
                    generate(s);
                  }}
                  style={{
                    padding: "11px 14px",
                    background: "#2a2a2a",
                    border: "1px solid #333",
                    borderRadius: 10,
                    color: "#ddd",
                    fontSize: "0.85rem",
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "'Figtree', sans-serif",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "#10a37f" }}>📈</span> {s}
                </button>
              ))}
            </div>
          </>
        )}
        {loading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: 200,
              gap: 14,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                border: "3px solid #2a2a2a",
                borderTopColor: "#10a37f",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <div style={{ color: "#666", fontSize: "0.85rem" }}>
              Generating chart...
            </div>
          </div>
        )}
        {error && (
          <div
            style={{
              background: "#e53e3e15",
              border: "1px solid #e53e3e40",
              borderRadius: 10,
              padding: "12px 14px",
              color: "#e53e3e",
              fontSize: "0.85rem",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}
        {chartData && !loading && (
          <>
            <ChartRenderer chartData={chartData} />
            <button
              onClick={() => {
                setChartData(null);
                setQuery("");
              }}
              style={{
                width: "100%",
                padding: 12,
                background: "#2a2a2a",
                border: "1px solid #3a3a3a",
                borderRadius: 10,
                color: "#ddd",
                fontSize: "0.88rem",
                cursor: "pointer",
                marginBottom: 20,
              }}
            >
              New Chart
            </button>
          </>
        )}
        {textAnswer && !loading && (
          <div
            style={{
              background: "#2a2a2a",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                color: "#10a37f",
                fontWeight: 700,
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              💬 Text Answer
            </div>
            <div
              style={{ fontSize: "0.88rem", color: "#ddd", lineHeight: 1.7 }}
            >
              {textAnswer}
            </div>
            <button
              onClick={() => {
                setTextAnswer("");
                setQuery("");
              }}
              style={{
                marginTop: 12,
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid #3a3a3a",
                borderRadius: 8,
                color: "#888",
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              Try another
            </button>
          </div>
        )}
        {history.length > 0 && !chartData && !textAnswer && !loading && (
          <>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#555",
                marginBottom: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Recent
            </div>
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => {
                  setChartData(h.chartData);
                  setQuery(h.query);
                }}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "#2a2a2a",
                  border: "1px solid #333",
                  borderRadius: 10,
                  color: "#ddd",
                  fontSize: "0.85rem",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "'Figtree', sans-serif",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>📊</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h.query}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  if (window.location.pathname === "/delete-account") {
    return <DeleteAccount />;
  }

  const [appState, setAppState] = useState("splash");
  const [exam, setExam] = useState(localStorage.getItem("examai_exam") || "");
  const [activeTab, setActiveTab] = useState("chat");
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseAuth);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5050";

  const GLOBAL_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
    html,body{overflow:hidden;overscroll-behavior:none;background:#212121;height:100%;}
    textarea,input{font-family:'Figtree',system-ui,sans-serif!important;}
    textarea{font-size:16px!important;}
    .msg-content p{margin-bottom:10px;line-height:1.75;}.msg-content p:last-child{margin-bottom:0;}
    .msg-content ul,.msg-content ol{padding-left:20px;margin:8px 0;}.msg-content li{margin-bottom:6px;line-height:1.7;}
    .msg-content strong{font-weight:600;color:#fff;}.msg-content em{color:#ccc;}
    .msg-content code{background:#343434;padding:2px 6px;border-radius:4px;font-size:0.84em;color:#e0e0e0;}
    .msg-content pre{background:#1a1a1a;padding:14px;border-radius:8px;overflow-x:auto;margin:10px 0;border:1px solid #333;}
    .msg-content h1,.msg-content h2,.msg-content h3{margin:14px 0 6px;color:#fff;font-weight:600;}
    .msg-content blockquote{border-left:3px solid #10a37f;padding-left:12px;color:#aaa;margin:8px 0;}
    .msg-content table{width:100%;border-collapse:collapse;margin:10px 0;font-size:0.85rem;}
    .msg-content img{max-width:100%;border-radius:12px;margin:10px 0;box-shadow:0 4px 20px rgba(0,0,0,0.3);}
    .msg-content th{background:#2a2a2a;color:#fff;padding:8px 12px;text-align:left;border:1px solid #3a3a3a;}
    .msg-content td{padding:7px 12px;border:1px solid #2a2a2a;color:#ddd;}
    .msg-content tr:nth-child(even) td{background:#1e1e1e;}
    ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#3a3a3a;border-radius:4px;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes dotPulse{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
    .dot1{animation:dotPulse 1s ease-in-out infinite;}.dot2{animation:dotPulse 1s ease-in-out 0.15s infinite;}.dot3{animation:dotPulse 1s ease-in-out 0.3s infinite;}
    select option{background:#2a2a2a;color:#ececec;}
  `;

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
    setSignOutError("");
    setSigningOut(true);
    try {
      await signOut(firebaseAuth);
    } catch (err) {
      setSignOutError("Failed to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    if (!firebaseAuth) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (user) setSignOutError("");
    });

    return () => unsubscribe();
  }, []);

  if (appState === "splash")
    return (
      <>
        <style>{GLOBAL_STYLES}</style>
        <SplashScreen
          onDone={() => {
            const savedExam = localStorage.getItem("examai_exam");
            if (savedExam) {
              setExam(savedExam);
              setAppState("main");
            } else setAppState("exam-select");
          }}
        />
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
        background: "#212121",
        color: "#ececec",
        fontFamily: "'Figtree', system-ui, sans-serif",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <style>{GLOBAL_STYLES}</style>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "6px 12px 0",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setAppState("exam-select")}
            style={{
              background: "transparent",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              padding: "4px 10px",
              color: "#555",
              fontSize: "0.72rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "'Figtree', sans-serif",
            }}
          >
            {EXAM_META[exam]?.icon} {exam}
            <svg width="8" height="5" viewBox="0 0 10 6" fill="none">
              <path
                d="M1 1L5 5L9 1"
                stroke="#555"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {authUser && (
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              style={{
                background: signingOut ? "#1f1616" : "transparent",
                border: "1px solid #4b2626",
                borderRadius: 8,
                padding: "4px 10px",
                color: signingOut ? "#b46d6d" : "#a26464",
                fontSize: "0.72rem",
                cursor: signingOut ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "'Figtree', sans-serif",
                opacity: signingOut ? 0.7 : 1,
              }}
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          )}
        </div>
      </div>
      {signOutError && (
        <div
          style={{
            padding: "4px 12px 0",
            color: "#e89a9a",
            fontSize: "0.72rem",
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {signOutError}
        </div>
      )}
      <SwipeView
        activeTab={activeTab}
        tabs={{
          chat: (
            <ChatScreen
              exam={exam}
              onChangeExam={handleChangeExam}
              API_URL={API_URL}
            />
          ),
          quiz: authUser ? (
            <QuizScreen exam={exam} API_URL={API_URL} userId={authUser.uid} />
          ) : (
            <AuthGateScreen tabId="quiz" authReady={authReady} />
          ),
          planner: <PlannerScreen exam={exam} API_URL={API_URL} />,
          chart: authUser ? (
            <ChartScreen exam={exam} API_URL={API_URL} userId={authUser.uid} />
          ) : (
            <AuthGateScreen tabId="chart" authReady={authReady} />
          ),
        }}
      />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
