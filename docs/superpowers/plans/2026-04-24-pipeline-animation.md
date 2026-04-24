# Pipeline Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-line animation showing the HLS pipeline end-to-end — shredder, conveyor belt, orchestrator window, player — driven by real pacer SSE events.

**Architecture:** A new `<PipelineView />` component renders five sub-components (SourceReel, Shredder, Conveyor, OrchestratorWindow, PlayerMonitor) left-to-right. Conveyor positions are derived from event timestamps via a single `requestAnimationFrame` loop — no setInterval per chunk. A tab toggle in page.tsx swaps between Pipeline (default) and the existing Timeline tile view. All data comes from the existing `usePacerEvents` hook and `usePlaylistPolling` hook — no new API routes or SSE channels.

**Tech Stack:** React 19, TypeScript, CSS transforms + transitions, one rAF loop. No animation libraries.

---

## File Structure

```
web/src/
├── lib/
│   ├── types.ts                          # MODIFY: add segmentDuration to PacerStatus
│   └── pacer.ts                          # MODIFY: add segmentDuration to status getter
├── hooks/
│   ├── usePacerEvents.ts                 # MODIFY: expose segmentDuration
│   └── usePipelineChunks.ts              # CREATE: event→chunk state machine for conveyor
├── components/
│   ├── pipeline/
│   │   ├── PipelineView.tsx              # CREATE: orchestrates the 5 sub-components
│   │   ├── SourceReel.tsx                # CREATE: film-strip icon with upload info
│   │   ├── Shredder.tsx                  # CREATE: animated teeth machine
│   │   ├── Conveyor.tsx                  # CREATE: belt with rAF-driven chunk positions
│   │   ├── OrchestratorWindow.tsx        # CREATE: 6-slot vertical column
│   │   └── PlayerMonitor.tsx             # CREATE: stylized TV/monitor
│   └── ViewToggle.tsx                    # CREATE: Pipeline/Timeline tab switcher
├── app/
│   └── page.tsx                          # MODIFY: add view toggle + conditional rendering
```

---

## Task 1: Add segmentDuration to PacerStatus

**Files:**
- Modify: `web/src/lib/types.ts:23-34`
- Modify: `web/src/lib/pacer.ts:24-35`
- Modify: `web/src/hooks/usePacerEvents.ts:6-57`

- [ ] **Step 1: Add segmentDuration to PacerStatus type**

In `web/src/lib/types.ts`, add `segmentDuration` to the `PacerStatus` interface. Change:

```typescript
export interface PacerStatus {
  state: "idle" | "running" | "paused" | "ended";
  speed: number;
  chaos: boolean;
  currentIndex: number;
  totalSegments: number;
  uploadId: string | null;
  streamId: string | null;
  segments: SegmentInfo[];
}
```

to:

```typescript
export interface PacerStatus {
  state: "idle" | "running" | "paused" | "ended";
  speed: number;
  chaos: boolean;
  currentIndex: number;
  totalSegments: number;
  uploadId: string | null;
  streamId: string | null;
  segments: SegmentInfo[];
  segmentDuration: number;
}
```

- [ ] **Step 2: Add segmentDuration to the Pacer status getter**

In `web/src/lib/pacer.ts`, change the `get status()` method from:

```typescript
  get status(): PacerStatus {
    return {
      state: this._state,
      speed: this._speed,
      chaos: this._chaos,
      currentIndex: this.currentIndex,
      totalSegments: this.segments.length,
      uploadId: this._uploadId,
      streamId: this._streamId,
      segments: [...this.segments],
    };
  }
```

to:

```typescript
  get status(): PacerStatus {
    return {
      state: this._state,
      speed: this._speed,
      chaos: this._chaos,
      currentIndex: this.currentIndex,
      totalSegments: this.segments.length,
      uploadId: this._uploadId,
      streamId: this._streamId,
      segments: [...this.segments],
      segmentDuration: this.segmentDuration,
    };
  }
```

- [ ] **Step 3: Expose segmentDuration from the usePacerEvents hook**

In `web/src/hooks/usePacerEvents.ts`, add state for segmentDuration. Change the hook to add:

```typescript
const [segmentDuration, setSegmentDuration] = useState(2);
```

after the existing `useState` calls, and in the `onmessage` handler where `data.type === "status"`, add:

```typescript
setSegmentDuration(data.segmentDuration ?? 2);
```

Then update the return to include it:

```typescript
return { segments, pacerState, events, speed, chaos, streamId, segmentDuration, clearEvents };
```

- [ ] **Step 4: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/lib/types.ts web/src/lib/pacer.ts web/src/hooks/usePacerEvents.ts
git commit -m "feat(web): add segmentDuration to PacerStatus for pipeline animation"
```

---

## Task 2: Pipeline chunk state machine hook

**Files:**
- Create: `web/src/hooks/usePipelineChunks.ts`

This hook consumes the event stream from `usePacerEvents` and maintains a map of chunk states with timestamps, suitable for the conveyor's rAF position math.

- [ ] **Step 1: Create the hook**

Create `web/src/hooks/usePipelineChunks.ts`:

```typescript
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSyncExternalStore } from "react";
import type { PacerEvent, PacerStatus } from "@/lib/types";

export type ChunkPhase =
  | "produced"
  | "delayed"
  | "posting"
  | "received"
  | "duplicated"
  | "failed";

export interface PipelineChunk {
  sequence: number;
  phase: ChunkPhase;
  producedAt: number;
  postingAt: number | null;
  receivedAt: number | null;
  delayedAt: number | null;
  failedAt: number | null;
  duplicatedAt: number | null;
  pauseAdjustMs: number;
}

// Mutable store — mutated by event processing, read by rAF via useSyncExternalStore
class ChunkStore {
  private chunks = new Map<number, PipelineChunk>();
  private listeners = new Set<() => void>();
  private _snapshot: ReadonlyMap<number, PipelineChunk> = new Map();
  private _pausedAt: number | null = null;

  getSnapshot = (): ReadonlyMap<number, PipelineChunk> => {
    return this._snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    this._snapshot = new Map(this.chunks);
    for (const l of this.listeners) l();
  }

  processEvent(event: PacerEvent) {
    const seq = event.sequence;

    switch (event.type) {
      case "produced": {
        this.chunks.set(seq, {
          sequence: seq,
          phase: "produced",
          producedAt: event.timestamp,
          postingAt: null,
          receivedAt: null,
          delayedAt: null,
          failedAt: null,
          duplicatedAt: null,
          pauseAdjustMs: 0,
        });
        break;
      }
      case "delayed": {
        const chunk = this.chunks.get(seq);
        if (chunk) {
          chunk.phase = "delayed";
          chunk.delayedAt = event.timestamp;
        }
        break;
      }
      case "posting": {
        const chunk = this.chunks.get(seq);
        if (chunk) {
          chunk.phase = "posting";
          chunk.postingAt = event.timestamp;
        }
        break;
      }
      case "received": {
        const chunk = this.chunks.get(seq);
        if (chunk) {
          chunk.phase = "received";
          chunk.receivedAt = event.timestamp;
        }
        break;
      }
      case "duplicated": {
        // Create ghost entry for the duplicate
        const ghostSeq = seq + 0.5; // non-integer so it doesn't collide
        this.chunks.set(ghostSeq, {
          sequence: seq,
          phase: "duplicated",
          producedAt: event.timestamp,
          postingAt: null,
          receivedAt: null,
          delayedAt: null,
          failedAt: null,
          duplicatedAt: event.timestamp,
          pauseAdjustMs: 0,
        });
        break;
      }
      case "failed": {
        const chunk = this.chunks.get(seq);
        if (chunk) {
          chunk.phase = "failed";
          chunk.failedAt = event.timestamp;
        }
        break;
      }
    }

    this.notify();
  }

  handlePause(now: number) {
    if (this._pausedAt === null) {
      this._pausedAt = now;
    }
  }

  handleResume(now: number) {
    if (this._pausedAt !== null) {
      const pausedDuration = now - this._pausedAt;
      for (const chunk of this.chunks.values()) {
        chunk.pauseAdjustMs += pausedDuration;
      }
      this._pausedAt = null;
      this.notify();
    }
  }

  reset() {
    this.chunks.clear();
    this._pausedAt = null;
    this.notify();
  }

  get pausedAt(): number | null {
    return this._pausedAt;
  }
}

export function usePipelineChunks(
  events: PacerEvent[],
  pacerState: PacerStatus["state"]
) {
  const storeRef = useRef<ChunkStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = new ChunkStore();
  }
  const store = storeRef.current;

  const lastProcessedRef = useRef(0);
  const prevStateRef = useRef(pacerState);

  // Process new events
  useEffect(() => {
    const newEvents = events.slice(lastProcessedRef.current);
    for (const event of newEvents) {
      store.processEvent(event);
    }
    lastProcessedRef.current = events.length;
  }, [events, store]);

  // Handle pause/resume
  useEffect(() => {
    const prev = prevStateRef.current;
    if (prev === "running" && pacerState === "paused") {
      store.handlePause(Date.now());
    } else if (prev === "paused" && pacerState === "running") {
      store.handleResume(Date.now());
    } else if (pacerState === "idle") {
      store.reset();
    }
    prevStateRef.current = pacerState;
  }, [pacerState, store]);

  const chunks = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const reset = useCallback(() => {
    store.reset();
    lastProcessedRef.current = 0;
  }, [store]);

  return { chunks, isPaused: store.pausedAt !== null, reset };
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/hooks/usePipelineChunks.ts
git commit -m "feat(web): add pipeline chunk state machine hook"
```

---

## Task 3: ViewToggle component

**Files:**
- Create: `web/src/components/ViewToggle.tsx`

- [ ] **Step 1: Create the toggle**

Create `web/src/components/ViewToggle.tsx`:

```tsx
"use client";

export type ViewMode = "pipeline" | "timeline";

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex gap-0 px-4 pt-3">
      <button
        onClick={() => onChange("pipeline")}
        className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
          mode === "pipeline"
            ? "border-ink text-ink"
            : "border-transparent text-muted hover:text-ink"
        }`}
      >
        Pipeline
      </button>
      <button
        onClick={() => onChange("timeline")}
        className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
          mode === "timeline"
            ? "border-ink text-ink"
            : "border-transparent text-muted hover:text-ink"
        }`}
      >
        Timeline
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/components/ViewToggle.tsx
git commit -m "feat(web): add Pipeline/Timeline view toggle"
```

---

## Task 4: SourceReel sub-component

**Files:**
- Create: `web/src/components/pipeline/SourceReel.tsx`

- [ ] **Step 1: Create the component**

Create `web/src/components/pipeline/SourceReel.tsx`:

```tsx
"use client";

import type { UploadResult } from "@/lib/types";

interface SourceReelProps {
  upload: UploadResult | null;
}

export function SourceReel({ upload }: SourceReelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 80, flexShrink: 0 }}>
      {/* Film reel icon */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#F3F0FF",
          border: "2px solid #C4B5FD",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Sprocket holes */}
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <div
            key={deg}
            style={{
              position: "absolute",
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#C4B5FD",
              transform: `rotate(${deg}deg) translateY(-20px)`,
            }}
          />
        ))}
        {/* Center hub */}
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: "#8B5CF6",
          }}
        />
      </div>

      {/* Label */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 10,
            fontWeight: 500,
            color: "#6A6A63",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Source
        </div>
        {upload ? (
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              color: "#0E0E0C",
              lineHeight: 1.3,
            }}
          >
            {upload.segments.length} segs
            <br />
            {upload.totalDuration.toFixed(1)}s
          </div>
        ) : (
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              color: "#6A6A63",
            }}
          >
            no video
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/components/pipeline/SourceReel.tsx
git commit -m "feat(web): add SourceReel pipeline sub-component"
```

---

## Task 5: Shredder sub-component

**Files:**
- Create: `web/src/components/pipeline/Shredder.tsx`

- [ ] **Step 1: Create the component**

Create `web/src/components/pipeline/Shredder.tsx`:

```tsx
"use client";

import type { PacerStatus } from "@/lib/types";

interface ShredderProps {
  pacerState: PacerStatus["state"];
  segmentDuration: number;
}

export function Shredder({ pacerState, segmentDuration }: ShredderProps) {
  const isRunning = pacerState === "running";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 72, flexShrink: 0 }}>
      {/* Machine body */}
      <div
        style={{
          width: 56,
          height: 64,
          backgroundColor: "#F0EFEB",
          border: "2px solid #D5D3CB",
          borderRadius: 4,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Teeth row */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 14,
            display: "flex",
            justifyContent: "center",
            gap: 2,
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 10,
                backgroundColor: "#6A6A63",
                borderRadius: "0 0 2px 2px",
                transform: isRunning
                  ? undefined
                  : "translateY(-2px)",
                animation: isRunning
                  ? `shredder-tooth 0.3s ease-in-out infinite ${i * 0.05}s alternate`
                  : "none",
              }}
            />
          ))}
        </div>

        {/* Label on body */}
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 8,
            color: "#6A6A63",
            lineHeight: 1.3,
          }}
        >
          ffmpeg
          <br />
          {segmentDuration}s
        </div>

        {/* Output slot */}
        <div
          style={{
            position: "absolute",
            bottom: -2,
            left: "50%",
            transform: "translateX(-50%)",
            width: 20,
            height: 6,
            backgroundColor: "#D5D3CB",
            borderRadius: "0 0 3px 3px",
          }}
        />
      </div>

      <style>{`
        @keyframes shredder-tooth {
          0% { transform: translateY(0px); }
          100% { transform: translateY(3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .shredder-tooth-animated {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/components/pipeline/Shredder.tsx
git commit -m "feat(web): add Shredder pipeline sub-component"
```

---

## Task 6: Conveyor belt sub-component (the centerpiece)

**Files:**
- Create: `web/src/components/pipeline/Conveyor.tsx`

- [ ] **Step 1: Create the component**

Create `web/src/components/pipeline/Conveyor.tsx`:

```tsx
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
    // Slower movement for delayed chunks
    return Math.min(0.7, elapsed / (tickIntervalMs * 2));
  }

  return Math.min(0.85, elapsed / tickIntervalMs);
}

function shouldShow(chunk: PipelineChunk, now: number): boolean {
  // Received chunks fade out after 300ms
  if (chunk.phase === "received" && chunk.receivedAt) {
    return now - chunk.receivedAt < 300;
  }
  // Failed chunks fade out after 600ms
  if (chunk.phase === "failed" && chunk.failedAt) {
    return now - chunk.failedAt < 600;
  }
  // Duplicate ghosts fade out after 400ms
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
    if (pacerState === "running" || pacerState === "paused") {
      forceRender((n) => n + 1);
    }
    rafRef.current = requestAnimationFrame(animate);
  }, [pacerState]);

  useEffect(() => {
    // Only run rAF when there are chunks to animate
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
      {/* Belt label */}
      <div
        style={{
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          color: "#6A6A63",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        Conveyor
      </div>

      {/* Belt surface */}
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
        {/* Belt track lines */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: BELT_STROKE, opacity: 0.15 }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: BELT_STROKE, opacity: 0.15 }} />

        {/* Chunks */}
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

        {/* Empty state */}
        {visibleChunks.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              color: "#6A6A63",
              opacity: 0.5,
            }}
          >
            idle
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/components/pipeline/Conveyor.tsx
git commit -m "feat(web): add Conveyor belt with rAF-driven chunk positions"
```

---

## Task 7: OrchestratorWindow sub-component

**Files:**
- Create: `web/src/components/pipeline/OrchestratorWindow.tsx`

- [ ] **Step 1: Create the component**

Create `web/src/components/pipeline/OrchestratorWindow.tsx`:

```tsx
"use client";

import type { PlaylistJson } from "@/lib/types";

interface OrchestratorWindowProps {
  playlist: PlaylistJson | null;
}

export function OrchestratorWindow({ playlist }: OrchestratorWindowProps) {
  const slots = playlist?.segments ?? [];
  const ended = playlist?.ended ?? false;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 76, flexShrink: 0 }}>
      {/* Label */}
      <div
        style={{
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          color: "#6A6A63",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Window
      </div>

      {/* Slot column */}
      <div
        style={{
          width: 60,
          backgroundColor: "#FAFAF7",
          border: "2px solid #E4E2D9",
          borderRadius: 4,
          padding: 3,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minHeight: 130,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const seg = slots[i];
          return (
            <div
              key={i}
              style={{
                height: 18,
                borderRadius: 3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                backgroundColor: seg ? "#FEF3C7" : "#F0EFEB",
                border: seg ? "1.5px solid #F59E0B" : "1.5px solid #D5D3CB",
                color: seg ? "#92400E" : "#D5D3CB",
                transition: "all 200ms ease",
              }}
            >
              {seg ? `seg ${seg.sequence}` : "—"}
            </div>
          );
        })}
      </div>

      {/* Sequence + ended */}
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: "#6A6A63",
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {playlist ? (
          <>
            seq {playlist.mediaSequence}
            {ended && (
              <div style={{ color: "#9F1239", fontWeight: 600 }}>ENDED</div>
            )}
          </>
        ) : (
          "empty"
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/components/pipeline/OrchestratorWindow.tsx
git commit -m "feat(web): add OrchestratorWindow pipeline sub-component"
```

---

## Task 8: PlayerMonitor sub-component

**Files:**
- Create: `web/src/components/pipeline/PlayerMonitor.tsx`

- [ ] **Step 1: Create the component**

Create `web/src/components/pipeline/PlayerMonitor.tsx`:

```tsx
"use client";

interface PlayerMonitorProps {
  videoState: "idle" | "playing" | "paused" | "waiting";
}

export function PlayerMonitor({ videoState }: PlayerMonitorProps) {
  const isPlaying = videoState === "playing";
  const isWaiting = videoState === "waiting";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 72, flexShrink: 0 }}>
      {/* TV body */}
      <div
        style={{
          width: 56,
          height: 44,
          backgroundColor: "#1A1A18",
          borderRadius: 4,
          border: "2px solid #333330",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Screen */}
        <div
          style={{
            position: "absolute",
            inset: 4,
            borderRadius: 2,
            backgroundColor: isPlaying ? "#0F6E56" : isWaiting ? "#4E6B88" : "#2A2A27",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color 200ms ease",
          }}
        >
          {isPlaying && (
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "10px solid #FAFAF7",
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                marginLeft: 3,
              }}
            />
          )}
          {isWaiting && (
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                border: "2px solid #FAFAF7",
                borderTopColor: "transparent",
                animation: "spin 1s linear infinite",
              }}
            />
          )}
        </div>
      </div>

      {/* Stand */}
      <div style={{ width: 20, height: 4, backgroundColor: "#333330", borderRadius: 2 }} />

      {/* Label */}
      <div
        style={{
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          color: "#6A6A63",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Player
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/components/pipeline/PlayerMonitor.tsx
git commit -m "feat(web): add PlayerMonitor pipeline sub-component"
```

---

## Task 9: PipelineView orchestrator component

**Files:**
- Create: `web/src/components/pipeline/PipelineView.tsx`

- [ ] **Step 1: Create the component**

Create `web/src/components/pipeline/PipelineView.tsx`:

```tsx
"use client";

import { SourceReel } from "./SourceReel";
import { Shredder } from "./Shredder";
import { Conveyor } from "./Conveyor";
import { OrchestratorWindow } from "./OrchestratorWindow";
import { PlayerMonitor } from "./PlayerMonitor";
import { usePipelineChunks } from "@/hooks/usePipelineChunks";
import type { PacerEvent, PacerStatus, PlaylistJson, UploadResult } from "@/lib/types";

interface PipelineViewProps {
  upload: UploadResult | null;
  events: PacerEvent[];
  pacerState: PacerStatus["state"];
  speed: number;
  segmentDuration: number;
  playlist: PlaylistJson | null;
  videoState: "idle" | "playing" | "paused" | "waiting";
}

export function PipelineView({
  upload,
  events,
  pacerState,
  speed,
  segmentDuration,
  playlist,
  videoState,
}: PipelineViewProps) {
  const { chunks } = usePipelineChunks(events, pacerState);

  return (
    <div style={{ padding: "16px 16px 12px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minHeight: 140,
        }}
      >
        <SourceReel upload={upload} />

        {/* Arrow */}
        <div style={{ color: "#D5D3CB", fontSize: 18, flexShrink: 0 }}>&rarr;</div>

        <Shredder pacerState={pacerState} segmentDuration={segmentDuration} />

        {/* Arrow */}
        <div style={{ color: "#D5D3CB", fontSize: 18, flexShrink: 0 }}>&rarr;</div>

        <Conveyor
          chunks={chunks}
          pacerState={pacerState}
          speed={speed}
          segmentDuration={segmentDuration}
        />

        {/* Arrow */}
        <div style={{ color: "#D5D3CB", fontSize: 18, flexShrink: 0 }}>&rarr;</div>

        <OrchestratorWindow playlist={playlist} />

        {/* Arrow */}
        <div style={{ color: "#D5D3CB", fontSize: 18, flexShrink: 0 }}>&rarr;</div>

        <PlayerMonitor videoState={videoState} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/components/pipeline/PipelineView.tsx
git commit -m "feat(web): add PipelineView orchestrator component"
```

---

## Task 10: Wire into page.tsx with view toggle and video state

**Files:**
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/components/VideoPlayer.tsx`

- [ ] **Step 1: Add onVideoStateChange callback to VideoPlayer**

In `web/src/components/VideoPlayer.tsx`, add an `onVideoStateChange` prop and fire it from video events. Replace the entire file with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
  active: boolean;
  onVideoStateChange?: (state: "idle" | "playing" | "paused" | "waiting") => void;
}

export function VideoPlayer({ active, onVideoStateChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      onVideoStateChange?.("idle");
      return;
    }
    if (!videoRef.current) return;

    const video = videoRef.current;
    const playlistUrl = "/api/playlist";

    const handlePlay = () => onVideoStateChange?.("playing");
    const handlePause = () => onVideoStateChange?.("paused");
    const handleWaiting = () => onVideoStateChange?.("waiting");
    const handlePlaying = () => onVideoStateChange?.("playing");

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    // Safari: native HLS support
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlistUrl;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {});
      });
      return () => {
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("waiting", handleWaiting);
        video.removeEventListener("playing", handlePlaying);
      };
    }

    // All others: hls.js
    if (!Hls.isSupported()) {
      setError("HLS is not supported in this browser");
      return;
    }

    const hls = new Hls({
      liveSyncDuration: 4,
      liveMaxLatencyDuration: 10,
      enableWorker: true,
    });
    hlsRef.current = hls;

    hls.loadSource(playlistUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setTimeout(() => hls.startLoad(), 2000);
        } else {
          setError(`HLS error: ${data.details}`);
        }
      }
    });

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      hls.destroy();
      hlsRef.current = null;
    };
  }, [active, onVideoStateChange]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">
        Player
      </h2>
      <div className="flex-1 flex items-center justify-center bg-neutral-bg rounded border border-neutral-border overflow-hidden">
        {error ? (
          <p className="text-coral-ink text-sm">{error}</p>
        ) : !active ? (
          <p className="text-muted text-sm">Start the stream to enable playback</p>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            controls
            muted
            playsInline
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update page.tsx with view toggle and pipeline view**

Replace `web/src/app/page.tsx` with:

```tsx
"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/Header";
import { UploadPanel } from "@/components/UploadPanel";
import { ControlBar } from "@/components/ControlBar";
import { SegmentTimeline } from "@/components/SegmentTimeline";
import { PlaylistView } from "@/components/PlaylistView";
import { VideoPlayer } from "@/components/VideoPlayer";
import { EventLog } from "@/components/EventLog";
import { ViewToggle } from "@/components/ViewToggle";
import type { ViewMode } from "@/components/ViewToggle";
import { PipelineView } from "@/components/pipeline/PipelineView";
import { usePacerEvents } from "@/hooks/usePacerEvents";
import { usePlaylistPolling } from "@/hooks/usePlaylistPolling";
import type { UploadResult } from "@/lib/types";

export default function Home() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("pipeline");
  const [videoState, setVideoState] = useState<"idle" | "playing" | "paused" | "waiting">("idle");
  const {
    segments,
    pacerState,
    events,
    speed,
    chaos,
    segmentDuration,
    clearEvents,
  } = usePacerEvents();

  const isActive = pacerState !== "idle";
  const { playlist, windowSequences } = usePlaylistPolling(isActive);

  const handleUpload = useCallback(async (result: UploadResult) => {
    setUploadResult(result);
  }, []);

  async function handleStart() {
    if (!uploadResult) return;
    await fetch("/api/pacer/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadId: uploadResult.uploadId,
        segments: uploadResult.segments,
      }),
    });
  }

  async function handlePause() {
    await fetch("/api/pacer/pause", { method: "POST" });
  }

  async function handleResume() {
    await fetch("/api/pacer/resume", { method: "POST" });
  }

  async function handleEnd() {
    await fetch("/api/pacer/end", { method: "POST" });
  }

  async function handleReset() {
    await fetch("/api/pacer/reset", { method: "POST" });
    setUploadResult(null);
    setVideoState("idle");
    clearEvents();
  }

  async function handleSpeedChange(newSpeed: number) {
    await fetch("/api/pacer/speed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed: newSpeed }),
    });
  }

  async function handleChaosToggle(enabled: boolean) {
    await fetch("/api/pacer/chaos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Upload */}
      <div className="px-4 py-4 border-b border-hairline">
        {uploadResult ? (
          <div className="text-sm text-muted">
            <span className="font-mono">{uploadResult.segments.length}</span> segments ready
            ({uploadResult.totalDuration.toFixed(1)}s total)
          </div>
        ) : (
          <UploadPanel onUploadComplete={handleUpload} />
        )}
      </div>

      {/* Controls */}
      <ControlBar
        pacerState={pacerState}
        speed={speed}
        chaos={chaos}
        hasSegments={uploadResult !== null}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onEnd={handleEnd}
        onReset={handleReset}
        onSpeedChange={handleSpeedChange}
        onChaosToggle={handleChaosToggle}
      />

      {/* View toggle + hero area */}
      <div className="border-b border-hairline">
        <ViewToggle mode={viewMode} onChange={setViewMode} />

        {viewMode === "pipeline" ? (
          <PipelineView
            upload={uploadResult}
            events={events}
            pacerState={pacerState}
            speed={speed}
            segmentDuration={segmentDuration}
            playlist={playlist}
            videoState={videoState}
          />
        ) : (
          <SegmentTimeline segments={segments} windowSequences={windowSequences} />
        )}
      </div>

      {/* Playlist + Player */}
      <div className="grid grid-cols-2 gap-4 p-4 flex-1 min-h-[300px] border-b border-hairline">
        <PlaylistView playlist={playlist} />
        <VideoPlayer active={isActive} onVideoStateChange={setVideoState} />
      </div>

      {/* Event Log */}
      <EventLog events={events} />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Build**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator/web && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/stefansolves/Stefan/Projects/hls-orchestrator
git add web/src/app/page.tsx web/src/components/VideoPlayer.tsx
git commit -m "feat(web): wire pipeline view into page with view toggle and video state"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| segmentDuration in PacerStatus | Task 1 |
| Chunk state machine from events | Task 2 |
| Pipeline/Timeline tab toggle, pipeline default | Task 3, Task 10 |
| SourceReel with upload info | Task 4 |
| Shredder with animated teeth | Task 5 |
| Conveyor with rAF position math | Task 6 |
| OrchestratorWindow 6-slot column | Task 7 |
| PlayerMonitor with video state | Task 8 |
| PipelineView orchestrating all 5 | Task 9 |
| Wired into page.tsx | Task 10 |
| VideoPlayer onVideoStateChange | Task 10 |
| Pause freezes, resume continues | Task 2 (pauseAdjustMs), Task 6 (pausedAtRef) |
| Speed changes affect belt | Task 6 (tickIntervalMs recomputed each frame) |
| prefers-reduced-motion | Task 6 (reduced flag), Task 5, Task 8 |
| No animation libraries | All tasks use CSS + inline styles |
| No new API routes | Confirmed — reuses existing hooks |
| No setInterval for belt | Task 6 uses rAF only |
| Existing timeline preserved | Task 10 (conditional render, both work) |
| Inline hex colors (no Tailwind class purging) | Tasks 4-9 use inline styles with hex values |
| Reset clears belt | Task 2 (store.reset()), Task 10 (handleReset) |
| Duplicate ghost chunks | Task 2 (ghostSeq = seq + 0.5), Task 6 (fade out) |

**Placeholder scan:** No TBD, TODO, or "implement later" found.

**Type consistency:** `PipelineChunk` is defined in Task 2 and consumed by Task 6. `ViewMode` is defined and exported in Task 3, imported in Task 10. `videoState` type `"idle" | "playing" | "paused" | "waiting"` is consistent across Tasks 8, 9, and 10. `segmentDuration` is added to `PacerStatus` in Task 1, exposed from hook in Task 1, consumed in Tasks 5, 6, 9, 10.
