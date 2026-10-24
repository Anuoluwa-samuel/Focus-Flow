import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { getTimerState } from "@/server/timer-service";
import { logger } from "@/lib/logger";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Read-only timer snapshot used to re-sync after tab focus, reconnect, or sleep. Never cached. */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user?.emailVerified) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: NO_STORE });
    return NextResponse.json(await getTimerState(user.id), { headers: NO_STORE });
  } catch (err) {
    logger.error("timer state failed", { name: err instanceof Error ? err.name : typeof err });
    return NextResponse.json({ code: "INTERNAL" }, { status: 500, headers: NO_STORE });
  }
}
