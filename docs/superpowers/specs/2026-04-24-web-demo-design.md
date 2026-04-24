# HLS Orchestrator Web Demo — Design Spec

## Purpose

A browser-based demo frontend for the Go HLS orchestrator, designed for use during a technical talk. Makes the invisible parts of HLS visible: chunking, sliding window, out-of-order arrivals, media-sequence advancing, gap healing, and deduplication.

## Architecture

Three processes on one machine:

1. **Browser (React UI)** — upload form, control bar, animated segment timeline, raw playlist view, event log, hls.js player.
2. **Next.js server (:3000)** — glue layer. Runs ffmpeg to segment uploaded video. Pacer loop posts segments to Go orchestrator on a controllable clock. Serves `.ts` files. Proxies playlist. Emits SSE events.
3. **Go orchestrator (:8080, unchanged)** — the system under demo. Receives segments, maintains sliding window, serves playlist.

```
Browser (React)          Next.js Server (:3000)         Go Orchestrator (:8080)
─────────────────        ──────────────────────         ─────────────────────────
Upload video ──────────> POST /api/upload
                         ├─ ffmpeg segments to tmpdir
                         └─ returns segment manifest

Start/controls ────────> POST /api/pacer/{action}
                         ├─ Pacer loop (setTimeout)
                         │  for each segment:
                         │    POST /streams/{id}/renditions/{name}/segments ──>
                         │    <── 201 Created
                         │  emits SSE events
SSE stream <────────────

GET /api/playlist ──────> proxy ───> GET /streams/{id}/renditions/{name}/playlist.m3u8
GET /api/segments/* ────> serve .ts from tmpdir

hls.js player ──────────> GET /api/playlist (loop)
                          GET /api/segments/* (per chunk)
```

## Go Orchestrator API (as-is, no changes)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/streams/{id}/renditions/{name}/segments` | `{"sequence": uint64, "duration": float64, "path": "string"}` | 201 Created |
| GET | `/streams/{id}/renditions/{name}/playlist.m3u8` | — | `application/vnd.apple.mpegurl` |
| POST | `/streams/{id}/end` | — | 200 OK |
| GET | `/metrics` | — | `{"active_streams": N, "status": "up"}` |

- Port: 8080 (hardcoded)
- Window size: 6 segments (hardcoded)
- Dedup: silently ignores duplicate sequence numbers
- Gap handling: playlist only publishes consecutive segments from lowest active ID
- No CORS headers (we proxy, so not needed)
- No reset endpoint (we use unique stream IDs per session)

## Next.js API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/upload` | POST | Accept video file, run ffmpeg, return segment manifest |
| `/api/pacer/start` | POST | Start pacer loop |
| `/api/pacer/pause` | POST | Pause pacer |
| `/api/pacer/resume` | POST | Resume pacer |
| `/api/pacer/speed` | POST | Update speed multiplier `{"speed": number}` |
| `/api/pacer/chaos` | POST | Toggle chaos mode `{"enabled": boolean}` |
| `/api/pacer/end` | POST | End stream (calls Go `/streams/{id}/end`) |
| `/api/pacer/reset` | POST | Wipe pacer state, generate new stream ID |
| `/api/pacer/events` | GET | SSE stream of pacer events |
| `/api/playlist` | GET | Proxy Go playlist. `?format=json` returns parsed version. |
| `/api/segments/[uploadId]/[filename]` | GET | Serve `.ts` file from disk with `video/mp2t` |

## Pacer

Singleton class on `globalThis` (survives Next.js HMR in dev).

- **Tick interval:** `segmentDuration * 1000 / speed` milliseconds
- **Speed range:** 0.25x to 4x, adjustable live
- **Chaos mode:** ~28% chance delay (1-3 extra ticks), ~9% chance duplicate
- **Stream ID:** `demo-{Date.now()}` — new ID on each reset, avoids needing Go reset endpoint
- **Segment path:** `/api/segments/{uploadId}/seg{N}.ts`
- **SSE events:** `produced`, `posting`, `received`, `delayed`, `duplicated`, `failed`

Per-segment states: `pending` > `posting` > `in-flight` > `received` | `delayed` | `duplicated` | `failed`

No queues, no workers, no rxjs, no state machine library. Plain `setTimeout` loop.

## ffmpeg Segmentation

On upload, spawn:

```
ffmpeg -y -i <input>
  -c:v libx264 -profile:v baseline -level 3.1 -preset veryfast -pix_fmt yuv420p
  -g 60 -keyint_min 60 -sc_threshold 0
  -c:a aac -b:a 128k -ac 2
  -f hls -hls_time 2 -hls_list_size 0 -hls_segment_type mpegts
  -hls_segment_filename seg%d.ts
  index.m3u8
```

Output directory: `$TMPDIR/hls-demo-uploads/<uuid>/`

Parse resulting `index.m3u8` to extract segment list with durations.

If ffmpeg is not on PATH, surface a clear error in the UI.

## UI

Single page. Projector-friendly light theme (no dark mode).

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  HLS Orchestrator Demo    localhost:8080  * connected    │
├─────────────────────────────────────────────────────────┤
│  [Upload .mp4]  or  drag & drop                         │
├─────────────────────────────────────────────────────────┤
│  > Start  || Pause  [] End  ~ Reset   Speed [----*-] 1x │
│  Chaos: OFF                                              │
├─────────────────────────────────────────────────────────┤
│  SEGMENT TIMELINE (hero)                                 │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│  │ 0  │ │ 1  │ │ 2  │ │ 3  │ │ 4  │ │ 5  │ │ 6  │ ... │
│  │recv│ │recv│ │wind│ │wind│ │wind│ │fly │ │pend│     │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘     │
│                  └── amber ring = in orchestrator window │
├────────────────────────────┬────────────────────────────┤
│  PLAYLIST (raw m3u8)       │  VIDEO PLAYER (hls.js)     │
│  #EXTM3U                   │  ┌──────────────────────┐  │
│  #EXT-X-VERSION:3          │  │                      │  │
│  #EXT-X-TARGETDURATION:2   │  │      >  video        │  │
│  #EXT-X-MEDIA-SEQUENCE:2   │  │                      │  │
│  #EXTINF:2.0,              │  └──────────────────────┘  │
│  /api/segments/.../seg2.ts │                            │
├─────────────────────────────┴────────────────────────────┤
│  > Event Log (collapsible)                               │
│    12:03:01.234  seg 4  posted -> received (142ms)       │
│    12:03:01.891  seg 5  delayed by chaos (2 ticks)       │
└──────────────────────────────────────────────────────────┘
```

### Segment Timeline (hero element)

- Each segment is a tile (~44x48px) with sequence number in monospace
- Tiles change color on state transition (200-300ms ease)
- Tiles currently in the orchestrator's playlist window get amber highlight with ring
- Window membership determined by polling `/api/playlist?format=json` every ~750ms
- Gentle pulse animation while in-flight
- No bouncy physics or spring animations

### Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| paper | #FAFAF7 | Background |
| ink | #0E0E0C | Primary text |
| muted | #6A6A63 | Secondary text |
| hairline | #E4E2D9 | Borders |
| amber | bg/border/ink variants | In-window segments (the star) |
| teal | bg/border/ink variants | Received segments |
| slate | bg/border/ink variants | In-flight segments |
| coral | bg/border/ink variants | Delayed/failed/duplicate |
| neutral | bg/border/ink variants | Pending segments |

### Fonts

- IBM Plex Sans — UI text
- IBM Plex Mono — numbers, sequence IDs, m3u8 text
- Loaded from Google Fonts

### hls.js Configuration

- `liveSyncDuration: 4`
- `liveMaxLatencyDuration: 10`
- Safari uses native HLS; all others use hls.js

## Controls

| Control | Action |
|---------|--------|
| Speed slider | 0.25x to 4x. Adjusts pacer tick interval live. |
| Chaos toggle | Enables out-of-order arrivals and duplicates. |
| Start | Begin pacer loop. |
| Pause / Resume | Pause/resume pacer. |
| End stream | Calls Go end endpoint. Playlist gains `#EXT-X-ENDLIST`. |
| Reset | Wipes pacer state, generates new stream ID. |

## Configuration

Environment variables (`.env.example`):

```
ORCHESTRATOR_URL=http://localhost:8080
STREAM_ID=demo          # prefix; actual ID is demo-{timestamp}
RENDITION=720p
SEGMENT_DURATION=2
```

## Tech Stack

- next (15), react, react-dom, hls.js, tailwindcss, typescript
- No framer-motion, shadcn, tRPC, zustand, or other extras

## Constraints

- No Go orchestrator changes
- No database, auth, multi-user
- Local-only (ffmpeg in API route)
- One active upload/session at a time
- No upload size cap
- No dark mode

## Verification Criteria

1. `npm run typecheck` passes with zero errors
2. `npm run build` succeeds
3. Upload short mp4 -> Start -> tiles transition pending > in-flight > received > amber window > slide off window -> hls.js player plays video
4. Chaos mode mid-stream produces delayed/duplicate events in log; media-sequence doesn't skip gaps
5. End stream shows `#EXT-X-ENDLIST` in rendered playlist
