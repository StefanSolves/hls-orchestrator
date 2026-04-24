import { getConfig } from "./config";
import type { SegmentInfo, PacerEvent, PacerStatus, SegmentState } from "./types";

type Listener = (event: PacerEvent) => void;

export class Pacer {
  private segments: SegmentInfo[] = [];
  private currentIndex = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<Listener> = new Set();
  private _state: "idle" | "running" | "paused" | "ended" = "idle";
  private _speed = 1;
  private _chaos = false;
  private _uploadId: string | null = null;
  private _streamId: string | null = null;
  private segmentDuration: number;

  constructor() {
    const config = getConfig();
    this.segmentDuration = config.segmentDuration;
    this._streamId = `${config.streamIdPrefix}-${Date.now()}`;
  }

  get status(): PacerStatus {
    return {
      state: this._state,
      speed: this._speed,
      chaos: this._chaos,
      currentIndex: this.currentIndex,
      totalSegments: this.segments.length,
      uploadId: this._uploadId,
      streamId: this._streamId,
      segments: [...this.segments],
      segmentDuration: this.segmentDuration,
    };
  }

  load(uploadId: string, segmentList: { filename: string; duration: number }[]) {
    this.stop();
    this._uploadId = uploadId;
    this._streamId = `${getConfig().streamIdPrefix}-${Date.now()}`;
    this.currentIndex = 0;
    this._state = "idle";
    this.segments = segmentList.map((s, i) => ({
      index: i,
      filename: s.filename,
      duration: s.duration,
      state: "pending" as SegmentState,
    }));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: PacerEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private updateSegmentState(index: number, state: SegmentState) {
    if (index >= 0 && index < this.segments.length) {
      this.segments[index] = { ...this.segments[index], state };
    }
  }

  setSpeed(speed: number) {
    this._speed = Math.max(0.25, Math.min(4, speed));
  }

  setChaos(enabled: boolean) {
    this._chaos = enabled;
  }

  start() {
    if (this._state === "running" || this.segments.length === 0) return;
    this._state = "running";
    this.scheduleTick();
  }

  pause() {
    if (this._state !== "running") return;
    this._state = "paused";
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  resume() {
    if (this._state !== "paused") return;
    this._state = "running";
    this.scheduleTick();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this._state = "idle";
  }

  async end() {
    this.pause();
    this._state = "ended";

    const config = getConfig();
    try {
      await fetch(
        `${config.orchestratorUrl}/streams/${this._streamId}/end`,
        { method: "POST" }
      );
    } catch {
      // Orchestrator may be down; UI will reflect from playlist polling
    }
  }

  reset() {
    this.stop();
    this.segments = [];
    this.currentIndex = 0;
    this._uploadId = null;
    this._streamId = null;
    this._state = "idle";
  }

  private scheduleTick() {
    if (this._state !== "running") return;
    const interval = (this.segmentDuration * 1000) / this._speed;
    this.timer = setTimeout(() => this.tick(), interval);
  }

  private async tick() {
    if (this._state !== "running") return;
    if (this.currentIndex >= this.segments.length) {
      return;
    }

    const seg = this.segments[this.currentIndex];
    const sequence = this.currentIndex;

    // Emit "produced"
    this.updateSegmentState(this.currentIndex, "posting");
    this.emit({
      type: "produced",
      segmentIndex: this.currentIndex,
      sequence,
      timestamp: Date.now(),
    });

    // Chaos: delay
    if (this._chaos && Math.random() < 0.28) {
      const delayTicks = 1 + Math.floor(Math.random() * 3);
      const delayMs = delayTicks * ((this.segmentDuration * 1000) / this._speed);
      this.updateSegmentState(this.currentIndex, "delayed");
      this.emit({
        type: "delayed",
        segmentIndex: this.currentIndex,
        sequence,
        timestamp: Date.now(),
        detail: `delayed by ${delayTicks} tick(s)`,
      });

      const capturedIndex = this.currentIndex;
      setTimeout(() => this.postSegment(capturedIndex, sequence, seg), delayMs);
      this.currentIndex++;
      this.scheduleTick();
      return;
    }

    // Chaos: duplicate
    if (this._chaos && Math.random() < 0.09) {
      this.emit({
        type: "duplicated",
        segmentIndex: this.currentIndex,
        sequence,
        timestamp: Date.now(),
        detail: "duplicate post",
      });
      // Post twice — orchestrator deduplicates
      this.postSegment(this.currentIndex, sequence, seg);
      this.postSegment(this.currentIndex, sequence, seg);
      this.currentIndex++;
      this.scheduleTick();
      return;
    }

    // Normal post
    await this.postSegment(this.currentIndex, sequence, seg);
    this.currentIndex++;
    this.scheduleTick();
  }

  private async postSegment(index: number, sequence: number, seg: SegmentInfo) {
    const config = getConfig();
    if (this.segments[index]?.state !== "delayed") {
      this.updateSegmentState(index, "in-flight");
    }
    this.emit({
      type: "posting",
      segmentIndex: index,
      sequence,
      timestamp: Date.now(),
    });

    try {
      const res = await fetch(
        `${config.orchestratorUrl}/streams/${this._streamId}/renditions/${config.rendition}/segments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sequence,
            duration: seg.duration,
            path: `/api/segments/${this._uploadId}/${seg.filename}`,
          }),
        }
      );

      if (res.ok) {
        this.updateSegmentState(index, "received");
        this.emit({
          type: "received",
          segmentIndex: index,
          sequence,
          timestamp: Date.now(),
        });
      } else {
        this.updateSegmentState(index, "failed");
        this.emit({
          type: "failed",
          segmentIndex: index,
          sequence,
          timestamp: Date.now(),
          detail: `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      this.updateSegmentState(index, "failed");
      this.emit({
        type: "failed",
        segmentIndex: index,
        sequence,
        timestamp: Date.now(),
        detail: err instanceof Error ? err.message : "Network error",
      });
    }
  }
}

// Singleton that survives Next.js HMR
const globalKey = "__hls_demo_pacer__";

export function getPacer(): Pacer {
  const g = globalThis as unknown as Record<string, Pacer>;
  if (!g[globalKey]) {
    g[globalKey] = new Pacer();
  }
  return g[globalKey];
}
