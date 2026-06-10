"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/positions", label: "Positions" },
  { href: "/cash", label: "Cash" },
  { href: "/hedges", label: "Hedges" },
  { href: "/market", label: "Market Data" },
  { href: "/lab", label: "Strategy Lab" },
  { href: "/ai", label: "AI Analysis" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-200 bg-white p-4 print:hidden dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6">
        <div className="text-base font-bold tracking-tight">FPF FX View</div>
        <div className="text-xs text-zinc-400">First Principles Fund</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
              pathname === l.href && "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800">
        <div className="truncate">{userEmail}</div>
        <form action="/api/auth/signout" method="post">
          <button className="mt-1 text-zinc-500 underline-offset-2 hover:underline">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
