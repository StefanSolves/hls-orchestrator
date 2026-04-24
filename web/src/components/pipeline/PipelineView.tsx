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
        <div style={{ color: "#D5D3CB", fontSize: 18, flexShrink: 0 }}>&rarr;</div>
        <Shredder pacerState={pacerState} segmentDuration={segmentDuration} />
        <div style={{ color: "#D5D3CB", fontSize: 18, flexShrink: 0 }}>&rarr;</div>
        <Conveyor
          chunks={chunks}
          pacerState={pacerState}
          speed={speed}
          segmentDuration={segmentDuration}
        />
        <div style={{ color: "#D5D3CB", fontSize: 18, flexShrink: 0 }}>&rarr;</div>
        <OrchestratorWindow playlist={playlist} />
        <div style={{ color: "#D5D3CB", fontSize: 18, flexShrink: 0 }}>&rarr;</div>
        <PlayerMonitor videoState={videoState} />
      </div>
    </div>
  );
}
