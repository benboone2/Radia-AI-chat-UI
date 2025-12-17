import React, { useState, useEffect } from "react";
import logo from "./assets/radia-logo.png";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface ChatTurn {
  inputs: { chat_input: string };
  outputs: { chat_output: string };
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
}

function buildChatHistory(messages: Message[]): ChatTurn[] {
  const history: ChatTurn[] = [];
  let pendingUser: Message | null = null;

  for (const m of messages) {
    if (m.role === "user") {
      // Start a new turn with this user message
      pendingUser = m;
    } else if (m.role === "assistant" && pendingUser) {
      // Pair the last user message with this assistant reply
      history.push({
        inputs: { chat_input: pendingUser.text },
        outputs: { chat_output: m.text },
      });
      pendingUser = null;
    }
  }

  return history;
}

const API_URL = process.env.REACT_APP_API_URL ?? "";

function stripCitations(raw: string): string {
  // Optional helper to cut off the "Citations" section
  const tokens = ["\n\nCitations", "\nCitations", "\n\nSources", "\nSources"];
  for (const t of tokens) {
    const idx = raw.indexOf(t);
    if (idx !== -1) {
      return raw.slice(0, idx).trim();
    }
  }
  return raw.trim();
}

// Theme colors
const THEME_BG = "rgb(193, 207, 220)"; // Radia branding color
const THEME_TEXT = "#ffffff"; // white text on theme backgrounds
const THEME_DARK = "#23405a"; // darker accent for buttons / user bubble

function App() {
  // Sessions (multiple chats)
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("radiaChatSessions");
        if (stored) {
          const parsed = JSON.parse(stored) as ChatSession[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch {
      // ignore parse errors and fall back to default
    }

    const firstSession: ChatSession = {
      id: crypto.randomUUID(),
      title: "New chat",
      messages: [],
      createdAt: new Date().toISOString(),
    };
    return [firstSession];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("radiaChatActiveSessionId");
        if (stored) return stored;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Derive active session and messages
  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  const messages: Message[] = activeSession ? activeSession.messages : [];

  // Persist sessions and active session ID
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "radiaChatSessions",
          JSON.stringify(sessions)
        );
      }
    } catch {
      // ignore storage failures
    }
  }, [sessions]);

  useEffect(() => {
  try {
    if (typeof window !== "undefined" && activeSession) {
      window.localStorage.setItem(
        "radiaChatActiveSessionId",
        activeSession.id
      );
    }
  } catch {
    // ignore
  }
}, [activeSession]);


  const newChat = () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: "New chat",
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setInput("");
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !API_URL || !activeSession) return;

    // Build history from the active session’s messages
    const history = buildChatHistory(activeSession.messages);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
    };

    // Optimistically append user message and set title on first message
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              title:
                s.messages.length === 0
                  ? trimmed.slice(0, 40) || "New chat"
                  : s.title,
              messages: [...s.messages, userMsg],
            }
          : s
      )
    );

    setInput("");
    setLoading(true);

    try {
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: trimmed,
          chat_history: history,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        const errMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Server error ${resp.status}: ${text.slice(0, 200)}`,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSession.id
              ? { ...s, messages: [...s.messages, errMsg] }
              : s
          )
        );
        return;
      }

      const data = await resp.json();

      const rawAnswer: string =
        data.answer !== undefined ? String(data.answer) : JSON.stringify(data);

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: stripCitations(rawAnswer), // cut off that big "Citations" tail
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, messages: [...s.messages, aiMsg] }
            : s
        )
      );
    } catch (err) {
      console.error("Error calling API:", err);
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Sorry, I couldn't reach the server.",
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, messages: [...s.messages, errMsg] }
            : s
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (
    e
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "FK Gretesk, FK Gretesk Medium, FK Gretesk black",
        background: THEME_BG, // theme background
      }}
    >
      {/* Sidebar: chat sessions */}
      <div
        style={{
          width: 260,
          borderRight: "1px solid #ddd",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 8,
            borderBottom: "1px solid #ddd",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Radia Assistant</span>
          <button
            onClick={newChat}
            style={{
              border: "none",
              borderRadius: 4,
              padding: "4px 8px",
              background: "#0078d4",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            + New
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 4,
            background: "#fafafa",
          }}
        >
          {sessions.map((s) => {
            const isActive = activeSession && activeSession.id === s.id;
            return (
              <div
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                style={{
                  padding: "6px 8px",
                  marginBottom: 4,
                  borderRadius: 4,
                  cursor: "pointer",
                  background: isActive ? "#e1f3ff" : "transparent",
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.title || "New chat"}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#666",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.messages[0]?.text || "No messages yet"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main chat pane */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid rgba(0,0,0,0.1)",
            background: THEME_BG,
            color: THEME_TEXT,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={logo}
              alt="Radia logo"
              style={{ height: 30, width: "auto" }}
            />
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                Radia SE&I Assistant
              </h2>
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                Answers from SE&I process docs. Internal use only.
              </div>
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            background: "#f5f7fb",
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  padding: 8,
                  borderRadius: 8,
                  background: m.role === "user" ? THEME_DARK : "#ffffff",
                  color: m.role === "user" ? "#ffffff" : "#000000",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  fontSize: 14,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div style={{ color: "#666", fontSize: 14 }}>
              Ask about production readiness, manufacturing plans, maturity
              gates, Jama usage patterns, etc.
            </div>
          )}
        </div>

        {/* Input area */}
        <div
          style={{
            borderTop: "1px solid #ddd",
            padding: 8,
            background: "#ffffff",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              style={{
                flex: 1,
                resize: "none",
                height: 60,
                fontSize: 14,
                padding: 8,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !API_URL || !activeSession}
              style={{
                minWidth: 80,
                padding: "0 12px",
                borderRadius: 4,
                border: "none",
                background: THEME_DARK,
                color: "white",
                fontWeight: 600,
                cursor: loading ? "default" : "pointer",
                opacity: loading || !API_URL || !activeSession ? 0.7 : 1,
              }}
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
          {!API_URL && (
            <div style={{ marginTop: 4, fontSize: 12, color: "red" }}>
              REACT_APP_API_URL is not set.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
