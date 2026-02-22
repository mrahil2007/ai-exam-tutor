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

const getUserId = () => {
  let userId = localStorage.getItem("examai_userId");
  if (!userId) {
    userId = "user_" + Math.random().toString(36).slice(2, 11);
    localStorage.setItem("examai_userId", userId);
  }
  return userId;
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
const VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
const USER_ID = getUserId();

// ── QUESTION TYPE DETECTOR & RENDERER ────────────────────────────────────────

// Detects if a question contains a pipe-separated table (new format from AI)
const isPipeTable = (text) => text.includes(" | ") && /[A-D]\.\s/.test(text);

// Detects old "List I / List II" inline text format
const isMatchingQuestion = (text) => {
  return /list[\s-]?i\b/i.test(text) && /list[\s-]?ii\b/i.test(text);
};

// Parse pipe-separated table format:
// "List I (heading) | List II (heading)\nA. item | 1. item\nB. item | 2. item"
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
        // Data row: "A. item | 1. item"
        const left = parts[0].replace(/^[A-D]\.\s*/i, "").trim();
        const right = parts[1]?.replace(/^\d+\.\s*/, "").trim() || "";
        const leftLabel =
          parts[0].match(/^([A-D])\./i)?.[1]?.toUpperCase() || "";
        const rightLabel = parts[1]?.match(/^(\d+)\./)?.[1] || "";
        rows.push({ leftLabel, left, rightLabel, right });
      } else {
        // Header row
        header1 = parts[0] || "List I";
        header2 = parts[1] || "List II";
      }
    } else if (/how many|which of|select the|correctly matched/i.test(line)) {
      questionLine = line;
    }
  }

  return { header1, header2, rows, questionLine };
};

// Parse old inline format: "List I: A) X, B) Y ... List II: a) p, b) q"
const parseInlineLists = (text) => {
  const list1Match = text.match(/list[\s-]?i[:\s]+([^.]*?)(?=list[\s-]?ii)/i);
  const list2Match = text.match(
    /list[\s-]?ii[:\s]+([^.]*?)(?=which|how many|$)/i
  );

  const parseItems = (str) => {
    if (!str) return [];
    const items = [];
    const regex =
      /([A-Da-d1-4])[).]\s*([^,A-Da-d1-4)]+?)(?=[,;]?\s*[A-Da-d1-4][).]|$)/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
      items.push({ label: match[1].toUpperCase(), text: match[2].trim() });
    }
    return items;
  };

  return {
    list1Items: parseItems(list1Match?.[1] || ""),
    list2Items: parseItems(list2Match?.[1] || ""),
  };
};

// Renders the intro text before any table
function QuestionIntro({ text }) {
  const intro = text.split("\n")[0];
  if (!intro || /list[\s-]?i\b/i.test(intro) || intro.includes("|"))
    return null;
  return (
    <div
      style={{
        fontSize: "0.9rem",
        color: "#fff",
        lineHeight: 1.6,
        fontWeight: 500,
        marginBottom: 10,
      }}
    >
      {intro}
    </div>
  );
}

// Main smart question renderer
function SmartQuestionDisplay({ question }) {
  // Get preamble (line before any table)
  const lines = question
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const preambleLines = [];
  let tableStarted = false;
  let bottomLine = "";
  for (const line of lines) {
    if (
      !tableStarted &&
      !line.includes("|") &&
      !/^[A-D]\.\s/i.test(line) &&
      !/list[\s-]?i\b/i.test(line)
    ) {
      if (/how many|which of|select the|correctly matched/i.test(line)) {
        bottomLine = line;
      } else preambleLines.push(line);
    } else {
      tableStarted = true;
    }
  }

  // Case 1: Pipe table format
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

  // Case 2: Old inline List I / List II format
  if (isMatchingQuestion(question)) {
    const { list1Items, list2Items } = parseInlineLists(question);
    const questionText =
      question.match(/(which of the following[^?]*\?|how many[^?]*\?)/i)?.[0] ||
      "";
    const list1Header =
      question.match(/list[\s-]?i\s*\(([^)]+)\)/i)?.[1] || "List I";
    const list2Header =
      question.match(/list[\s-]?ii\s*\(([^)]+)\)/i)?.[1] || "List II";

    if (list1Items.length > 0 && list2Items.length > 0) {
      const maxRows = Math.max(list1Items.length, list2Items.length);
      const intro = question.split(/list[\s-]?i\b/i)[0].trim();
      return (
        <div>
          {intro && (
            <div
              style={{
                fontSize: "0.9rem",
                color: "#fff",
                lineHeight: 1.6,
                fontWeight: 500,
                marginBottom: 10,
              }}
            >
              {intro}
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
                  }}
                >
                  LIST I{list1Header !== "List I" ? ` (${list1Header})` : ""}
                </td>
                <td
                  style={{
                    background: "#1a2a3a",
                    color: "#60a5fa",
                    padding: "7px 10px",
                    border: "1px solid #60a5fa40",
                    fontWeight: 700,
                    fontSize: "0.72rem",
                  }}
                >
                  LIST II{list2Header !== "List II" ? ` (${list2Header})` : ""}
                </td>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }).map((_, i) => (
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
                      {list1Items[i]?.label}
                    </span>
                    {list1Items[i]?.text}
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
                      {list2Items[i]?.label}
                    </span>
                    {list2Items[i]?.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {questionText && (
            <div
              style={{
                fontSize: "0.85rem",
                color: "#bbb",
                fontStyle: "italic",
              }}
            >
              {questionText}
            </div>
          )}
        </div>
      );
    }
  }

  // Case 3: Statement-based or plain question — render as-is
  const formatQuestion = (text) => {
    return text
      .replace(/(Consider the following statements?:?\s*)/gi, "$1\n")
      .replace(/(Statement\s+I{1,3}:)/gi, "\n$1")
      .replace(/(\d+\.\s)/g, "\n\n$1")
      .replace(
        /(Which of the statements?|How many of the above|Which one of the following)/gi,
        "\n$1"
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };
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
function QuizScreen({ exam, onBack, API_URL }) {
  const [screen, setScreen] = useState("setup");
  const [topic, setTopic] = useState("");
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

  const startQuiz = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }
    setError("");
    setScreen("loading");
    try {
      const res = await fetch(`${API_URL}/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, exam, count }),
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
      setError("Failed to generate quiz. Try again.");
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
          userId: USER_ID,
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
      const res = await fetch(`${API_URL}/quiz/history/${USER_ID}`);
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
        height: "100dvh",
        background: "#212121",
        color: "#ececec",
        fontFamily: "'Figtree', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid #2a2a2a",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: "#888",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: "0.85rem",
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
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>{" "}
          Back
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
            Quiz Mode
          </div>
          <div style={{ fontSize: "0.72rem", color: "#666" }}>{exam}</div>
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
              gap: 20,
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
                placeholder="e.g. Photosynthesis, Indian History..."
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
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>{" "}
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
            <div style={{ color: "#888", fontSize: "0.9rem" }}>
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
                  animation: "fadeIn 0.2s ease",
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
                  animation: "fadeIn 0.2s ease",
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
            {answers.some((a) => a.selected !== a.correct) && (
              <div
                style={{
                  background: "#2a2a2a",
                  borderRadius: 14,
                  padding: 16,
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontSize: "0.82rem",
                    color: "#f59e0b",
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  📋 Review Wrong Answers
                </div>
                {answers.map(
                  (a, i) =>
                    a.selected !== a.correct && (
                      <div
                        key={i}
                        style={{
                          marginBottom: 12,
                          paddingBottom: 12,
                          borderBottom: "1px solid #333",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.82rem",
                            color: "#ddd",
                            marginBottom: 4,
                          }}
                        >
                          Q{i + 1}:{" "}
                          <SmartQuestionDisplay
                            question={questions[i]?.question || ""}
                          />
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#e53e3e" }}>
                          ✗ You:{" "}
                          {questions[i]?.options[a.selected]?.replace(
                            /^[A-D]\)\s*/,
                            ""
                          )}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#10a37f" }}>
                          ✓ Correct:{" "}
                          {questions[i]?.options[a.correct]?.replace(
                            /^[A-D]\)\s*/,
                            ""
                          )}
                        </div>
                      </div>
                    )
                )}
              </div>
            )}
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
function PlannerScreen({ exam, onBack, API_URL }) {
  const [screen, setScreen] = useState("setup"); // setup | loading | view | list
  const [examDate, setExamDate] = useState("");
  const [topics, setTopics] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(4);
  const [plan, setPlan] = useState(null);
  const [savedPlans, setSavedPlans] = useState([]);
  const [viewMode, setViewMode] = useState("list"); // list | week
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
        height: "100dvh",
        background: "#212121",
        color: "#ececec",
        fontFamily: "'Figtree', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid #2a2a2a",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: "#888",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: "0.85rem",
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
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>{" "}
          Back
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
            Study Planner
          </div>
          <div style={{ fontSize: "0.72rem", color: "#666" }}>{exam}</div>
        </div>
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
        {/* SETUP */}
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
                <span style={{ color: "#555" }}>
                  (optional — leave blank for full syllabus)
                </span>
              </label>
              <textarea
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="e.g. Indian History, Polity, Geography, Economics..."
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
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Generate My Plan
            </button>
          </div>
        )}

        {/* LOADING */}
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

        {/* VIEW PLAN */}
        {screen === "view" && plan && (
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            {/* Plan header */}
            <div
              style={{
                background: "linear-gradient(135deg, #10a37f20, #0d8a6a10)",
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
              {/* Progress bar */}
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
                    background: "linear-gradient(90deg, #10a37f, #0d8a6a)",
                    width: `${progressPct}%`,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.72rem", color: "#666", marginTop: 4 }}>
                {progressPct}% complete
              </div>
            </div>

            {/* View mode toggle */}
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

            {/* DAY LIST VIEW */}
            {viewMode === "list" && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {plan.days.map((day, i) => {
                  const isToday = day.date === today;
                  const isPast = day.date < today;
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
                        transition: "all 0.2s",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                        }}
                      >
                        {/* Checkbox */}
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
                          {/* Topics */}
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
                          {/* Details */}
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
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
                    </div>
                  );
                })}
              </div>
            )}

            {/* WEEKLY VIEW */}
            {viewMode === "week" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                  }}
                >
                  <button
                    onClick={() => setCurrentWeek((w) => Math.max(0, w - 1))}
                    disabled={currentWeek === 0}
                    style={{
                      background: "#2a2a2a",
                      border: "1px solid #3a3a3a",
                      borderRadius: 8,
                      padding: "6px 12px",
                      color: currentWeek === 0 ? "#444" : "#ddd",
                      cursor: currentWeek === 0 ? "not-allowed" : "pointer",
                      fontSize: "0.82rem",
                    }}
                  >
                    ← Prev
                  </button>
                  <span
                    style={{
                      fontSize: "0.85rem",
                      color: "#ddd",
                      fontWeight: 600,
                    }}
                  >
                    Week {currentWeek + 1} of {totalWeeks}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentWeek((w) => Math.min(totalWeeks - 1, w + 1))
                    }
                    disabled={currentWeek === totalWeeks - 1}
                    style={{
                      background: "#2a2a2a",
                      border: "1px solid #3a3a3a",
                      borderRadius: 8,
                      padding: "6px 12px",
                      color: currentWeek === totalWeeks - 1 ? "#444" : "#ddd",
                      cursor:
                        currentWeek === totalWeeks - 1
                          ? "not-allowed"
                          : "pointer",
                      fontSize: "0.82rem",
                    }}
                  >
                    Next →
                  </button>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: 6,
                  }}
                >
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (d) => (
                      <div
                        key={d}
                        style={{
                          textAlign: "center",
                          fontSize: "0.65rem",
                          color: "#555",
                          paddingBottom: 6,
                          fontWeight: 600,
                        }}
                      >
                        {d}
                      </div>
                    )
                  )}
                  {daysInWeek.map((day, i) => {
                    const isToday = day.date === today;
                    return (
                      <div
                        key={i}
                        onClick={() => toggleDay(plan.days.indexOf(day))}
                        style={{
                          background: day.completed
                            ? "#10a37f20"
                            : isToday
                            ? "#f59e0b15"
                            : "#2a2a2a",
                          border: `1px solid ${
                            day.completed
                              ? "#10a37f50"
                              : isToday
                              ? "#f59e0b50"
                              : "#333"
                          }`,
                          borderRadius: 10,
                          padding: "10px 6px",
                          textAlign: "center",
                          cursor: "pointer",
                          minHeight: 80,
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: "#666",
                            marginBottom: 4,
                          }}
                        >
                          Day {day.day}
                        </div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: day.completed ? "#10a37f" : "#ddd",
                            fontWeight: 600,
                            lineHeight: 1.3,
                          }}
                        >
                          {day.focus?.slice(0, 20)}
                          {day.focus?.length > 20 ? "..." : ""}
                        </div>
                        {day.completed && (
                          <div style={{ fontSize: 14, marginTop: 4 }}>✅</div>
                        )}
                        {isToday && !day.completed && (
                          <div
                            style={{
                              fontSize: "0.6rem",
                              color: "#f59e0b",
                              marginTop: 4,
                              fontWeight: 700,
                            }}
                          >
                            TODAY
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
              <button
                onClick={() => setScreen("setup")}
                style={{
                  flex: 1,
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

        {/* SAVED PLANS LIST */}
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
                No saved plans yet. Create your first plan!
              </div>
            ) : (
              savedPlans.map((p) => {
                const completed =
                  p.days?.filter((d) => d.completed).length || 0;
                const total = p.days?.length || 0;
                const pct = total ? Math.round((completed / total) * 100) : 0;
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

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("chat"); // chat | quiz | planner
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [exam, setExam] = useState("General");
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

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const voiceRef = useRef(voice);
  const messagesRef = useRef(messages);
  const currentChatIdRef = useRef(currentChatId);
  const API_URL = import.meta.env.VITE_API_URL;

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
      setExam(data.exam || "General");
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

  const handleFileUpload = async (file) => {
    if (!file || loading) return;
    setLoading(true);
    const isPdf = file.type === "application/pdf";
    setMessages((p) => [
      ...p,
      { role: "user", content: isPdf ? "📄 PDF sent" : "📷 Image sent" },
      { role: "assistant", content: "" },
    ]);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("exam", exam);
      const res = await fetch(`${API_URL}/image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      const answer =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer.trim()
          : "⚠️ Could not process file.";
      typeText(answer, setMessages, () => setLoading(false));
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
  const GLOBAL_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body { overflow: hidden; overscroll-behavior: none; background: #212121; }
    textarea, input { font-family: 'Figtree', system-ui, sans-serif !important; }
    textarea { font-size: 16px !important; }
    .msg-content p { margin-bottom: 10px; line-height: 1.75; } .msg-content p:last-child { margin-bottom: 0; }
    .msg-content ul, .msg-content ol { padding-left: 20px; margin: 8px 0; } .msg-content li { margin-bottom: 6px; line-height: 1.7; }
    .msg-content strong { font-weight: 600; color: #fff; } .msg-content em { color: #ccc; }
    .msg-content code { background: #343434; padding: 2px 6px; border-radius: 4px; font-size: 0.84em; color: #e0e0e0; }
    .msg-content pre { background: #1a1a1a; padding: 14px; border-radius: 8px; overflow-x: auto; margin: 10px 0; border: 1px solid #333; }
    .msg-content h1,.msg-content h2,.msg-content h3 { margin: 14px 0 6px; color: #fff; font-weight: 600; }
    .msg-content blockquote { border-left: 3px solid #10a37f; padding-left: 12px; color: #aaa; margin: 8px 0; }
    .msg-content table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 0.85rem; }
    .msg-content th { background: #2a2a2a; color: #fff; padding: 8px 12px; text-align: left; border: 1px solid #3a3a3a; }
    .msg-content td { padding: 7px 12px; border: 1px solid #2a2a2a; color: #ddd; }
    .msg-content tr:nth-child(even) td { background: #1e1e1e; }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 4px; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes dotPulse { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
    @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    .dot1 { animation: dotPulse 1s ease-in-out infinite; } .dot2 { animation: dotPulse 1s ease-in-out 0.15s infinite; } .dot3 { animation: dotPulse 1s ease-in-out 0.3s infinite; }
    .suggestion-btn:active { background: #343434 !important; } .exam-opt:active { background: #3a3a3a !important; }
    .send-btn:active { transform: scale(0.9); } .img-btn:active { opacity: 0.5; }
    .attach-opt:hover { background: #333 !important; } .attach-opt:active { background: #3a3a3a !important; }
    .mic-btn-active { animation: pulse 0.8s ease-in-out infinite; }
    .chat-item:hover { background: #2a2a2a !important; } .chat-item:hover .delete-btn { opacity: 1 !important; }
    select option { background: #2a2a2a; color: #ececec; }
  `;

  if (screen === "quiz")
    return (
      <div style={{ fontFamily: "'Figtree', sans-serif" }}>
        <style>{GLOBAL_STYLES}</style>
        <QuizScreen
          exam={exam}
          onBack={() => setScreen("chat")}
          API_URL={API_URL}
        />
      </div>
    );
  if (screen === "planner")
    return (
      <div style={{ fontFamily: "'Figtree', sans-serif" }}>
        <style>{GLOBAL_STYLES}</style>
        <PlannerScreen
          exam={exam}
          onBack={() => setScreen("chat")}
          API_URL={API_URL}
        />
      </div>
    );

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "row",
        background: "#212121",
        color: "#ececec",
        fontFamily: "'Figtree', system-ui, sans-serif",
      }}
      onClick={() => {
        setShowExamMenu(false);
        setShowAttachMenu(false);
      }}
    >
      <style>{GLOBAL_STYLES}</style>

      {/* SIDEBAR */}
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
      <div
        style={{
          width: showSidebar ? 260 : 0,
          minWidth: showSidebar ? 260 : 0,
          height: "100dvh",
          background: "#171717",
          borderRight: "1px solid #2a2a2a",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.25s ease, min-width 0.25s ease",
          flexShrink: 0,
          zIndex: 50,
          position: "fixed",
          top: 0,
          left: 0,
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
                background: "linear-gradient(135deg, #10a37f, #0d8a6a)",
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

        {/* Feature buttons in sidebar */}
        <div
          style={{
            padding: "8px 10px 0",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <button
            onClick={() => {
              setScreen("quiz");
              setShowSidebar(false);
            }}
            style={{
              padding: "9px 14px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 9,
              color: "#f59e0b",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              textAlign: "left",
            }}
          >
            🧠 Quiz Mode
          </button>
          <button
            onClick={() => {
              setScreen("planner");
              setShowSidebar(false);
            }}
            style={{
              padding: "9px 14px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 9,
              color: "#a78bfa",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              textAlign: "left",
            }}
          >
            📅 Study Planner
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
                className="chat-item"
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
                  transition: "background 0.15s",
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
                  className="delete-btn"
                  onClick={(e) => deleteChat(chat._id, e)}
                  style={{
                    opacity: 0,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "#666",
                    padding: 3,
                    borderRadius: 4,
                    transition: "opacity 0.15s",
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
      </div>

      {/* MAIN CHAT */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100dvh",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
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
            minHeight: 52,
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
                  background: "linear-gradient(135deg, #10a37f, #0d8a6a)",
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
                textTransform: "capitalize",
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
                    borderRadius: 10,
                    padding: 4,
                    zIndex: 100,
                    minWidth: 110,
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
                        borderRadius: 7,
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
                    background: "linear-gradient(135deg, #10a37f, #0d8a6a)",
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
                      borderRadius: 10,
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setScreen("quiz")}
                    style={{
                      flex: 1,
                      background: "#f59e0b15",
                      border: "1px solid #f59e0b30",
                      borderRadius: 10,
                      padding: "11px 14px",
                      color: "#f59e0b",
                      fontSize: "0.85rem",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "'Figtree', sans-serif",
                      fontWeight: 500,
                    }}
                  >
                    🧠 Take a Quiz
                  </button>
                  <button
                    onClick={() => setScreen("planner")}
                    style={{
                      flex: 1,
                      background: "#a78bfa15",
                      border: "1px solid #a78bfa30",
                      borderRadius: 10,
                      padding: "11px 14px",
                      color: "#a78bfa",
                      fontSize: "0.85rem",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "'Figtree', sans-serif",
                      fontWeight: 500,
                    }}
                  >
                    📅 Study Plan
                  </button>
                </div>
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
                          background:
                            "linear-gradient(135deg, #10a37f, #0d8a6a)",
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

        {/* INPUT */}
        <div
          style={{
            flexShrink: 0,
            padding: "8px 12px",
            paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
            background: "#212121",
            borderTop: isEmpty ? "none" : "1px solid #2a2a2a",
          }}
        >
          {isListening && (
            <div
              style={{
                textAlign: "center",
                marginBottom: 6,
                fontSize: "0.75rem",
                color: "#10a37f",
                animation: "fadeIn 0.2s ease",
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
              className="img-btn"
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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
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
              className={isListening ? "mic-btn-active" : ""}
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
                transition: "all 0.15s",
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
              }}
            />
            <button
              className="send-btn"
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
            Hold mic to speak • ExamAI can make mistakes. Verify important info.
          </div>
        </div>
      </div>

      {/* BOTTOM SHEET */}
      {showAttachMenu && (
        <div
          onClick={() => setShowAttachMenu(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.5)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background: "#2a2a2a",
              borderRadius: "18px 18px 0 0",
              padding: "12px 0 calc(20px + env(safe-area-inset-bottom))",
              animation: "slideUp 0.2s ease",
            }}
          >
            <div
              style={{
                width: 36,
                height: 4,
                background: "#444",
                borderRadius: 2,
                margin: "0 auto 16px",
              }}
            />
            {[
              {
                label: "Take a Photo",
                ref: cameraInputRef,
                icon: (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ececec"
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
                label: "Choose from Gallery",
                ref: fileInputRef,
                icon: (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ececec"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                ),
              },
              {
                label: "Upload PDF",
                ref: pdfInputRef,
                icon: (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ececec"
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
            ].map(({ label, ref, icon }) => (
              <button
                key={label}
                className="attach-opt"
                onClick={() => {
                  ref.current.click();
                  setShowAttachMenu(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  width: "100%",
                  padding: "14px 24px",
                  background: "transparent",
                  border: "none",
                  color: "#ececec",
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "'Figtree', sans-serif",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "#3a3a3a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {icon}
                </div>
                {label}
              </button>
            ))}
          </div>
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
            animation: "toastIn 0.2s ease",
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
