"use client";

import type { UploadResult } from "@/lib/types";

interface SourceReelProps {
  upload: UploadResult | null;
}

export function SourceReel({ upload }: SourceReelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 80, flexShrink: 0 }}>
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
        <div style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#8B5CF6" }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 10, fontWeight: 500, color: "#6A6A63", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Source
        </div>
        {upload ? (
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#0E0E0C", lineHeight: 1.3 }}>
            {upload.segments.length} segs<br />{upload.totalDuration.toFixed(1)}s
          </div>
        ) : (
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#6A6A63" }}>no video</div>
        )}
      </div>
    </div>
  );
}
