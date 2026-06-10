"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui";
import { PayoffChart } from "@/components/charts";

interface OptionsResponse {
  spot: string;
  forward: string;
  atmVol: string;
  volSource: string;
  netPremiumUsd: string;
  annualizedCarry: string;
  strikes: number[];
  payoff: { spot: number; payoffUsd: number }[];
}

export function OptionBuilder() {
  const [form, setForm] = useState({
    ccy: "PEN",
    structure: "collar",
    notionalLocal: "1000000",
    tenorDays: "91",
    putStrike: "",
    callStrike: "",
    lowPutStrike: "",
  });
  const [results, setResults] = useState<{ structure: string; data: OptionsResponse }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function price(compare = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          putStrike: form.putStrike || undefined,
          callStrike: form.callStrike || undefined,
          lowPutStrike: form.lowPutStrike || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const data: OptionsResponse = await res.json();
      setResults((prev) => (compare ? [...prev.slice(-2), { structure: form.structure, data }] : [{ structure: form.structure, data }]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Option structure builder (Garman–Kohlhagen)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-7">
          <div>
            <Label>Ccy</Label>
            <Select value={form.ccy} onChange={set("ccy")}>
              {["PEN", "COP", "MXN", "DOP", "BRL"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Structure</Label>
            <Select value={form.structure} onChange={set("structure")}>
              <option value="forward">Forward (sell local)</option>
              <option value="put">Protective put</option>
              <option value="collar">Collar</option>
              <option value="seagull">Seagull</option>
            </Select>
          </div>
          <div>
            <Label>Notional (local)</Label>
            <Input value={form.notionalLocal} onChange={set("notionalLocal")} inputMode="decimal" />
          </div>
          <div>
            <Label>Tenor (days)</Label>
            <Input value={form.tenorDays} onChange={set("tenorDays")} inputMode="numeric" />
          </div>
          <div>
            <Label>Put strike</Label>
            <Input value={form.putStrike} onChange={set("putStrike")} placeholder="auto −3%" />
          </div>
          <div>
            <Label>Call strike</Label>
            <Input value={form.callStrike} onChange={set("callStrike")} placeholder="auto +3%" />
          </div>
          <div>
            <Label>Low put (seagull)</Label>
            <Input value={form.lowPutStrike} onChange={set("lowPutStrike")} placeholder="auto −10%" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => price(false)} disabled={busy}>
            Price
          </Button>
          <Button variant="outline" onClick={() => price(true)} disabled={busy}>
            Add to comparison
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className={`grid gap-4 ${results.length > 1 ? "md:grid-cols-2" : ""}`}>
          {results.map((r, i) => (
            <div key={i} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                <b className="capitalize">{r.structure}</b>
                <Badge variant="secondary">spot {Number(r.data.spot).toFixed(5)}</Badge>
                <Badge variant="secondary">fwd {Number(r.data.forward).toFixed(5)}</Badge>
                <Badge variant="secondary">
                  vol {(Number(r.data.atmVol) * 100).toFixed(1)}% ({r.data.volSource})
                </Badge>
                <Badge variant={Number(r.data.netPremiumUsd) < 0 ? "warning" : "success"}>
                  net premium ${Number(r.data.netPremiumUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </Badge>
                <Badge variant="outline">carry {(Number(r.data.annualizedCarry) * 100).toFixed(2)}%/yr</Badge>
              </div>
              <PayoffChart points={r.data.payoff} strikes={r.data.strikes} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
