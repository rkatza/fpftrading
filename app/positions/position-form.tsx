"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePosition, deletePosition, type ActionResult } from "@/app/actions";
import { Button, Card, CardContent, Input, Label, Select } from "@/components/ui";

export interface PositionRow {
  id: string;
  borrower: string;
  country: string;
  usdNotional: string;
  marketValueUsd: string;
  settlementCcy: string;
  underlyingCcy: string;
  exposureFactor: string;
  startDate: string;
  maturityDate: string;
  status: "active" | "repaid";
  notes: string;
}

const CCYS = ["USD", "PEN", "COP", "MXN", "DOP", "BRL"];

export function PositionForm({ ccys = CCYS, initial }: { ccys?: string[]; initial?: PositionRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res: ActionResult = await savePosition(new FormData(e.currentTarget));
    if (res.ok) {
      setMsg(res.warning ?? null);
      setOpen(false);
      router.refresh();
    } else {
      setMsg(res.error);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Button size="sm" variant={initial ? "ghost" : "default"} onClick={() => setOpen(true)}>
          {initial ? "Edit" : "+ New position"}
        </Button>
        {msg && <span className="text-xs text-amber-600">{msg}</span>}
      </div>
    );
  }

  return (
    <Card className="my-2">
      <CardContent className="p-4">
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {initial && <input type="hidden" name="id" value={initial.id} />}
          <div>
            <Label>Borrower</Label>
            <Input name="borrower" defaultValue={initial?.borrower} required />
          </div>
          <div>
            <Label>Country</Label>
            <Input name="country" defaultValue={initial?.country} required />
          </div>
          <div>
            <Label>USD notional</Label>
            <Input name="usdNotional" inputMode="decimal" defaultValue={initial?.usdNotional} required />
          </div>
          <div>
            <Label>Market value (USD)</Label>
            <Input name="marketValueUsd" inputMode="decimal" defaultValue={initial?.marketValueUsd} required />
          </div>
          <div>
            <Label>Settlement ccy</Label>
            <Select name="settlementCcy" defaultValue={initial?.settlementCcy ?? "USD"}>
              {ccys.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Underlying ccy</Label>
            <Select name="underlyingCcy" defaultValue={initial?.underlyingCcy ?? "PEN"}>
              {ccys.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Exposure factor (0–1)</Label>
            <Input name="exposureFactor" inputMode="decimal" defaultValue={initial?.exposureFactor ?? "1"} required />
          </div>
          <div>
            <Label>Status</Label>
            <Select name="status" defaultValue={initial?.status ?? "active"}>
              <option>active</option>
              <option>repaid</option>
            </Select>
          </div>
          <div>
            <Label>Start date</Label>
            <Input name="startDate" type="date" defaultValue={initial?.startDate} required />
          </div>
          <div>
            <Label>Maturity</Label>
            <Input name="maturityDate" type="date" defaultValue={initial?.maturityDate} />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Input name="notes" defaultValue={initial?.notes} />
          </div>
          <div className="col-span-2 flex items-end justify-end gap-2 md:col-span-4">
            {msg && <span className="mr-auto text-xs text-red-600">{msg}</span>}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function DeleteButton({ id, kind }: { id: string; kind: "position" | "cash" }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-red-600"
      onClick={async () => {
        if (!confirm("Delete this entry?")) return;
        const { deleteCash } = await import("@/app/actions");
        const res = kind === "position" ? await deletePosition(id) : await deleteCash(id);
        if (res.ok) router.refresh();
        else alert(res.error);
      }}
    >
      Delete
    </Button>
  );
}
