"use client";

import { useState, useEffect, useRef } from "react";
import type { PacerStatus, SegmentInfo } from "@/lib/types";

interface StreamCompleteBannerProps {
  pacerState: PacerStatus["state"];
  segments: SegmentInfo[];
  onReset: () => void;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function StreamCompleteBanner({ pacerState, segments, onReset }: StreamCompleteBannerProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStateRef = useRef(pacerState);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedText, setElapsedText] = useState("");

  // Track when streaming started
  useEffect(() => {
    if (prevStateRef.current !== "running" && pacerState === "running") {
      startTimeRef.current = Date.now();
    }
    prevStateRef.current = pacerState;
  }, [pacerState]);

  // Show banner when stream ends
  useEffect(() => {
    if (pacerState === "ended" && !dismissed) {
      const elapsed = startTimeRef.current
        ? (Date.now() - startTimeRef.current) / 1000
        : 0;
      setElapsedText(formatDuration(elapsed));
      setVisible(true);

      timerRef.current = setTimeout(() => setVisible(false), 8000);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
    if (pacerState === "idle") {
      setVisible(false);
      setDismissed(false);
      startTimeRef.current = null;
    }
  }, [pacerState, dismissed]);

  if (!visible) return null;

  const receivedCount = segments.filter(s => s.state === "received").length;

  return (
    <div className="border-b-2 border-teal-border bg-teal-bg/40 px-4 py-3 flex items-center gap-3">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
        <circle cx="9" cy="9" r="9" fill="#CCFBF1" />
        <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#134E4A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-sm text-teal-ink flex-1">
        Stream complete — <span className="font-mono">{receivedCount}</span> segments delivered in {elapsedText}
      </span>
      <button
        onClick={() => { setVisible(false); onReset(); }}
        className="text-xs font-medium text-teal-ink underline underline-offset-2 hover:opacity-70"
      >
        Reset
      </button>
      <button
        onClick={() => { setVisible(false); setDismissed(true); }}
        className="text-xs text-muted hover:text-ink"
      >
        Dismiss
      </button>
    </div>
  );
}
