# Diagnostic Findings — Demo UX Issues

Investigated 2026-04-24. Six symptoms reported; analysis below.

---

## Symptom 1: SourceReel shows "no video" after upload succeeds

### What the code says should happen

1. `UploadPanel.onUploadComplete(data)` fires on success (`UploadPanel.tsx:57`)
2. `page.tsx:handleUpload` calls `setUploadResult(result)` (`page.tsx:37`)
3. `PipelineView` receives `upload={uploadResult}` (`page.tsx:120`)
4. `PipelineView` passes `upload` to `SourceReel` (`PipelineView.tsx:42`)
5. `SourceReel` checks `upload ? ... : "no video"` (`SourceReel.tsx:44-49`)

The wiring is correct. `uploadResult` is set in `page.tsx` state, passed through `PipelineView`, and `SourceReel` renders conditionally on it.

### Root cause

**Cannot determine definitively from code alone.** The data flow chain `UploadPanel → page.tsx → PipelineView → SourceReel` is correctly wired. `handleUpload` has stable identity (`useCallback` with `[]` deps, and `setUploadResult` is a stable setter). The most likely explanation is a **stale render or React state batching edge case** — but I cannot reproduce this from code inspection alone.

One plausible theory: if the SSE connection drops and reconnects (see Symptom 3), the reconnect triggers a status message with an empty segments array and `state: "idle"`. This does NOT clear `uploadResult` (that's local page state), so SourceReel should still show data. This theory does not explain the symptom.

**Alternatively**, if `handleReset` was inadvertently triggered (via keyboard shortcut, accidental click, or the StreamCompleteBanner's reset button), that WOULD clear `uploadResult` (`page.tsx:66`). But that would also reset the UploadPanel, which contradicts the user seeing "Ready — 6 segments" in the banner.

### Verdict

**Cannot confirm from code.** Would need to add `console.log` to `handleUpload` and `SourceReel` to check if `uploadResult` is being set and passed through. If it IS set but SourceReel still shows "no video", that would indicate a React rendering issue.

### Proposed fix

Add a `console.log('uploadResult:', uploadResult)` to PipelineView's render to verify the prop. If the prop is null, trace upstream. If the prop is populated but SourceReel shows "no video", there's a deeper React issue.

---

## Symptom 2: Conveyor shows "idle" while streaming

### What the code says should happen

1. Pacer emits `produced` event (`pacer.ts:147-151`)
2. SSE endpoint relays it to client (`events/route.ts:19-28`)
3. `usePacerEvents` appends it to `events` array (`usePacerEvents.ts:36`)
4. `events` is passed to `PipelineView` → `usePipelineChunks` (`PipelineView.tsx:30`)
5. `usePipelineChunks.processEvent` creates a chunk with `phase: "produced"` (`usePipelineChunks.ts:51-62`)
6. Conveyor renders chunks from the map (`Conveyor.tsx:150-159`)

### Root cause: **BUG — the entire segment lifecycle completes in ~3ms**

This is the critical finding. In the normal (non-chaos) path in `pacer.ts:tick()`:

```
// Line 146-151: emit "produced"
this.emit({ type: "produced", ... timestamp: Date.now() });

// Line 191-192: IMMEDIATELY call postSegment with await
await this.postSegment(this.currentIndex, sequence, seg);
```

Inside `postSegment`:
```
// Line 202-206: emit "posting" (timestamp: now + ~0ms)
this.emit({ type: "posting", ... timestamp: Date.now() });

// Line 209-221: fetch to localhost:8081 (~1-3ms round trip)
const res = await fetch(...);

// Line 224-229: emit "received" (timestamp: now + ~3ms)
this.emit({ type: "received", ... timestamp: Date.now() });
```

The **entire lifecycle from `produced` to `received` takes ~3ms** because the orchestrator is on localhost. There is no artificial delay between producing a segment and posting it.

The Conveyor's `shouldShow()` (`Conveyor.tsx:49-60`) hides `received` chunks after 300ms. So a chunk:
1. Appears at phase `produced` (progress ≈ 0, left edge)
2. Immediately transitions to `posting` (progress = 0.85, 85% across belt)
3. ~3ms later transitions to `received` (progress = 1.0, right edge)
4. Fades out over 300ms

The entire visible lifecycle is 300ms, and the chunk jumps from left to right instantly because elapsed time divided by `tickIntervalMs` (8000ms at 0.25×) is essentially 0. The chunk appears at the far right and fades out before the user can notice.

With 6 segments at 0.25× speed, the ticks fire every 8 seconds. By the time the user looks at the conveyor, all visible chunks have already faded out.

### Verdict

**Bug.** The pacer was designed to pace the *interval between segments* (the `scheduleTick` delay), but it does NOT pace the *within-segment lifecycle*. The `produced → posting → received` sequence fires as fast as the localhost round-trip allows (~3ms), leaving no time for the conveyor animation.

### Proposed fix

Insert a delay between `produced` and `postSegment` in the pacer's normal path. Something like: emit `produced`, then `setTimeout(() => this.postSegment(...), tickIntervalMs * 0.7)`. This gives the chunk 70% of the tick interval to visibly slide across the belt before the HTTP post fires. The remaining 30% is the `posting` pause at 85%.

---

## Symptom 3: SSE `net::ERR_NETWORK_IO_SUSPENDED`

### What the code says should happen

The SSE hook has a reconnect mechanism (`usePacerEvents.ts:43-46`):

```typescript
es.onerror = () => {
  es.close();
  setTimeout(connect, 2000);
};
```

On error, it closes the EventSource and reconnects after 2 seconds.

### Analysis

`ERR_NETWORK_IO_SUSPENDED` is a Chrome-specific error that fires when the browser **throttles background tab network activity** or when the system **suspends network I/O** (e.g., laptop sleep/wake, or Chrome's tab throttling after ~5 minutes of inactivity). This is a browser-level suspension, not a server error.

The reconnect logic DOES exist and should fire on this error. However, there are two issues:

1. **The reconnect does NOT clear stale state.** When the connection drops and reconnects, the new connection gets a fresh `status` message from the server. But the `events` array in `usePacerEvents` retains all old events. If the ChunkStore in `usePipelineChunks` has already processed events up to index N (`lastProcessedRef.current`), and the events array hasn't been cleared, no new processing occurs until new events arrive after reconnect.

2. **There's a silent gap.** Between the drop and the 2s reconnect, any pacer events emitted during that window are lost permanently. The SSE endpoint only sends events in real-time via the subscribe callback — there's no replay/catch-up mechanism.

### Verdict

**Partial bug.** The reconnect works, but event loss during the gap is permanent. For a live demo this is acceptable — the status message on reconnect will resync the segment states. The event log and chunk store will have gaps but will resume processing new events. The main risk is that the audience sees a 2-second freeze in all event-driven UI.

### Proposed fix

No code change strictly needed — the 2s reconnect is adequate for a demo. If desired, reduce reconnect delay to 500ms and add a visual "reconnecting..." indicator in the header.

---

## Symptom 4: Player is black with no "tap to unmute" overlay

### What the code says should happen

`showUnmuteOverlay` is initialized to `false` (`VideoPlayer.tsx:17`). It's only set to `true` inside the `handlePlay` and `handlePlaying` callbacks (`VideoPlayer.tsx:37-38, 43-44`). The overlay renders when `showUnmuteOverlay && isMuted` (`VideoPlayer.tsx:134`).

The video element is created when `active` is true (`VideoPlayer.tsx:123-133`). `active` is `pacerState !== "idle"` (`page.tsx:33`). So the video element exists once the pacer starts.

hls.js loads the playlist from `/api/playlist`. If the playlist returns 404 (no segments registered yet with the orchestrator), hls.js fires a `NETWORK_ERROR` which triggers `hls.startLoad()` after 2 seconds (`VideoPlayer.tsx:88-89`). This retry loop continues until the playlist becomes available.

### Root cause

**Expected behavior, not a bug.** The player IS black because hls.js can't load the manifest — the orchestrator has no segments yet (or very few). The overlay doesn't appear because `showUnmuteOverlay` is gated on the `play`/`playing` events, which only fire after hls.js successfully loads and starts playback. The black screen with no overlay is the correct intermediate state.

The issue is **UI miscommunication** — the player should show a "waiting for segments..." or spinner state between "active but not yet playing" and "actually playing."

### Verdict

**UI miscommunication.** The code is working correctly but the intermediate state (active, loading, not yet playing) has no visual feedback. The user sees a blank black `<video>` element with browser controls but no content and no explanation.

### Proposed fix

Track a `loading` state: set it when hls.js is created, clear it on `MANIFEST_PARSED` or first `playing` event. Show a spinner + "buffering..." text over the video during this state. The unmute overlay then appears after playback actually begins.

---

## Symptom 5: Speed slider fires hundreds of POST requests

### What the code says should happen

The slider's `onChange` fires `onSpeedChange(parseFloat(e.target.value))` on every value change (`ControlBar.tsx:110`). This calls `handleSpeedChange` in `page.tsx:71-76`, which does `await fetch("/api/pacer/speed", ...)` on every call.

An HTML range input fires `onChange` on every pixel of movement during a drag. With `step={0.25}` and `min={0.25}` to `max={4}`, there are 16 discrete values. But browsers fire events at display refresh rate during dragging, so you get ~60 events/second even though only 16 values are possible. Many of those fire with the same value (the input snaps to steps, but the event fires anyway).

### Root cause

**No debounce.** Every `onChange` from the slider fires a POST to `/api/pacer/speed`. There is no debounce, throttle, or deduplication anywhere in the chain:

- `ControlBar.tsx:110` — fires `onSpeedChange` on every change
- `page.tsx:71-76` — `handleSpeedChange` fires `fetch` immediately
- No `useDebouncedCallback`, no `setTimeout` throttle, no value deduplication

### Verdict

**Bug (minor).** Functionally harmless (3ms round trips, idempotent endpoint), but pollutes the network tab and is visually noisy during a demo if DevTools is open.

### Proposed fix

Debounce with a 100ms trailing timeout. Either in `handleSpeedChange` in page.tsx (wrap with a `setTimeout`/`clearTimeout` pattern) or apply optimistic local state in the slider so it feels instant while the POST is batched. Alternatively, deduplicate: skip the POST if the value hasn't changed from the last sent value.

---

## Symptom 6: "2/6 segments produced but conveyor shows no chunks"

### Root cause

**Same bug as Symptom 2.** This is the same underlying issue viewed from a different angle.

At 0.25× speed with 2 segments produced after ~16 seconds:
- Segment 0: produced at T=0, received at T≈3ms, faded out by T=303ms
- Segment 1: produced at T=8000ms, received at T≈8003ms, faded out by T=8303ms
- Current time: T≈16000ms

Both chunks completed their entire visible lifecycle (300ms fade-out after `received`) long before the user checked the conveyor. The Conveyor shows "idle" because `shouldShow()` returns false for all chunks (`now - chunk.receivedAt > 300` for both).

The chunks DID render. They existed for ~303ms each. But their entire on-screen time was a 300ms fade at the far-right edge of the belt, at full progress (1.0). They never visibly slid across — they appeared, immediately jumped to `received` at 100% position, faded out, and were gone.

### Verdict

**Same bug as Symptom 2.** Fixing the pacer timing (adding a delay between `produced` and `postSegment`) fixes both symptoms.

---

## Summary and Fix Ordering

### Dependency graph

```
Symptom 2 ←→ Symptom 6   (same root cause: pacer lifecycle too fast)
Symptom 1                 (cannot confirm from code, needs instrumentation)
Symptom 3                 (minor, reconnect works, cosmetic improvement)
Symptom 4                 (UI miscommunication, not a bug)
Symptom 5                 (minor, no debounce on slider)
```

### Recommended fix order

1. **Symptoms 2+6 first** — this is the showstopper. The conveyor animation is the centerpiece of the pipeline view and it's currently invisible. Fix: add a delay in the pacer between `produced` and the HTTP POST so chunks spend visible time on the belt.

2. **Symptom 1 second** — add instrumentation (`console.log`) to verify whether `uploadResult` is actually null when SourceReel renders. May be a side effect of the SSE reconnect or a React timing issue that resolves once Symptom 2 is fixed (fewer rapid state updates).

3. **Symptom 4 third** — add a loading/buffering state to the video player so the intermediate state is communicated.

4. **Symptom 5 fourth** — add debounce to the speed slider. Quick fix, low risk.

5. **Symptom 3 last** — cosmetic. The 2s reconnect is fine for a demo. Optionally add a visual indicator.
