"use client";

export type ViewMode = "pipeline" | "timeline";

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex gap-0 px-4 pt-3">
      <button
        onClick={() => onChange("pipeline")}
        className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
          mode === "pipeline"
            ? "border-ink text-ink"
            : "border-transparent text-muted hover:text-ink"
        }`}
      >
        Pipeline
      </button>
      <button
        onClick={() => onChange("timeline")}
        className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
          mode === "timeline"
            ? "border-ink text-ink"
            : "border-transparent text-muted hover:text-ink"
        }`}
      >
        Timeline
      </button>
    </div>
  );
}
