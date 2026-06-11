"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const fmtUsdShort = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}k`;

export function ExposureBarChart({
  data,
}: {
  data: { ccy: string; gross: number; net: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="ccy" fontSize={12} />
        <YAxis tickFormatter={fmtUsdShort} fontSize={11} width={56} />
        <Tooltip formatter={(v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
        <Bar dataKey="gross" name="Gross exposure" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
        <Bar dataKey="net" name="Net (after hedges)" fill="#0d9488" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ points, positive }: { points: { date: string; value: number }[]; positive: boolean }) {
  if (points.length < 2) {
    return (
      <div className="flex h-8 w-24 flex-col justify-center" title="Trend appears once at least two daily quotes are stored">
        <div className="border-t-2 border-dashed border-zinc-300 dark:border-zinc-700" />
        <span className="mt-1 text-[9px] leading-none text-zinc-400">building history…</span>
      </div>
    );
  }
  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line type="monotone" dataKey="value" stroke={positive ? "#059669" : "#dc2626"} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PayoffChart({ points, strikes }: { points: { spot: number; payoffUsd: number }[]; strikes?: number[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="spot" fontSize={11} tickFormatter={(v) => Number(v).toFixed(3)} />
        <YAxis tickFormatter={fmtUsdShort} fontSize={11} width={60} />
        <Tooltip
          formatter={(v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          labelFormatter={(l) => `Spot ${Number(l).toFixed(5)}`}
        />
        <ReferenceLine y={0} stroke="#71717a" />
        {strikes?.map((s) => <ReferenceLine key={s} x={s} stroke="#f59e0b" strokeDasharray="4 4" />)}
        <Line type="monotone" dataKey="payoffUsd" stroke="#0d9488" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RatioGauge({ ratio, min, max }: { ratio: number | null; min: number; max: number }) {
  const pct = ratio === null ? 0 : Math.min(Math.max(ratio, 0), 1.5);
  const inBand = ratio !== null && ratio >= min && ratio <= max;
  return (
    <div className="w-full">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="absolute h-full bg-zinc-300 dark:bg-zinc-700"
          style={{ left: `${(min / 1.5) * 100}%`, width: `${((max - min) / 1.5) * 100}%` }}
        />
        <div
          className={`absolute h-full rounded-full ${inBand ? "bg-emerald-500" : "bg-amber-500"}`}
          style={{ width: `${(pct / 1.5) * 100}%`, opacity: 0.85 }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>{ratio === null ? "n/a" : `${(ratio * 100).toFixed(1)}%`}</span>
        <span>
          band {(min * 100).toFixed(0)}–{(max * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
