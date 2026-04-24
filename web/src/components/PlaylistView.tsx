"use client";

import type { PlaylistJson } from "@/lib/types";

interface PlaylistViewProps {
  playlist: PlaylistJson | null;
}

export function PlaylistView({ playlist }: PlaylistViewProps) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">
        Playlist
      </h2>
      {playlist ? (
        <>
          <div className="flex gap-3 text-xs font-mono text-muted mb-2">
            <span>seq: {playlist.mediaSequence}</span>
            <span>segs: {playlist.segments.length}</span>
            {playlist.ended && (
              <span className="text-coral-ink font-semibold">ENDED</span>
            )}
          </div>
          <pre className="flex-1 overflow-auto text-xs font-mono leading-relaxed bg-neutral-bg rounded p-3 border border-neutral-border whitespace-pre-wrap break-all">
            {playlist.raw}
          </pre>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted">
          No playlist yet
        </div>
      )}
    </div>
  );
}
