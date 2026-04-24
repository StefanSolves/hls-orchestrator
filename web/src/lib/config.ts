export function getConfig() {
  return {
    orchestratorUrl: process.env.ORCHESTRATOR_URL || "http://localhost:8080",
    streamIdPrefix: process.env.STREAM_ID || "demo",
    rendition: process.env.RENDITION || "720p",
    segmentDuration: Number(process.env.SEGMENT_DURATION) || 2,
  };
}
