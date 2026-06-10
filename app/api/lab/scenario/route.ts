import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dec } from "@/lib/money";
import { loadBook } from "@/lib/book";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { runScenario } from "@/lib/engine/scenario";
import { DEFAULT_MARGIN_CONFIG } from "@/lib/engine/margin";

const schema = z.object({
  spotPct: z.coerce.number().min(-0.5).max(0.5),
  fwdPointsBps: z.coerce.number().min(-500).max(500).default(0),
  ccy: z.string().length(3).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { spotPct, fwdPointsBps, ccy } = parsed.data;

  const [book, market] = await Promise.all([loadBook(), loadMarketView()]);
  const result = runScenario(
    book.positionInputs,
    book.cashInputs,
    book.hedgeInputs,
    market,
    new Date(),
    { spotPct: dec(spotPct), fwdPointsBps: dec(fwdPointsBps), volPts: dec(0), ccy },
    DEFAULT_MARGIN_CONFIG
  );

  return NextResponse.json({
    shock: result.shock,
    exposureDeltaUsd: result.exposureDeltaUsd.toFixed(2),
    hedgeMtmDeltaUsd: result.hedgeMtmDeltaUsd.toFixed(2),
    netPnlUsd: result.netPnlUsd.toFixed(2),
    marginRequiredBase: result.margin.base.requiredUsd.toFixed(2),
    marginRequiredShocked: result.margin.shocked.requiredUsd.toFixed(2),
    perCcy: result.base.map((b, i) => ({
      ccy: b.ccy,
      grossBase: b.grossExposureUsd.toFixed(2),
      netBase: b.netExposureUsd.toFixed(2),
      mtmBase: b.hedgeMtmUsd.toFixed(2),
      mtmShocked: result.shocked[i].hedgeMtmUsd.toFixed(2),
    })),
  });
}
