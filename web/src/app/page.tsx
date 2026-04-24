"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/Header";
import { UploadPanel } from "@/components/UploadPanel";
import { ControlBar } from "@/components/ControlBar";
import { SegmentTimeline } from "@/components/SegmentTimeline";
import { PlaylistView } from "@/components/PlaylistView";
import { VideoPlayer } from "@/components/VideoPlayer";
import { EventLog } from "@/components/EventLog";
import { usePacerEvents } from "@/hooks/usePacerEvents";
import { usePlaylistPolling } from "@/hooks/usePlaylistPolling";
import type { UploadResult } from "@/lib/types";

export default function Home() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const {
    segments,
    pacerState,
    events,
    speed,
    chaos,
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

      {/* Timeline (hero) */}
      <div className="border-b border-hairline">
        <SegmentTimeline segments={segments} windowSequences={windowSequences} />
      </div>

      {/* Playlist + Player */}
      <div className="grid grid-cols-2 gap-4 p-4 flex-1 min-h-[300px] border-b border-hairline">
        <PlaylistView playlist={playlist} />
        <VideoPlayer active={isActive} />
      </div>

      {/* Event Log */}
      <EventLog events={events} />
    </div>
  );
}
