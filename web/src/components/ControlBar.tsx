"use client";

import { useState, useRef, useEffect } from "react";
import type { PacerStatus } from "@/lib/types";

interface ControlBarProps {
  pacerState: PacerStatus["state"];
  speed: number;
  chaos: boolean;
  hasSegments: boolean;
  currentIndex: number;
  totalSegments: number;
  elapsedText: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onChaosToggle: (enabled: boolean) => void;
}

export function ControlBar({
  pacerState,
  speed,
  chaos,
  hasSegments,
  currentIndex,
  totalSegments,
  elapsedText,
  onStart,
  onPause,
  onResume,
  onEnd,
  onReset,
  onSpeedChange,
  onChaosToggle,
}: ControlBarProps) {
  const isIdle = pacerState === "idle";
  const isRunning = pacerState === "running";
  const isPaused = pacerState === "paused";
  const isEnded = pacerState === "ended";

  const canStart = isIdle && hasSegments;
  const canEnd = isRunning || isPaused;

  // Local speed for instant slider feedback; debounce the network call
  const [localSpeed, setLocalSpeed] = useState(speed);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local speed when server-side speed changes (e.g. on SSE status update)
  useEffect(() => {
    setLocalSpeed(speed);
  }, [speed]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSliderChange(next: number) {
    setLocalSpeed(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSpeedChange(next);
    }, 150);
  }

  let statusText: string;
  if (isIdle && !hasSegments) {
    statusText = "upload a video to begin";
  } else if (isIdle && hasSegments) {
    statusText = "ready \u2014 click start to begin streaming";
  } else if (isRunning) {
    statusText = `streaming \u2014 ${currentIndex}/${totalSegments} segments produced`;
  } else if (isPaused) {
    statusText = "paused \u2014 resume or end the stream";
  } else if (isEnded) {
    statusText = `stream complete \u2014 ${totalSegments} segments delivered in ${elapsedText}. reset to try another video.`;
  } else {
    statusText = "";
  }

  const btnBase = "px-3 py-1.5 text-sm font-medium rounded transition-colors";
  const btnPrimary = `${btnBase} bg-ink text-paper`;
  const btnSecondary = `${btnBase} border border-hairline`;
  const btnDisabled = "opacity-40 cursor-not-allowed";

  return (
    <div className="px-4 py-3 border-b border-hairline bg-paper">
      <div className="flex flex-wrap items-center gap-3">
        {/* Playback controls — always show all, disable as needed */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button onClick={onPause} className={btnPrimary}>
              Pause
            </button>
          ) : isPaused ? (
            <button onClick={onResume} className={btnPrimary}>
              Resume
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={!canStart}
              className={`${btnPrimary} ${!canStart ? btnDisabled : ""}`}
            >
              Start
            </button>
          )}
          <button
            onClick={onEnd}
            disabled={!canEnd}
            className={`${btnSecondary} ${!canEnd ? btnDisabled : ""}`}
          >
            End
          </button>
          {/* Reset gets prominent styling when stream is ended */}
          <button
            onClick={onReset}
            className={isEnded ? btnPrimary : btnSecondary}
          >
            Reset
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-hairline" />

        {/* Speed slider — disabled when ended */}
        <div className={`flex items-center gap-2 ${isEnded ? "opacity-40" : ""}`}>
          <label className="text-sm text-muted">Speed</label>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={localSpeed}
            onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
            disabled={isEnded}
            className="w-28 accent-ink"
          />
          <span className="text-sm font-mono w-10 text-right">{localSpeed}x</span>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-hairline" />

        {/* Chaos toggle — disabled when ended */}
        <button
          onClick={() => onChaosToggle(!chaos)}
          disabled={isEnded}
          className={`${btnBase} border ${
            chaos
              ? "bg-coral-bg border-coral-border text-coral-ink"
              : "border-hairline text-muted"
          } ${isEnded ? btnDisabled : ""}`}
        >
          Chaos {chaos ? "ON" : "OFF"}
        </button>
      </div>

      {/* Status line */}
      <div className="mt-1.5 text-xs text-muted">{statusText}</div>
    </div>
  );
}
