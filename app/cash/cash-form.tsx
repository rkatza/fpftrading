"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCash } from "@/app/actions";
import { Button, Card, CardContent, Input, Label, Select } from "@/components/ui";

export interface CashRow {
  id: string;
  counterpartyId: string;
  account: string;
  ccy: string;
  amount: string;
  asOf: string;
  isMarginAccount: boolean;
}

export function CashForm({
  counterparties,
  initial,
}: {
  counterparties: { id: string; name: string }[];
  initial?: CashRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await saveCash(new FormData(e.currentTarget));
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else setError(res.error);
  }

  if (!open) {
    return (
      <Button size="sm" variant={initial ? "ghost" : "default"} onClick={() => setOpen(true)}>
        {initial ? "Edit" : "+ New balance"}
      </Button>
    );
  }

  return (
    <Card className="my-2">
      <CardContent className="p-4">
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {initial && <input type="hidden" name="id" value={initial.id} />}
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
            <Label>Account</Label>
            <Input name="account" defaultValue={initial?.account} required />
          </div>
          <div>
            <Label>Currency</Label>
            <Input name="ccy" defaultValue={initial?.ccy ?? "USD"} maxLength={3} required />
          </div>
          <div>
            <Label>Amount</Label>
            <Input name="amount" inputMode="decimal" defaultValue={initial?.amount} required />
          </div>
          <div>
            <Label>As of</Label>
            <Input name="asOf" type="date" defaultValue={initial?.asOf ?? new Date().toISOString().slice(0, 10)} required />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <input
              id="isMargin"
              type="checkbox"
              name="isMarginAccount"
              value="true"
              defaultChecked={initial?.isMarginAccount}
            />
            <Label htmlFor="isMargin">Margin account</Label>
          </div>
          <div className="col-span-2 flex items-end justify-end gap-2 md:col-span-3">
            {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
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
