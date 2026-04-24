"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { PlaylistJson } from "@/lib/types";

export function usePlaylistPolling(enabled: boolean) {
  const [playlist, setPlaylist] = useState<PlaylistJson | null>(null);
  const [windowSequences, setWindowSequences] = useState<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef(750);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/playlist?format=json", { cache: "no-store" });
      if (res.ok) {
        const data: PlaylistJson = await res.json();
        setPlaylist(data);
        setWindowSequences(new Set(data.segments.map((s) => s.sequence)));
        intervalRef.current = 750; // Fast polling on success
      } else if (res.status === 404) {
        intervalRef.current = 3000; // Back off on 404
      }
    } catch {
      intervalRef.current = 3000;
    }

    if (enabled) {
      timerRef.current = setTimeout(poll, intervalRef.current);
    }
  }, [enabled]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!enabled) return;

    // Start polling immediately
    intervalRef.current = 750;
    poll();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, poll]);

  return { playlist, windowSequences };
}
