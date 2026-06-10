import { prisma } from "@/lib/db";
import { staleness } from "@/lib/marketdata/resolve";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { QuoteForm } from "./quote-form";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  spot: "Spot",
  forward_outright: "Forward outright",
  forward_points: "Forward points",
  vol_atm: "ATM vol",
  vol_rr25: "25d RR",
  vol_bf25: "25d BF",
  interest_rate: "Interest rate",
};

export default async function MarketPage() {
  const all = await prisma.marketQuote.findMany({ orderBy: { quotedAt: "desc" }, take: 2000 });

  // latest per (pair, type, tenor)
  const latest = new Map<string, (typeof all)[number]>();
  for (const q of all) {
    const key = `${q.pair}|${q.type}|${q.tenor}`;
    if (!latest.has(key)) latest.set(key, q);
  }

  const groups = new Map<string, (typeof all)[number][]>();
  for (const q of latest.values()) {
    const g = q.type === "interest_rate" ? "Interest rates" : q.pair;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(q);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === "Interest rates" ? 1 : b === "Interest rates" ? -1 : a.localeCompare(b)
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-xl font-bold">Market data</h1>
      <QuoteForm />
      {ordered.map(([group, quotes]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{group}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{group === "Interest rates" ? "Ccy" : "Type"}</TH>
                  <TH>Tenor</TH>
                  <TH className="text-right">Value</TH>
                  <TH>Source</TH>
                  <TH>Quoted at</TH>
                  <TH>By</TH>
                </TR>
              </THead>
              <TBody>
                {quotes
                  .sort((a, b) => (a.type + a.tenor).localeCompare(b.type + b.tenor))
                  .map((q) => {
                    const st = staleness(q.quotedAt, q.source);
                    return (
                      <TR key={q.id}>
                        <TD className="font-medium">
                          {group === "Interest rates" ? q.pair : TYPE_LABEL[q.type] ?? q.type}
                        </TD>
                        <TD>{q.tenor}</TD>
                        <TD className="text-right tabular-nums">{Number(q.value).toFixed(8)}</TD>
                        <TD>
                          <Badge variant={q.source === "manual" ? "outline" : "secondary"}>{q.source}</Badge>
                        </TD>
                        <TD>
                          <span className={st.stale ? "text-amber-600" : "text-zinc-500"}>
                            {q.quotedAt.toISOString().slice(0, 16).replace("T", " ")}
                            {st.stale && ` (stale ${Math.round(st.ageHours / 24)}d)`}
                          </span>
                        </TD>
                        <TD className="text-zinc-400">{q.enteredBy ?? ""}</TD>
                      </TR>
                    );
                  })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
