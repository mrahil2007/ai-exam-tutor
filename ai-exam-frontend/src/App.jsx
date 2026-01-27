import { useState, useEffect, useRef } from "react";
import "./App.css";

/* 🔥 Line-by-line typing effect */
const typeText = (text, setMessages) => {
  let index = 0;
  const lines = text.split("\n");

  const interval = setInterval(() => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];

      if (!last || last.role !== "assistant") return prev;

      last.content += lines[index] + "\n";
      return [...updated];
    });

    index++;
    if (index >= lines.length) clearInterval(interval);
  }, 150); // typing speed (ms)
};

function App() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi 👋 I’m your AI Exam Helper. Ask me anything!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [exam, setExam] = useState("General");

  const messagesEndRef = useRef(null);

  /* 🔥 Auto-scroll */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userText = input;
    setInput("");
    setLoading(true);

    // add user message
    setMessages((prev) => [...prev, { role: "user", content: userText }]);

    // add EMPTY assistant message (for typing)
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userText,
          exam: exam,
        }),
      });

      const data = await res.json();

      const answer =
        data?.answer || "⚠️ No response from AI. Please try again.";

      // 🔥 typing effect instead of instant render
      typeText(answer, setMessages);
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content:
            "⚠️ Server is waking up (free hosting). Please try again in a few seconds.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`chat-container ${darkMode ? "dark" : "light"}`}>
      {/* HEADER */}
      <div className="chat-header">
        <span>🎓 AI Exam Tutor</span>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <select
            className="exam-select"
            value={exam}
            onChange={(e) => setExam(e.target.value)}
          >
            <option>General</option>
            <option>UPSC</option>
            <option>JEE</option>
            <option>NEET</option>
            <option>SSC</option>
            <option>Banking</option>
            <option>GATE</option>
            <option>CAT</option>
          </select>

          <button
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? "🌞" : "🌙"}
          </button>
        </div>
      </div>

      {/* CHAT MESSAGES */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* FOOTER */}
      <footer className="chat-footer">
        <span>
          ⚡ Powered by AI • 📧 Contact:{" "}
          <a href="mailto:mrahil2007@gmail.com">mrahil2007@gmail.com</a>
        </span>
      </footer>

      {/* INPUT */}
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask your ${exam} question...`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <button onClick={sendMessage} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
}

export default App;
