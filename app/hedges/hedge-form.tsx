"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteHedge, rollHedge, saveHedge } from "@/app/actions";
import { Button, Card, CardContent, Input, Label, Select } from "@/components/ui";

export interface HedgeRow {
  id: string;
  type: string;
  direction: string;
  pair: string;
  notionalLocal: string;
  contractRate: string;
  premiumUsd: string;
  tradeDate: string;
  fixingDate: string;
  settlementDate: string;
  counterpartyId: string;
  status: string;
  settledPnlUsd: string;
  notes: string;
}

const PAIRS = ["PEN/USD", "COP/USD", "MXN/USD", "DOP/USD", "BRL/USD"];

export function HedgeForm({
  counterparties,
  initial,
  rollOf,
  label,
}: {
  counterparties: { id: string; name: string }[];
  initial?: Partial<HedgeRow>;
  /** when set, submitting settles this hedge id and books the new one as its roll */
  rollOf?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = rollOf ? await rollHedge(rollOf, fd) : await saveHedge(fd);
    if (res.ok) {
      setMsg(res.warning ?? null);
      setOpen(false);
      router.refresh();
    } else setMsg(res.error);
  }

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        <Button size="sm" variant={initial?.id || rollOf ? "ghost" : "default"} onClick={() => setOpen(true)}>
          {label ?? (rollOf ? "Roll" : initial?.id ? "Edit" : "+ New hedge")}
        </Button>
        {msg && <span className="max-w-md text-xs text-amber-600">{msg}</span>}
      </span>
    );
  }

  return (
    <Card className="my-2">
      <CardContent className="p-4">
        {rollOf && (
          <p className="mb-2 text-xs text-amber-600">
            Rolling: the existing hedge will be marked settled and this trade booked as its replacement.
          </p>
        )}
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {initial?.id && !rollOf && <input type="hidden" name="id" value={initial.id} />}
          <div>
            <Label>Type</Label>
            <Select name="type" defaultValue={initial?.type ?? "NDF"}>
              {["NDF", "FORWARD", "OPTION_CALL", "OPTION_PUT", "STRUCTURE"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Direction (of local ccy)</Label>
            <Select name="direction" defaultValue={initial?.direction ?? "sell"}>
              <option value="sell">sell</option>
              <option value="buy">buy</option>
            </Select>
          </div>
          <div>
            <Label>Pair</Label>
            <Select name="pair" defaultValue={initial?.pair ?? "PEN/USD"}>
              {PAIRS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Notional (local ccy)</Label>
            <Input name="notionalLocal" inputMode="decimal" defaultValue={initial?.notionalLocal} required />
          </div>
          <div>
            <Label>Contract rate (USD per unit)</Label>
            <Input name="contractRate" inputMode="decimal" defaultValue={initial?.contractRate} required />
          </div>
          <div>
            <Label>Premium USD (options)</Label>
            <Input name="premiumUsd" inputMode="decimal" defaultValue={initial?.premiumUsd} />
          </div>
          <div>
            <Label>Trade date</Label>
            <Input name="tradeDate" type="date" defaultValue={initial?.tradeDate ?? new Date().toISOString().slice(0, 10)} required />
          </div>
          <div>
            <Label>Fixing date</Label>
            <Input name="fixingDate" type="date" defaultValue={initial?.fixingDate} required />
          </div>
          <div>
            <Label>Settlement date</Label>
            <Input name="settlementDate" type="date" defaultValue={initial?.settlementDate} required />
          </div>
          <div>
            <Label>Counterparty</Label>
            <Select name="counterpartyId" defaultValue={initial?.counterpartyId}>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select name="status" defaultValue={rollOf ? "open" : (initial?.status ?? "open")}>
              <option>open</option>
              <option>fixed</option>
              <option>settled</option>
            </Select>
          </div>
          {rollOf ? (
            <div>
              <Label>Realized P&L on closed leg (USD)</Label>
              <Input name="closePnlUsd" inputMode="decimal" placeholder="optional" />
            </div>
          ) : (
            <div>
              <Label>Settled P&L (USD)</Label>
              <Input name="settledPnlUsd" inputMode="decimal" defaultValue={initial?.settledPnlUsd} />
            </div>
          )}
          <div className="col-span-2">
            <Label>Notes</Label>
            <Input name="notes" defaultValue={initial?.notes} />
          </div>
          <div className="col-span-2 flex items-end justify-end gap-2 md:col-span-4">
            {msg && <span className="mr-auto text-xs text-red-600">{msg}</span>}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{rollOf ? "Roll hedge" : "Save"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function DeleteHedgeButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-red-600"
      onClick={async () => {
        if (!confirm("Delete this hedge?")) return;
        const res = await deleteHedge(id);
        if (res.ok) router.refresh();
        else alert(res.error);
      }}
    >
      Delete
    </Button>
  );
}
