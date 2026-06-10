import { loadBook } from "@/lib/book";
import { prisma } from "@/lib/db";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { ndfMtmUsd, daysToFixing } from "@/lib/engine/mtm";
import { baseCcy } from "@/lib/engine/types";
import { dec, fmtUsd } from "@/lib/money";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DeleteHedgeButton, HedgeForm, type HedgeRow } from "./hedge-form";

export const dynamic = "force-dynamic";

export default async function HedgesPage() {
  const [book, market, counterparties] = await Promise.all([
    loadBook(),
    loadMarketView(),
    prisma.counterparty.findMany({ orderBy: { name: "asc" } }),
  ]);
  const now = new Date();

  const rows = book.hedges.map((h) => {
    const input = book.hedgeInputs.find((x) => x.id === h.id)!;
    const ccy = baseCcy(h.pair);
    const fwd = market.forwardTo(ccy, h.fixingDate);
    const isFwdLike = h.type === "NDF" || h.type === "FORWARD";
    const mtm =
      h.status !== "settled" && isFwdLike && fwd
        ? ndfMtmUsd({
            direction: h.direction,
            notionalLocal: input.notionalLocal,
            contractRate: input.contractRate,
            forwardToFixing: fwd,
            usdRate: market.usdRate,
            valuationDate: now,
            settlementDate: h.settlementDate,
          })
        : null;
    return { h, fwd, mtm, dtf: daysToFixing(now, h.fixingDate) };
  });

  const open = rows.filter((r) => r.h.status !== "settled");
  const settled = rows.filter((r) => r.h.status === "settled");
  const totalMtm = open.reduce((a, r) => a.plus(r.mtm ?? dec(0)), dec(0));

  const toRow = (h: (typeof book.hedges)[number]): Partial<HedgeRow> => ({
    id: h.id,
    type: h.type,
    direction: h.direction,
    pair: h.pair,
    notionalLocal: h.notionalLocal.toString(),
    contractRate: h.contractRate.toString(),
    premiumUsd: h.premiumUsd?.toString() ?? "",
    tradeDate: h.tradeDate.toISOString().slice(0, 10),
    fixingDate: h.fixingDate.toISOString().slice(0, 10),
    settlementDate: h.settlementDate.toISOString().slice(0, 10),
    counterpartyId: h.counterpartyId,
    status: h.status,
    settledPnlUsd: h.settledPnlUsd?.toString() ?? "",
    notes: h.notes ?? "",
  });

  /** pre-fill a roll: same economics, fixing pushed ~3 months */
  const rollPrefill = (h: (typeof book.hedges)[number]): Partial<HedgeRow> => {
    const push = (d: Date) => {
      const n = new Date(d);
      n.setUTCMonth(n.getUTCMonth() + 3);
      return n.toISOString().slice(0, 10);
    };
    return {
      ...toRow(h),
      id: undefined,
      tradeDate: now.toISOString().slice(0, 10),
      fixingDate: push(h.fixingDate),
      settlementDate: push(h.settlementDate),
      status: "open",
      settledPnlUsd: "",
    };
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Hedge book</h1>
        <span className="text-sm text-zinc-500">
          Open MTM: <span className={totalMtm.isNegative() ? "text-red-600" : "text-emerald-600"}>{fmtUsd(totalMtm)}</span>
        </span>
      </div>
      <HedgeForm counterparties={counterparties} />

      <Card>
        <CardHeader>
          <CardTitle>Open / fixed ({open.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Pair</TH>
                <TH>Type</TH>
                <TH>Dir</TH>
                <TH className="text-right">Notional (local)</TH>
                <TH className="text-right">Contract</TH>
                <TH className="text-right">Fwd to fixing</TH>
                <TH className="text-right">MTM (USD)</TH>
                <TH className="text-right">Days to fix</TH>
                <TH>Fixing</TH>
                <TH>Cpty</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {open.map(({ h, fwd, mtm, dtf }) => (
                <TR key={h.id}>
                  <TD className="font-medium">{h.pair}</TD>
                  <TD>{h.type}</TD>
                  <TD>
                    <Badge variant={h.direction === "sell" ? "secondary" : "outline"}>{h.direction}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{Number(h.notionalLocal).toLocaleString("en-US")}</TD>
                  <TD className="text-right tabular-nums">{Number(h.contractRate).toFixed(6)}</TD>
                  <TD className="text-right tabular-nums">{fwd ? fwd.toFixed(6) : "—"}</TD>
                  <TD className={`text-right tabular-nums ${mtm?.isNegative() ? "text-red-600" : "text-emerald-600"}`}>
                    {mtm ? fmtUsd(mtm) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {dtf <= 30 ? <Badge variant={dtf <= 7 ? "destructive" : "warning"}>{dtf}d</Badge> : `${dtf}d`}
                  </TD>
                  <TD>{h.fixingDate.toISOString().slice(0, 10)}</TD>
                  <TD>{h.counterparty.name}</TD>
                  <TD className="whitespace-nowrap">
                    <HedgeForm counterparties={counterparties} initial={toRow(h)} />
                    <HedgeForm counterparties={counterparties} initial={rollPrefill(h)} rollOf={h.id} />
                    <DeleteHedgeButton id={h.id} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fixing timeline</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {open
            .slice()
            .sort((a, b) => a.h.fixingDate.getTime() - b.h.fixingDate.getTime())
            .map(({ h, dtf }) => (
              <div key={h.id} className="flex items-center gap-2">
                <span className="w-24 tabular-nums text-zinc-500">{h.fixingDate.toISOString().slice(0, 10)}</span>
                <div className="h-2 rounded bg-teal-600/70" style={{ width: `${Math.min(Math.max(dtf, 2), 365) / 1.7}px` }} />
                <span>
                  {h.pair} {h.direction} {Number(h.notionalLocal).toLocaleString("en-US")} @ {Number(h.contractRate).toFixed(5)}
                </span>
                <Badge variant={dtf <= 30 ? "warning" : "secondary"}>{dtf}d</Badge>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settled ({settled.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Pair</TH>
                <TH>Type</TH>
                <TH>Dir</TH>
                <TH className="text-right">Notional</TH>
                <TH className="text-right">Contract</TH>
                <TH>Fixing</TH>
                <TH className="text-right">Realized P&L</TH>
                <TH>Notes</TH>
              </TR>
            </THead>
            <TBody>
              {settled.map(({ h }) => (
                <TR key={h.id}>
                  <TD>{h.pair}</TD>
                  <TD>{h.type}</TD>
                  <TD>{h.direction}</TD>
                  <TD className="text-right tabular-nums">{Number(h.notionalLocal).toLocaleString("en-US")}</TD>
                  <TD className="text-right tabular-nums">{Number(h.contractRate).toFixed(6)}</TD>
                  <TD>{h.fixingDate.toISOString().slice(0, 10)}</TD>
                  <TD className="text-right tabular-nums">{h.settledPnlUsd ? fmtUsd(h.settledPnlUsd.toString()) : "—"}</TD>
                  <TD className="max-w-56 truncate text-zinc-500">{h.notes}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
