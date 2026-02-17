import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

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

const EXAMS = [
  "General",
  "UPSC",
  "JEE",
  "NEET",
  "SSC",
  "Banking",
  "GATE",
  "CAT",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [exam, setExam] = useState("General");
  const [showExamMenu, setShowExamMenu] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Android keyboard viewport fix
  useEffect(() => {
    const handleViewport = () => {
      const h = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(h);
    };
    window.visualViewport?.addEventListener("resize", handleViewport);
    window.visualViewport?.addEventListener("scroll", handleViewport);
    window.addEventListener("resize", handleViewport);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewport);
      window.visualViewport?.removeEventListener("scroll", handleViewport);
      window.removeEventListener("resize", handleViewport);
    };
  }, []);

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

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");
    setLoading(true);
    setMessages((p) => [
      ...p,
      { role: "user", content: userText },
      { role: "assistant", content: "" },
    ]);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userText, exam }),
      });
      const data = await res.json();
      const answer =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer.trim()
          : "⚠️ No response. Please try again.";
      typeText(answer, setMessages, () => setLoading(false));
    } catch {
      setMessages((p) => [
        ...p.slice(0, -1),
        { role: "assistant", content: "⚠️ Server error. Please try again." },
      ]);
      setLoading(false);
    }
  };

  const handleImageUpload = async (file) => {
    if (!file || loading) return;
    setLoading(true);
    setMessages((p) => [
      ...p,
      { role: "user", content: "📷 Image sent" },
      { role: "assistant", content: "" },
    ]);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("exam", exam);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      const answer =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer.trim()
          : "⚠️ Could not process image.";
      typeText(answer, setMessages, () => setLoading(false));
    } catch {
      setMessages((p) => [
        ...p.slice(0, -1),
        { role: "assistant", content: "⚠️ Image processing failed." },
      ]);
      setLoading(false);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#212121",
        color: "#ececec",
        fontFamily: "'Figtree', system-ui, -apple-system, sans-serif",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      onClick={() => setShowExamMenu(false)}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        html, body { overflow: 100%; overscroll-behavior: none; background: #212121; }
        textarea { font-family: 'Figtree', system-ui, sans-serif !important; font-size: 16px !important; }
        .msg-content p { margin-bottom: 10px; line-height: 1.75; }
        .msg-content p:last-child { margin-bottom: 0; }
        .msg-content ul, .msg-content ol { padding-left: 20px; margin: 8px 0; }
        .msg-content li { margin-bottom: 6px; line-height: 1.7; }
        .msg-content strong { font-weight: 600; color: #fff; }
        .msg-content em { color: #ccc; }
        .msg-content code { background: #343434; padding: 2px 6px; border-radius: 4px; font-size: 0.84em; color: #e0e0e0; }
        .msg-content pre { background: #1a1a1a; padding: 14px; border-radius: 8px; overflow-x: auto; margin: 10px 0; border: 1px solid #333; }
        .msg-content h1,.msg-content h2,.msg-content h3 { margin: 14px 0 6px; color: #fff; font-weight: 600; }
        .msg-content blockquote { border-left: 3px solid #10a37f; padding-left: 12px; color: #aaa; margin: 8px 0; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dotPulse {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        .dot1 { animation: dotPulse 1s ease-in-out infinite; }
        .dot2 { animation: dotPulse 1s ease-in-out 0.15s infinite; }
        .dot3 { animation: dotPulse 1s ease-in-out 0.3s infinite; }
        .suggestion-btn:active { background: #343434 !important; }
        .exam-opt:active { background: #3a3a3a !important; }
        .send-btn:active { transform: scale(0.9); }
        .img-btn:active { opacity: 0.5; }
      `}</style>

      {/* ── HEADER ── */}
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
          minHeight: 52,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "8px",
              background: "linear-gradient(135deg, #10a37f, #0d8a6a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "15px",
            }}
          >
            🎓
          </div>
          <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "#fff" }}>
            ExamAI
          </span>
        </div>

        {/* Exam selector */}
        <div
          style={{ position: "relative" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowExamMenu(!showExamMenu)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: "#2a2a2a",
              border: "1px solid #3a3a3a",
              borderRadius: "8px",
              padding: "6px 11px",
              color: "#ececec",
              fontSize: "0.82rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {exam}
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
                borderRadius: "10px",
                padding: "4px",
                zIndex: 100,
                minWidth: "110px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                animation: "fadeIn 0.12s ease",
              }}
            >
              {EXAMS.map((e) => (
                <button
                  key={e}
                  className="exam-opt"
                  onClick={() => {
                    setExam(e);
                    setShowExamMenu(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 12px",
                    borderRadius: "7px",
                    background: exam === e ? "#10a37f20" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: exam === e ? "#10a37f" : "#ddd",
                    fontSize: "0.85rem",
                    fontWeight: exam === e ? 600 : 400,
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MESSAGES ── */}
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
        {/* Empty state */}
        {isEmpty ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px 16px",
              gap: "20px",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #10a37f, #0d8a6a)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
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
                  marginBottom: "5px",
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
                gap: "8px",
                width: "100%",
                maxWidth: "380px",
              }}
            >
              {[
                "📚 Explain Newton's Laws of Motion",
                "🇮🇳 What is the Preamble of Indian Constitution?",
                "🔢 Solve: If 2x + 3 = 11, find x",
                "📝 Key topics I should study today",
              ].map((s, i) => (
                <button
                  key={i}
                  className="suggestion-btn"
                  onClick={() => setInput(s.slice(3))}
                  style={{
                    background: "#2a2a2a",
                    border: "1px solid #333",
                    borderRadius: "10px",
                    padding: "11px 14px",
                    color: "#ddd",
                    fontSize: "0.85rem",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "background 0.15s",
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
              gap: "2px",
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
                        padding: "10px 14px",
                        maxWidth: "82%",
                        fontSize: "0.9rem",
                        lineHeight: 1.65,
                        color: "#ececec",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      padding: "6px 14px",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "6px",
                        flexShrink: 0,
                        background: "linear-gradient(135deg, #10a37f, #0d8a6a)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        marginTop: "3px",
                      }}
                    >
                      🎓
                    </div>

                    <div style={{ flex: 1, minWidth: 0, paddingTop: "2px" }}>
                      {msg.content === "" && loading ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "5px",
                            alignItems: "center",
                            height: 28,
                          }}
                        >
                          <div
                            className="dot1"
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: "#10a37f",
                            }}
                          />
                          <div
                            className="dot2"
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: "#10a37f",
                            }}
                          />
                          <div
                            className="dot3"
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: "#10a37f",
                            }}
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
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
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

      {/* ── INPUT ── */}
      <div
        style={{
          flexShrink: 0,
          padding: "8px 12px",
          paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
          background: "#212121",
          borderTop: isEmpty ? "none" : "1px solid #2a2a2a",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "6px",
            background: "#2a2a2a",
            border: "1px solid #3a3a3a",
            borderRadius: "14px",
            padding: "6px 6px 6px 12px",
          }}
        >
          {/* Image upload */}
          <label
            className="img-btn"
            style={{
              width: 34,
              height: 34,
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#666",
              flexShrink: 0,
              marginBottom: "1px",
              transition: "opacity 0.15s",
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
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handleImageUpload(e.target.files[0])}
            />
          </label>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ExamAI...`}
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
              maxHeight: "160px",
              minHeight: "26px",
              paddingTop: "7px",
              paddingBottom: "5px",
              WebkitAppearance: "none",
              caretColor: "#10a37f",
            }}
          />

          {/* Send */}
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              width: 34,
              height: 34,
              borderRadius: "8px",
              background: loading || !input.trim() ? "#3a3a3a" : "#10a37f",
              border: "none",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s",
              marginBottom: "1px",
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
            marginTop: "6px",
            fontSize: "0.65rem",
            color: "#444",
          }}
        >
          ExamAI can make mistakes. Verify important info.
        </div>
      </div>
    </div>
  );
}
