import { prisma } from "@/lib/db";
import { ALLOWED_EMAILS } from "@/lib/auth";
import { DEFAULT_MARGIN_CONFIG } from "@/lib/engine/margin";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { PolicyForm } from "./policy-form";

export const dynamic = "force-dynamic";

const PROVIDERS: { name: string; env: string; purpose: string }[] = [
  { name: "Twelve Data", env: "TWELVEDATA_API_KEY", purpose: "Primary spot (USD/PEN, COP, MXN, DOP, BRL)" },
  { name: "TraderMade", env: "TRADERMADE_API_KEY", purpose: "Fallback spot + forwards" },
  { name: "FinPricing", env: "FINPRICING_API_KEY", purpose: "FX vol surfaces (optional)" },
  { name: "Banxico SIE", env: "BANXICO_TOKEN", purpose: "Mexico policy rate (free token)" },
  { name: "FRED", env: "FRED_API_KEY", purpose: "SOFR (free key)" },
  { name: "Anthropic", env: "ANTHROPIC_API_KEY", purpose: "AI briefs, recommendations, chat" },
  { name: "Trading Economics", env: "TRADING_ECONOMICS_KEY", purpose: "Economic calendar (optional)" },
];

export default async function SettingsPage() {
  const policies = await prisma.hedgePolicy.findMany({ orderBy: { ccy: "asc" } });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Hedge policy bands</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Table>
            <THead>
              <TR>
                <TH>Ccy</TH>
                <TH className="text-right">Target min</TH>
                <TH className="text-right">Target max</TH>
              </TR>
            </THead>
            <TBody>
              {policies.map((p) => (
                <TR key={p.id}>
                  <TD className="font-semibold">{p.ccy}</TD>
                  <TD className="text-right tabular-nums">{(Number(p.targetRatioMin) * 100).toFixed(0)}%</TD>
                  <TD className="text-right tabular-nums">{(Number(p.targetRatioMax) * 100).toFixed(0)}%</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <PolicyForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Margin model</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600 dark:text-zinc-400">
          Required = Σ open notional (USD) × risk weight − netting benefit. Default EM weight{" "}
          {Number(DEFAULT_MARGIN_CONFIG.defaultWeight) * 100}%, netting benefit{" "}
          {Number(DEFAULT_MARGIN_CONFIG.nettingBenefit) * 100}%. Per-ccy overrides are configured in code (
          <code>lib/engine/margin.ts</code>) in v1.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Providers & keys</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Provider</TH>
                <TH>Status</TH>
                <TH>Used for</TH>
              </TR>
            </THead>
            <TBody>
              {PROVIDERS.map((p) => (
                <TR key={p.env}>
                  <TD className="font-medium">{p.name}</TD>
                  <TD>
                    <Badge variant={process.env[p.env] ? "success" : "warning"}>
                      {process.env[p.env] ? "configured" : "missing"}
                    </Badge>
                  </TD>
                  <TD className="text-zinc-500">{p.purpose}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="mt-2 text-xs text-zinc-400">Keys live in environment variables only — never in the database.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users (allow-list)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {ALLOWED_EMAILS.map((e) => (
            <div key={e} className="py-0.5 text-zinc-600 dark:text-zinc-400">
              {e}
            </div>
          ))}
          <p className="mt-2 text-xs text-zinc-400">
            Single shared role in v1. The allow-list is code-defined (<code>lib/auth.ts</code>); the shared password is{" "}
            <code>AUTH_PASSWORD</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
