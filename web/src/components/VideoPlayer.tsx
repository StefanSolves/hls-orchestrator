"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
  active: boolean;
}

export function VideoPlayer({ active }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !videoRef.current) return;

    const video = videoRef.current;
    const playlistUrl = "/api/playlist";

    // Safari: native HLS support
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlistUrl;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {});
      });
      return;
    }

    // All others: hls.js
    if (!Hls.isSupported()) {
      setError("HLS is not supported in this browser");
      return;
    }

    const hls = new Hls({
      liveSyncDuration: 4,
      liveMaxLatencyDuration: 10,
      enableWorker: true,
    });
    hlsRef.current = hls;

    hls.loadSource(playlistUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setTimeout(() => hls.startLoad(), 2000);
        } else {
          setError(`HLS error: ${data.details}`);
        }
      }
    });

    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [active]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">
        Player
      </h2>
      <div className="flex-1 flex items-center justify-center bg-neutral-bg rounded border border-neutral-border overflow-hidden">
        {error ? (
          <p className="text-coral-ink text-sm">{error}</p>
        ) : !active ? (
          <p className="text-muted text-sm">Start the stream to enable playback</p>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            controls
            muted
            playsInline
          />
        )}
      </div>
    </div>
  );
}
