import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

/** Auth payloads are tiny (a name, an email, a password). Anything larger is refused before parsing. */
const MAX_BODY_BYTES = 16 * 1024;

const handlers = toNextJsHandler((req) => getAuth().handler(req));

export const GET = handlers.GET;

export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return tooLarge();

  // Chunked requests carry no length: read at most the limit.
  const reader = req.body?.getReader();
  if (!reader) return handlers.POST(req);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      void reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  return handlers.POST(
    new Request(req.url, { method: req.method, headers: req.headers, body, duplex: "half" } as RequestInit),
  );
}

function tooLarge() {
  return Response.json({ message: "Request body too large.", code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
}
