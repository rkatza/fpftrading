import Link from "next/link";
import { loadBook } from "@/lib/book";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { computeExposures, totalHedgeMtm } from "@/lib/engine/exposure";
import { estimateMargin, DEFAULT_MARGIN_CONFIG, marginShortfall } from "@/lib/engine/margin";
import { dec, fmtUsd } from "@/lib/money";
import { prisma } from "@/lib/db";
import { staleness } from "@/lib/marketdata/resolve";
import { Badge, Card, CardContent, CardHeader, CardTitle, Stat, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ExposureBarChart, RatioGauge, Sparkline } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [book, market, alerts, spotHistory] = await Promise.all([
    loadBook(),
    loadMarketView(),
    prisma.alert.findMany({ where: { acknowledgedAt: null }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.marketQuote.findMany({
      where: { type: "spot", tenor: "SPOT" },
      orderBy: { quotedAt: "asc" },
      take: 500,
    }),
  ]);

  const now = new Date();
  const exposures = computeExposures(book.positionInputs, book.cashInputs, book.hedgeInputs, market, now);
  const mtm = totalHedgeMtm(exposures);
  const grossTotal = exposures.reduce((a, e) => a.plus(e.grossExposureUsd), dec(0));
  const netTotal = exposures.reduce((a, e) => a.plus(e.netExposureUsd), dec(0));
  const margin = estimateMargin(book.hedgeInputs, market, DEFAULT_MARGIN_CONFIG);
  const posted = book.cash.filter((c) => c.isMarginAccount).reduce((a, c) => a.plus(dec(c.amount.toString())), dec(0));
  const shortfall = marginShortfall(posted, margin.requiredUsd);
  const realizedPnl = book.hedges
    .filter((h) => h.settledPnlUsd)
    .reduce((a, h) => a.plus(dec(h.settledPnlUsd!.toString())), dec(0));

  const chartData = exposures
    .filter((e) => !e.grossExposureUsd.isZero() || !e.hedgeNotionalUsd.isZero())
    .map((e) => ({ ccy: e.ccy, gross: e.grossExposureUsd.toNumber(), net: e.netExposureUsd.toNumber() }));

  const sparkByCcy = new Map<string, { date: string; value: number }[]>();
  for (const q of spotHistory) {
    const ccy = q.pair.split("/")[0];
    if (!sparkByCcy.has(ccy)) sparkByCcy.set(ccy, []);
    sparkByCcy.get(ccy)!.push({ date: q.quotedAt.toISOString().slice(0, 10), value: Number(q.value) });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <span className="text-xs text-zinc-400">as of {now.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
      </div>

      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.map((a) => (
            <Badge key={a.id} variant={a.severity === "critical" ? "destructive" : "warning"}>
              {a.message}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Gross FX exposure" value={fmtUsd(grossTotal)} />
        <Stat label="Net FX exposure" value={fmtUsd(netTotal)} />
        <Stat label="Hedge MTM" value={fmtUsd(mtm)} tone={mtm.isNegative() ? "neg" : "pos"} />
        <Stat label="Realized hedge P&L" value={fmtUsd(realizedPnl)} tone={realizedPnl.isNegative() ? "neg" : "pos"} />
        <Stat
          label="Margin posted / required"
          value={`${fmtUsd(posted)}`}
          sub={`req ${fmtUsd(margin.requiredUsd)} → ${shortfall.gt(0) ? "SHORTFALL " + fmtUsd(shortfall) : "excess " + fmtUsd(shortfall.neg())}`}
          tone={shortfall.gt(0) ? "neg" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Exposure by currency</CardTitle>
          </CardHeader>
          <CardContent>
            <ExposureBarChart data={chartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hedge ratios vs. policy bands</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {book.policies.map((p) => {
              const e = exposures.find((x) => x.ccy === p.ccy);
              return (
                <div key={p.ccy} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-semibold">{p.ccy}</span>
                  <RatioGauge
                    ratio={e?.hedgeRatio?.toNumber() ?? null}
                    min={Number(p.targetRatioMin)}
                    max={Number(p.targetRatioMax)}
                  />
                </div>
              );
            })}
            {book.policies.length === 0 && (
              <p className="text-xs text-zinc-400">
                No policy bands set. <Link className="underline" href="/settings">Configure in Settings.</Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exposure detail</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Ccy</TH>
                <TH className="text-right">Positions</TH>
                <TH className="text-right">Cash</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">Hedged</TH>
                <TH className="text-right">Net</TH>
                <TH className="text-right">Ratio</TH>
                <TH className="text-right">Hedge MTM</TH>
              </TR>
            </THead>
            <TBody>
              {exposures.map((e) => (
                <TR key={e.ccy}>
                  <TD className="font-semibold">{e.ccy}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.positionExposureUsd)}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.cashUsd)}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.grossExposureUsd)}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.hedgeNotionalUsd)}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.netExposureUsd)}</TD>
                  <TD className="text-right tabular-nums">{e.hedgeRatio ? `${e.hedgeRatio.mul(100).toFixed(1)}%` : "—"}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.hedgeMtmUsd)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spot panel</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Pair</TH>
                <TH className="text-right">USD per unit</TH>
                <TH className="text-right">Day Δ</TH>
                <TH>Trend</TH>
                <TH>Source</TH>
              </TR>
            </THead>
            <TBody>
              {Object.entries(market.spot).map(([ccy, s]) => {
                const meta = market.spotMeta[ccy];
                const hist = sparkByCcy.get(ccy) ?? [];
                const prev = hist.length >= 2 ? hist[hist.length - 2].value : null;
                const dayChg = prev ? (s.toNumber() - prev) / prev : null;
                const stale = meta ? staleness(meta.quotedAt, meta.source) : null;
                return (
                  <TR key={ccy}>
                    <TD className="font-semibold">{ccy}/USD</TD>
                    <TD className="text-right tabular-nums">{s.toFixed(8)}</TD>
                    <TD className={`text-right tabular-nums ${dayChg && dayChg < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {dayChg === null ? "—" : `${(dayChg * 100).toFixed(2)}%`}
                    </TD>
                    <TD>
                      <Sparkline points={hist.slice(-30)} positive={!dayChg || dayChg >= 0} />
                    </TD>
                    <TD>
                      {meta && (
                        <Badge variant={stale?.stale ? "warning" : "secondary"}>
                          {meta.source}
                          {stale?.stale ? ` · stale ${Math.round(stale.ageHours)}h` : ""}
                        </Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
