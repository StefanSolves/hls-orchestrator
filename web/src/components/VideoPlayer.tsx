"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
  active: boolean;
  onVideoStateChange?: (state: "idle" | "playing" | "paused" | "waiting") => void;
}

export function VideoPlayer({ active, onVideoStateChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [showUnmuteOverlay, setShowUnmuteOverlay] = useState(false);

  const handleVideoStateChange = useCallback(
    (state: "idle" | "playing" | "paused" | "waiting") => {
      onVideoStateChange?.(state);
    },
    [onVideoStateChange]
  );

  useEffect(() => {
    if (!active) {
      handleVideoStateChange("idle");
      setShowUnmuteOverlay(false);
      return;
    }
    if (!videoRef.current) return;

    const video = videoRef.current;
    const playlistUrl = "/api/playlist";

    const handlePlay = () => {
      handleVideoStateChange("playing");
      setShowUnmuteOverlay(true);
    };
    const handlePause = () => handleVideoStateChange("paused");
    const handleWaiting = () => handleVideoStateChange("waiting");
    const handlePlaying = () => {
      handleVideoStateChange("playing");
      setShowUnmuteOverlay(true);
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    // Safari: native HLS support
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlistUrl;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {});
      });
      return () => {
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("waiting", handleWaiting);
        video.removeEventListener("playing", handlePlaying);
      };
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
          // Retry on network errors (playlist not ready yet)
          setTimeout(() => hls.startLoad(), 2000);
        } else {
          setError(`HLS error: ${data.details}`);
        }
      }
    });

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      hls.destroy();
      hlsRef.current = null;
    };
  }, [active, handleVideoStateChange]);

  function handleUnmute() {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
    setShowUnmuteOverlay(false);
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">
        Player
      </h2>
      <div className="flex-1 flex items-center justify-center bg-neutral-bg rounded border border-neutral-border overflow-hidden relative">
        {error ? (
          <p className="text-coral-ink text-sm">{error}</p>
        ) : !active ? (
          <p className="text-muted text-sm">Waiting for stream...</p>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              controls
              muted={isMuted}
              playsInline
            />
            {showUnmuteOverlay && isMuted && (
              <button
                onClick={handleUnmute}
                className="absolute inset-0 flex items-center justify-center bg-ink/30 transition-opacity hover:bg-ink/40"
              >
                <span className="bg-ink/70 text-paper text-xs font-medium px-3 py-1.5 rounded">
                  Tap to unmute
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
