import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { CHAT_TOOLS, runChatLoop } from "@/lib/ai/tools";

const textResponse = (text: string): Partial<Anthropic.Message> => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text, citations: null }],
  usage: { input_tokens: 100, output_tokens: 20 } as Anthropic.Usage,
});

const toolUseResponse = (name: string, input: object): Partial<Anthropic.Message> => ({
  stop_reason: "tool_use",
  content: [
    { type: "text", text: "Let me check.", citations: null },
    { type: "tool_use", id: "tu_1", name, input },
  ],
  usage: { input_tokens: 100, output_tokens: 30 } as Anthropic.Usage,
});

function mockClient(responses: Partial<Anthropic.Message>[]) {
  const create = vi.fn();
  for (const r of responses) create.mockResolvedValueOnce(r);
  return { client: { messages: { create } } as unknown as Pick<Anthropic, "messages">, create };
}

describe("AI chat tool-use loop", () => {
  it("declares the four book tools", () => {
    expect(CHAT_TOOLS.map((t) => t.name).sort()).toEqual(["get_exposures", "get_hedges", "get_rates", "run_scenario"]);
  });

  it("returns text directly when no tool is used", async () => {
    const { client } = mockClient([textResponse("Your net COP exposure is $7.4M.")]);
    const res = await runChatLoop(client, "claude-sonnet-4-6", "sys", [{ role: "user", content: "net COP?" }]);
    expect(res.text).toContain("COP");
    expect(res.usage.output_tokens).toBe(20);
  });

  it("executes requested tools and feeds results back", async () => {
    const { client, create } = mockClient([
      toolUseResponse("get_exposures", {}),
      textResponse("PEN is 27% hedged."),
    ]);
    const executed: string[] = [];
    const res = await runChatLoop(
      client,
      "claude-sonnet-4-6",
      "sys",
      [{ role: "user", content: "PEN ratio?" }],
      async (name) => {
        executed.push(name);
        return JSON.stringify({ exposures: [{ ccy: "PEN", hedgeRatio: "0.273" }] });
      }
    );
    expect(executed).toEqual(["get_exposures"]);
    expect(res.text).toBe("PEN is 27% hedged.");
    // second call must include the tool_result turn
    const secondCallMessages = create.mock.calls[1][0].messages;
    expect(secondCallMessages.at(-1).content[0].type).toBe("tool_result");
    expect(res.usage.input_tokens).toBe(200);
  });

  it("stops at the iteration cap instead of looping forever", async () => {
    const responses = Array.from({ length: 10 }, () => toolUseResponse("get_rates", {}));
    const { client, create } = mockClient(responses);
    const res = await runChatLoop(client, "claude-sonnet-4-6", "sys", [{ role: "user", content: "loop" }], async () => "{}", 3);
    expect(create).toHaveBeenCalledTimes(3);
    expect(res.text).toContain("iteration limit");
  });
});

describe("context builder (seeded DB)", () => {
  it.skipIf(!process.env.DATABASE_URL)("serializes the book compactly with computed exposures", async () => {
    const { buildBookContext } = await import("@/lib/ai/context");
    const ctx = await buildBookContext();
    expect(ctx.baseCurrency).toBe("USD");
    const pen = ctx.exposures.find((e) => e.ccy === "PEN")!;
    expect(Number(pen.grossUsd)).toBeGreaterThan(1_800_000);
    expect(ctx.hedges).toHaveLength(3);
    expect(ctx.hedges.every((h) => h.forwardToFixing !== null)).toBe(true);
    expect(ctx.market.spot.PEN).toBe("0.28400000");
    expect(ctx.policies.length).toBeGreaterThan(0);
  });
});
