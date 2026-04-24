"use client";

import type { PacerStatus } from "@/lib/types";

interface ControlBarProps {
  pacerState: PacerStatus["state"];
  speed: number;
  chaos: boolean;
  hasSegments: boolean;
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

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-hairline bg-paper">
      {/* Playback controls */}
      <div className="flex items-center gap-2">
        {isIdle && (
          <button
            onClick={onStart}
            disabled={!hasSegments}
            className="px-3 py-1.5 text-sm font-medium rounded bg-ink text-paper disabled:opacity-30"
          >
            Start
          </button>
        )}
        {isRunning && (
          <button
            onClick={onPause}
            className="px-3 py-1.5 text-sm font-medium rounded bg-ink text-paper"
          >
            Pause
          </button>
        )}
        {isPaused && (
          <button
            onClick={onResume}
            className="px-3 py-1.5 text-sm font-medium rounded bg-ink text-paper"
          >
            Resume
          </button>
        )}
        <button
          onClick={onEnd}
          disabled={isIdle || isEnded}
          className="px-3 py-1.5 text-sm font-medium rounded border border-hairline disabled:opacity-30"
        >
          End
        </button>
        <button
          onClick={onReset}
          className="px-3 py-1.5 text-sm font-medium rounded border border-hairline"
        >
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
        className={`px-3 py-1.5 text-sm font-medium rounded border transition-colors ${
          chaos
            ? "bg-coral-bg border-coral-border text-coral-ink"
            : "border-hairline text-muted"
        }`}
      >
        Chaos {chaos ? "ON" : "OFF"}
      </button>

      {/* State indicator */}
      <span className="ml-auto text-xs font-mono text-muted uppercase">
        {pacerState}
      </span>
    </div>
  );
}
