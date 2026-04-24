# HLS Orchestrator — Web Demo

A browser-based visualizer for the Go HLS orchestrator, designed for live technical talks. Makes the invisible parts of HLS visible: chunking, sliding window, out-of-order arrivals, media-sequence advancing, and deduplication.

## Prerequisites

- Node.js 20+
- ffmpeg on PATH (`brew install ffmpeg` or equivalent)
- Go 1.21+ (to run the orchestrator)

## Setup

Terminal 1 — Go orchestrator:

```bash
go run cmd/orchestrator/main.go
```

Terminal 2 — Web demo:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

## How It Works

```
Browser (:3000)          Next.js Server           Go Orchestrator (:8080)
────────────────         ──────────────           ──────────────────────
Upload .mp4 ───────────> ffmpeg segments
                         to tmpdir

Start ─────────────────> Pacer loop ────────────> POST segments
                         (setTimeout,              (window=6, dedup,
                          controllable speed)       gap detection)

SSE events <───────────  emits per-segment
                         state changes

GET /api/playlist ─────> proxy ──────────────────> GET playlist.m3u8
GET /api/segments/* ───> serve .ts from disk

hls.js player ─────────> fetches playlist + segments through Next.js
```

## Talk-Mode Tips

- **Recommended speed:** 0.5x reads well from the back of the room
- **Chaos mode:** Flip it on mid-stream to demo out-of-order arrivals and dedup. The amber window tiles will show gaps healing in real time.
- **Explain the timeline:** Teal = received by orchestrator, Amber with ring = currently in the sliding window playlist, Coral = delayed/duplicated/failed
- **End stream:** Click End to show `#EXT-X-ENDLIST` appearing in the playlist view

## Known Limitations

- Local-only (ffmpeg runs server-side in a Next.js API route)
- Single active session at a time — uploading again replaces the previous session
- No authentication or multi-user support
- The Go orchestrator's window size (6) is hardcoded and not adjustable at runtime
