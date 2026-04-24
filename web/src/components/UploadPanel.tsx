"use client";

import { useState, useRef } from "react";
import type { UploadResult } from "@/lib/types";

interface UploadPanelProps {
  onUploadComplete: (result: UploadResult) => void;
}

export function UploadPanel({ onUploadComplete }: UploadPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/") && !file.name.endsWith(".mp4")) {
      setError("Please upload a video file (.mp4)");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      onUploadComplete(data as UploadResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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
      {uploading ? (
        <p className="text-muted">Segmenting video with ffmpeg...</p>
      ) : (
        <>
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
        </>
      )}
      {error && (
        <p className="text-coral-ink mt-2 text-sm">{error}</p>
      )}
    </div>
  );
}
