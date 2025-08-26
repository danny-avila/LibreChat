import React, { useEffect, useState } from "react";

export default function AdminLogsStreamTest() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const es = new EventSource(`/api/user-activity/stream?token=${token}`);

    es.onopen = () => {
      console.log("[Stream] Connected");
    };

    es.onmessage = (evt) => {
      // Each evt.data is a JSON string from SSE
      setMessages((prev) => [...prev, evt.data]);
      console.log("[Stream] Message:", evt.data);
    };

    es.onerror = (err) => {
      console.error("[Stream] SSE error", err);
      es.close();
    };

    return () => es.close();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Logs Stream Test</h2>
      <div
        style={{
          maxHeight: 500,
          overflowY: "auto",
          border: "1px solid #ccc",
          padding: 10,
        }}
      >
        {messages.map((msg, i) => (
          <pre key={i} style={{ fontSize: 12, margin: 0 }}>
            {msg}
          </pre>
        ))}
      </div>
    </div>
  );
}
