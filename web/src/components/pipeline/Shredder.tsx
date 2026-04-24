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
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 14, display: "flex", justifyContent: "center", gap: 2 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 10,
                backgroundColor: "#6A6A63",
                borderRadius: "0 0 2px 2px",
                transform: isRunning ? undefined : "translateY(-2px)",
                animation: isRunning ? `shredder-tooth 0.3s ease-in-out infinite ${i * 0.05}s alternate` : "none",
              }}
            />
          ))}
        </div>
        <div style={{ position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "#6A6A63", lineHeight: 1.3 }}>
          ffmpeg<br />{segmentDuration}s
        </div>
        <div style={{ position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)", width: 20, height: 6, backgroundColor: "#D5D3CB", borderRadius: "0 0 3px 3px" }} />
      </div>
      <style>{`
        @keyframes shredder-tooth {
          0% { transform: translateY(0px); }
          100% { transform: translateY(3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}
