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

// ✅ Generate or load anonymous userId from localStorage
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

export default function App() {
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

  // ✅ Chat history state
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

  // ✅ Load chat list on mount
  useEffect(() => {
    loadChatList();
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ✅ Load sidebar chat list
  const loadChatList = async () => {
    setLoadingChats(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/chats/${USER_ID}`
      );
      const data = await res.json();
      setChatList(data);
    } catch (err) {
      console.error("Failed to load chats:", err);
    } finally {
      setLoadingChats(false);
    }
  };

  // ✅ Create a new chat session
  const createNewChat = async (examType = exam) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/chats/${USER_ID}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exam: examType }),
        }
      );
      const data = await res.json();
      setCurrentChatId(data._id || data.chatId);
      setMessages([]);
      setInput("");
      setShowSidebar(false);
      await loadChatList();
      return data._id || data.chatId;
    } catch (err) {
      console.error("Failed to create chat:", err);
      return null;
    }
  };

  // ✅ Load an existing chat
  const loadChat = async (chatId) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/chats/${USER_ID}/${chatId}`
      );
      const data = await res.json();
      setCurrentChatId(chatId);
      setMessages(data.messages || []);
      setExam(data.exam || "General");
      setShowSidebar(false);
    } catch (err) {
      console.error("Failed to load chat:", err);
      showToast("⚠️ Failed to load chat.");
    }
  };

  // ✅ Delete a chat
  const deleteChat = async (chatId, e) => {
    e.stopPropagation();
    try {
      await fetch(
        `${import.meta.env.VITE_API_URL}/chats/${USER_ID}/${chatId}`,
        {
          method: "DELETE",
        }
      );
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setMessages([]);
      }
      await loadChatList();
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  };

  const buildHistory = (currentMessages) => {
    return currentMessages
      .filter((m) => m.content && m.content.trim())
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
  };

  const sendMessageWithText = async (text, withVoice = false) => {
    if (!text.trim() || loading) return;
    setInput("");
    setLoading(true);

    // ✅ Create new chat if none exists
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          exam,
          history,
          userId: USER_ID, // ✅ send userId
          chatId: activeChatId, // ✅ send chatId
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
        // ✅ Refresh sidebar to update title
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/image`, {
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
        const res = await fetch(`${import.meta.env.VITE_API_URL}/speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk, voice: voiceRef.current }),
        });
        if (!res.ok) {
          setIsSpeaking(false);
          return;
        }
        const audioBlob = await res.blob();
        const audio = new Audio(URL.createObjectURL(audioBlob));
        audioRef.current = audio;
        await new Promise((resolve) => {
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play();
        });
      }
    } catch (err) {
      console.error("TTS error:", err);
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
        const permissionStatus = await navigator.permissions.query({
          name: "microphone",
        });
        if (permissionStatus.state === "denied") {
          showToast("🎤 Mic blocked. Allow it in browser/app settings.");
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
        : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
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
        const blob = new Blob(chunks, { type: actualType });
        const formData = new FormData();
        formData.append("audio", blob, `audio.${ext}`);
        try {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL}/transcribe`,
            { method: "POST", body: formData }
          );
          const data = await res.json();
          const transcript = data.text?.trim();
          if (transcript) {
            setInput(transcript);
            setTimeout(() => sendMessageWithText(transcript, true), 300);
          }
        } catch (err) {
          console.error("Transcription error:", err);
          showToast("⚠️ Transcription failed. Please try again.");
        } finally {
          setIsListening(false);
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch (err) {
      setIsListening(false);
      showToast("🎤 Mic access denied. Allow it in browser/app settings.");
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

  const isEmpty = messages.length === 0;

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "row",
        background: "#212121",
        color: "#ececec",
        fontFamily: "'Figtree', system-ui, -apple-system, sans-serif",
      }}
      onClick={() => {
        setShowExamMenu(false);
        setShowAttachMenu(false);
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        html, body { overflow: hidden; overscroll-behavior: none; background: #212121; }
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
        .msg-content table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 0.85rem; }
        .msg-content th { background: #2a2a2a; color: #fff; padding: 8px 12px; text-align: left; border: 1px solid #3a3a3a; }
        .msg-content td { padding: 7px 12px; border: 1px solid #2a2a2a; color: #ddd; }
        .msg-content tr:nth-child(even) td { background: #1e1e1e; }
        ::-webkit-scrollbar { width: 4px; height: 0; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 4px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dotPulse { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .dot1 { animation: dotPulse 1s ease-in-out infinite; }
        .dot2 { animation: dotPulse 1s ease-in-out 0.15s infinite; }
        .dot3 { animation: dotPulse 1s ease-in-out 0.3s infinite; }
        .suggestion-btn:active { background: #343434 !important; }
        .exam-opt:active { background: #3a3a3a !important; }
        .send-btn:active { transform: scale(0.9); }
        .img-btn:active { opacity: 0.5; }
        .attach-opt:hover { background: #333 !important; }
        .attach-opt:active { background: #3a3a3a !important; }
        .mic-btn-active { animation: pulse 0.8s ease-in-out infinite; }
        .chat-item:hover { background: #2a2a2a !important; }
        .chat-item:hover .delete-btn { opacity: 1 !important; }
        .new-chat-btn:hover { background: #1a8a6a !important; }
        select option { background: #2a2a2a; color: #ececec; }
      `}</style>

      {/* ── SIDEBAR ── */}
      <>
        {/* Overlay for mobile */}
        {showSidebar && (
          <div
            onClick={() => setShowSidebar(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 49,
              display: window.innerWidth < 768 ? "block" : "none",
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
            position: window.innerWidth < 768 ? "fixed" : "relative",
            top: 0,
            left: 0,
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          {/* Sidebar Header */}
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
              className="new-chat-btn"
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
                transition: "background 0.15s",
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
              </svg>
              New Chat
            </button>
          </div>

          {/* Chat List */}
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
                      style={{
                        fontSize: "0.7rem",
                        color: "#555",
                        marginTop: 2,
                      }}
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
      </>

      {/* ── MAIN CHAT AREA ── */}
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* ✅ Sidebar toggle button */}
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
            style={{ display: "flex", alignItems: "center", gap: 8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              style={{
                background: "#2a2a2a",
                border: "1px solid #3a3a3a",
                borderRadius: 8,
                padding: "6px 11px",
                color: "#ececec",
                fontSize: "0.82rem",
                fontWeight: 500,
                cursor: "pointer",
                textTransform: "capitalize",
                outline: "none",
              }}
            >
              {VOICES.map((v) => (
                <option
                  key={v}
                  value={v}
                  style={{ textTransform: "capitalize" }}
                >
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
                  gap: 5,
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 8,
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
            {/* Attach */}
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

            {/* Mic */}
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

            {/* Stop voice */}
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
                  transition: "all 0.15s",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            )}

            {/* Textarea */}
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

            {/* Send */}
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

      {/* ── BOTTOM SHEET ── */}
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

      {/* ── TOAST ── */}
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
