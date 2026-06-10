"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePolicy } from "@/app/actions";
import { Button, Input, Label, Select } from "@/components/ui";

export function PolicyForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await savePolicy(new FormData(e.currentTarget));
    if (res.ok) {
      setError(null);
      router.refresh();
    } else setError(res.error);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <Label>Ccy</Label>
        <Select name="ccy" className="w-24">
          {["PEN", "COP", "MXN", "DOP", "BRL"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Min ratio (0–1)</Label>
        <Input name="targetRatioMin" className="w-28" inputMode="decimal" placeholder="0.50" required />
      </div>
      <div>
        <Label>Max ratio (0–1)</Label>
        <Input name="targetRatioMax" className="w-28" inputMode="decimal" placeholder="1.00" required />
      </div>
      <Button type="submit" size="sm">
        Save band
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
