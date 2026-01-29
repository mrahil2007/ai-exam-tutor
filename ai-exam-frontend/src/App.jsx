import { useState, useEffect, useRef } from "react";
import "./App.css";

/* 🎙 Speech → Text */
const startListening = (setInput) => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Speech recognition not supported in this browser.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.start();

  recognition.onresult = (event) => {
    setInput(event.results[0][0].transcript);
  };

  recognition.onerror = () => recognition.stop();
};

/* 🔊 Text → Speech */
const speakText = (text, voiceEnabledRef) => {
  if (!voiceEnabledRef.current) return;
  if (!text || typeof text !== "string") return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  utterance.rate = 1;
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);
};

/* 🔤 Word-by-word typing */
const typeText = (text, setMessages, onDone, voiceEnabledRef) => {
  if (!text || typeof text !== "string") {
    onDone?.();
    return;
  }

  const words = text.split(" ");
  let index = 0;

  const interval = setInterval(() => {
    setMessages((prev) => {
      const updated = [...prev];
      const lastIndex = updated.length - 1;

      if (lastIndex < 0 || updated[lastIndex].role !== "assistant") {
        clearInterval(interval);
        onDone?.();
        return prev;
      }

      updated[lastIndex] = {
        ...updated[lastIndex],
        content: words.slice(0, index + 1).join(" "),
      };

      return updated;
    });

    index++;

    if (index >= words.length) {
      clearInterval(interval);
      speakText(text, voiceEnabledRef);
      onDone?.();
    }
  }, 70);
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
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const voiceEnabledRef = useRef(voiceEnabled);
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  const messagesEndRef = useRef(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* 💬 Send text question */
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    window.speechSynthesis.cancel();
    setLoading(true);

    const userText = input;
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

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
          : "⚠️ No response from AI.";

      typeText(answer, setMessages, () => setLoading(false), voiceEnabledRef);
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "⚠️ Server is waking up. Please wait." },
      ]);
      setLoading(false);
    }
  };

  /* 🖼 Image upload + OCR */
  const handleImageUpload = async (file) => {
    if (!file || loading) return;

    window.speechSynthesis.cancel();
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "🖼 Reading image…" },
    ]);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("exam", exam);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/image`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      const answer =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer.trim()
          : "⚠️ Could not read image.";

      // replace placeholder with empty assistant
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "" },
      ]);

      typeText(answer, setMessages, () => setLoading(false), voiceEnabledRef);
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "❌ Image processing failed." },
      ]);
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
            onClick={() => {
              setVoiceEnabled((prev) => {
                if (prev) window.speechSynthesis.cancel();
                return !prev;
              });
            }}
            title="Toggle voice output"
          >
            {voiceEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {/* CHAT */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
            {loading && i === messages.length - 1 && msg.role === "assistant"
              ? " ▍"
              : ""}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

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

        <label className="image-upload">
          📷
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleImageUpload(e.target.files[0])}
            hidden
          />
        </label>

        <button onClick={() => startListening(setInput)} disabled={loading}>
          🎤
        </button>

        <button onClick={sendMessage} disabled={loading}>
          {loading ? "Thinking…" : "Send"}
        </button>
      </div>
    </div>
  );
}

export default App;
