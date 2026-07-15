import { streamAIRequest } from "@/lib/ai/engine"
import type { AIStreamChunk, AspenRequest } from "@/lib/ai/types"

// Never statically optimize a streaming endpoint.
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let request: unknown
  try {
    request = await req.json()
  } catch {
    return new Response(JSON.stringify({ type: "error", content: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamAIRequest(request as AspenRequest)) {
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\0"))
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              content: err instanceof Error ? err.message : "AI processing failed",
            }) + "\0"
          )
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
