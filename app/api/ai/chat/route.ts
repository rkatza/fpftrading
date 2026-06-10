import { NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { AI_MODEL, anthropic, logUsage } from "@/lib/ai/client";
import { runChatLoop } from "@/lib/ai/tools";

export const maxDuration = 120;

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
});

const SYSTEM = `You are the book Q&A assistant for First Principles Fund's FX platform. Answer questions about the fund's FX exposures, hedge book, and market data using the provided tools — compute, don't guess. Quote conventions: pairs like PEN/USD are USD per 1 unit of local currency. Be direct and quantitative. All output is advisory; you cannot execute trades or modify the book.`;

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid messages" }, { status: 400 });

  try {
    const { text, usage } = await runChatLoop(
      anthropic(),
      AI_MODEL,
      SYSTEM,
      parsed.data.messages as Anthropic.MessageParam[]
    );
    logUsage("chat", usage);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Chat failed" }, { status: 500 });
  }
}
