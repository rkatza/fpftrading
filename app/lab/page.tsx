import { loadBook } from "@/lib/book";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { computeExposures } from "@/lib/engine/exposure";
import { annualizedCarry, carryUsdPerYear } from "@/lib/engine/carry";
import { Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ScenarioRunner } from "./scenario-runner";
import { OptionBuilder } from "./option-builder";

export const dynamic = "force-dynamic";

const TENORS = [
  { label: "1M", days: 30 },
  { label: "3M", days: 91 },
  { label: "6M", days: 182 },
  { label: "12M", days: 365 },
];

export default async function LabPage() {
  const [book, market] = await Promise.all([loadBook(), loadMarketView()]);
  const now = new Date();
  const exposures = computeExposures(book.positionInputs, book.cashInputs, book.hedgeInputs, market, now);

  const carryRows = Object.entries(market.spot)
    .filter(([ccy]) => market.spot[ccy])
    .map(([ccy, spot]) => {
      const gross = exposures.find((e) => e.ccy === ccy)?.grossExposureUsd;
      return {
        ccy,
        cells: TENORS.map((t) => {
          const fwd = market.forwardTo(ccy, new Date(now.getTime() + t.days * 86_400_000));
          if (!fwd) return null;
          const carry = annualizedCarry(spot, fwd, t.days);
          return {
            carryPct: carry.mul(100).toFixed(2),
            usdPerYear: gross && !gross.isZero() ? carryUsdPerYear(gross, carry).toFixed(0) : null,
          };
        }),
      };
    });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-xl font-bold">Strategy & Scenario Lab</h1>
      <ScenarioRunner />

      <Card>
        <CardHeader>
          <CardTitle>Hedge carry — annualized (forward vs. spot; positive = points in your favor when selling local)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Ccy</TH>
                {TENORS.map((t) => (
                  <TH key={t.label} className="text-right">
                    {t.label}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {carryRows.map((r) => (
                <TR key={r.ccy}>
                  <TD className="font-semibold">{r.ccy}</TD>
                  {r.cells.map((c, i) => (
                    <TD key={i} className="text-right tabular-nums">
                      {c ? (
                        <>
                          <span className={Number(c.carryPct) < 0 ? "text-red-600" : "text-emerald-600"}>{c.carryPct}%</span>
                          {c.usdPerYear && (
                            <span className="block text-[10px] text-zinc-400">
                              ${Number(c.usdPerYear).toLocaleString("en-US")}/yr on full gross
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <OptionBuilder />
    </div>
  );
}
