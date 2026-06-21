import { z } from "zod";
import { runWebSearchAgent } from "@/lib/web-search-agent";
import type { SearchEvent } from "@/lib/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  input: z.string().trim().min(1).max(300),
});

function encodeSse(event: SearchEvent): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function mapErrorToMessage(err: unknown): { message: string; status: number } {
  const message = err instanceof Error ? err.message : "Something went wrong";

  if (message.startsWith("Enter a GitHub repo")) {
    return { message, status: 400 };
  }
  if (message.includes("Repository not found")) {
    return { message, status: 404 };
  }
  if (
    message.includes("GitHub API rate limit") ||
    message.includes("rate limit reached") ||
    message.includes("AI rate limit") ||
    message.toLowerCase().includes("rate limit hit")
  ) {
    return { message, status: 429 };
  }
  if (
    message.includes("AZURE_OPENAI_API_KEY") ||
    message.includes("AZURE_OPENAI_BASE_URL") ||
    message.includes("FIRECRAWL_API_KEY")
  ) {
    return { message, status: 500 };
  }

  const status =
    message.includes("rate limit") || message.includes("Rate limit") ? 429 : 500;
  return { message, status };
}

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    const msg =
      parsed.error.issues.map((issue) => issue.message).join("; ") ||
      "Invalid input.";
    return Response.json({ error: msg }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SearchEvent) => {
        controller.enqueue(encodeSse(event));
      };

      try {
        const result = await runWebSearchAgent(parsed.data.input, send);
        send({
          type: "result",
          source: result.source,
          similar: result.similar,
          reasoning: result.reasoning,
        });
      } catch (err) {
        const { message } = mapErrorToMessage(err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
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
