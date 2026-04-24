"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { PipelineChunk } from "@/hooks/usePipelineChunks";
import type { PacerStatus } from "@/lib/types";

interface ConveyorProps {
  chunks: ReadonlyMap<number, PipelineChunk>;
  pacerState: PacerStatus["state"];
  speed: number;
  segmentDuration: number;
}

const COLORS = {
  produced:    { bg: "#C8EBDC", border: "#1D9E75", text: "#094637" },
  delayed:     { bg: "#FCE8BE", border: "#C88A1B", text: "#6A4409" },
  posting:     { bg: "#E1E8F0", border: "#4E6B88", text: "#213449" },
  received:    { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" },
  duplicated:  { bg: "#F7D2C1", border: "#C8562C", text: "#612614" },
  failed:      { bg: "#F7D2C1", border: "#C8562C", text: "#612614" },
} as const;

const BELT_COLOR = "#E1F5EE";
const BELT_STROKE = "#0F6E56";
const CHUNK_SIZE = 32;

function getChunkProgress(
  chunk: PipelineChunk,
  now: number,
  tickIntervalMs: number,
  isPaused: boolean,
  pausedAt: number | null,
): number {
  if (chunk.phase === "posting") return 0.85;
  if (chunk.phase === "received") return 1;
  if (chunk.phase === "failed") return chunk.postingAt ? 0.85 : 0.5;
  if (chunk.phase === "duplicated") return 0.95;

  const effectiveNow = isPaused && pausedAt ? pausedAt : now;
  const elapsed = effectiveNow - chunk.producedAt - chunk.pauseAdjustMs;

  if (chunk.phase === "delayed") {
    return Math.min(0.7, elapsed / (tickIntervalMs * 2));
  }

  return Math.min(0.85, elapsed / tickIntervalMs);
}

function shouldShow(chunk: PipelineChunk, now: number): boolean {
  if (chunk.phase === "received" && chunk.receivedAt) {
    return now - chunk.receivedAt < 300;
  }
  if (chunk.phase === "failed" && chunk.failedAt) {
    return now - chunk.failedAt < 600;
  }
  if (chunk.phase === "duplicated" && chunk.duplicatedAt) {
    return now - chunk.duplicatedAt < 400;
  }
  return true;
}

function getOpacity(chunk: PipelineChunk, now: number): number {
  if (chunk.phase === "received" && chunk.receivedAt) {
    const elapsed = now - chunk.receivedAt;
    return Math.max(0, 1 - elapsed / 300);
  }
  if (chunk.phase === "failed" && chunk.failedAt) {
    const elapsed = now - chunk.failedAt;
    return Math.max(0, 1 - elapsed / 600);
  }
  if (chunk.phase === "duplicated" && chunk.duplicatedAt) {
    const elapsed = now - chunk.duplicatedAt;
    return Math.max(0, 1 - elapsed / 400);
  }
  return 1;
}

function getWobble(chunk: PipelineChunk, now: number): number {
  if (chunk.phase === "delayed" && chunk.delayedAt) {
    const elapsed = now - chunk.delayedAt;
    if (elapsed < 400) {
      return Math.sin(elapsed / 40 * Math.PI) * 3;
    }
  }
  if (chunk.phase === "failed" && chunk.failedAt) {
    const elapsed = now - chunk.failedAt;
    if (elapsed < 300) {
      return Math.sin(elapsed / 30 * Math.PI) * 4;
    }
  }
  return 0;
}

export function Conveyor({ chunks, pacerState, speed, segmentDuration }: ConveyorProps) {
  // Temporary instrumentation to verify Fix A belt traversal delay (revert after confirmed)
  if (chunks.size > 0) {
    console.log('[Conveyor] chunks', chunks.size, [...chunks.values()].map(c => ({ seq: c.sequence, phase: c.phase, age: Date.now() - c.producedAt })));
  }
  const beltRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [, forceRender] = useState(0);
  const isPaused = pacerState === "paused";
  const pausedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPaused) {
      pausedAtRef.current = Date.now();
    } else {
      pausedAtRef.current = null;
    }
  }, [isPaused]);

  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const animate = useCallback(() => {
    forceRender((n) => n + 1);
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    let hasActive = false;
    const now = Date.now();
    for (const chunk of chunks.values()) {
      if (shouldShow(chunk, now)) {
        hasActive = true;
        break;
      }
    }

    if (hasActive || pacerState === "running") {
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [chunks, pacerState, animate]);

  const beltWidth = beltRef.current?.clientWidth ?? 400;
  const tickIntervalMs = (segmentDuration * 1000) / speed;
  const now = Date.now();
  const reduced = prefersReducedMotion.current;

  const visibleChunks: Array<{
    key: number;
    chunk: PipelineChunk;
    x: number;
    opacity: number;
    wobbleY: number;
    color: typeof COLORS[keyof typeof COLORS];
  }> = [];

  for (const [key, chunk] of chunks) {
    if (!shouldShow(chunk, now)) continue;

    const progress = getChunkProgress(chunk, now, tickIntervalMs, isPaused, pausedAtRef.current);
    const x = progress * (beltWidth - CHUNK_SIZE);
    const opacity = reduced ? (getOpacity(chunk, now) > 0.5 ? 1 : 0) : getOpacity(chunk, now);
    const wobbleY = reduced ? 0 : getWobble(chunk, now);
    const color = COLORS[chunk.phase];

    visibleChunks.push({ key, chunk, x, opacity, wobbleY, color });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 200 }}>
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 10, fontWeight: 500, color: "#6A6A63", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        Conveyor
      </div>
      <div
        ref={beltRef}
        style={{
          position: "relative",
          height: 52,
          backgroundColor: BELT_COLOR,
          border: `2px solid ${BELT_STROKE}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: BELT_STROKE, opacity: 0.15 }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: BELT_STROKE, opacity: 0.15 }} />

        {visibleChunks.map(({ key, chunk, x, opacity, wobbleY, color }) => (
          <div
            key={key}
            style={{
              position: "absolute",
              left: x,
              top: (52 - CHUNK_SIZE - 4) / 2,
              width: CHUNK_SIZE,
              height: CHUNK_SIZE,
              backgroundColor: color.bg,
              border: `2px solid ${color.border}`,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              color: color.text,
              opacity,
              transform: wobbleY !== 0 ? `translateY(${wobbleY}px)` : undefined,
              transition: reduced ? "none" : undefined,
              willChange: "left, opacity, transform",
            }}
          >
            {chunk.sequence}
          </div>
        ))}

        {visibleChunks.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#6A6A63", opacity: 0.5 }}>
            idle
          </div>
        )}
      </div>
    </div>
  );
}
