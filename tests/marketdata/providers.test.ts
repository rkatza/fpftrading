import { describe, expect, it, vi } from "vitest";
import { dec } from "@/lib/money";
import { TwelveDataProvider } from "@/lib/marketdata/twelvedata";
import { TraderMadeProvider } from "@/lib/marketdata/tradermade";
import { resolveSpot } from "@/lib/marketdata/resolve";
import type { ProviderQuote, RateProvider } from "@/lib/marketdata/types";
import { toProviderSymbol } from "@/lib/marketdata/types";

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe("pair convention", () => {
  it("PEN/USD (fund) → USD/PEN (provider)", () => {
    expect(toProviderSymbol("PEN/USD")).toBe("USD/PEN");
  });
});

describe("TwelveDataProvider", () => {
  it("inverts USD/PEN price into USD-per-PEN", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ price: "3.5211" }));
    const p = new TwelveDataProvider("key", fetchFn);
    const q = await p.getSpot("PEN/USD");
    expect(fetchFn.mock.calls[0][0]).toContain("symbol=USD%2FPEN");
    expect(q!.value.toNumber()).toBeCloseTo(1 / 3.5211, 8);
    expect(q!.source).toBe("api:twelvedata");
  });

  it("throws on API error payloads", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: "error", message: "limit" }));
    const p = new TwelveDataProvider("key", fetchFn);
    await expect(p.getSpot("PEN/USD")).rejects.toThrow(/limit/);
  });

  it("history is inverted and chronological", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        values: [
          { datetime: "2026-04-30", close: "3.5211" },
          { datetime: "2026-04-29", close: "3.5300" },
        ],
      })
    );
    const p = new TwelveDataProvider("key", fetchFn);
    const h = await p.getHistory("PEN/USD", 2);
    expect(h.map((x) => x.date)).toEqual(["2026-04-29", "2026-04-30"]);
    expect(h[1].value.toNumber()).toBeCloseTo(1 / 3.5211, 8);
  });
});

describe("TraderMadeProvider", () => {
  it("uses USDPEN symbol and inverts the mid", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ quotes: [{ mid: 3.5211 }] }));
    const p = new TraderMadeProvider("key", fetchFn);
    const q = await p.getSpot("PEN/USD");
    expect(fetchFn.mock.calls[0][0]).toContain("currency=USDPEN");
    expect(q!.value.toNumber()).toBeCloseTo(1 / 3.5211, 8);
  });
});

describe("resolution order", () => {
  const quote = (source: string, ageHours = 0): ProviderQuote => ({
    pair: "PEN/USD",
    tenor: "SPOT",
    value: dec("0.284"),
    source,
    quotedAt: new Date(Date.now() - ageHours * 3_600_000),
  });

  const provider = (name: string, result: ProviderQuote | null, fail = false): RateProvider => ({
    name,
    getSpot: fail ? vi.fn().mockRejectedValue(new Error("down")) : vi.fn().mockResolvedValue(result),
    getHistory: vi.fn().mockResolvedValue([]),
  });

  const baseDeps = {
    getManual: async () => null as ProviderQuote | null,
    getCipDerived: async () => null as ProviderQuote | null,
    getLastGood: async () => null as ProviderQuote | null,
  };

  it("fresh manual quote wins over APIs", async () => {
    const q = await resolveSpot("PEN/USD", {
      ...baseDeps,
      getManual: async () => quote("manual", 1),
      providers: [provider("primary", quote("api:twelvedata"))],
    });
    expect(q!.source).toBe("manual");
  });

  it("stale manual quote falls through to primary API", async () => {
    const q = await resolveSpot("PEN/USD", {
      ...baseDeps,
      getManual: async () => quote("manual", 48),
      providers: [provider("primary", quote("api:twelvedata"))],
      manualFreshHours: 24,
    });
    expect(q!.source).toBe("api:twelvedata");
  });

  it("primary outage falls back to secondary", async () => {
    const q = await resolveSpot("PEN/USD", {
      ...baseDeps,
      providers: [provider("primary", null, true), provider("fallback", quote("api:tradermade"))],
    });
    expect(q!.source).toBe("api:tradermade");
  });

  it("all APIs down → CIP-derived", async () => {
    const q = await resolveSpot("PEN/USD", {
      ...baseDeps,
      providers: [provider("primary", null, true)],
      getCipDerived: async () => quote("cip"),
    });
    expect(q!.source).toBe("cip");
  });

  it("everything down → last good cache", async () => {
    const q = await resolveSpot("PEN/USD", {
      ...baseDeps,
      providers: [provider("primary", null, true)],
      getLastGood: async () => quote("api:twelvedata", 72),
    });
    expect(q!.source).toBe("api:twelvedata");
  });
});
