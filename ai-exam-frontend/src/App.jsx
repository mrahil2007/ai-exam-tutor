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

  try {
    recognition.start();
  } catch (e) {
    console.error("Speech recognition already started or blocked", e);
  }

  recognition.onresult = (event) => {
    setInput(event.results[0][0].transcript);
  };

  recognition.onerror = (event) => {
    console.error("Speech Error:", event.error);
    recognition.stop();
  };
};

/* 🔊 Text → Speech */
const speakText = (text, voiceEnabledRef) => {
  if (!voiceEnabledRef.current || !text) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  window.speechSynthesis.speak(utterance);
};

/* 🔤 Word-by-word typing */
const typeText = (text, setMessages, onDone, voiceEnabledRef) => {
  if (!text) {
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
  }, 50); // Slightly faster typing for better UX
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
  const [exam, setExam] = useState("General");
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const voiceEnabledRef = useRef(voiceEnabled);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Debug: Check if API URL is loaded
  useEffect(() => {
    console.log("API Configured at:", import.meta.env.VITE_API_URL);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    window.speechSynthesis.cancel();
    setLoading(true);

    const userText = input;
    setInput("");

    setMessages((prev) => [
      ...prev,
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
      const answer = data?.answer?.trim() || "⚠️ No response from AI.";

      typeText(answer, setMessages, () => setLoading(false), voiceEnabledRef);
    } catch (err) {
      console.error("Fetch error:", err);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: "⚠️ Connection error. Please check your internet.",
        },
      ]);
      setLoading(false);
    }
  };

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
      const answer = data?.answer?.trim() || "⚠️ Could not read image.";

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
    <div className="chat-container">
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
          </select>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
            {loading &&
            i === messages.length - 1 &&
            msg.role === "assistant" &&
            !msg.content
              ? "..."
              : ""}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <button
          type="button"
          className="image-upload"
          onClick={() => document.getElementById("imageInput").click()}
          disabled={loading}
        >
          📷
        </button>
        <input
          id="imageInput"
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleImageUpload(e.target.files[0])}
        />

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask ${exam} question...`}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />

        <button
          type="button"
          className="mic-btn"
          onClick={() => startListening(setInput)}
          disabled={loading}
        >
          🎤
        </button>

        <button
          type="button"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

export default App;
