import { useState, useRef, useCallback, useEffect } from "react";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
} from "firebase/auth";
import { G } from "../theme";
import { firebaseAuth, hasFirebaseConfig } from "../firebase";

const DEFAULT_CC = (() => {
  const v = String(
    import.meta.env.VITE_DEFAULT_PHONE_COUNTRY_CODE || "+91"
  ).replace(/\D/g, "");
  return v ? `+${v}` : "+91";
})();

const normalizePhone = (input = "") => {
  const v = input.trim();
  if (!v) return null;
  if (v.startsWith("+")) {
    const c = `+${v.slice(1).replace(/\D/g, "")}`;
    return /^\+\d{8,15}$/.test(c) ? c : null;
  }
  const d = v.replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return null;
  const e = `${DEFAULT_CC}${d}`;
  return /^\+\d{8,15}$/.test(e) ? e : null;
};

const getAuthError = (error) => {
  const code = error?.code || "";
  if (code === "auth/invalid-credential") return "Invalid email or password.";
  if (code === "auth/email-already-in-use")
    return "Email already registered. Sign in instead.";
  if (code === "auth/weak-password")
    return "Password must be at least 6 characters.";
  if (code === "auth/invalid-email") return "Please enter a valid email.";
  if (code === "auth/popup-closed-by-user")
    return "Google sign-in was cancelled.";
  if (code === "auth/invalid-phone-number")
    return `Enter a valid phone number (default ${DEFAULT_CC}).`;
  if (code === "auth/too-many-requests")
    return "Too many attempts. Please wait.";
  if (code === "auth/invalid-verification-code")
    return "Invalid OTP. Please retry.";
  return error?.message || "Authentication failed. Please try again.";
};

export default function AuthGateScreen() {
  const [method, setMethod] = useState("google");
  const [emailMode, setEmailMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [showManualRC, setShowManualRC] = useState(false);

  const rcRef = useRef(null);
  const rcVerifier = useRef(null);

  const clearRC = useCallback(() => {
    if (rcVerifier.current) {
      rcVerifier.current.clear();
      rcVerifier.current = null;
    }
  }, []);

  useEffect(() => () => clearRC(), [clearRC]);

  const getVerifier = useCallback(() => {
    if (!firebaseAuth) throw new Error("Firebase not ready.");
    if (rcVerifier.current) return rcVerifier.current;
    if (!rcRef.current) throw new Error("reCAPTCHA failed. Reload and retry.");
    rcVerifier.current = new RecaptchaVerifier(firebaseAuth, rcRef.current, {
      size: showManualRC ? "normal" : "invisible",
      callback: () => setError(""),
      "expired-callback": () => setError("Verification expired. Retry."),
    });
    return rcVerifier.current;
  }, [showManualRC]);

  const withLoading = async (action, task) => {
    try {
      setError("");
      setLoading(action);
      await task();
    } catch (e) {
      setError(getAuthError(e));
    } finally {
      setLoading("");
    }
  };

  const googleSignIn = async () => {
    if (!firebaseAuth) {
      setError("Firebase not configured.");
      return;
    }
    await withLoading("google", async () => {
      const p = new GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(firebaseAuth, p);
    });
  };

  const emailAuth = async (e) => {
    e.preventDefault();
    if (!firebaseAuth) {
      setError("Firebase not configured.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter email and password.");
      return;
    }
    await withLoading("email", async () => {
      if (emailMode === "signup")
        await createUserWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password
        );
      else
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    });
  };

  const sendOtp = async () => {
    if (!firebaseAuth) {
      setError("Firebase not configured.");
      return;
    }
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError(`Enter a valid phone number (default ${DEFAULT_CC}).`);
      return;
    }
    await withLoading("otp-send", async () => {
      try {
        const v = getVerifier();
        await v.render();
        const result = await signInWithPhoneNumber(firebaseAuth, normalized, v);
        setConfirm(result);
        setOtp("");
      } catch (e) {
        const c = e?.code || "";
        if (
          !showManualRC &&
          (c === "auth/invalid-app-credential" ||
            /timeout/i.test(e?.message || ""))
        )
          setShowManualRC(true);
        clearRC();
        throw e;
      }
    });
  };

  const verifyOtp = async () => {
    if (!confirm) {
      setError("Request OTP first.");
      return;
    }
    await withLoading("otp-verify", async () => {
      await confirm.confirm(otp.trim());
      setConfirm(null);
      setOtp("");
      setPhone("");
    });
  };

  const dis = Boolean(loading);

  const inp = {
    width: "100%",
    borderRadius: 10,
    border: `1px solid rgba(240,165,0,0.2)`,
    background: G.surface,
    color: G.text,
    padding: "11px 12px",
    fontSize: "0.86rem",
    outline: "none",
    fontFamily: "'Figtree',sans-serif",
  };
  const primBtn = {
    width: "100%",
    marginTop: 10,
    borderRadius: 10,
    padding: 11,
    fontSize: "0.88rem",
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    background: `linear-gradient(135deg,${G.gold},${G.saffron})`,
    color: "#000",
    fontFamily: "'Figtree',sans-serif",
  };
  const secBtn = {
    ...primBtn,
    background: "transparent",
    border: `1px solid ${G.border}`,
    color: G.gold,
  };

  if (!hasFirebaseConfig)
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: G.bg,
          padding: 20,
        }}
      >
        <div
          style={{
            background: G.surface,
            border: `1px solid ${G.border}`,
            borderRadius: 16,
            padding: 24,
            maxWidth: 400,
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: G.gold,
              fontSize: "0.75rem",
              fontWeight: 600,
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Firebase Not Configured
          </div>
          <div style={{ color: G.muted, fontSize: "0.85rem" }}>
            Add VITE_FIREBASE_* environment variables and restart.
          </div>
        </div>
      </div>
    );

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: G.bg,
        padding: "20px",
        overflowY: "auto",
        position: "relative",
      }}
    >
      {/* BG glow */}
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "20%",
          width: 280,
          height: 280,
          background: `radial-gradient(circle,${G.glow},transparent 70%)`,
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "min(480px,100%)",
          borderRadius: 20,
          border: `1px solid ${G.border}`,
          background:
            "linear-gradient(160deg,rgba(18,20,31,0.97),rgba(8,9,16,0.97))",
          padding: 24,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            border: `1px solid ${G.border}`,
            background: "rgba(240,165,0,0.08)",
            color: G.gold,
            padding: "4px 10px",
            fontSize: "0.68rem",
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          🔐 Secure Access
        </div>
        <div
          style={{
            fontFamily: "'Playfair Display',serif",
            fontSize: "1.3rem",
            fontWeight: 700,
            color: G.text,
            marginBottom: 6,
          }}
        >
          Sign in to unlock Mock Tests
        </div>
        <div
          style={{
            color: G.muted,
            fontSize: "0.84rem",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          Ask AI and Job Alerts are free. Mock Tests require sign in.
        </div>

        {/* Method selector */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {["google", "email", "phone"].map((m) => (
            <button
              key={m}
              disabled={dis}
              onClick={() => {
                setMethod(m);
                setError("");
                setShowManualRC(false);
              }}
              style={{
                borderRadius: 10,
                border: `1px solid ${method === m ? G.gold : G.border2}`,
                background: method === m ? `rgba(240,165,0,0.12)` : G.surface,
                color: method === m ? G.goldL : G.muted,
                fontSize: "0.78rem",
                fontWeight: 600,
                padding: "9px 6px",
                cursor: "pointer",
                textTransform: "capitalize",
                fontFamily: "'Figtree',sans-serif",
              }}
            >
              {m === "google" ? "Google" : m === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>

        {/* Google */}
        {method === "google" && (
          <div
            style={{
              background: G.surface,
              border: `1px solid ${G.border2}`,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <button
              disabled={dis}
              onClick={googleSignIn}
              style={{
                ...secBtn,
                marginTop: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg,#fde047,${G.saffron})`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "#000",
                }}
              >
                G
              </span>
              {loading === "google" ? "Connecting..." : "Continue with Google"}
            </button>
            <div style={{ fontSize: "0.75rem", color: G.muted, marginTop: 8 }}>
              Fastest option if you have Google on this device.
            </div>
          </div>
        )}

        {/* Email */}
        {method === "email" && (
          <form
            onSubmit={emailAuth}
            style={{
              background: G.surface,
              border: `1px solid ${G.border2}`,
              borderRadius: 12,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              style={inp}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={
                emailMode === "signup" ? "new-password" : "current-password"
              }
              style={inp}
            />
            <button type="submit" disabled={dis} style={primBtn}>
              {loading === "email"
                ? emailMode === "signup"
                  ? "Creating..."
                  : "Signing in..."
                : emailMode === "signup"
                ? "Create Account"
                : "Sign In"}
            </button>
            <button
              type="button"
              disabled={dis}
              onClick={() =>
                setEmailMode((m) => (m === "signup" ? "login" : "signup"))
              }
              style={{
                background: "transparent",
                border: "none",
                color: "#60a5fa",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
                marginTop: 4,
                fontFamily: "'Figtree',sans-serif",
              }}
            >
              {emailMode === "signup"
                ? "Have an account? Sign in"
                : "New here? Sign up"}
            </button>
          </form>
        )}

        {/* Phone */}
        {method === "phone" && (
          <div
            style={{
              background: G.surface,
              border: `1px solid ${G.border2}`,
              borderRadius: 12,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter 10-digit phone number"
              autoComplete="tel"
              style={inp}
            />
            {!confirm ? (
              <button disabled={dis} onClick={sendOtp} style={secBtn}>
                {loading === "otp-send" ? "Sending OTP..." : "Send OTP"}
              </button>
            ) : (
              <>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter OTP"
                  autoComplete="one-time-code"
                  style={inp}
                />
                <button disabled={dis} onClick={verifyOtp} style={primBtn}>
                  {loading === "otp-verify" ? "Verifying..." : "Verify OTP"}
                </button>
                <button
                  onClick={() => {
                    setConfirm(null);
                    setOtp("");
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#60a5fa",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    padding: 0,
                    fontFamily: "'Figtree',sans-serif",
                  }}
                >
                  Change number / resend
                </button>
              </>
            )}
            <div style={{ fontSize: "0.73rem", color: G.muted }}>
              Country code : <code style={{ color: G.gold }}>{DEFAULT_CC}</code>
            </div>
            <div
              ref={rcRef}
              style={{
                minHeight: showManualRC && !confirm ? 78 : 1,
                overflow: "hidden",
                opacity: showManualRC && !confirm ? 1 : 0,
                pointerEvents: showManualRC && !confirm ? "auto" : "none",
              }}
            />
          </div>
        )}

        <div
          style={{
            textAlign: "center",
            fontSize: "0.72rem",
            color: G.muted,
            marginTop: 12,
          }}
        >
          Sign in once — stays logged in on this device.
        </div>
        {error && (
          <div
            style={{
              marginTop: 12,
              border: `1px solid rgba(229,62,62,0.4)`,
              borderRadius: 10,
              background: "rgba(229,62,62,0.1)",
              color: "#f7a6b0",
              padding: "9px 12px",
              fontSize: "0.8rem",
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
