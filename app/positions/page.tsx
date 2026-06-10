import { prisma } from "@/lib/db";
import { dec, fmtUsd } from "@/lib/money";
import { Badge, Card, CardContent, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DeleteButton, PositionForm, type PositionRow } from "./position-form";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const positions = await prisma.position.findMany({ orderBy: [{ status: "asc" }, { borrower: "asc" }] });
  const total = positions
    .filter((p) => p.status === "active")
    .reduce((a, p) => a.plus(dec(p.marketValueUsd.toString())), dec(0));

  const toRow = (p: (typeof positions)[number]): PositionRow => ({
    id: p.id,
    borrower: p.borrower,
    country: p.country,
    usdNotional: p.usdNotional.toString(),
    marketValueUsd: p.marketValueUsd.toString(),
    settlementCcy: p.settlementCcy,
    underlyingCcy: p.underlyingCcy,
    exposureFactor: p.exposureFactor.toString(),
    startDate: p.startDate.toISOString().slice(0, 10),
    maturityDate: p.maturityDate?.toISOString().slice(0, 10) ?? "",
    status: p.status,
    notes: p.notes ?? "",
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Positions</h1>
        <span className="text-sm text-zinc-500">Active MV: {fmtUsd(total)}</span>
      </div>
      <PositionForm />
      <Card>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Borrower</TH>
                <TH>Country</TH>
                <TH className="text-right">Notional</TH>
                <TH className="text-right">Market value</TH>
                <TH>Underlying</TH>
                <TH className="text-right">FX factor</TH>
                <TH>Maturity</TH>
                <TH>Status</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {positions.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.borrower}</TD>
                  <TD>{p.country}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(p.usdNotional.toString())}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(p.marketValueUsd.toString())}</TD>
                  <TD>
                    <Badge variant={p.underlyingCcy === "USD" ? "secondary" : "outline"}>{p.underlyingCcy}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{Number(p.exposureFactor).toFixed(2)}</TD>
                  <TD>{p.maturityDate?.toISOString().slice(0, 10) ?? "—"}</TD>
                  <TD>
                    <Badge variant={p.status === "active" ? "success" : "secondary"}>{p.status}</Badge>
                  </TD>
                  <TD className="flex gap-1">
                    <PositionForm initial={toRow(p)} />
                    <DeleteButton id={p.id} kind="position" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
