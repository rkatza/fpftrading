import { loadBook } from "@/lib/book";
import { prisma } from "@/lib/db";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { computeExposures, totalHedgeMtm } from "@/lib/engine/exposure";
import { estimateMargin, DEFAULT_MARGIN_CONFIG } from "@/lib/engine/margin";
import { dec, fmtUsd } from "@/lib/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [book, market, recentRecs] = await Promise.all([
    loadBook(),
    loadMarketView(),
    prisma.recommendation.findMany({ where: { status: "reviewed" }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);
  const now = new Date();
  const exposures = computeExposures(book.positionInputs, book.cashInputs, book.hedgeInputs, market, now);
  const mtm = totalHedgeMtm(exposures);
  const margin = estimateMargin(book.hedgeInputs, market, DEFAULT_MARGIN_CONFIG);
  const posted = book.cash.filter((c) => c.isMarginAccount).reduce((a, c) => a.plus(dec(c.amount.toString())), dec(0));
  const realized = book.hedges
    .filter((h) => h.settledPnlUsd)
    .reduce((a, h) => a.plus(dec(h.settledPnlUsd!.toString())), dec(0));
  const settledThisPeriod = book.hedges.filter((h) => h.status === "settled");
  const month = now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const active = exposures.filter((e) => !e.grossExposureUsd.isZero() || e.openHedgeCount > 0);
  const recommendation =
    active
      .filter((e) => {
        const pol = book.policies.find((p) => p.ccy === e.ccy);
        return pol && e.hedgeRatio !== null && (e.hedgeRatio.lt(dec(pol.targetRatioMin.toString())) || e.hedgeRatio.gt(dec(pol.targetRatioMax.toString())));
      })
      .map((e) => e.ccy);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold">Monthly hedge report</h1>
        <PrintButton />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950 print:border-0 print:p-0">
        <h1 className="text-lg font-bold">First Principles Fund — FX Hedge Report</h1>
        <p className="text-sm text-zinc-500">{month} · prepared {now.toISOString().slice(0, 10)}</p>

        {/* FPF house style: recommendation first */}
        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-zinc-500">Bottom line</h2>
        <p className="mt-1 text-sm">
          {recommendation.length > 0
            ? `Action needed: ${recommendation.join(", ")} hedge ratio${recommendation.length > 1 ? "s are" : " is"} outside the policy band — rebalance this month.`
            : "All hedge ratios are within policy bands. No rebalancing required this month."}{" "}
          Hedge book MTM stands at {fmtUsd(mtm)}; margin posted {fmtUsd(posted)} vs. estimated requirement{" "}
          {fmtUsd(margin.requiredUsd)}.
        </p>

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-zinc-500">Exposures & coverage</h2>
        <Table>
          <THead>
            <TR>
              <TH>Ccy</TH>
              <TH className="text-right">Gross</TH>
              <TH className="text-right">Hedged</TH>
              <TH className="text-right">Net</TH>
              <TH className="text-right">Ratio</TH>
              <TH className="text-right">Policy band</TH>
              <TH className="text-right">MTM</TH>
            </TR>
          </THead>
          <TBody>
            {active.map((e) => {
              const pol = book.policies.find((p) => p.ccy === e.ccy);
              return (
                <TR key={e.ccy}>
                  <TD className="font-semibold">{e.ccy}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.grossExposureUsd)}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.hedgeNotionalUsd)}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.netExposureUsd)}</TD>
                  <TD className="text-right tabular-nums">{e.hedgeRatio ? `${e.hedgeRatio.mul(100).toFixed(1)}%` : "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {pol ? `${Number(pol.targetRatioMin) * 100}–${Number(pol.targetRatioMax) * 100}%` : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">{fmtUsd(e.hedgeMtmUsd)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-zinc-500">Hedge book</h2>
        <Table>
          <THead>
            <TR>
              <TH>Pair</TH>
              <TH>Dir</TH>
              <TH className="text-right">Notional (local)</TH>
              <TH className="text-right">Contract</TH>
              <TH>Fixing</TH>
              <TH>Cpty</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {book.hedges.map((h) => (
              <TR key={h.id}>
                <TD>{h.pair}</TD>
                <TD>{h.direction}</TD>
                <TD className="text-right tabular-nums">{Number(h.notionalLocal).toLocaleString("en-US")}</TD>
                <TD className="text-right tabular-nums">{Number(h.contractRate).toFixed(6)}</TD>
                <TD>{h.fixingDate.toISOString().slice(0, 10)}</TD>
                <TD>{h.counterparty.name}</TD>
                <TD>{h.status}</TD>
              </TR>
            ))}
          </TBody>
        </Table>

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-zinc-500">P&L and margin</h2>
        <ul className="mt-1 list-disc pl-5 text-sm">
          <li>Unrealized hedge MTM: {fmtUsd(mtm)}</li>
          <li>
            Realized P&L on settled hedges (inception-to-date): {fmtUsd(realized)} across {settledThisPeriod.length} settled
            trade{settledThisPeriod.length === 1 ? "" : "s"}
          </li>
          <li>
            Margin: {fmtUsd(posted)} posted vs. {fmtUsd(margin.requiredUsd)} estimated requirement (
            {margin.requiredUsd.gt(posted) ? "shortfall" : "excess"} {fmtUsd(margin.requiredUsd.minus(posted).abs())})
          </li>
        </ul>

        {recentRecs.length > 0 && (
          <>
            <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-zinc-500">Actions & analysis reviewed</h2>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {recentRecs.map((r) => (
                <li key={r.id}>
                  {r.title} ({r.createdAt.toISOString().slice(0, 10)})
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-8 text-xs text-zinc-400">
          Generated by FPF FX View. Sources and timestamps for every market datum are available on the Market Data page.
        </p>
      </div>
    </div>
  );
}
