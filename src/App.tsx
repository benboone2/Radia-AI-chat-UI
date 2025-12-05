import React, { useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
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

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !API_URL) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
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
          chat_history: [], // we can wire real history later
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        const errMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Server error ${resp.status}: ${text.slice(0, 200)}`,
        };
        setMessages((prev) => [...prev, errMsg]);
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

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error("Error calling API:", err);
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Sorry, I couldn't reach the server.",
      };
      setMessages((prev) => [...prev, errMsg]);
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
        fontFamily: "Segoe UI, system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid #ddd",
          background: "#ffffff",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Radia SEI / Production Assistant</h2>
        <div style={{ fontSize: 12, color: "#666" }}>
          Answers from your prompt flow + AI Search. Internal use only.
        </div>
      </div>

      {/* Chat area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          background: "#f5f5f5",
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
                background: m.role === "user" ? "#0078d4" : "#ffffff",
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
            Ask about production readiness, manufacturing plans, maturity gates,
            etc.
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
            disabled={loading || !API_URL}
            style={{
              minWidth: 80,
              padding: "0 12px",
              borderRadius: 4,
              border: "none",
              background: "#0078d4",
              color: "white",
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading || !API_URL ? 0.7 : 1,
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
  );
}

export default App;
