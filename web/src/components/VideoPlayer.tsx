"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

type PlayerStatus = "idle" | "waiting-for-segments" | "buffering" | "playing";

interface VideoPlayerProps {
  active: boolean;
  playlistReady: boolean;
  onVideoStateChange?: (state: "idle" | "playing" | "paused" | "waiting") => void;
}

export function VideoPlayer({ active, playlistReady, onVideoStateChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [showUnmuteOverlay, setShowUnmuteOverlay] = useState(false);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");

  const handleVideoStateChange = useCallback(
    (state: "idle" | "playing" | "paused" | "waiting") => {
      onVideoStateChange?.(state);
    },
    [onVideoStateChange]
  );

  // Show waiting state when active but playlist not ready
  useEffect(() => {
    if (!active) {
      handleVideoStateChange("idle");
      setShowUnmuteOverlay(false);
      setPlayerStatus("idle");
    } else if (!playlistReady) {
      setPlayerStatus("waiting-for-segments");
    }
  }, [active, playlistReady, handleVideoStateChange]);

  // Create hls.js only after playlist is available (with 200ms settling delay)
  useEffect(() => {
    if (!active || !playlistReady || !videoRef.current) return;

    let cancelled = false;
    const delayTimer = setTimeout(() => {
      if (cancelled || !videoRef.current) return;
      initHls(videoRef.current);
    }, 200);

    function initHls(video: HTMLVideoElement) {
      const playlistUrl = "/api/playlist";

      setPlayerStatus("buffering");

      const handlePlay = () => {
        handleVideoStateChange("playing");
        setPlayerStatus("playing");
        setShowUnmuteOverlay(true);
      };
      const handlePause = () => handleVideoStateChange("paused");
      const handleWaiting = () => handleVideoStateChange("waiting");
      const handlePlaying = () => {
        handleVideoStateChange("playing");
        setPlayerStatus("playing");
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
        cleanupRef.current = () => {
          video.removeEventListener("play", handlePlay);
          video.removeEventListener("pause", handlePause);
          video.removeEventListener("waiting", handleWaiting);
          video.removeEventListener("playing", handlePlaying);
          video.removeAttribute("src");
        };
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

      let firstFragLoaded = false;
      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (!firstFragLoaded) {
          firstFragLoaded = true;
          setPlayerStatus("playing");
        }
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

      cleanupRef.current = () => {
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("waiting", handleWaiting);
        video.removeEventListener("playing", handlePlaying);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    const cleanupRef: { current: (() => void) | null } = { current: null };

    return () => {
      cancelled = true;
      clearTimeout(delayTimer);
      cleanupRef.current?.();
    };
  }, [active, playlistReady, handleVideoStateChange]);

  function handleUnmute() {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
    setShowUnmuteOverlay(false);
  }

  const showLoadingOverlay = active && (playerStatus === "waiting-for-segments" || playerStatus === "buffering");

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
            {showLoadingOverlay && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-bg/80">
                <svg width="20" height="20" viewBox="0 0 20 20" className="animate-spin mb-2">
                  <circle cx="10" cy="10" r="8" fill="none" stroke="#D5D3CB" strokeWidth="2" />
                  <path d="M10 2a8 8 0 0 1 8 8" fill="none" stroke="#6A6A63" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="text-xs text-muted font-sans">
                  {playerStatus === "waiting-for-segments" ? "Waiting for first segment..." : "Buffering segments..."}
                </span>
              </div>
            )}
            {showUnmuteOverlay && isMuted && !showLoadingOverlay && (
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
