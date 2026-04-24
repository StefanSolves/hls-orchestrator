"use client";

import type { PacerStatus } from "@/lib/types";

interface ControlBarProps {
  pacerState: PacerStatus["state"];
  speed: number;
  chaos: boolean;
  hasSegments: boolean;
  currentIndex: number;
  totalSegments: number;
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
    statusText = "stream ended \u2014 reset to try another";
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
          <button onClick={onReset} className={btnSecondary}>
            Reset
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-hairline" />

        {/* Speed slider */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Speed</label>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="w-28 accent-ink"
          />
          <span className="text-sm font-mono w-10 text-right">{speed}x</span>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-hairline" />

        {/* Chaos toggle */}
        <button
          onClick={() => onChaosToggle(!chaos)}
          className={`${btnBase} border ${
            chaos
              ? "bg-coral-bg border-coral-border text-coral-ink"
              : "border-hairline text-muted"
          }`}
        >
          Chaos {chaos ? "ON" : "OFF"}
        </button>
      </div>

      {/* Status line */}
      <div className="mt-1.5 text-xs text-muted">{statusText}</div>
    </div>
  );
}
