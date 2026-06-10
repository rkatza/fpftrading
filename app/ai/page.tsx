import { prisma } from "@/lib/db";
import { BookChat, GeneratePanel, RecommendationCard } from "./ai-client";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const recs = await prisma.recommendation.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">AI Analysis</h1>
        <p className="text-xs text-zinc-500">
          All output is advisory only — it is never auto-applied and never writes to the book.
        </p>
      </div>
      <GeneratePanel />
      <BookChat />
      <h2 className="mt-2 text-sm font-semibold text-zinc-500">Briefs & recommendations inbox</h2>
      {recs.length === 0 && <p className="text-xs text-zinc-400">Nothing generated yet.</p>}
      {recs.map((r) => (
        <RecommendationCard
          key={r.id}
          rec={{
            id: r.id,
            title: r.title,
            body: r.body,
            status: r.status,
            ccy: r.ccy,
            createdAt: r.createdAt.toISOString(),
          }}
        />
      ))}
    </div>
  );
}
