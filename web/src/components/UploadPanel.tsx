"use client";

import { useState, useRef, useEffect } from "react";
import type { UploadResult } from "@/lib/types";

type UploadStage = "idle" | "uploading" | "segmenting" | "ready" | "error";

interface UploadPanelProps {
  onUploadComplete: (result: UploadResult) => void;
}

export function UploadPanel({ onUploadComplete }: UploadPanelProps) {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSizeMB, setFileSizeMB] = useState<number | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/") && !file.name.endsWith(".mp4")) {
      setError("Please upload a video file (.mp4)");
      setStage("error");
      return;
    }

    setFileName(file.name);
    setFileSizeMB(Math.round(file.size / 1024 / 1024 * 10) / 10);
    setStage("uploading");
    setError(null);

    // After 1.5s, switch to "segmenting" — the slow part is ffmpeg on the server
    timerRef.current = setTimeout(() => setStage("segmenting"), 1500);

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (timerRef.current) clearTimeout(timerRef.current);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        setStage("error");
        return;
      }
      setResult(data as UploadResult);
      setStage("ready");
      onUploadComplete(data as UploadResult);
    } catch (err) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setError(err instanceof Error ? err.message : "Upload failed");
      setStage("error");
    }
  }

  function handleRetry() {
    setStage("idle");
    setError(null);
    setFileName(null);
    setFileSizeMB(null);
    setResult(null);
  }

  function handleChooseAnother() {
    handleRetry();
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
          onClick={handleChooseAnother}
          className="text-xs text-muted underline underline-offset-2 hover:text-ink ml-2"
        >
          choose another video
        </button>
      </div>
    );
  }

  if (stage === "uploading") {
    return (
      <div className="flex items-center gap-3 py-2">
        <Spinner />
        <span className="text-sm text-muted">
          Uploading {fileName}{fileSizeMB !== null && ` (${fileSizeMB}MB)`}...
        </span>
      </div>
    );
  }

  if (stage === "segmenting") {
    return (
      <div className="flex items-center gap-3 py-2">
        <Spinner />
        <span className="text-sm text-muted">
          Segmenting with ffmpeg...
        </span>
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

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="animate-spin shrink-0">
      <circle cx="8" cy="8" r="6" fill="none" stroke="#D5D3CB" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="#6A6A63" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
