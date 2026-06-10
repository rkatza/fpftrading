import { prisma } from "@/lib/db";
import { dec, fmtUsd } from "@/lib/money";
import { Badge, Card, CardContent, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DeleteButton } from "@/app/positions/position-form";
import { CashForm, type CashRow } from "./cash-form";

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const [cash, counterparties] = await Promise.all([
    prisma.cashBalance.findMany({ include: { counterparty: true }, orderBy: { amount: "desc" } }),
    prisma.counterparty.findMany({ orderBy: { name: "asc" } }),
  ]);
  const total = cash.filter((c) => c.ccy === "USD").reduce((a, c) => a.plus(dec(c.amount.toString())), dec(0));

  const toRow = (c: (typeof cash)[number]): CashRow => ({
    id: c.id,
    counterpartyId: c.counterpartyId,
    account: c.account,
    ccy: c.ccy,
    amount: c.amount.toString(),
    asOf: c.asOf.toISOString().slice(0, 10),
    isMarginAccount: c.isMarginAccount,
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cash</h1>
        <span className="text-sm text-zinc-500">USD total: {fmtUsd(total)}</span>
      </div>
      <CashForm counterparties={counterparties} />
      <Card>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Counterparty</TH>
                <TH>Account</TH>
                <TH>Ccy</TH>
                <TH className="text-right">Amount</TH>
                <TH>As of</TH>
                <TH></TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {cash.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.counterparty.name}</TD>
                  <TD>{c.account}</TD>
                  <TD>{c.ccy}</TD>
                  <TD className="text-right tabular-nums">
                    {c.ccy === "USD" ? fmtUsd(c.amount.toString()) : Number(c.amount).toLocaleString("en-US")}
                  </TD>
                  <TD>{c.asOf.toISOString().slice(0, 10)}</TD>
                  <TD>{c.isMarginAccount && <Badge variant="warning">margin</Badge>}</TD>
                  <TD className="flex gap-1">
                    <CashForm counterparties={counterparties} initial={toRow(c)} />
                    <DeleteButton id={c.id} kind="cash" />
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
