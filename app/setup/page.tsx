/**
 * Shown (via proxy.ts redirect) when required env vars are missing —
 * a fresh Vercel deploy lands here instead of a bare 500.
 * No auth, no database access.
 */
export const dynamic = "force-dynamic";

const REQUIRED: { key: string; hint: string }[] = [
  { key: "DATABASE_URL", hint: "Postgres connection string (Vercel → Storage → Neon, or any Postgres)" },
  { key: "AUTH_SECRET", hint: "session signing secret — generate with: openssl rand -base64 32" },
  { key: "AUTH_PASSWORD", hint: "shared partner password for the 4 allow-listed logins" },
];

const OPTIONAL: { key: string; hint: string }[] = [
  { key: "CRON_SECRET", hint: "bearer token for /api/cron/* (required for scheduled refresh)" },
  { key: "TWELVEDATA_API_KEY", hint: "live spot rates" },
  { key: "ANTHROPIC_API_KEY", hint: "AI briefs, recommendations, chat" },
];

export default function SetupPage() {
  const missing = REQUIRED.filter((r) => !process.env[r.key]);
  const optionalMissing = OPTIONAL.filter((r) => !process.env[r.key]);

  return (
    <div className="mx-auto mt-16 max-w-xl px-6">
      <h1 className="text-xl font-bold">FPF FX View — setup required</h1>
      <p className="mt-2 text-sm text-zinc-500">
        The app is deployed but not configured yet. Set the environment variables below (Vercel → Project →
        Settings → Environment Variables), then redeploy.
      </p>

      <h2 className="mt-6 text-sm font-semibold">Required — missing</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {missing.map((r) => (
          <li key={r.key} className="rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950">
            <code className="font-semibold">{r.key}</code>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">{r.hint}</div>
          </li>
        ))}
        {missing.length === 0 && <li className="text-sm text-emerald-600">All set — redeploy to continue.</li>}
      </ul>

      {optionalMissing.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-semibold">Optional — not configured</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {optionalMissing.map((r) => (
              <li key={r.key} className="text-xs text-zinc-500">
                <code>{r.key}</code> — {r.hint}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-6 text-sm font-semibold">After the variables are set</h2>
      <ol className="mt-2 list-decimal pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        <li>Redeploy — migrations run automatically during the build.</li>
        <li>
          Seed the Apr-2026 book once, from your machine:{" "}
          <code className="text-xs">DATABASE_URL=&lt;prod url&gt; npx prisma db seed</code>
        </li>
        <li>Log in with an allow-listed partner email and your AUTH_PASSWORD.</li>
      </ol>
    </div>
  );
}
