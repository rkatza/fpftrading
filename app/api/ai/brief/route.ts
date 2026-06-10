import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { generateMacroBrief } from "@/lib/ai/generate";

export const maxDuration = 120;

const schema = z.object({ ccy: z.enum(["PEN", "COP", "MXN", "DOP", "BRL"]) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "ccy must be one of PEN/COP/MXN/DOP/BRL" }, { status: 400 });
  try {
    const { id } = await generateMacroBrief(parsed.data.ccy);
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed" }, { status: 500 });
  }
}
