import Link from "next/link";
import { prisma } from "@/lib/db";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { staleness } from "@/lib/marketdata/resolve";
import { annualizedCarry } from "@/lib/engine/carry";
import { dec, Decimal } from "@/lib/money";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Sparkline } from "@/components/charts";

export const dynamic = "force-dynamic";

const TENORS = [
  { label: "1M", days: 30 },
  { label: "3M", days: 91 },
  { label: "6M", days: 182, highlight: true },
  { label: "12M", days: 365 },
] as const;

const CCY_NAMES: Record<string, string> = {
  PEN: "Peruvian Sol",
  COP: "Colombian Peso",
  MXN: "Mexican Peso",
  DOP: "Dominican Peso",
  BRL: "Brazilian Real",
};

export default async function MarketsPage() {
  const now = new Date();
  const [market, currencies, spotHistory, briefs, openHedges] = await Promise.all([
    loadMarketView(),
    prisma.currency.findMany({ where: { code: { not: "USD" } } }),
    prisma.marketQuote.findMany({
      where: { type: "spot", tenor: "SPOT" },
      orderBy: { quotedAt: "asc" },
      take: 1000,
    }),
    prisma.recommendation.findMany({
      where: { title: { startsWith: "Macro brief" }, status: { not: "dismissed" } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.hedge.findMany({ where: { status: { not: "settled" } } }),
  ]);

  const histByCcy = new Map<string, { date: string; value: number }[]>();
  for (const q of spotHistory) {
    const ccy = q.pair.split("/")[0];
    if (!histByCcy.has(ccy)) histByCcy.set(ccy, []);
    histByCcy.get(ccy)!.push({ date: q.quotedAt.toISOString().slice(0, 10), value: Number(q.value) });
  }

  const cards = Object.entries(market.spot).map(([ccy, spot]) => {
    const meta = market.spotMeta[ccy];
    const stale = meta ? staleness(meta.quotedAt, meta.source) : null;
    const hist = histByCcy.get(ccy) ?? [];
    const prev = hist.length >= 2 ? hist[hist.length - 2].value : null;
    const dayChg = prev ? spot.toNumber() / prev - 1 : null;
    const localRate = market.rates[ccy] ?? null;
    const brief = briefs.find((b) => b.ccy === ccy) ?? null;
    const hedgeCount = openHedges.filter((h) => h.pair.startsWith(ccy + "/")).length;

    const rows = TENORS.map((t) => {
      const fwd = market.forwardTo(ccy, new Date(now.getTime() + t.days * 86_400_000));
      if (!fwd) return { ...t, fwd: null as Decimal | null, periodPct: null as Decimal | null, carry: null as Decimal | null, usdPerMillion: null as Decimal | null };
      const periodPct = fwd.minus(spot).div(spot); // points over the period
      const carry = annualizedCarry(spot, fwd, t.days);
      // cost/earn of selling 1M USD-equivalent of local ccy forward for this tenor
      const usdPerMillion = periodPct.mul(1_000_000);
      return { ...t, fwd, periodPct, carry, usdPerMillion };
    });

    return { ccy, spot, meta, stale, hist, dayChg, localRate, brief, hedgeCount, rows };
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Markets</h1>
        <p className="text-xs text-zinc-500">
          Today’s rates vs. USD and reference cost of standard forward hedges. Positive carry = selling the local
          currency forward earns the points; negative = the hedge costs that much per year.
        </p>
      </div>

      {cards.map((c) => (
        <Card key={c.ccy}>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">
                {c.ccy}/USD <span className="font-normal text-zinc-400">— {CCY_NAMES[c.ccy] ?? c.ccy}</span>
              </CardTitle>
              {currencies.find((x) => x.code === c.ccy)?.isNdfOnly && <Badge variant="outline">NDF market</Badge>}
              {c.hedgeCount > 0 && <Badge variant="secondary">{c.hedgeCount} open hedge{c.hedgeCount > 1 ? "s" : ""}</Badge>}
            </div>
            {c.meta && (
              <Badge variant={c.stale?.stale ? "warning" : "secondary"}>
                {c.meta.source}
                {c.stale?.stale ? ` · stale ${Math.round(c.stale.ageHours / 24)}d` : ""}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-2xl font-semibold tabular-nums">{c.spot.toFixed(5)}</div>
                <div className="text-xs text-zinc-400">USD per {c.ccy}</div>
              </div>
              <div>
                <div className="text-lg font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
                  {dec(1).div(c.spot).toFixed(4)}
                </div>
                <div className="text-xs text-zinc-400">{c.ccy} per USD</div>
              </div>
              <div>
                <div className={`text-lg font-medium tabular-nums ${c.dayChg !== null && c.dayChg < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {c.dayChg === null ? "—" : `${c.dayChg >= 0 ? "+" : ""}${(c.dayChg * 100).toFixed(2)}%`}
                </div>
                <div className="text-xs text-zinc-400">day change</div>
              </div>
              <Sparkline points={c.hist.slice(-30)} positive={!c.dayChg || c.dayChg >= 0} />
              <div className="ml-auto text-right">
                <div className="text-sm tabular-nums">
                  {c.localRate ? `${c.localRate.mul(100).toFixed(2)}%` : "—"} vs SOFR {market.usdRate.mul(100).toFixed(2)}%
                </div>
                <div className="text-xs text-zinc-400">
                  policy rate · differential{" "}
                  {c.localRate ? `${c.localRate.minus(market.usdRate).mul(100).toFixed(2)}pp` : "—"}
                </div>
              </div>
            </div>

            <Table>
              <THead>
                <TR>
                  <TH>Hedge tenor</TH>
                  <TH className="text-right">Forward (USD per {c.ccy})</TH>
                  <TH className="text-right">Points vs spot</TH>
                  <TH className="text-right">Annualized carry</TH>
                  <TH className="text-right">$ per $1M hedged</TH>
                </TR>
              </THead>
              <TBody>
                {c.rows.map((r) => (
                  <TR key={r.label} className={"highlight" in r && r.highlight ? "bg-teal-50 dark:bg-teal-950/40" : ""}>
                    <TD className="font-medium">
                      {r.label}
                      {"highlight" in r && r.highlight && (
                        <Badge className="ml-2" variant="success">
                          standard 6M
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{r.fwd ? r.fwd.toFixed(6) : "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {r.periodPct ? `${r.periodPct.mul(100).toFixed(2)}%` : "—"}
                    </TD>
                    <TD className={`text-right tabular-nums ${r.carry?.isNegative() ? "text-red-600" : "text-emerald-600"}`}>
                      {r.carry ? `${r.carry.mul(100).toFixed(2)}%/yr` : "—"}
                    </TD>
                    <TD className={`text-right tabular-nums ${r.usdPerMillion?.isNegative() ? "text-red-600" : "text-emerald-600"}`}>
                      {r.usdPerMillion
                        ? `${r.usdPerMillion.isNegative() ? "-" : "+"}$${r.usdPerMillion.abs().toNumber().toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="-mt-2 text-[11px] text-zinc-400">
              Forwards from dealer quotes where available, otherwise CIP-implied from the rate differential. “$ per $1M
              hedged” is the forward-points cost/earn over the tenor on a $1M notional sold forward.
            </p>

            <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Latest macro brief</span>
                <Link href="/ai" className="text-xs text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
                  {c.brief ? "open in AI Analysis →" : "generate one →"}
                </Link>
              </div>
              {c.brief ? (
                <>
                  <div className="text-xs text-zinc-400">{c.brief.createdAt.toISOString().slice(0, 10)}</div>
                  <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                    {c.brief.body.replace(/^#+\s.*$/gm, "").trim().slice(0, 600)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-400">No brief yet for {c.ccy}.</p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
