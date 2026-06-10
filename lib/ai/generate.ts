import { prisma } from "@/lib/db";
import { ADVISORY_FOOTER, AI_MODEL, anthropic, logUsage } from "./client";
import { buildBookContext } from "./context";

/**
 * Macro briefs + hedge recommendations. Output is stored as Recommendation
 * rows (the only table the AI layer writes) and labeled advisory.
 */

const HOUSE_STYLE =
  "Write in FPF house style: direct, recommendation-first. Lead with the action or conclusion, then the reasoning. No hedging filler. Use market-standard currency terminology.";

export async function generateMacroBrief(ccy: string): Promise<{ id: string }> {
  const ctx = await buildBookContext();
  const client = anthropic();

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    system: `You are the FX strategist for First Principles Fund, a USD credit fund lending to LatAm fintechs. ${HOUSE_STYLE}`,
    messages: [
      {
        role: "user",
        content: `Write a macro brief for ${ccy} (vs USD) for the fund's partners.

Cover: central-bank policy rate path, recent inflation, key FX drivers, what NDF-implied carry says vs. the policy path, and what it means for our hedge book. If you are not certain of a current figure, say so explicitly rather than inventing one.

Current book and market context (computed from our systems):
${JSON.stringify(ctx, null, 1)}

Format as markdown with a one-paragraph "Bottom line" first.`,
      },
    ],
  });
  logUsage(`brief:${ccy}`, response.usage);

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  const rec = await prisma.recommendation.create({
    data: {
      ccy,
      title: `Macro brief — ${ccy} (${new Date().toISOString().slice(0, 10)})`,
      body: text + ADVISORY_FOOTER,
      inputsJson: { kind: "brief", model: AI_MODEL, usage: response.usage, context: ctx } as object,
    },
  });
  return { id: rec.id };
}

export async function generateHedgeRecommendation(ccy?: string): Promise<{ id: string }> {
  const ctx = await buildBookContext();
  const client = anthropic();

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    system: `You are the FX hedging advisor for First Principles Fund. ${HOUSE_STYLE} Every recommendation must state its assumptions explicitly and quantify cost (carry, premium) where possible. You never execute trades; a human does.`,
    messages: [
      {
        role: "user",
        content: `Given our hedge policy bands, current carry, and the book below, propose concrete hedging actions${ccy ? ` for ${ccy}` : ""}.

For each action: instrument, direction, notional, suggested tenor/fixing, estimated cost in bps annualized (from the carry data), and which policy gap it closes. Consider rolls for hedges fixing within 60 days. Consider option structures (collar/seagull) where outright carry is expensive.

Book and market context:
${JSON.stringify(ctx, null, 1)}`,
      },
    ],
  });
  logUsage(`recommend:${ccy ?? "all"}`, response.usage);

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  const rec = await prisma.recommendation.create({
    data: {
      ccy: ccy ?? null,
      title: `Hedge recommendation${ccy ? ` — ${ccy}` : ""} (${new Date().toISOString().slice(0, 10)})`,
      body: text + ADVISORY_FOOTER,
      inputsJson: { kind: "recommendation", model: AI_MODEL, usage: response.usage, context: ctx } as object,
    },
  });
  return { id: rec.id };
}
