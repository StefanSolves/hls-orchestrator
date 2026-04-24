import { getPacer } from "@/lib/pacer";
import type { PacerEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const pacer = getPacer();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send current status immediately
      const status = pacer.status;
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "status", ...status })}\n\n`)
      );

      const unsubscribe = pacer.subscribe((event: PacerEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
          // Also send updated status after each event
          const currentStatus = pacer.status;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "status", ...currentStatus })}\n\n`)
          );
        } catch {
          // Stream closed
          unsubscribe();
        }
      });

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15_000);
    },
    cancel() {
      // ReadableStream cancel is called when the client disconnects
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
