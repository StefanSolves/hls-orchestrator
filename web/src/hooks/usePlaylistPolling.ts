"use client";

import { useEffect, useState, useRef } from "react";
import type { PlaylistJson } from "@/lib/types";

export function usePlaylistPolling(enabled: boolean) {
  const [playlist, setPlaylist] = useState<PlaylistJson | null>(null);
  const [windowSequences, setWindowSequences] = useState<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    async function poll() {
      try {
        const res = await fetch("/api/playlist?format=json", { cache: "no-store" });
        if (!res.ok) return;
        const data: PlaylistJson = await res.json();
        setPlaylist(data);
        setWindowSequences(new Set(data.segments.map((s) => s.sequence)));
      } catch {
        // Orchestrator or proxy not reachable; skip this tick
      }
    }

    poll(); // Immediate first poll
    timerRef.current = setInterval(poll, 750);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled]);

  return { playlist, windowSequences };
}
