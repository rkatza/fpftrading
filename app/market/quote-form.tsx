"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveManualQuote } from "@/app/actions";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui";

export function QuoteForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; warn: boolean } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const res = await saveManualQuote(new FormData(form));
    if (res.ok) {
      setMsg(res.warning ? { text: res.warning, warn: true } : { text: "Saved.", warn: false });
      form.reset();
      router.refresh();
    } else {
      setMsg({ text: res.error, warn: true });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual quote entry (dealer quotes)</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-2 items-end gap-3 md:grid-cols-5">
          <div>
            <Label>Pair / ccy</Label>
            <Input name="pair" placeholder="PEN/USD" required />
          </div>
          <div>
            <Label>Tenor</Label>
            <Input name="tenor" placeholder="SPOT, 3M or 2026-12-15" required />
          </div>
          <div>
            <Label>Type</Label>
            <Select name="type" defaultValue="forward_outright">
              {["spot", "forward_outright", "forward_points", "vol_atm", "vol_rr25", "vol_bf25", "interest_rate"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Value (USD per unit / decimal)</Label>
            <Input name="value" inputMode="decimal" required />
          </div>
          <Button type="submit">Save quote</Button>
        </form>
        {msg && <p className={`mt-2 text-xs ${msg.warn ? "text-amber-600" : "text-emerald-600"}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}
