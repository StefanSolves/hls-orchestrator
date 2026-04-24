"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PacerEvent, PacerStatus, SegmentInfo } from "@/lib/types";

export function usePacerEvents() {
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [pacerState, setPacerState] = useState<PacerStatus["state"]>("idle");
  const [events, setEvents] = useState<PacerEvent[]>([]);
  const [speed, setSpeed] = useState(1);
  const [chaos, setChaos] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/api/pacer/events");
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "status") {
          setSegments(data.segments || []);
          setPacerState(data.state);
          setSpeed(data.speed);
          setChaos(data.chaos);
          setStreamId(data.streamId);
        } else {
          // It's a PacerEvent
          setEvents((prev) => [...prev.slice(-199), data as PacerEvent]);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    es.onerror = () => {
      es.close();
      // Reconnect after 2s
      setTimeout(connect, 2000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { segments, pacerState, events, speed, chaos, streamId, clearEvents };
}
