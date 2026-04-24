"use client";

interface PlayerMonitorProps {
  videoState: "idle" | "playing" | "paused" | "waiting";
}

export function PlayerMonitor({ videoState }: PlayerMonitorProps) {
  const isPlaying = videoState === "playing";
  const isWaiting = videoState === "waiting";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 72, flexShrink: 0 }}>
      <div style={{ width: 56, height: 44, backgroundColor: "#1A1A18", borderRadius: 4, border: "2px solid #333330", position: "relative", overflow: "hidden" }}>
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
            <div style={{ width: 0, height: 0, borderLeft: "10px solid #FAFAF7", borderTop: "6px solid transparent", borderBottom: "6px solid transparent", marginLeft: 3 }} />
          )}
          {isWaiting && (
            <div style={{ width: 12, height: 12, borderRadius: 6, border: "2px solid #FAFAF7", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
          )}
        </div>
      </div>
      <div style={{ width: 20, height: 4, backgroundColor: "#333330", borderRadius: 2 }} />
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 10, fontWeight: 500, color: "#6A6A63", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Player
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; } }
      `}</style>
    </div>
  );
}
