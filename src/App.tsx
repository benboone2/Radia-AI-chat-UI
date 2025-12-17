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
const THEME_BG = "#2B3F4D"; // Radia branding color
const THEME_TEXT = "#ffffff"; // white text on theme backgrounds
const THEME_DARK = "#515151"; // darker accent for buttons / user bubble

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

  const deleteSession = (id: string) => {
    setSessions((prev) => {
      // Don’t allow deleting the last remaining chat
      if (prev.length <= 1) {
        return prev;
      }

      const filtered = prev.filter((s) => s.id !== id);

      // If we deleted the active session, move focus to the first remaining
      if (id === activeSessionId) {
        if (filtered.length > 0) {
          setActiveSessionId(filtered[0].id);
        } else {
          setActiveSessionId(null);
        }
      }

      return filtered;
    });
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
      height: "100vh",
      fontFamily: "FK grotesk, FK grotesk Medium, FK grotesk black italic",
      background: THEME_BG,
    }}
  >
    {/* LEFT SIDEBAR: chat list */}
    <div
      style={{
        width: 260,
        borderRight: "1px solid rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "column",
        background: THEME_BG,
        color: THEME_TEXT,
      }}
    >
      {/* Sidebar header with logo + New button */}
      <div
        style={{
          padding: 8,
          borderBottom: "1px solid rgba(255,255,255,0.4)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src={logo}
            alt="Radia logo"
            style={{ height: 26, width: "auto" }}
          />
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            Radia Assistant
          </span>
        </div>
        <button
          onClick={newChat}
          style={{
            border: "none",
            borderRadius: 4,
            padding: "4px 8px",
            background: THEME_DARK,
            color: "#fff",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          + New
        </button>
      </div>

      {/* Chat list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 4,
        }}
      >
        {sessions.map((s) => {
          const isActive = activeSession && activeSession.id === s.id;
          const firstLine = s.messages[0]?.text || "No messages yet";

          return (
            <div
              key={s.id}
              style={{
                padding: 6,
                marginBottom: 4,
                borderRadius: 4,
                background: isActive
                  ? "rgba(35,64,90,0.3)"
                  : "rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {/* Clickable area to select chat */}
                <div
                  onClick={() => setActiveSessionId(s.id)}
                  style={{
                    flex: 1,
                    cursor: "pointer",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 500,
                      fontSize: 13,
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
                      opacity: 0.85,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {firstLine}
                  </div>
                </div>

                {/* Delete button – only show if more than 1 chat exists */}
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // prevent selecting on delete click
                      deleteSession(s.id);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: THEME_TEXT,
                      cursor: "pointer",
                      fontSize: 14,
                      lineHeight: 1,
                      padding: "0 4px",
                    }}
                    title="Delete chat"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* RIGHT MAIN PANE: header + messages + input */}
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#f5f7fb",
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
              Radia SEI / Production Assistant
            </h2>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              Answers from your prompt flow + AI Search. Internal use only.
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
                padding: 10,
                borderRadius: 10,
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
          <div style={{ color: "#555", fontSize: 14 }}>
            Ask about production readiness, manufacturing plans, maturity gates,
            Jama usage patterns, etc.
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: "1px solid rgba(0,0,0,0.1)",
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
              borderRadius: 6,
              border: "1px solid #ccc",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !API_URL || !activeSession}
            style={{
              minWidth: 80,
              padding: "0 16px",
              borderRadius: 6,
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
