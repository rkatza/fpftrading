"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const PRESETS = ["-0.15", "-0.10", "-0.05", "0.05", "0.10", "0.15"];
const CCYS = ["", "PEN", "COP", "MXN", "DOP", "BRL"];

interface ScenarioResponse {
  exposureDeltaUsd: string;
  hedgeMtmDeltaUsd: string;
  netPnlUsd: string;
  marginRequiredBase: string;
  marginRequiredShocked: string;
  perCcy: { ccy: string; grossBase: string; netBase: string; mtmBase: string; mtmShocked: string }[];
}

const usd = (s: string) =>
  `${Number(s) < 0 ? "-" : ""}$${Math.abs(Number(s)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function ScenarioRunner() {
  const [spotPct, setSpotPct] = useState("-0.10");
  const [ccy, setCcy] = useState("");
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(pct = spotPct) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotPct: Number(pct), fwdPointsBps: 0, ccy: ccy || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenario runner — spot shock</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-28" value={ccy} onChange={(e) => setCcy(e.target.value)}>
            {CCYS.map((c) => (
              <option key={c} value={c}>
                {c || "All ccys"}
              </option>
            ))}
          </Select>
          {PRESETS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === spotPct ? "default" : "outline"}
              onClick={() => {
                setSpotPct(p);
                run(p);
              }}
              disabled={busy}
            >
              {Number(p) > 0 ? "+" : ""}
              {Number(p) * 100}%
            </Button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {result && (
          <>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                Exposure Δ: <b className={Number(result.exposureDeltaUsd) < 0 ? "text-red-600" : "text-emerald-600"}>{usd(result.exposureDeltaUsd)}</b>
              </span>
              <span>
                Hedge MTM Δ: <b className={Number(result.hedgeMtmDeltaUsd) < 0 ? "text-red-600" : "text-emerald-600"}>{usd(result.hedgeMtmDeltaUsd)}</b>
              </span>
              <span>
                Net P&L: <b className={Number(result.netPnlUsd) < 0 ? "text-red-600" : "text-emerald-600"}>{usd(result.netPnlUsd)}</b>
              </span>
              <Badge variant="secondary">
                margin req {usd(result.marginRequiredBase)} → {usd(result.marginRequiredShocked)}
              </Badge>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Ccy</TH>
                  <TH className="text-right">Gross</TH>
                  <TH className="text-right">Net</TH>
                  <TH className="text-right">MTM base</TH>
                  <TH className="text-right">MTM shocked</TH>
                </TR>
              </THead>
              <TBody>
                {result.perCcy
                  .filter((r) => Number(r.grossBase) !== 0 || Number(r.mtmBase) !== 0)
                  .map((r) => (
                    <TR key={r.ccy}>
                      <TD className="font-medium">{r.ccy}</TD>
                      <TD className="text-right tabular-nums">{usd(r.grossBase)}</TD>
                      <TD className="text-right tabular-nums">{usd(r.netBase)}</TD>
                      <TD className="text-right tabular-nums">{usd(r.mtmBase)}</TD>
                      <TD className="text-right tabular-nums">{usd(r.mtmShocked)}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
