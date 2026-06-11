import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seedBook } from "@/lib/seed";

export const maxDuration = 120;

/**
 * One-time bootstrap: loads the Apr-2026 seed book into an EMPTY database.
 * Guarded twice: requires CRON_SECRET, and refuses outright once any user
 * row exists (the seed wipes tables — never allowed on a live book).
 *
 * Usage (browser): /api/setup/seed?token=<CRON_SECRET>
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? url.searchParams.get("token");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized — pass ?token=<CRON_SECRET>" }, { status: 401 });
  }

  const users = await prisma.user.count().catch(() => -1);
  if (users === -1) {
    return NextResponse.json({ error: "Database not reachable or not migrated yet." }, { status: 500 });
  }
  if (users > 0) {
    return NextResponse.json({ error: "Database already seeded — refusing to wipe a live book." }, { status: 409 });
  }

  try {
    await seedBook(prisma);
    return NextResponse.json({ ok: true, message: "Seeded the Apr 30, 2026 book. You can log in now." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Seed failed" }, { status: 500 });
  }
}
