import type Anthropic from "@anthropic-ai/sdk";
import { dec } from "@/lib/money";
import { loadBook } from "@/lib/book";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { runScenario } from "@/lib/engine/scenario";
import { DEFAULT_MARGIN_CONFIG } from "@/lib/engine/margin";
import { buildBookContext } from "./context";

/**
 * Book Q&A tools: answers are computed by the engines, not guessed.
 * All tools are read-only — the AI never writes to the database.
 */
export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_exposures",
    description:
      "Get current FX exposures per currency: gross, hedged, net (USD), hedge ratio, hedge MTM. Call this for any question about exposure or coverage.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_hedges",
    description:
      "Get the open hedge book: every NDF/forward/option with notional, contract rate, fixing date, days to fixing, current forward, counterparty.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_rates",
    description:
      "Get current market data: spot rates (USD per local unit), central-bank policy rates, SOFR, and 3M annualized carry per currency.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "run_scenario",
    description:
      "Shock the market and recompute the book. Use for what-if questions (e.g. 'what if PEN depreciates 10%'). spotPct is the local-currency move vs USD: -0.10 = 10% depreciation.",
    input_schema: {
      type: "object",
      properties: {
        spotPct: { type: "number", description: "fractional spot move, e.g. -0.10" },
        ccy: { type: "string", description: "restrict to one currency code (PEN/COP/MXN/DOP/BRL); omit for all" },
      },
      required: ["spotPct"],
      additionalProperties: false,
    },
  },
];

export async function executeChatTool(name: string, input: unknown): Promise<string> {
  const ctx = await buildBookContext();
  switch (name) {
    case "get_exposures":
      return JSON.stringify({ asOf: ctx.asOf, exposures: ctx.exposures, policies: ctx.policies });
    case "get_hedges":
      return JSON.stringify({ asOf: ctx.asOf, hedges: ctx.hedges });
    case "get_rates":
      return JSON.stringify({ asOf: ctx.asOf, market: ctx.market });
    case "run_scenario": {
      const { spotPct, ccy } = input as { spotPct: number; ccy?: string };
      if (typeof spotPct !== "number" || Math.abs(spotPct) > 0.5) {
        return JSON.stringify({ error: "spotPct must be a number in [-0.5, 0.5]" });
      }
      const [book, market] = await Promise.all([loadBook(), loadMarketView()]);
      const res = runScenario(
        book.positionInputs,
        book.cashInputs,
        book.hedgeInputs,
        market,
        new Date(),
        { spotPct: dec(spotPct), fwdPointsBps: dec(0), volPts: dec(0), ccy },
        DEFAULT_MARGIN_CONFIG
      );
      return JSON.stringify({
        shock: res.shock,
        exposureDeltaUsd: res.exposureDeltaUsd.toFixed(0),
        hedgeMtmDeltaUsd: res.hedgeMtmDeltaUsd.toFixed(0),
        netPnlUsd: res.netPnlUsd.toFixed(0),
        marginRequiredUsd: res.margin.shocked.requiredUsd.toFixed(0),
      });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

/**
 * Manual tool-use loop (kept manual so tests can mock the client).
 * Returns the final text and total usage.
 */
export async function runChatLoop(
  client: Pick<Anthropic, "messages">,
  model: string,
  system: string,
  messages: Anthropic.MessageParam[],
  executeTool: (name: string, input: unknown) => Promise<string> = executeChatTool,
  maxIterations = 8
): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number } }> {
  const convo: Anthropic.MessageParam[] = [...messages];
  const usage = { input_tokens: 0, output_tokens: 0 };

  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      tools: CHAT_TOOLS,
      messages: convo,
    });
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, usage };
    }

    convo.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      results.push({ type: "tool_result", tool_use_id: tu.id, content: await executeTool(tu.name, tu.input) });
    }
    convo.push({ role: "user", content: results });
  }
  return { text: "I hit the tool-use iteration limit before finishing — try a narrower question.", usage };
}
