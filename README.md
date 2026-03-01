# Low-Latency HLS Playlist Orchestrator

## Overview
This is a thread-safe, concurrent Go service that acts as an HTTP Live Streaming (HLS) playlist orchestrator. It acts as the middleman between a live video transcoder (which uploads video segments) and a video player (which requests the `.m3u8` manifest).

## Features Implemented
* **Concurrency**: Thread-safe handling of simultaneous segment uploads and playlist requests across multiple streams and renditions using `sync.RWMutex`.
* **Sliding Window**: Maintains a strict rolling buffer of 6 segments. Older segments are automatically evicted from memory.
* **Contiguity (Gap Detection)**: Detects missing or out-of-order segments. The generated playlist only exposes contiguous segments, hiding gaps to prevent player crashes. It dynamically heals when delayed segments arrive.
* **Graceful Shutdown**: Context-aware termination ensuring all active HTTP requests finish before the server stops.
* **Bonuses Completed**: Dockerfile included, Unit Tests written, and a `/metrics` health endpoint implemented.

## Prerequisites
* Go 1.21 or higher (Tested on 1.23+)
* Docker (Optional, for containerized running)

## How to Run

**Using Go:**

go run cmd/orchestrator/main.go

**Using Docker** 

docker build -t hls-orchestrator .
docker run -p 8080:8080 hls-orchestrator

**Running Tests**

To verify the sliding window and contignuity logic:
go test ./internal/streaming/... -v

**API Endpoints**

Check Health/Metrics: GET /metrics
Register a Segment: POST /streams/{streamID}/renditions/{renditionName}/segments
Body: {"sequence": 1, "duration": 2.0, "path": "/segments/1.ts"}
Get Playlist: GET /streams/{streamID}/renditions/{renditionName}/playlist.m3u8
End Stream: POST /streams/{streamID}/end

**Latency Analysis**

Minimum Achievable LatencyWith a 2.0s segment duration and a 6-segment sliding window, the theoretical minimum live latency is approximately 6 to 10 seconds.

Most standard HLS players (like Safari natively, HLS.js, or ExoPlayer) require a buffer of roughly 3 full segments before they begin playback to ensure stability against network jitter. ($3 \text{ segments} \times 2.0\text{s} = 6.0\text{s}$ of edge latency).

Strategies for "Near-Instant" Latency (< 2s)To bridge the gap between standard HLS and "instant" streaming, the following strategies can be applied:Reduce Segment Duration: Shifting the transcoder from 2.0s to 1.0s or 0.5s segments directly reduces the "chunk" of time the player must wait for.LL-HLS (Low-Latency HLS) & CMAF: Implement Apple's LL-HLS specification.

This allows the orchestrator to advertise and deliver "Partial Segments" (CMAF chunks) of ~200ms before the full 2s segment is even finished encoding.HTTP/2 Push / Preload Hints: Use the #EXT-X-PRELOAD-HINT tag to tell the video player exactly which segment is coming next, allowing it to open the connection early.

**Trade-offs**
Overhead: Shorter segments (or partial CMAF chunks) exponentially increase the number of HTTP requests made to the orchestrator and CDN, which increases compute load and bandwidth overhead.

Stability: A smaller buffer leaves the video player highly susceptible to "stalling" (buffering spinners) if the user's network speed fluctuates even slightly.

**Testing with Curl**
To quickly verify the system, live stream can be simulated by running these commands in order:

1. Push initial segments:

for i in {1..3}; do
  curl -X POST http://localhost:8080/streams/test/renditions/720p/segments \
  -d "{\"sequence\": $i, \"duration\": 2.0, \"path\": \"/segments/$i.ts\"}"
done

2. Retrieve the playlist:

curl -i http://localhost:8080/streams/test/renditions/720p/playlist.m3u8

3. Simulate a gap (Push segment 5, skipping 4):

curl -X POST http://localhost:8080/streams/test/renditions/720p/segments \
  -d '{"sequence": 5, "duration": 2.0, "path": "/segments/5.ts"}'


4. Heal the stream (Push the missing segment 4)

curl -X POST http://localhost:8080/streams/test/renditions/720p/segments \
  -d '{"sequence": 4, "duration": 2.0, "path": "/segments/4.ts"}'

5. Close the stream:
curl -X POST http://localhost:8080/streams/test/end