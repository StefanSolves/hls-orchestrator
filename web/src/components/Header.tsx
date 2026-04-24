"use client";

import { useEffect, useState } from "react";

export function Header() {
  const [connected, setConnected] = useState(false);
  const orchestratorUrl = "localhost:8080";

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/playlist");
        // Even a 404 means the proxy reached the orchestrator
        setConnected(res.status !== 502);
      } catch {
        setConnected(false);
      }
    }
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-hairline">
      <h1 className="text-lg font-semibold tracking-tight">
        HLS Orchestrator Demo
      </h1>
      <div className="flex items-center gap-2 text-sm font-mono text-muted">
        <span>{orchestratorUrl}</span>
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? "bg-teal-border" : "bg-coral-border"
          }`}
        />
        <span>{connected ? "connected" : "disconnected"}</span>
      </div>
    </header>
  );
}
