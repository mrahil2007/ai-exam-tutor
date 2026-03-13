// ── THEME ─────────────────────────────────────────────────────────────────────
export const G = {
  bg: "#080910",
  bg2: "#0d0f1a",
  surface: "#12141f",
  surf2: "#1a1c2a",
  gold: "#4d8c7a", // was #f0a500 (gold) → viridian green
  goldL: "#6abda3", // was #fbbf24 (amber) → light viridian
  saffron: "#0d9488", // was #ff6b2b (orange) → deep teal for green→teal gradients
  teal: "#14b8a6",
  text: "#f0ede8",
  muted: "#6b7280",
  border: "rgba(77,140,122,0.18)", // was rgba(240,165,0,0.14)
  border2: "rgba(255,255,255,0.06)",
  glow: "rgba(77,140,122,0.28)", // was rgba(240,165,0,0.22)
  error: "#e53e3e",
};

export const PLAY_STORE =
  "https://play.google.com/store/apps/details?id=jeanix.in";

export const EXAMS = [
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

export const STATE_PCS_LIST = [
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

export const TOPIC_PH = {
  General: "e.g. Photosynthesis, Indian History...",
  UPSC: "e.g. Indian Polity, Medieval History...",
  CSAT: "e.g. Logical Reasoning, Data Interpretation...",
  "Current Affairs": "e.g. India-China Relations, Union Budget 2025...",
  "State PCS": "e.g. History, Geography, Economy...",
  "CBSE 10th": "e.g. Triangles, Chemical Reactions...",
  "CBSE 12th": "e.g. Integration, Electrochemistry...",
  JEE: "e.g. Kinematics, Organic Chemistry...",
  NEET: "e.g. Cell Biology, Human Physiology...",
  SSC: "e.g. Reasoning, Profit & Loss...",
  Banking: "e.g. Seating Arrangement, Data Interpretation...",
  GATE: "e.g. Data Structures, Control Systems...",
  CAT: "e.g. Reading Comprehension, Percentages...",
};

export const VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];

export const EXAM_META = {
  General: { icon: "💬", color: "#4d8c7a", desc: "All subjects" }, // was #f0a500
  UPSC: { icon: "🏛️", color: "#f59e0b", desc: "Civil Services" },
  CSAT: { icon: "🧮", color: "#a78bfa", desc: "GS Paper II" },
  "Current Affairs": { icon: "📰", color: "#38bdf8", desc: "Latest events" },
  "State PCS": { icon: "🗺️", color: "#ff6b2b", desc: "State exams" },
  "CBSE 10th": { icon: "📗", color: "#34d399", desc: "Class 10 Board" },
  "CBSE 12th": { icon: "📘", color: "#60a5fa", desc: "Class 12 Board" },
  JEE: { icon: "⚡", color: "#3b82f6", desc: "Engineering" },
  NEET: { icon: "🧬", color: "#ec4899", desc: "Medical" },
  SSC: { icon: "📋", color: "#8b5cf6", desc: "Staff Selection" },
  Banking: { icon: "🏦", color: "#06b6d4", desc: "Bank exams" },
  GATE: { icon: "🔬", color: "#ff6b2b", desc: "Tech & Science" },
  CAT: { icon: "📊", color: "#e53e3e", desc: "Management" },
};

export const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800&family=Playfair+Display:wght@700;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  html,body{overflow:hidden;overscroll-behavior:none;background:#080910;height:100%;}
  textarea,input{font-family:'Figtree',system-ui,sans-serif!important;}
  textarea{font-size:16px!important;}
  .msg-content p{margin-bottom:10px;line-height:1.75;}.msg-content p:last-child{margin-bottom:0;}
  .msg-content ul,.msg-content ol{padding-left:20px;margin:8px 0;}.msg-content li{margin-bottom:6px;line-height:1.7;}
  .msg-content strong{font-weight:600;color:#4d8c7a;}.msg-content em{color:#ccc;}
  .msg-content code{background:#1e1e2e;padding:2px 6px;border-radius:4px;font-size:0.84em;color:#6abda3;}
  .msg-content pre{background:#0d0f1a;padding:14px;border-radius:8px;overflow-x:auto;margin:10px 0;border:1px solid rgba(77,140,122,0.18);}
  .msg-content h1,.msg-content h2,.msg-content h3{margin:14px 0 6px;color:#4d8c7a;font-weight:700;}
  .msg-content blockquote{border-left:3px solid #4d8c7a;padding-left:12px;color:#aaa;margin:8px 0;}
  .msg-content table{width:100%;border-collapse:collapse;margin:10px 0;font-size:0.85rem;}
  .msg-content th{background:#12141f;color:#6abda3;padding:8px 12px;text-align:left;border:1px solid rgba(77,140,122,0.18);}
  .msg-content td{padding:7px 12px;border:1px solid rgba(255,255,255,0.06);color:#ddd;}
  .msg-content tr:nth-child(even) td{background:#0d0f1a;}
  ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#4d8c7a55;border-radius:4px;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes dotPulse{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
  @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
  .dot1{animation:dotPulse 1s ease-in-out infinite;}
  .dot2{animation:dotPulse 1s ease-in-out 0.15s infinite;}
  .dot3{animation:dotPulse 1s ease-in-out 0.3s infinite;}
  select option{background:#12141f;color:#f0ede8;}
`;
