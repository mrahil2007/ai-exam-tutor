import { useState, useRef, useEffect } from "react";
import { G } from "../theme";

// ── Constants ──────────────────────────────────────────────────────────────────
const RESUME_TEMPLATES = [
  { id: "IT / Software", icon: "💻", desc: "Developer, Engineer, Analyst" },
  { id: "Government Job", icon: "🏛️", desc: "UPSC, SSC, PSU, Bank PO" },
  { id: "Banking / Finance", icon: "🏦", desc: "CA, Finance, Accounts" },
  { id: "Teaching / Education", icon: "📚", desc: "Teacher, Professor, Tutor" },
  { id: "Defence / NDA", icon: "🎖️", desc: "Army, Navy, Air Force, NDA" },
  { id: "General / Fresher", icon: "🌟", desc: "Any field, Entry level" },
];

const CAREER_GAP_REASONS = [
  "Higher Education / Studying",
  "Family / Personal Responsibilities",
  "Health / Medical Reasons",
  "Travel / Sabbatical",
  "Freelance / Self-employment",
  "Job Search / Career Transition",
  "Startup / Business Venture",
  "Volunteer / Social Work",
  "Other",
];

const STEPS = [
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "template", label: "Template", icon: "🎨" },
  { id: "experience", label: "Experience", icon: "💼" },
  { id: "education", label: "Education", icon: "🎓" },
  { id: "skills", label: "Skills", icon: "⚡" },
  { id: "review", label: "Review", icon: "✅" },
];

const EMPTY_FORM = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  targetRole: "",
  targetTemplate: "General / Fresher",
  summary: "",
  linkedin: "",
  github: "",
  experienceType: "",
  experience: [
    { company: "", role: "", duration: "", points: "", current: false },
  ],
  careerGaps: [],
  education: [{ institution: "", degree: "", year: "", score: "" }],
  skills: "",
  certifications: "",
  languages: "",
  achievements: "",
};

// ── Shared styles ──────────────────────────────────────────────────────────────
const inp = (extra = {}) => ({
  width: "100%",
  padding: "11px 13px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 10,
  color: "#f0ede8",
  fontSize: "0.86rem",
  outline: "none",
  fontFamily: "'Figtree',sans-serif",
  ...extra,
});

const lbl = {
  fontSize: "0.71rem",
  color: "#6b7280",
  fontWeight: 700,
  marginBottom: 6,
  display: "block",
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const cardStyle = {
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 14,
  padding: "16px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {label && <span style={lbl}>{label}</span>}
      {children}
    </div>
  );
}

// ── Step progress bar ─────────────────────────────────────────────────────────
function StepBar({ current }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div
      style={{ display: "flex", alignItems: "center", padding: "12px 16px 0" }}
    >
      {STEPS.map((s, i) => (
        <div
          key={s.id}
          style={{
            display: "flex",
            alignItems: "center",
            flex: i < STEPS.length - 1 ? 1 : 0,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: i < idx ? "0.65rem" : "0.72rem",
              background:
                i < idx
                  ? `linear-gradient(135deg,${G.gold},${G.saffron})`
                  : i === idx
                  ? "rgba(240,165,0,0.12)"
                  : "rgba(255,255,255,0.04)",
              border:
                i === idx
                  ? `2px solid ${G.gold}`
                  : i < idx
                  ? "none"
                  : "1px solid rgba(255,255,255,0.08)",
              color: i <= idx ? G.gold : "#4b5563",
              fontWeight: 700,
            }}
          >
            {i < idx ? "✓" : s.icon}
          </div>
          {i < STEPS.length - 1 && (
            <div
              style={{
                flex: 1,
                height: 2,
                margin: "0 2px",
                borderRadius: 2,
                background:
                  i < idx
                    ? `linear-gradient(90deg,${G.gold},${G.saffron})`
                    : "rgba(255,255,255,0.06)",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Nav buttons ───────────────────────────────────────────────────────────────
function NavButtons({ onBack, onNext, label = "Next →", disabled, loading }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
        background: "rgba(8,8,8,0.85)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          style={{
            flex: "0 0 auto",
            padding: "13px 18px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 12,
            color: G.muted,
            fontSize: "0.85rem",
            cursor: "pointer",
            fontFamily: "'Figtree',sans-serif",
            fontWeight: 600,
          }}
        >
          ← Back
        </button>
      )}
      <button
        onClick={onNext}
        disabled={disabled || loading}
        style={{
          flex: 1,
          padding: "13px",
          background:
            disabled || loading
              ? "rgba(240,165,0,0.2)"
              : `linear-gradient(135deg,${G.gold},${G.saffron})`,
          border: "none",
          borderRadius: 12,
          color: disabled || loading ? "rgba(0,0,0,0.35)" : "#000",
          fontSize: "0.9rem",
          fontWeight: 700,
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "'Figtree',sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {loading ? (
          <>
            <div
              style={{
                width: 15,
                height: 15,
                border: "2px solid rgba(0,0,0,0.2)",
                borderTopColor: "#000",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />{" "}
            Building...
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}

// ── Section header for preview ────────────────────────────────────────────────
const SH = () => ({
  fontSize: "9.5pt",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#8b6914",
  borderBottom: "1.5px solid #c9a227",
  paddingBottom: 3,
  margin: "13px 0 7px",
});

const getSkillsList = (s) => {
  if (!s) return [];
  if (typeof s === "string")
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  if (Array.isArray(s)) return s.filter(Boolean);
  return [
    ...(s.technical || []),
    ...(s.soft || []),
    ...(s.tools || []),
    ...(s.languages || []),
  ].filter(Boolean);
};
const getCertLines = (c) => {
  if (!c) return [];
  if (typeof c === "string") return c.split("\n").filter(Boolean);
  if (Array.isArray(c))
    return c
      .map((x) =>
        typeof x === "string"
          ? x
          : `${x.name || ""}${x.issuer ? " — " + x.issuer : ""}${
              x.year ? " (" + x.year + ")" : ""
            }`
      )
      .filter(Boolean);
  return [];
};

// ── Resume Preview ────────────────────────────────────────────────────────────
function ResumePreview({ resume }) {
  const ref = useRef(null);
  const download = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${
      resume?.name || "Resume"
    }</title><style>
      *{box-sizing:border-box;margin:0;padding:0}body{font-family:'Georgia',serif;font-size:10.5pt;color:#1a1a1a;padding:32px 40px;max-width:780px;margin:0 auto}
      h1{font-size:19pt;font-weight:700;letter-spacing:-0.5px;margin-bottom:3px}.role-title{font-size:10pt;color:#8b6914;font-weight:600;margin-bottom:7px}
      .contact{font-size:9pt;color:#555;margin-bottom:12px;display:flex;gap:14px;flex-wrap:wrap;border-bottom:1px solid #e8e0d0;padding-bottom:9px}
      .sec{font-size:8.5pt;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#8b6914;border-bottom:1.5px solid #c9a227;padding-bottom:3px;margin:13px 0 7px}
      .title{font-weight:700;font-size:10pt}.sub{color:#555;font-size:9pt}.date{color:#888;font-size:8.5pt;white-space:nowrap;margin-left:8px}
      .row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}ul{padding-left:16px;margin-top:4px}
      li{font-size:9.5pt;margin-bottom:3px;line-height:1.55}.tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
      .tag{background:#f7f2e8;border:1px solid #ddd0b0;padding:2px 9px;border-radius:3px;font-size:8.5pt;color:#333}
      p{font-size:9.5pt;line-height:1.7;margin-top:3px;color:#333}
      .gap-box{background:#fffbf0;border:1px solid #f0d878;border-radius:4px;padding:5px 10px;margin-bottom:6px;font-size:9pt;color:#7a5c00}
      @media print{body{padding:18px 26px}}
    </style></head><body>${ref.current?.innerHTML || ""}</body></html>`);
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 400);
  };
  if (!resume) return null;
  const skills = getSkillsList(resume.skills);
  const certs = getCertLines(resume.certifications);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        height: "100%",
      }}
    >
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={download}
          style={{
            flex: 1,
            padding: "10px",
            background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
            border: "none",
            borderRadius: 10,
            color: "#000",
            fontSize: "0.82rem",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'Figtree',sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download / Print PDF
        </button>
        <button
          onClick={() =>
            navigator.clipboard.writeText(JSON.stringify(resume, null, 2))
          }
          style={{
            padding: "10px 12px",
            background: "transparent",
            border: `1px solid ${G.border2}`,
            borderRadius: 10,
            color: G.muted,
            fontSize: "0.78rem",
            cursor: "pointer",
            fontFamily: "'Figtree',sans-serif",
          }}
        >
          Copy
        </button>
      </div>
      <div
        style={{
          flex: 1,
          background: "#fff",
          borderRadius: 12,
          overflowY: "auto",
          boxShadow: "0 6px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div
          ref={ref}
          style={{
            padding: "30px 34px",
            fontFamily: "Georgia,serif",
            color: "#1a1a1a",
            fontSize: "10.5pt",
            lineHeight: 1.65,
          }}
        >
          <h1 style={{ fontSize: "19pt", fontWeight: 700, marginBottom: 3 }}>
            {resume.name}
          </h1>
          {(resume.contact?.targetRole || resume.targetRole) && (
            <div
              style={{
                fontSize: "10pt",
                color: "#8b6914",
                fontWeight: 600,
                marginBottom: 7,
              }}
            >
              {resume.contact?.targetRole || resume.targetRole}
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 12,
              fontSize: "9pt",
              color: "#555",
              borderBottom: "1px solid #e8e0d0",
              paddingBottom: 9,
            }}
          >
            {(resume.contact?.email || resume.email) && (
              <span>✉ {resume.contact?.email || resume.email}</span>
            )}
            {(resume.contact?.phone || resume.phone) && (
              <span>📞 {resume.contact?.phone || resume.phone}</span>
            )}
            {(resume.contact?.location || resume.location) && (
              <span>📍 {resume.contact?.location || resume.location}</span>
            )}
            {(resume.contact?.linkedin || resume.linkedin) && (
              <span>🔗 {resume.contact?.linkedin || resume.linkedin}</span>
            )}
            {(resume.contact?.github || resume.github) && (
              <span>⌨ {resume.contact?.github || resume.github}</span>
            )}
          </div>
          {resume.summary && (
            <>
              <div style={SH()}>Professional Summary</div>
              <p>{resume.summary}</p>
            </>
          )}
          {resume.experience?.filter((e) => e.role || e.title || e.company)
            .length > 0 && (
            <>
              <div style={SH()}>Work Experience</div>
              {resume.experience.map((e, i) => {
                const title = e.title || e.role || "";
                const co = e.company || "";
                const dur = e.endDate || e.duration || "";
                const pts = Array.isArray(e.bullets)
                  ? e.bullets.join("\n")
                  : e.points || "";
                if (!title && !co) return null;
                return (
                  <div key={i} style={{ marginBottom: 11 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "10pt" }}>
                          {title}
                        </div>
                        <div style={{ color: "#555", fontSize: "9pt" }}>
                          {co}
                        </div>
                      </div>
                      {dur && (
                        <div
                          style={{
                            color: "#888",
                            fontSize: "8.5pt",
                            whiteSpace: "nowrap",
                            marginLeft: 8,
                          }}
                        >
                          {dur}
                        </div>
                      )}
                    </div>
                    {pts && (
                      <ul style={{ paddingLeft: 16, marginTop: 4 }}>
                        {pts
                          .split("\n")
                          .filter(Boolean)
                          .map((p, j) => (
                            <li
                              key={j}
                              style={{
                                fontSize: "9.5pt",
                                marginBottom: 3,
                                lineHeight: 1.55,
                              }}
                            >
                              {p.replace(/^[-•*]\s*/, "")}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </>
          )}
          {resume.careerGaps?.filter((g) => g.from || g.reason).length > 0 && (
            <>
              <div style={SH()}>Career Breaks</div>
              {resume.careerGaps
                .filter((g) => g.from || g.reason)
                .map((g, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#fffbf0",
                      border: "1px solid #f0d878",
                      borderRadius: 4,
                      padding: "6px 12px",
                      marginBottom: 7,
                      fontSize: "9.5pt",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#7a5c00" }}>
                      {g.from}
                      {g.to ? ` – ${g.to}` : ""}
                    </span>
                    {g.reason && (
                      <span style={{ color: "#555", marginLeft: 8 }}>
                        {g.reason}
                      </span>
                    )}
                    {g.description && (
                      <div
                        style={{ color: "#666", marginTop: 2, fontSize: "9pt" }}
                      >
                        {g.description}
                      </div>
                    )}
                  </div>
                ))}
            </>
          )}
          {resume.education?.filter((e) => e.degree || e.institution).length >
            0 && (
            <>
              <div style={SH()}>Education</div>
              {resume.education.map((e, i) => {
                if (!e.degree && !e.institution) return null;
                return (
                  <div
                    key={i}
                    style={{
                      marginBottom: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "10pt" }}>
                        {e.degree}
                      </div>
                      <div style={{ color: "#555", fontSize: "9pt" }}>
                        {e.institution}
                        {e.cgpa || e.score ? ` · ${e.cgpa || e.score}` : ""}
                      </div>
                    </div>
                    {e.year && (
                      <div
                        style={{
                          color: "#888",
                          fontSize: "8.5pt",
                          whiteSpace: "nowrap",
                          marginLeft: 8,
                        }}
                      >
                        {e.year}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
          {skills.length > 0 && (
            <>
              <div style={SH()}>Skills</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                  marginTop: 4,
                }}
              >
                {skills.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      background: "#f7f2e8",
                      border: "1px solid #ddd0b0",
                      padding: "2px 9px",
                      borderRadius: 3,
                      fontSize: "8.5pt",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}
          {certs.length > 0 && (
            <>
              <div style={SH()}>Certifications</div>
              <ul style={{ paddingLeft: 16 }}>
                {certs.map((c, i) => (
                  <li key={i} style={{ fontSize: "9.5pt", marginBottom: 3 }}>
                    {c.replace(/^[-•*]\s*/, "")}
                  </li>
                ))}
              </ul>
            </>
          )}
          {resume.languages && (
            <>
              <div style={SH()}>Languages</div>
              <p style={{ fontSize: "9.5pt" }}>{resume.languages}</p>
            </>
          )}
          {resume.projects?.length > 0 && (
            <>
              <div style={SH()}>Projects</div>
              {resume.projects.map((p, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: "10pt" }}>
                    {p.name}
                    {p.link ? (
                      <span
                        style={{
                          fontWeight: 400,
                          fontSize: "8.5pt",
                          color: "#666",
                          marginLeft: 8,
                        }}
                      >
                        {p.link}
                      </span>
                    ) : null}
                  </div>
                  {p.tech?.length > 0 && (
                    <div
                      style={{
                        fontSize: "8.5pt",
                        color: "#888",
                        marginBottom: 2,
                      }}
                    >
                      {p.tech.join(", ")}
                    </div>
                  )}
                  {p.description && (
                    <p style={{ fontSize: "9.5pt", lineHeight: 1.55 }}>
                      {p.description}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
          {resume.achievements?.length > 0 && (
            <>
              <div style={SH()}>Achievements & Awards</div>
              <ul style={{ paddingLeft: 16 }}>
                {(Array.isArray(resume.achievements)
                  ? resume.achievements
                  : resume.achievements.split("\n").filter(Boolean)
                ).map((a, i) => (
                  <li key={i} style={{ fontSize: "9.5pt", marginBottom: 3 }}>
                    {typeof a === "string" ? a.replace(/^[-•*]\s*/, "") : a}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
export default function ResumeScreen({ API_URL, userId }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [screen, setScreen] = useState("list");
  const [step, setStep] = useState("profile");
  const [resume, setResume] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState([]);
  const [loadLL, setLL] = useState(false);
  const [gen, setGen] = useState(false);

  const sf = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setEF = (i, k, v) =>
    setForm((f) => {
      const a = [...f.experience];
      a[i] = { ...a[i], [k]: v };
      return { ...f, experience: a };
    });
  const setEdF = (i, k, v) =>
    setForm((f) => {
      const a = [...f.education];
      a[i] = { ...a[i], [k]: v };
      return { ...f, education: a };
    });
  const setGF = (i, k, v) =>
    setForm((f) => {
      const a = [...f.careerGaps];
      a[i] = { ...a[i], [k]: v };
      return { ...f, careerGaps: a };
    });
  const addExp = () =>
    sf("experience", [
      ...form.experience,
      { company: "", role: "", duration: "", points: "", current: false },
    ]);
  const remExp = (i) =>
    sf(
      "experience",
      form.experience.filter((_, j) => j !== i)
    );
  const addEdu = () =>
    sf("education", [
      ...form.education,
      { institution: "", degree: "", year: "", score: "" },
    ]);
  const remEdu = (i) =>
    sf(
      "education",
      form.education.filter((_, j) => j !== i)
    );
  const addGap = () =>
    sf("careerGaps", [
      ...form.careerGaps,
      { from: "", to: "", reason: "", description: "" },
    ]);
  const remGap = (i) =>
    sf(
      "careerGaps",
      form.careerGaps.filter((_, j) => j !== i)
    );

  const loadSaved = async () => {
    if (!userId) return;
    setLL(true);
    try {
      const r = await fetch(`${API_URL}/resume/${userId}`);
      if (r.ok) setSaved(await r.json());
    } catch {}
    setLL(false);
  };
  useEffect(() => {
    loadSaved();
  }, [userId]);

  const openSaved = async (id) => {
    try {
      const r = await fetch(`${API_URL}/resume/${userId}/${id}`);
      const d = await r.json();
      setResume(d.resume);
      setForm(d.form || EMPTY_FORM);
      setScreen("preview");
    } catch {
      setError("Failed to load.");
    }
  };
  const delSaved = async (id, e) => {
    e.stopPropagation();
    try {
      await fetch(`${API_URL}/resume/${userId}/${id}`, { method: "DELETE" });
      setSaved((s) => s.filter((r) => r._id !== id));
    } catch {}
  };

  const stepIds = STEPS.map((s) => s.id);
  const nextStep = () => {
    const i = stepIds.indexOf(step);
    if (i < stepIds.length - 1) setStep(stepIds[i + 1]);
  };
  const prevStep = () => {
    const i = stepIds.indexOf(step);
    if (i > 0) setStep(stepIds[i - 1]);
    else {
      setScreen("list");
      setStep("profile");
    }
  };

  const generate = async () => {
    setGen(true);
    setError("");
    try {
      const r = await fetch(`${API_URL}/resume/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, userId }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Server error");
      }
      const data = await r.json();
      setResume(data.resume);
      await loadSaved();
      setScreen("preview");
    } catch (e) {
      setError(e.message || "Failed. Please try again.");
    }
    setGen(false);
  };

  const fmtDate = (d) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (screen === "list")
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
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${G.border2}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: "1rem",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>📄</span>My Resumes
          </div>
          <button
            onClick={() => {
              setForm(EMPTY_FORM);
              setStep("profile");
              setError("");
              setScreen("wizard");
            }}
            style={{
              background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
              border: "none",
              borderRadius: 10,
              padding: "7px 16px",
              color: "#000",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Figtree',sans-serif",
            }}
          >
            + New
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
          {loadLL && (
            <div style={{ textAlign: "center", padding: 40, color: G.muted }}>
              Loading...
            </div>
          )}
          {!loadLL && saved.length === 0 && (
            <div style={{ textAlign: "center", padding: "50px 20px" }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>📄</div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "1.05rem",
                  color: G.text,
                  marginBottom: 8,
                }}
              >
                No resumes yet
              </div>
              <div
                style={{
                  fontSize: "0.82rem",
                  color: G.muted,
                  marginBottom: 22,
                  lineHeight: 1.7,
                }}
              >
                Build a professional ATS-optimised resume
                <br />
                in under 5 minutes.
              </div>
              <button
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setStep("profile");
                  setScreen("wizard");
                }}
                style={{
                  background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
                  border: "none",
                  borderRadius: 12,
                  padding: "13px 28px",
                  color: "#000",
                  fontSize: "0.92rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "'Figtree',sans-serif",
                }}
              >
                Build My Resume →
              </button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {saved.map((r) => (
              <div
                key={r._id}
                onClick={() => openSaved(r._id)}
                style={{
                  background: G.surface,
                  border: `1px solid ${G.border2}`,
                  borderRadius: 13,
                  padding: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 11,
                    background:
                      "linear-gradient(135deg,rgba(240,165,0,0.12),rgba(255,107,43,0.12))",
                    border: `1px solid ${G.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                >
                  📄
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      color: G.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.title || "Untitled Resume"}
                  </div>
                  <div
                    style={{ fontSize: "0.7rem", color: G.muted, marginTop: 3 }}
                  >
                    {r.targetRole && (
                      <span style={{ color: G.gold, marginRight: 8 }}>
                        {r.targetRole}
                      </span>
                    )}
                    {fmtDate(r.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => delSaved(r._id, e)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: G.muted,
                    cursor: "pointer",
                    padding: 6,
                    flexShrink: 0,
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
            ))}
          </div>
        </div>
      </div>
    );

  // ── PREVIEW ───────────────────────────────────────────────────────────────
  if (screen === "preview")
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: G.bg,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${G.border2}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setScreen("list")}
            style={{
              background: "transparent",
              border: "none",
              color: G.muted,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: "0.8rem",
              fontFamily: "'Figtree',sans-serif",
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
              <polyline points="15 18 9 12 15 6" />
            </svg>
            My Resumes
          </button>
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.95rem",
              color: G.text,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📄</span>Resume Ready
          </div>
          <button
            onClick={() => {
              setStep("profile");
              setScreen("wizard");
            }}
            style={{
              background: "transparent",
              border: `1px solid ${G.border2}`,
              borderRadius: 8,
              padding: "5px 12px",
              color: G.muted,
              fontSize: "0.76rem",
              cursor: "pointer",
              fontFamily: "'Figtree',sans-serif",
            }}
          >
            ✏️ Edit
          </button>
        </div>
        <div style={{ flex: 1, padding: "12px 14px", overflow: "hidden" }}>
          <ResumePreview resume={resume} />
        </div>
      </div>
    );

  // ── WIZARD ────────────────────────────────────────────────────────────────
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
          padding: "12px 16px 0",
          borderBottom: `1px solid ${G.border2}`,
          flexShrink: 0,
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
            <button
              onClick={() => {
                setScreen("list");
                setStep("profile");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: G.muted,
                cursor: "pointer",
                fontFamily: "'Figtree',sans-serif",
                display: "flex",
                alignItems: "center",
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
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span style={{ fontWeight: 800, fontSize: "0.96rem" }}>
              📄 AI Resume Builder
            </span>
          </div>
          <span style={{ fontSize: "0.68rem", color: G.muted }}>
            Step {stepIds.indexOf(step) + 1}/{STEPS.length}
          </span>
        </div>
        <StepBar current={step} />
        <div
          style={{
            textAlign: "center",
            padding: "8px 0 10px",
            fontSize: "0.76rem",
            color: G.muted,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          {STEPS.find((s) => s.id === step)?.icon}{" "}
          {STEPS.find((s) => s.id === step)?.label}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 0" }}>
        <div
          style={{
            maxWidth: 520,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* ── PROFILE ── */}
          {step === "profile" && (
            <>
              <div style={cardStyle}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: G.text,
                  }}
                >
                  👤 Personal Information
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <Field label="Full Name *">
                    <input
                      value={form.fullName}
                      onChange={(e) => sf("fullName", e.target.value)}
                      placeholder="Mohammad Rahil"
                      style={inp()}
                    />
                  </Field>
                  <Field label="Target Role *">
                    <input
                      value={form.targetRole}
                      onChange={(e) => sf("targetRole", e.target.value)}
                      placeholder="Software Engineer"
                      style={inp()}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => sf("email", e.target.value)}
                      placeholder="rahil@email.com"
                      style={inp()}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => sf("phone", e.target.value)}
                      placeholder="+91 98765 43210"
                      style={inp()}
                    />
                  </Field>
                  <Field label="Location">
                    <input
                      value={form.location}
                      onChange={(e) => sf("location", e.target.value)}
                      placeholder="New Delhi, India"
                      style={inp()}
                    />
                  </Field>
                  <Field label="LinkedIn">
                    <input
                      value={form.linkedin}
                      onChange={(e) => sf("linkedin", e.target.value)}
                      placeholder="linkedin.com/in/rahil"
                      style={inp()}
                    />
                  </Field>
                  <Field label="GitHub (optional)">
                    <input
                      value={form.github}
                      onChange={(e) => sf("github", e.target.value)}
                      placeholder="github.com/rahil"
                      style={inp()}
                    />
                  </Field>
                </div>
              </div>
              <div style={cardStyle}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: G.text,
                  }}
                >
                  📝 Professional Summary
                </div>
                <textarea
                  value={form.summary}
                  onChange={(e) => sf("summary", e.target.value)}
                  placeholder="Leave blank — AI will craft a compelling summary for you..."
                  rows={4}
                  style={inp({ resize: "none", lineHeight: 1.65 })}
                />
                <div style={{ fontSize: "0.7rem", color: G.muted }}>
                  💡 Leave blank for best AI-generated results
                </div>
              </div>
            </>
          )}

          {/* ── TEMPLATE ── */}
          {step === "template" && (
            <>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: G.muted,
                  textAlign: "center",
                  lineHeight: 1.65,
                  marginBottom: 2,
                }}
              >
                Choose the style that matches your target industry
              </div>
              {RESUME_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => sf("targetTemplate", t.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 16px",
                    borderRadius: 13,
                    cursor: "pointer",
                    background:
                      form.targetTemplate === t.id
                        ? "rgba(240,165,0,0.07)"
                        : "rgba(255,255,255,0.02)",
                    border: `1.5px solid ${
                      form.targetTemplate === t.id
                        ? G.gold
                        : "rgba(255,255,255,0.07)"
                    }`,
                    textAlign: "left",
                    fontFamily: "'Figtree',sans-serif",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ fontSize: 26, flexShrink: 0 }}>{t.icon}</div>
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.88rem",
                        color: form.targetTemplate === t.id ? G.gold : G.text,
                      }}
                    >
                      {t.id}
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: G.muted,
                        marginTop: 2,
                      }}
                    >
                      {t.desc}
                    </div>
                  </div>
                  {form.targetTemplate === t.id && (
                    <div style={{ marginLeft: "auto", color: G.gold }}>✓</div>
                  )}
                </button>
              ))}
            </>
          )}

          {/* ── EXPERIENCE ── */}
          {step === "experience" && (
            <>
              {/* Type selector */}
              {!form.experienceType && (
                <div style={cardStyle}>
                  <div
                    style={{
                      fontSize: "0.88rem",
                      fontWeight: 700,
                      color: G.text,
                      textAlign: "center",
                    }}
                  >
                    What is your work experience status?
                  </div>
                  {[
                    {
                      id: "fresher",
                      icon: "🌱",
                      title: "Fresher / Student",
                      desc: "0–1 years · No full-time job yet",
                    },
                    {
                      id: "experienced",
                      icon: "💼",
                      title: "Working Professional",
                      desc: "Have 1+ years of work experience",
                    },
                  ].map((o) => (
                    <button
                      key={o.id}
                      onClick={() => sf("experienceType", o.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "16px",
                        borderRadius: 13,
                        cursor: "pointer",
                        background: "rgba(255,255,255,0.02)",
                        border: "1.5px solid rgba(255,255,255,0.08)",
                        textAlign: "left",
                        fontFamily: "'Figtree',sans-serif",
                      }}
                    >
                      <div style={{ fontSize: 28, flexShrink: 0 }}>
                        {o.icon}
                      </div>
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            color: G.text,
                          }}
                        >
                          {o.title}
                        </div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: G.muted,
                            marginTop: 2,
                          }}
                        >
                          {o.desc}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* FRESHER */}
              {form.experienceType === "fresher" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.84rem",
                        fontWeight: 700,
                        color: G.text,
                      }}
                    >
                      🌱 Internships & Projects
                    </div>
                    <button
                      onClick={() => sf("experienceType", "")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: G.muted,
                        fontSize: "0.7rem",
                        cursor: "pointer",
                        fontFamily: "'Figtree',sans-serif",
                      }}
                    >
                      Change ✕
                    </button>
                  </div>
                  {form.experience.map((e, i) => (
                    <div key={i} style={cardStyle}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: G.gold,
                            fontWeight: 700,
                          }}
                        >
                          Internship / Project {i + 1}
                        </span>
                        {form.experience.length > 1 && (
                          <button
                            onClick={() => remExp(i)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: G.error,
                              cursor: "pointer",
                              fontSize: "0.7rem",
                              fontFamily: "'Figtree',sans-serif",
                            }}
                          >
                            ✕ Remove
                          </button>
                        )}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 9,
                        }}
                      >
                        <Field label="Role / Project Title">
                          <input
                            value={e.role}
                            onChange={(ev) => setEF(i, "role", ev.target.value)}
                            placeholder="Frontend Intern"
                            style={inp()}
                          />
                        </Field>
                        <Field label="Company / College">
                          <input
                            value={e.company}
                            onChange={(ev) =>
                              setEF(i, "company", ev.target.value)
                            }
                            placeholder="TechStartup / IITD"
                            style={inp()}
                          />
                        </Field>
                        <Field label="Duration">
                          <input
                            value={e.duration}
                            onChange={(ev) =>
                              setEF(i, "duration", ev.target.value)
                            }
                            placeholder="Jun – Aug 2024"
                            style={inp()}
                          />
                        </Field>
                      </div>
                      <Field label="Key Contributions (one per line)">
                        <textarea
                          value={e.points}
                          onChange={(ev) => setEF(i, "points", ev.target.value)}
                          placeholder={
                            "- Built REST APIs\n- Improved load time by 30%"
                          }
                          rows={3}
                          style={inp({ resize: "none", lineHeight: 1.6 })}
                        />
                      </Field>
                    </div>
                  ))}
                  <button
                    onClick={addExp}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      padding: "11px",
                      borderRadius: 12,
                      border: "1.5px dashed rgba(240,165,0,0.3)",
                      background: "rgba(240,165,0,0.04)",
                      color: G.gold,
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'Figtree',sans-serif",
                    }}
                  >
                    + Add Internship / Project
                  </button>
                </>
              )}

              {/* EXPERIENCED */}
              {form.experienceType === "experienced" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.84rem",
                        fontWeight: 700,
                        color: G.text,
                      }}
                    >
                      💼 Work Experience
                    </div>
                    <button
                      onClick={() => sf("experienceType", "")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: G.muted,
                        fontSize: "0.7rem",
                        cursor: "pointer",
                        fontFamily: "'Figtree',sans-serif",
                      }}
                    >
                      Change ✕
                    </button>
                  </div>
                  {form.experience.map((e, i) => (
                    <div key={i} style={cardStyle}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: G.gold,
                            fontWeight: 700,
                          }}
                        >
                          Company {i + 1}
                        </span>
                        {form.experience.length > 1 && (
                          <button
                            onClick={() => remExp(i)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: G.error,
                              cursor: "pointer",
                              fontSize: "0.7rem",
                              fontFamily: "'Figtree',sans-serif",
                            }}
                          >
                            ✕ Remove
                          </button>
                        )}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 9,
                        }}
                      >
                        <Field label="Job Title">
                          <input
                            value={e.role}
                            onChange={(ev) => setEF(i, "role", ev.target.value)}
                            placeholder="Software Engineer"
                            style={inp()}
                          />
                        </Field>
                        <Field label="Company Name">
                          <input
                            value={e.company}
                            onChange={(ev) =>
                              setEF(i, "company", ev.target.value)
                            }
                            placeholder="Infosys Ltd."
                            style={inp()}
                          />
                        </Field>
                        <Field label="Duration">
                          <input
                            value={e.duration}
                            onChange={(ev) =>
                              setEF(i, "duration", ev.target.value)
                            }
                            placeholder="Jan 2022 – Dec 2023"
                            style={inp()}
                          />
                        </Field>
                        <Field label="Currently Here?">
                          <button
                            onClick={() => setEF(i, "current", !e.current)}
                            style={{
                              padding: "11px 13px",
                              borderRadius: 10,
                              border: `1px solid ${
                                e.current ? G.gold : "rgba(255,255,255,0.09)"
                              }`,
                              background: e.current
                                ? "rgba(240,165,0,0.09)"
                                : "rgba(255,255,255,0.03)",
                              color: e.current ? G.gold : G.muted,
                              fontSize: "0.82rem",
                              cursor: "pointer",
                              fontFamily: "'Figtree',sans-serif",
                              fontWeight: 600,
                            }}
                          >
                            {e.current ? "✓ Yes, current" : "No"}
                          </button>
                        </Field>
                      </div>
                      <Field label="Key Achievements & Responsibilities (one per line)">
                        <textarea
                          value={e.points}
                          onChange={(ev) => setEF(i, "points", ev.target.value)}
                          placeholder={
                            "- Led team of 6 engineers\n- Reduced API latency by 40%\n- Delivered 2 weeks early"
                          }
                          rows={4}
                          style={inp({ resize: "none", lineHeight: 1.6 })}
                        />
                      </Field>
                    </div>
                  ))}
                  <button
                    onClick={addExp}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      padding: "11px",
                      borderRadius: 12,
                      border: "1.5px dashed rgba(240,165,0,0.3)",
                      background: "rgba(240,165,0,0.04)",
                      color: G.gold,
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'Figtree',sans-serif",
                    }}
                  >
                    + Add Another Company
                  </button>

                  {/* Career gaps */}
                  <div style={cardStyle}>
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
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            color: G.text,
                          }}
                        >
                          ⏸ Career Gaps
                        </div>
                        <div
                          style={{
                            fontSize: "0.69rem",
                            color: G.muted,
                            marginTop: 2,
                          }}
                        >
                          Had a break? Explain it briefly — it looks
                          professional.
                        </div>
                      </div>
                      <button
                        onClick={addGap}
                        style={{
                          background: "rgba(240,165,0,0.1)",
                          border: "1px solid rgba(240,165,0,0.2)",
                          borderRadius: 7,
                          padding: "4px 10px",
                          color: G.gold,
                          fontSize: "0.69rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "'Figtree',sans-serif",
                          flexShrink: 0,
                        }}
                      >
                        + Add Gap
                      </button>
                    </div>
                    {form.careerGaps.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: "0.75rem",
                          color: G.muted,
                          padding: "4px 0",
                        }}
                      >
                        No gaps — great!
                      </div>
                    )}
                    {form.careerGaps.map((g, i) => (
                      <div
                        key={i}
                        style={{
                          background: "rgba(255,207,0,0.04)",
                          border: "1px solid rgba(255,207,0,0.12)",
                          borderRadius: 10,
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 9,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "#f0c040",
                              fontWeight: 600,
                            }}
                          >
                            Gap {i + 1}
                          </span>
                          <button
                            onClick={() => remGap(i)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: G.error,
                              cursor: "pointer",
                              fontSize: "0.7rem",
                              fontFamily: "'Figtree',sans-serif",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 8,
                          }}
                        >
                          <Field label="From (Month Year)">
                            <input
                              value={g.from}
                              onChange={(ev) =>
                                setGF(i, "from", ev.target.value)
                              }
                              placeholder="Mar 2022"
                              style={inp()}
                            />
                          </Field>
                          <Field label="To (Month Year)">
                            <input
                              value={g.to}
                              onChange={(ev) => setGF(i, "to", ev.target.value)}
                              placeholder="Sep 2022"
                              style={inp()}
                            />
                          </Field>
                        </div>
                        <Field label="Reason">
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 5,
                              marginTop: 2,
                            }}
                          >
                            {CAREER_GAP_REASONS.map((r) => (
                              <button
                                key={r}
                                onClick={() => setGF(i, "reason", r)}
                                style={{
                                  padding: "4px 9px",
                                  borderRadius: 100,
                                  border: `1px solid ${
                                    g.reason === r
                                      ? G.gold
                                      : "rgba(255,255,255,0.08)"
                                  }`,
                                  background:
                                    g.reason === r
                                      ? "rgba(240,165,0,0.1)"
                                      : "rgba(255,255,255,0.02)",
                                  color: g.reason === r ? G.gold : G.muted,
                                  fontSize: "0.68rem",
                                  cursor: "pointer",
                                  fontFamily: "'Figtree',sans-serif",
                                }}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        </Field>
                        <Field label="Brief Description (optional)">
                          <textarea
                            value={g.description}
                            onChange={(ev) =>
                              setGF(i, "description", ev.target.value)
                            }
                            placeholder="e.g. Completed MBA from Delhi University"
                            rows={2}
                            style={inp({ resize: "none", lineHeight: 1.6 })}
                          />
                        </Field>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── EDUCATION ── */}
          {step === "education" && (
            <>
              {form.education.map((e, i) => (
                <div key={i} style={cardStyle}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: G.gold,
                        fontWeight: 700,
                      }}
                    >
                      Qualification {i + 1}
                    </span>
                    {form.education.length > 1 && (
                      <button
                        onClick={() => remEdu(i)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: G.error,
                          cursor: "pointer",
                          fontSize: "0.7rem",
                          fontFamily: "'Figtree',sans-serif",
                        }}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 9,
                    }}
                  >
                    <Field label="Degree / Course">
                      <input
                        value={e.degree}
                        onChange={(ev) => setEdF(i, "degree", ev.target.value)}
                        placeholder="B.Tech Computer Science"
                        style={inp()}
                      />
                    </Field>
                    <Field label="University / School">
                      <input
                        value={e.institution}
                        onChange={(ev) =>
                          setEdF(i, "institution", ev.target.value)
                        }
                        placeholder="IIT Delhi"
                        style={inp()}
                      />
                    </Field>
                    <Field label="Year of Passing">
                      <input
                        value={e.year}
                        onChange={(ev) => setEdF(i, "year", ev.target.value)}
                        placeholder="2019 – 2023"
                        style={inp()}
                      />
                    </Field>
                    <Field label="Score / CGPA / %">
                      <input
                        value={e.score}
                        onChange={(ev) => setEdF(i, "score", ev.target.value)}
                        placeholder="8.4 CGPA / 85%"
                        style={inp()}
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <button
                onClick={addEdu}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  padding: "11px",
                  borderRadius: 12,
                  border: "1.5px dashed rgba(240,165,0,0.3)",
                  background: "rgba(240,165,0,0.04)",
                  color: G.gold,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'Figtree',sans-serif",
                }}
              >
                + Add Another Qualification
              </button>
            </>
          )}

          {/* ── SKILLS ── */}
          {step === "skills" && (
            <>
              <div style={cardStyle}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: G.text,
                  }}
                >
                  ⚡ Skills
                </div>
                <Field label="Technical & Soft Skills (comma separated)">
                  <textarea
                    value={form.skills}
                    onChange={(e) => sf("skills", e.target.value)}
                    placeholder="Python, React, MS Excel, Communication, Leadership, SQL, Problem Solving"
                    rows={3}
                    style={inp({ resize: "none", lineHeight: 1.6 })}
                  />
                </Field>
                <div style={{ fontSize: "0.7rem", color: G.muted }}>
                  💡 Include both technical and soft skills for a higher ATS
                  score
                </div>
              </div>
              <div style={cardStyle}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: G.text,
                  }}
                >
                  🏅 Certifications
                </div>
                <textarea
                  value={form.certifications}
                  onChange={(e) => sf("certifications", e.target.value)}
                  placeholder={
                    "AWS Certified Developer (2024)\nGoogle Analytics Certified\nCoursera Machine Learning"
                  }
                  rows={4}
                  style={inp({ resize: "none", lineHeight: 1.6 })}
                />
              </div>
              <div style={cardStyle}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: G.text,
                  }}
                >
                  🗣️ Languages Known
                </div>
                <input
                  value={form.languages}
                  onChange={(e) => sf("languages", e.target.value)}
                  placeholder="Hindi (Native), English (Fluent), Tamil (Conversational)"
                  style={inp()}
                />
              </div>
              <div style={cardStyle}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: G.text,
                  }}
                >
                  🏆 Achievements & Awards
                </div>
                <textarea
                  value={form.achievements}
                  onChange={(e) => sf("achievements", e.target.value)}
                  placeholder={
                    "- Won 1st place at National Hackathon 2023\n- Published research paper in IEEE"
                  }
                  rows={3}
                  style={inp({ resize: "none", lineHeight: 1.6 })}
                />
              </div>
            </>
          )}

          {/* ── REVIEW ── */}
          {step === "review" && (
            <>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: G.muted,
                  textAlign: "center",
                  lineHeight: 1.65,
                  marginBottom: 4,
                }}
              >
                Everything looks good? Hit{" "}
                <strong style={{ color: G.gold }}>Generate</strong>!
              </div>
              {[
                {
                  label: "👤 Profile",
                  val: form.fullName
                    ? `${form.fullName} · ${form.targetRole || "No role"}`
                    : "❌ Name missing",
                },
                { label: "🎨 Template", val: form.targetTemplate },
                {
                  label: "💼 Experience",
                  val:
                    form.experienceType === "fresher"
                      ? `Fresher · ${
                          form.experience.filter((e) => e.role || e.company)
                            .length
                        } item(s)`
                      : form.experienceType === "experienced"
                      ? `${
                          form.experience.filter((e) => e.role || e.company)
                            .length
                        } company(s) · ${form.careerGaps.length} gap(s)`
                      : "⚠️ Not selected",
                },
                {
                  label: "🎓 Education",
                  val:
                    form.education.filter((e) => e.degree || e.institution)
                      .length + " qualification(s)",
                },
                {
                  label: "⚡ Skills",
                  val: form.skills
                    ? form.skills.split(",").filter(Boolean).length +
                      " skills added"
                    : "⚠️ No skills added",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 11,
                  }}
                >
                  <span style={{ fontSize: "0.8rem", color: G.muted }}>
                    {row.label}
                  </span>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      color: G.text,
                      fontWeight: 600,
                      maxWidth: "60%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.val}
                  </span>
                </div>
              ))}
              {error && (
                <div
                  style={{
                    background: `${G.error}18`,
                    border: `1px solid ${G.error}40`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: G.error,
                    fontSize: "0.8rem",
                  }}
                >
                  {error}
                </div>
              )}
              <div
                style={{
                  background: "rgba(240,165,0,0.06)",
                  border: "1px solid rgba(240,165,0,0.14)",
                  borderRadius: 11,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: G.gold,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  🤖 What AI will do:
                </div>
                {[
                  "Write a compelling professional summary",
                  "Improve bullets with action verbs + metrics",
                  "Add ATS keywords for your target role",
                  "Format everything to professional standards",
                ].map((s, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: "0.73rem",
                      color: G.muted,
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ color: G.gold }}>✓</span>
                    {s}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ height: 80 }} />
        </div>
      </div>

      {/* Navigation */}
      <NavButtons
        onBack={prevStep}
        onNext={
          step === "review"
            ? () => {
                setScreen("generating");
                generate();
              }
            : nextStep
        }
        label={
          step === "profile"
            ? "Choose Template →"
            : step === "template"
            ? "Add Experience →"
            : step === "experience"
            ? "Add Education →"
            : step === "education"
            ? "Add Skills →"
            : step === "skills"
            ? "Review →"
            : "🚀 Generate My Resume"
        }
        disabled={step === "profile" && !form.fullName.trim()}
        loading={step === "review" && gen}
      />
    </div>
  );
}
