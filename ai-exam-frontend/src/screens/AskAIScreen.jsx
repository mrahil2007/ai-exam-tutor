import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { G, EXAMS, EXAM_META, VOICES } from "../theme";

// ── Helpers ───────────────────────────────────────────────────────────────────
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

const isImageVerb = (t = "") => {
  const s = t.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return false;
  if (["generate", "create", "draw", "make", "imagine"].includes(s))
    return true;
  return /^gen[a-z]{0,8}rate$/.test(s);
};

const extractImagePrompt = (text = "") => {
  const v = text.trim();
  if (!v) return null;
  const s = v.match(/^\/(?:image|img|imagine)\s+(.+)$/i);
  if (s?.[1]?.trim()) return s[1].trim();
  const c = v.match(
    /^(?:please\s+)?(?:(?:create|generate|draw|make|imagine)\s+)+(?:an?\s+)?image(?:\s+(?:of|for))?\s*[:,-]?\s*(.+)$/i
  );
  if (c?.[1]?.trim()) return c[1].trim();
  const p = v.match(
    /^(?:can|could|would)\s+you\s+(?:(?:create|generate|draw|make|imagine)\s+)+(?:an?\s+)?image(?:\s+(?:of|for))?\s*[:,-]?\s*(.+)$/i
  );
  if (p?.[1]?.trim()) return p[1].trim();
  const m = v.match(/\bimage\b\s*(?:of|for)?\s*[:,-]?\s*(.+)$/i);
  if (m?.[1]?.trim()) {
    const before = v.slice(0, m.index || 0).trim();
    if (before.split(/\s+/).filter(Boolean).some(isImageVerb))
      return m[1].trim();
  }
  return null;
};

const isImageEditIntent = (text = "") => {
  const v = text.trim().toLowerCase();
  if (!v || /\?$/.test(v) || /^(what|which|who|where|when|why|how)\b/.test(v))
    return false;
  return /\b(edit|change|modify|make|turn|replace|remove|add|swap|recolor|color|colour|background|retouch|enhance|transform|convert)\b/.test(
    v
  );
};

const resolvePollinationsUrl = async (prompt, apiUrl) => {
  const empty = { url: null };
  if (!apiUrl) return empty;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(`${apiUrl}/image/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    clearTimeout(t);
    const data = await res.json().catch(() => null);
    if (!res.ok) return empty;
    const imageUrl =
      typeof data?.imageUrl === "string" && data.imageUrl.trim()
        ? data.imageUrl.trim()
        : null;
    return { url: imageUrl };
  } catch {
    return empty;
  }
};

const markdownUrlTransform = (url) => {
  if (typeof url !== "string") return "";
  const v = url.trim();
  if (!v) return "";
  if (
    /^data:image\/[a-z0-9.+-]+;base64,/i.test(v) ||
    /^(https?:|mailto:|tel:)/i.test(v)
  )
    return v;
  return "";
};

// ── ImageComponent ─────────────────────────────────────────────────────────────
function ImageComponent({ src, alt, onRegenerate, onZoom }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const imgRef = useRef(null);
  const active = typeof src === "string" ? src.trim() : "";

  useEffect(() => {
    setLoading(true);
    setErr(false);
  }, [src]);
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0) {
      setLoading(false);
      return;
    }
    if (!loading || err) return;
    const t = setTimeout(() => {
      const c = imgRef.current;
      if (c && c.complete && c.naturalWidth > 0) setLoading(false);
      else {
        setLoading(false);
        setErr(true);
      }
    }, 45000);
    return () => clearTimeout(t);
  }, [loading, err, active]);

  const download = async () => {
    try {
      const r = await fetch(active);
      const b = await r.blob();
      const u = URL.createObjectURL(b);
      const l = document.createElement("a");
      l.href = u;
      l.download = `examai-${Date.now()}.png`;
      document.body.appendChild(l);
      l.click();
      document.body.removeChild(l);
      URL.revokeObjectURL(u);
    } catch {
      window.open(active, "_blank");
    }
  };

  return (
    <div style={{ margin: "10px 0", maxWidth: 340 }}>
      <div
        style={{
          position: "relative",
          minHeight: err ? 80 : 180,
          background: G.surface,
          borderRadius: 12,
          overflow: "hidden",
          border: `1px solid ${G.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && !err && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                border: `3px solid ${G.border2}`,
                borderTopColor: G.gold,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          </div>
        )}
        <img
          ref={imgRef}
          src={active}
          alt={alt}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setErr(true);
          }}
          onClick={() => onZoom?.(active)}
          style={{
            maxWidth: "100%",
            maxHeight: 320,
            display: loading ? "none" : "block",
            borderRadius: 12,
            objectFit: "contain",
            cursor: onZoom ? "zoom-in" : "default",
          }}
        />
        {err && (
          <div
            style={{ color: G.error, fontSize: "0.85rem", padding: "0 12px" }}
          >
            ⚠️ Failed to load image
          </div>
        )}
      </div>
      {!loading && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {[
            {
              icon: (
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              ),
              fn: download,
            },
            {
              icon: (
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
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                </svg>
              ),
              fn: () => onRegenerate?.(alt),
            },
          ].map(({ icon, fn }, i) => (
            <button
              key={i}
              onClick={fn}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: G.surface,
                border: `1px solid ${G.border2}`,
                color: G.text,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function AskAIScreen({
  exam,
  onChangeExam,
  API_URL,
  userId,
  anonId,
  initialPrompt,
  onPromptUsed,
}) {
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

  const msgEndRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const pdfRef = useRef(null);
  const audioRef = useRef(null);
  const mrRef = useRef(null);
  const voiceRef = useRef(voice);
  const msgsRef = useRef(messages);
  const chatIdRef = useRef(currentChatId);

  useEffect(() => {
    msgsRef.current = messages;
  }, [messages]);
  useEffect(() => {
    chatIdRef.current = currentChatId;
  }, [currentChatId]);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height =
        Math.min(taRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);
  useEffect(() => {
    loadChatList();
  }, []);

  // Auto-send initial prompt from Jobs tab
  useEffect(() => {
    if (!initialPrompt) return;
    setInput(initialPrompt);
    onPromptUsed?.();
    const t = setTimeout(() => sendMessageWithText(initialPrompt), 400);
    return () => clearTimeout(t);
  }, [initialPrompt]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadChatList = async () => {
    setLoadingChats(true);
    try {
      const effectiveId = userId || anonId;
      const r = await fetch(`${API_URL}/chats/${effectiveId}`);
      setChatList(await r.json());
    } catch {}
    setLoadingChats(false);
  };

  const createNewChat = async (ex = exam) => {
    try {
      const effectiveId = userId || anonId;
      const r = await fetch(`${API_URL}/chats/${effectiveId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam: ex }),
      });
      const d = await r.json();
      const id = d._id || d.chatId;
      setCurrentChatId(id);
      setMessages([]);
      setInput("");
      setShowSidebar(false);
      await loadChatList();
      return id;
    } catch {
      return null;
    }
  };

  const loadChat = async (id) => {
    try {
      const effectiveId = userId || anonId;
      const r = await fetch(`${API_URL}/chats/${effectiveId}/${id}`);
      const d = await r.json();
      setCurrentChatId(id);
      setMessages(d.messages || []);
      setShowSidebar(false);
    } catch {
      showToast("⚠️ Failed to load chat.");
    }
  };

  const deleteChat = async (id, e) => {
    e.stopPropagation();
    try {
      const effectiveId = userId || anonId;
      await fetch(`${API_URL}/chats/${effectiveId}/${id}`, {
        method: "DELETE",
      });
      if (currentChatId === id) {
        setCurrentChatId(null);
        setMessages([]);
      }
      await loadChatList();
    } catch {}
  };

  const buildHistory = (msgs) =>
    msgs
      .filter((m) => m.content?.trim())
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

  const sendMessageWithText = async (text) => {
    if (!text.trim() || loading) return;
    setInput("");
    setLoading(true);
    let cid = chatIdRef.current;
    if (!cid) {
      cid = await createNewChat(exam);
      if (!cid) {
        setLoading(false);
        return;
      }
    }
    const prev = msgsRef.current;
    setMessages((p) => [
      ...p,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);

    const imgPrompt = extractImagePrompt(text);
    if (imgPrompt) {
      const result = await resolvePollinationsUrl(imgPrompt, API_URL);
      setMessages((p) => {
        const u = [...p];
        u[u.length - 1] = result?.url
          ? {
              ...u[u.length - 1],
              content: `🖼️ ${imgPrompt}`,
              imageUrl: result.url,
              imagePrompt: imgPrompt,
            }
          : { ...u[u.length - 1], content: "⚠️ Could not generate image." };
        return u;
      });
      setLoading(false);
      return;
    }

    const hist = buildHistory([...prev, { role: "user", content: text }]);
    try {
      const r = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          exam,
          history: hist,
          userId,
          anonId,
          chatId: cid,
        }),
      });
      const d = await r.json();
      const ans =
        typeof d?.answer === "string" && d.answer.trim()
          ? d.answer.trim()
          : "⚠️ No response. Please try again.";
      typeText(ans, setMessages, () => {
        setLoading(false);
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

  const sendMessage = () => {
    if (!input.trim() || loading) return;
    sendMessageWithText(input.trim());
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
    const fn = (e) => {
      if (pendingFile || loading) return;
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            handleFileUpload(f);
            e.preventDefault();
            break;
          }
        }
      }
    };
    document.addEventListener("paste", fn);
    return () => document.removeEventListener("paste", fn);
  }, [handleFileUpload, pendingFile, loading]);

  const sendFileWithPrompt = async () => {
    if (!pendingFile || loading) return;
    const file = pendingFile,
      prompt = filePrompt.trim();
    const isPdf = file.type === "application/pdf";
    const imgUrl = isPdf ? null : URL.createObjectURL(file);
    setPendingFile(null);
    setFilePrompt("");
    setLoading(true);
    let cid = chatIdRef.current;
    if (!cid) {
      cid = await createNewChat(exam);
      if (!cid) {
        setLoading(false);
        return;
      }
    }
    setMessages((p) => [
      ...p,
      {
        role: "user",
        content: isPdf ? `📄 ${file.name}` : "",
        imageUrl: imgUrl,
        filePrompt: prompt || null,
      },
      { role: "assistant", content: "" },
    ]);
    try {
      if (!isPdf && prompt && isImageEditIntent(prompt)) {
        const fd = new FormData();
        fd.append("image", file);
        fd.append("prompt", prompt);
        fd.append("width", "1024");
        fd.append("height", "1024");
        const r = await fetch(`${API_URL}/image/edit`, {
          method: "POST",
          body: fd,
        });
        const d = await r.json().catch(() => null);
        setMessages((p) => {
          const u = [...p];
          u[u.length - 1] =
            r.ok && typeof d?.imageUrl === "string" && d.imageUrl
              ? {
                  ...u[u.length - 1],
                  content: `🖌️ ${prompt}`,
                  imageUrl: d.imageUrl,
                  imagePrompt: prompt,
                }
              : {
                  ...u[u.length - 1],
                  content: d?.error || "⚠️ Could not edit image.",
                };
          return u;
        });
        setLoading(false);
        loadChatList();
        return;
      }
      const fd = new FormData();
      fd.append("image", file);
      fd.append("exam", exam);
      fd.append("chatId", cid);
      if (prompt) fd.append("prompt", prompt);
      const r = await fetch(`${API_URL}/image`, { method: "POST", body: fd });
      const d = await r.json();
      const ans =
        typeof d?.answer === "string" && d.answer.trim()
          ? d.answer.trim()
          : "⚠️ Could not process file.";
      typeText(ans, setMessages, () => {
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
      setIsSpeaking(true);
      const chunks = text.match(/.{1,200}(?:\s|$)/g) || [text];
      for (const c of chunks) {
        const r = await fetch(`${API_URL}/speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: c, voice: voiceRef.current }),
        });
        if (!r.ok) {
          setIsSpeaking(false);
          return;
        }
        const audio = new Audio(URL.createObjectURL(await r.blob()));
        audioRef.current = audio;
        await new Promise((res) => {
          audio.onended = res;
          audio.onerror = res;
          audio.play();
        });
      }
    } catch {
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsListening(true);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : null;
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const actualType = mr.mimeType || mimeType || "audio/webm";
        const ext = actualType.includes("mp4")
          ? "mp4"
          : actualType.includes("ogg")
          ? "ogg"
          : "webm";
        const fd = new FormData();
        fd.append(
          "audio",
          new Blob(chunks, { type: actualType }),
          `audio.${ext}`
        );
        try {
          const r = await fetch(`${API_URL}/transcribe`, {
            method: "POST",
            body: fd,
          });
          const d = await r.json();
          const t = d.text?.trim();
          if (t) {
            setInput(t);
            setTimeout(() => sendMessageWithText(t), 300);
          }
        } catch {
          showToast("⚠️ Transcription failed.");
        } finally {
          setIsListening(false);
        }
      };
      mr.start();
      mrRef.current = mr;
    } catch {
      setIsListening(false);
      showToast("🎤 Mic access denied.");
    }
  };
  const stopListening = () => {
    if (mrRef.current && mrRef.current.state === "recording") {
      mrRef.current.stop();
      mrRef.current = null;
    }
  };

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }) => <div style={{ margin: "4px 0" }}>{children}</div>,
      img: ({ src, alt }) => (
        <ImageComponent
          src={src}
          alt={alt}
          onRegenerate={(p) => sendMessageWithText(`Generate image of ${p}`)}
          onZoom={setSelectedImage}
        />
      ),
    }),
    []
  );

  const formatDate = (d) => {
    const date = new Date(d),
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
      {/* Sidebar overlay */}
      {showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 49,
          }}
        />
      )}

      {/* ── SIDEBAR ── */}
      <div
        style={{
          width: showSidebar ? 260 : 0,
          minWidth: showSidebar ? 260 : 0,
          height: "100%",
          background: G.bg2,
          borderRight: `1px solid ${G.border2}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "all 0.25s ease",
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
            borderBottom: `1px solid ${G.border2}`,
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
                borderRadius: 8,
                background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}
            >
              🎓
            </div>
            <span
              style={{
                fontFamily: "'Playfair Display',serif",
                fontWeight: 700,
                fontSize: "1rem",
                color: G.text,
              }}
            >
              Exam<span style={{ color: G.gold }}>AI</span>
            </span>
          </div>
          <button
            onClick={() => createNewChat()}
            style={{
              width: "100%",
              padding: "9px 14px",
              background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
              border: "none",
              borderRadius: 9,
              color: "#000",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontFamily: "'Figtree',sans-serif",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#000"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Chat
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
          {loadingChats ? (
            <div
              style={{
                textAlign: "center",
                color: G.muted,
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
                color: G.muted,
                fontSize: "0.8rem",
                marginTop: 20,
                padding: "0 12px",
              }}
            >
              No chats yet.
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
                    currentChatId === chat._id ? G.surface : "transparent",
                  marginBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={G.muted}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
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
                      fontSize: "0.68rem",
                      color: G.muted,
                      marginTop: 2,
                    }}
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
                    color: G.muted,
                    padding: 3,
                    flexShrink: 0,
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
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
        <div
          style={{
            padding: "12px",
            borderTop: `1px solid ${G.border2}`,
            flexShrink: 0,
          }}
        >
          <a
            href="/delete-account"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: G.error,
              textDecoration: "none",
              fontSize: "0.82rem",
              padding: "8px 10px",
              borderRadius: 8,
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
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Delete Account
          </a>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: G.bg,
            borderBottom: `1px solid ${G.border2}`,
            flexShrink: 0,
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                color: G.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="17"
                height="17"
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
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}
            >
              🤖
            </div>
            <span
              style={{ fontWeight: 700, fontSize: "0.92rem", color: G.text }}
            >
              Ask AI
            </span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              style={{
                background: G.surface,
                border: `1px solid ${G.border2}`,
                borderRadius: 8,
                padding: "5px 7px",
                color: G.text,
                fontSize: "0.75rem",
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
                  background: G.surface,
                  border: `1px solid ${G.border2}`,
                  borderRadius: 8,
                  padding: "5px 9px",
                  color: G.text,
                  fontSize: "0.76rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  maxWidth: 110,
                  overflow: "hidden",
                  fontFamily: "'Figtree',sans-serif",
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
                <svg width="9" height="5" viewBox="0 0 10 6" fill="none">
                  <path
                    d="M1 1L5 5L9 1"
                    stroke={G.muted}
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
                    background: G.surface,
                    border: `1px solid ${G.border}`,
                    borderRadius: 10,
                    padding: 4,
                    zIndex: 100,
                    minWidth: 150,
                    maxHeight: 280,
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
                        background:
                          exam === e ? "rgba(240,165,0,0.1)" : "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: exam === e ? G.gold : "#ddd",
                        fontSize: "0.83rem",
                        fontWeight: exam === e ? 600 : 400,
                        fontFamily: "'Figtree',sans-serif",
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

        {/* Messages */}
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
                gap: 18,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    margin: "0 auto 12px",
                  }}
                >
                  🤖
                </div>
                <div
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    color: G.text,
                    marginBottom: 4,
                  }}
                >
                  What can I help with?
                </div>
                <div style={{ fontSize: "0.8rem", color: G.muted }}>
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
                  "📝 Key topics I should study for today",
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s.slice(3))}
                    style={{
                      background: G.surface,
                      border: `1px solid ${G.border2}`,
                      borderRadius: 10,
                      padding: "11px 14px",
                      color: "#ddd",
                      fontSize: "0.84rem",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "'Figtree',sans-serif",
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
                          background: G.surf2,
                          borderRadius: "14px 14px 3px 14px",
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
                          />
                        )}
                        {msg.filePrompt && (
                          <div
                            style={{
                              marginTop: msg.imageUrl ? 6 : 0,
                              padding: "4px 8px",
                              fontSize: "0.88rem",
                              color: G.text,
                              lineHeight: 1.5,
                            }}
                          >
                            {msg.filePrompt}
                          </div>
                        )}
                        {!msg.imageUrl && msg.content && (
                          <div
                            style={{
                              fontSize: "0.88rem",
                              lineHeight: 1.65,
                              color: G.text,
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
                        gap: 8,
                        padding: "6px 14px",
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 7,
                          flexShrink: 0,
                          background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          marginTop: 3,
                        }}
                      >
                        🤖
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
                            {["d1", "d2", "d3"].map((c) => (
                              <div
                                key={c}
                                className={c}
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: G.gold,
                                }}
                              />
                            ))}
                          </div>
                        ) : msg.imageUrl ? (
                          <ImageComponent
                            src={msg.imageUrl}
                            alt={msg.imagePrompt || ""}
                            onRegenerate={(p) =>
                              sendMessageWithText(
                                `Generate image of ${
                                  p || msg.imagePrompt || "a new scene"
                                }`
                              )
                            }
                            onZoom={setSelectedImage}
                          />
                        ) : (
                          <div
                            className="msg-content"
                            style={{
                              fontSize: "0.88rem",
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
                                    color: G.gold,
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
              <div ref={msgEndRef} style={{ height: 4 }} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div
          style={{
            flexShrink: 0,
            padding: "8px 12px 10px",
            background: G.bg,
            borderTop: isEmpty ? "none" : `1px solid ${G.border2}`,
          }}
        >
          {pendingFile && (
            <div
              style={{
                background: G.surface,
                border: `1px solid ${G.border}`,
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
                      fontSize: "0.78rem",
                      color: "#aaa",
                      maxWidth: 180,
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
                    color: G.muted,
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
                  background: G.bg2,
                  border: `1px solid ${G.border2}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  color: G.text,
                  fontSize: "0.86rem",
                  outline: "none",
                  resize: "none",
                  fontFamily: "'Figtree',sans-serif",
                  marginBottom: 8,
                }}
              />
              <button
                onClick={sendFileWithPrompt}
                style={{
                  width: "100%",
                  padding: "9px",
                  background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
                  border: "none",
                  borderRadius: 8,
                  color: "#000",
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'Figtree',sans-serif",
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
                fontSize: "0.72rem",
                color: G.gold,
              }}
            >
              🎤 Recording...
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              background: G.surface,
              border: `1px solid ${isListening ? G.gold : G.border2}`,
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
                width: 32,
                height: 32,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: G.muted,
                flexShrink: 0,
                marginBottom: 1,
                background: "transparent",
                border: "none",
              }}
            >
              <svg
                width="17"
                height="17"
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
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                handleFileUpload(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={camRef}
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
              ref={pdfRef}
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
                width: 32,
                height: 32,
                borderRadius: 8,
                background: isListening
                  ? `linear-gradient(135deg,${G.gold},${G.saffron})`
                  : "transparent",
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
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke={isListening ? "#000" : G.muted}
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
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: G.error,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginBottom: 1,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            )}
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "Listening..." : "Ask AI anything..."}
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
                color: G.text,
                lineHeight: 1.6,
                maxHeight: 160,
                minHeight: 26,
                paddingTop: 7,
                paddingBottom: 5,
                caretColor: G.gold,
                fontFamily: "'Figtree',sans-serif",
                fontSize: 16,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background:
                  loading || !input.trim()
                    ? G.surf2
                    : `linear-gradient(135deg,${G.gold},${G.saffron})`,
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
                    width: 13,
                    height: 13,
                    border: "2px solid rgba(0,0,0,0.3)",
                    borderTopColor: "#000",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={loading || !input.trim() ? "#555" : "#000"}
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
              marginTop: 5,
              fontSize: "0.62rem",
              color: "#333",
            }}
          >
            Hold mic to speak · ExamAI can make mistakes.
          </div>
        </div>
      </div>

      {/* ── ATTACH SHEET ── */}
      {showAttachMenu && (
        <>
          <style>{`@keyframes aBd{from{opacity:0}to{opacity:1}}@keyframes aSh{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
          <div
            onClick={() => setShowAttachMenu(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
              animation: "aBd 0.25s ease both",
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
              background: `linear-gradient(180deg,${G.bg2} 0%,${G.bg} 100%)`,
              borderRadius: "24px 24px 0 0",
              padding: `0 0 calc(24px + env(safe-area-inset-bottom))`,
              animation: "aSh 0.35s cubic-bezier(0.32,0.72,0,1) both",
              boxShadow: `0 -1px 0 ${G.border2},0 -20px 60px rgba(0,0,0,0.7)`,
            }}
          >
            <div style={{ padding: "12px 18px 16px" }}>
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.15)",
                  margin: "0 auto 16px",
                }}
              />
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: G.text,
                  letterSpacing: -0.3,
                  marginBottom: 4,
                }}
              >
                Add Attachment
              </div>
              <div style={{ fontSize: "0.7rem", color: G.muted }}>
                Photo, gallery image, or PDF document
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
                  bg: `linear-gradient(135deg,${G.saffron},#e53e3e)`,
                  ref: camRef,
                  icon: (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
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
                  ref: fileRef,
                  icon: (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
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
                  bg: `linear-gradient(135deg,${G.gold},${G.saffron})`,
                  ref: pdfRef,
                  icon: (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#000"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  ),
                },
              ].map(({ label, desc, bg, ref, icon }) => (
                <button
                  key={label}
                  onClick={() => {
                    ref.current.click();
                    setShowAttachMenu(false);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "16px 14px 14px",
                    borderRadius: 16,
                    border: `1px solid ${G.border2}`,
                    background: "rgba(255,255,255,0.04)",
                    cursor: "pointer",
                    backdropFilter: "blur(12px)",
                    fontFamily: "'Figtree',sans-serif",
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: bg,
                    }}
                  >
                    {icon}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        color: G.text,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        color: G.muted,
                        marginTop: 3,
                      }}
                    >
                      {desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Image zoom */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.94)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 0.2s ease",
            cursor: "zoom-out",
          }}
        >
          <img
            src={selectedImage}
            alt="Full"
            style={{
              maxWidth: "94%",
              maxHeight: "94%",
              borderRadius: 8,
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
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              border: `1px solid ${G.border2}`,
              color: G.text,
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            background: G.error,
            color: "#fff",
            padding: "9px 16px",
            borderRadius: 10,
            fontSize: "0.8rem",
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
