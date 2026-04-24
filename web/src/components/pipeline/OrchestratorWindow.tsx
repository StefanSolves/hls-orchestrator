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
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 10, fontWeight: 500, color: "#6A6A63", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Window
      </div>
      <div style={{ width: 60, backgroundColor: "#FAFAF7", border: "2px solid #E4E2D9", borderRadius: 4, padding: 3, display: "flex", flexDirection: "column", gap: 2, minHeight: 130 }}>
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
              {seg ? `seg ${seg.sequence}` : "\u2014"}
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "#6A6A63", textAlign: "center", lineHeight: 1.3 }}>
        {playlist ? (
          <>
            seq {playlist.mediaSequence}
            {ended && <div style={{ color: "#9F1239", fontWeight: 600 }}>ENDED</div>}
          </>
        ) : "empty"}
      </div>
    </div>
  );
}
