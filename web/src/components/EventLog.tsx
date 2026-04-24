"use client";

import { useState, useRef, useEffect } from "react";
import type { PacerEvent } from "@/lib/types";

interface EventLogProps {
  events: PacerEvent[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

function eventColor(type: PacerEvent["type"]): string {
  switch (type) {
    case "received": return "text-teal-ink";
    case "posting": return "text-slate-ink";
    case "delayed":
    case "duplicated":
    case "failed": return "text-coral-ink";
    default: return "text-muted";
  }
}

export function EventLog({ events }: EventLogProps) {
  const [collapsed, setCollapsed] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, collapsed]);

  return (
    <div className="border-t border-hairline">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-2 flex items-center gap-2 text-sm text-muted hover:text-ink"
      >
        <span className="font-mono text-xs">{collapsed ? "\u25b8" : "\u25be"}</span>
        Event Log
        <span className="font-mono text-xs">({events.length})</span>
      </button>
      {!collapsed && (
        <div
          ref={scrollRef}
          className="max-h-48 overflow-auto px-4 pb-3 font-mono text-xs leading-relaxed"
        >
          {events.length === 0 ? (
            <p className="text-muted">No events yet</p>
          ) : (
            events.map((evt, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-muted shrink-0">{formatTime(evt.timestamp)}</span>
                <span className="text-muted shrink-0">seg {evt.sequence}</span>
                <span className={eventColor(evt.type)}>
                  {evt.type}
                  {evt.detail ? ` — ${evt.detail}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
