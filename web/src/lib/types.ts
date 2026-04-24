export type SegmentState =
  | "pending"
  | "posting"
  | "in-flight"
  | "received"
  | "delayed"
  | "duplicated"
  | "failed";

export interface SegmentInfo {
  index: number;
  filename: string;
  duration: number;
  state: SegmentState;
}

export interface PacerEvent {
  type: "produced" | "posting" | "received" | "delayed" | "duplicated" | "failed";
  segmentIndex: number;
  sequence: number;
  timestamp: number;
  detail?: string;
}

export interface PacerStatus {
  state: "idle" | "running" | "paused" | "ended";
  speed: number;
  chaos: boolean;
  currentIndex: number;
  totalSegments: number;
  uploadId: string | null;
  streamId: string | null;
  segments: SegmentInfo[];
  segmentDuration: number;
}

export interface UploadResult {
  uploadId: string;
  segments: { filename: string; duration: number }[];
  totalDuration: number;
}

export interface PlaylistJson {
  raw: string;
  version: number;
  targetDuration: number;
  mediaSequence: number;
  segments: { sequence: number; duration: number; path: string }[];
  ended: boolean;
}
