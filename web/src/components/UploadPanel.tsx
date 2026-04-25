"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { UploadResult } from "@/lib/types";

type UploadStage = "idle" | "uploading" | "transcoding" | "ready" | "error";

interface UploadPanelProps {
  onUploadComplete: (result: UploadResult) => void;
  resetKey?: number;
}

export function UploadPanel({ onUploadComplete, resetKey }: UploadPanelProps) {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSizeMB, setFileSizeMB] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const [uploadedMB, setUploadedMB] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Reset when parent signals (via resetKey changing)
  useEffect(() => {
    if (resetKey !== undefined && resetKey > 0) {
      handleRetry();
    }
  }, [resetKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
      esRef.current?.close();
    };
  }, []);

  const handleTranscodeSSE = useCallback((uploadId: string) => {
    const es = new EventSource(`/api/upload/transcode-progress?uploadId=${uploadId}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === "transcoding") {
          setTranscodeProgress(data.progress);
        } else if (data.status === "complete") {
          es.close();
          esRef.current = null;
          const uploadResult: UploadResult = {
            uploadId,
            segments: data.segments,
            totalDuration: data.totalDuration,
          };
          setResult(uploadResult);
          setTranscodeProgress(1);
          setStage("ready");
          onUploadComplete(uploadResult);
        } else if (data.status === "error") {
          es.close();
          esRef.current = null;
          setError(data.message || "Transcoding failed");
          setStage("error");
        }
      } catch {
        // ignore malformed SSE
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // If we haven't received a result yet, the connection dropped
      if (stage === "transcoding") {
        setError("Lost connection to transcoding progress. The video may still be processing — try refreshing.");
        setStage("error");
      }
    };
  }, [onUploadComplete, stage]);

  function handleFile(file: File) {
    if (!file.type.startsWith("video/") && !file.name.endsWith(".mp4")) {
      setError("Please upload a video file (.mp4)");
      setStage("error");
      return;
    }

    const sizeMB = Math.round(file.size / 1024 / 1024 * 10) / 10;
    setFileName(file.name);
    setFileSizeMB(sizeMB);
    setUploadProgress(0);
    setUploadedMB(0);
    setTranscodeProgress(0);
    setStage("uploading");
    setError(null);

    const formData = new FormData();
    formData.append("video", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(e.loaded / e.total);
        setUploadedMB(Math.round(e.loaded / 1024 / 1024 * 10) / 10);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.uploadId) {
            setUploadProgress(1);
            setStage("transcoding");
            handleTranscodeSSE(data.uploadId);
          }
        } catch {
          setError("Invalid response from server");
          setStage("error");
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          setError(data.error || `Upload failed (${xhr.status})`);
        } catch {
          setError(`Upload failed (${xhr.status})`);
        }
        setStage("error");
      }
    };

    xhr.onerror = () => {
      setError("Network error during upload");
      setStage("error");
    };

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  }

  function handleRetry() {
    xhrRef.current?.abort();
    esRef.current?.close();
    setStage("idle");
    setError(null);
    setFileName(null);
    setFileSizeMB(null);
    setUploadProgress(0);
    setUploadedMB(0);
    setTranscodeProgress(0);
    setResult(null);
  }

  if (stage === "ready" && result) {
    return (
      <div className="flex items-center gap-3">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <circle cx="8" cy="8" r="8" fill="#CCFBF1" />
          <path d="M5 8l2 2 4-4" stroke="#134E4A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm text-ink">
          Ready — <span className="font-mono">{result.segments.length}</span> segments, {result.totalDuration.toFixed(1)}s total
        </span>
        <button
          onClick={handleRetry}
          className="text-xs text-muted underline underline-offset-2 hover:text-ink ml-2"
        >
          choose another video
        </button>
      </div>
    );
  }

  if (stage === "uploading" || stage === "transcoding") {
    return (
      <div className="space-y-3 py-2">
        {/* Stage 1: Upload */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted font-sans">
              {stage === "uploading"
                ? `Uploading ${fileName} — ${uploadedMB} / ${fileSizeMB}MB`
                : `Uploaded ${fileName}`}
            </span>
            <span className="font-mono text-muted">{Math.round(uploadProgress * 100)}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#E1E8F0" }}>
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${uploadProgress * 100}%`, backgroundColor: "#4E6B88" }}
            />
          </div>
        </div>

        {/* Stage 2: Transcode (visible once upload completes) */}
        {stage === "transcoding" && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted font-sans">Segmenting with ffmpeg...</span>
              <span className="font-mono text-muted">{Math.round(transcodeProgress * 100)}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#C8EBDC" }}>
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${transcodeProgress * 100}%`, backgroundColor: "#1D9E75" }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="flex items-center gap-3 py-2">
        <span className="text-sm text-coral-ink">{error}</span>
        <button
          onClick={handleRetry}
          className="text-xs text-muted underline underline-offset-2 hover:text-ink"
        >
          retry
        </button>
      </div>
    );
  }

  // idle
  return (
    <div
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        dragOver ? "border-amber-border bg-amber-bg/30" : "border-hairline"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <p className="text-muted mb-2">
        Drop a .mp4 file here, or{" "}
        <button
          className="text-ink underline underline-offset-2"
          onClick={() => inputRef.current?.click()}
        >
          browse
        </button>
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mp4"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
