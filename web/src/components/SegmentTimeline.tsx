"use client";

import type { SegmentInfo } from "@/lib/types";

interface SegmentTimelineProps {
  segments: SegmentInfo[];
  windowSequences: Set<number>;
}

function tileClasses(seg: SegmentInfo, inWindow: boolean): string {
  if (inWindow) {
    return "bg-amber-bg border-amber-border text-amber-ink ring-2 ring-amber-border";
  }

  switch (seg.state) {
    case "received":
      return "bg-teal-bg border-teal-border text-teal-ink";
    case "posting":
    case "in-flight":
      return "bg-slate-bg border-slate-border text-slate-ink animate-pulse-subtle";
    case "delayed":
    case "duplicated":
    case "failed":
      return "bg-coral-bg border-coral-border text-coral-ink";
    case "pending":
    default:
      return "bg-neutral-bg border-neutral-border text-neutral-ink";
  }
}

function stateLabel(seg: SegmentInfo, inWindow: boolean): string {
  if (inWindow) return "window";
  switch (seg.state) {
    case "received": return "recv";
    case "posting":
    case "in-flight": return "fly";
    case "delayed": return "late";
    case "duplicated": return "dup";
    case "failed": return "fail";
    case "pending":
    default: return "";
  }
}

export function SegmentTimeline({ segments, windowSequences }: SegmentTimelineProps) {
  if (segments.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-muted text-sm">
        Upload a video to see the segment timeline
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-1.5 mb-2">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          Segment Timeline
        </h2>
        <span className="text-xs font-mono text-muted">
          ({segments.length} segments, window size 6)
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {segments.map((seg) => {
          const inWindow = windowSequences.has(seg.index);
          return (
            <div
              key={seg.index}
              className={`
                w-11 h-12 flex flex-col items-center justify-center
                rounded border text-xs transition-all duration-300 ease-in-out
                ${tileClasses(seg, inWindow)}
              `}
            >
              <span className="font-mono font-semibold text-[11px] leading-none">
                {seg.index}
              </span>
              <span className="text-[9px] leading-none mt-0.5 opacity-80">
                {stateLabel(seg, inWindow)}
              </span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-bg border border-amber-border" /> in window
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-teal-bg border border-teal-border" /> received
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-bg border border-slate-border" /> in-flight
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-coral-bg border border-coral-border" /> delayed/dup/fail
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-neutral-bg border border-neutral-border" /> pending
        </span>
      </div>
    </div>
  );
}
