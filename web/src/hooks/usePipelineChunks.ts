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
        const ghostSeq = seq + 0.5;
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

  useEffect(() => {
    const newEvents = events.slice(lastProcessedRef.current);
    for (const event of newEvents) {
      store.processEvent(event);
    }
    lastProcessedRef.current = events.length;
  }, [events, store]);

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
