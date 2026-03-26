"use client";

import { useState, useRef } from "react";

type Msg = {
  role: "user" | "assistant";
  text: string;
  needsConfirm?: boolean;
};

export default function ChatBox({ onUpdate }: { onUpdate?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
  {
    role: "assistant",
    text:
      "Hi! I'm your Job Application Agent. Here's what I can help with:\n\n" +
      " **Track Applications**\n" +
      "• Add note for Google: spoke with recruiter\n" +
      "• Show my history with Amazon\n\n" +
      " **Follow-up Emails**\n" +
      "• Write a follow-up email for Stripe\n" +
      "• Help me follow up with Meta\n\n" +
      " **Resume Tailoring**\n" +
      "• How should I tailor my resume for Google?\n" +
      "• What skills should I highlight for this job?\n\n" +
      " **Other**\n" +
      "• What needs my attention?\n" +
      "• Check my fit for Anthropic\n" +
      "• Upload resume (📎 button)",
  },
]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sessionId] = useState(() => {
    if (typeof window === "undefined") return "ssr";
    const key = "job-agent-session";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  });

  function markNeedConfirm(replyText: string) {
    return replyText.includes("Reply CONFIRM") || replyText.includes("CONFIRM to");
  }

  async function callAgent(message: string) {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false as const, reply: `Error: ${data?.error ?? res.statusText}` };
    }
    return { ok: true as const, reply: String(data.reply ?? "(no reply)") };
  }

  async function quickSend(text: string) {
    if (loading) return;

    setMsgs((m) => [...m, { role: "user", text }]);
    setLoading(true);

    try {
      const result = await callAgent(text);
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: result.reply, needsConfirm: markNeedConfirm(result.reply) },
      ]);
      if (text === "CONFIRM" && onUpdate) {
        onUpdate();
      }
    } catch (e: any) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: `Network error: ${e?.message ?? e}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const result = await callAgent(text);
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: result.reply, needsConfirm: markNeedConfirm(result.reply) },
      ]);
      if (onUpdate) {
        onUpdate();
      }
    } catch (e: any) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: `Network error: ${e?.message ?? e}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".pdf")) {
      setMsgs((m) => [...m, { role: "assistant", text: "❌ Please upload a PDF file." }]);
      return;
    }

    setMsgs((m) => [...m, { role: "user", text: `📄 Uploading: ${file.name}` }]);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("save", "false"); // Preview first

      const res = await fetch("/api/resume/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setMsgs((m) => [...m, { role: "assistant", text: `❌ Error: ${data.error}` }]);
        return;
      }

      // Show preview and ask for confirmation
      const parsed = data.parsed;
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text:
            `📄 I extracted from your resume:\n\n` +
            `📚 Skills: ${parsed.skills.slice(0, 10).join(", ")}${parsed.skills.length > 10 ? "..." : ""}\n\n` +
            `💼 Experience: ${parsed.experience}\n\n` +
            `🎓 Education: ${parsed.education}\n\n` +
            `🔑 Keywords: ${parsed.keywords.slice(0, 8).join(", ")}${parsed.keywords.length > 8 ? "..." : ""}`,
          needsConfirm: false,
        },
      ]);

      // Auto-save the resume
      const saveRes = await fetch("/api/resume/upload", {
        method: "POST",
        body: (() => {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("save", "true");
          return fd;
        })(),
      });

      if (saveRes.ok) {
        setMsgs((m) => [
          ...m,
          { role: "assistant", text: "✅ Resume saved! I'll use this to match jobs for you." },
        ]);
        if (onUpdate) onUpdate();
      }
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", text: `❌ Upload failed: ${e.message}` }]);
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "#3b82f6",
          color: "white",
          border: "none",
          fontSize: 24,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            right: 24,
            width: 380,
            height: 500,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              background: "#3b82f6",
              color: "white",
              fontWeight: 600,
            }}
          >
            Job Application Agent
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 12,
            }}
          >
            {msgs.map((m, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#666",
                    marginBottom: 4,
                  }}
                >
                  {m.role === "user" ? "You" : "Agent"}
                </div>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: m.role === "user" ? "#e0f2fe" : "#f3f4f6",
                    fontSize: 14,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.text}
                </div>

                {m.role === "assistant" && m.needsConfirm && (
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button
                      onClick={() => quickSend("CONFIRM")}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: "#10b981",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      ✅ Confirm
                    </button>
                    <button
                      onClick={() => quickSend("CANCEL")}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: "#ef4444",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      ❌ Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ color: "#666", fontSize: 13 }}>Agent is thinking...</div>
            )}
          </div>

          {/* Input */}
          <div
            style={{
              padding: 12,
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              gap: 8,
            }}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Upload Resume (PDF)"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              📎
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                outline: "none",
                fontSize: 14,
              }}
            />
            <button
              onClick={send}
              disabled={loading}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: "#3b82f6",
                color: "white",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}