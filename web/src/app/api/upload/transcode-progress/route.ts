import { NextRequest } from "next/server";
import { getTranscodeEntry, subscribeTranscode } from "@/lib/transcoder";
import type { TranscodeProgress } from "@/lib/transcoder";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get("uploadId");
  if (!uploadId) {
    return new Response("Missing uploadId", { status: 400 });
  }

  const entry = getTranscodeEntry(uploadId);
  if (!entry) {
    return new Response("Upload not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send current progress immediately
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(entry.progress)}\n\n`)
      );

      // If already complete or errored, close immediately
      if (entry.progress.status === "complete" || entry.progress.status === "error") {
        controller.close();
        return;
      }

      const unsubscribe = subscribeTranscode(uploadId, (progress: TranscodeProgress) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
          );
          if (progress.status === "complete" || progress.status === "error") {
            controller.close();
          }
        } catch {
          unsubscribe();
        }
      });
    },
    cancel() {
      // Client disconnected — cleanup handled by try/catch in subscribe
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
