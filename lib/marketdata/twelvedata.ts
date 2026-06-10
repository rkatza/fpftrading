import { dec } from "@/lib/money";
import { ProviderError, toProviderSymbol, type HistoryPoint, type ProviderQuote, type RateProvider } from "./types";

/**
 * Twelve Data — primary spot provider. Quotes USD/XXX (local per USD);
 * we invert to the fund convention (USD per local unit).
 */
export class TwelveDataProvider implements RateProvider {
  readonly name = "twelvedata";

  constructor(
    private apiKey = process.env.TWELVEDATA_API_KEY ?? "",
    private fetchFn: typeof fetch = fetch
  ) {}

  private async call(path: string, params: Record<string, string>) {
    const url = new URL(`https://api.twelvedata.com/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("apikey", this.apiKey);
    const res = await this.fetchFn(url.toString());
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}`);
    const json = await res.json();
    if (json.status === "error" || json.code) throw new ProviderError(this.name, json.message ?? "API error");
    return json;
  }

  async getSpot(pair: string): Promise<ProviderQuote | null> {
    const symbol = toProviderSymbol(pair); // e.g. USD/PEN
    const json = await this.call("price", { symbol });
    if (!json.price) return null;
    const usdPerLocal = dec(1).div(dec(json.price));
    return {
      pair,
      tenor: "SPOT",
      value: usdPerLocal.toDecimalPlaces(8),
      source: "api:twelvedata",
      quotedAt: new Date(),
    };
  }

  async getHistory(pair: string, days: number): Promise<HistoryPoint[]> {
    const symbol = toProviderSymbol(pair);
    const json = await this.call("time_series", {
      symbol,
      interval: "1day",
      outputsize: String(days),
    });
    if (!json.values) return [];
    return (json.values as { datetime: string; close: string }[])
      .map((v) => ({ date: v.datetime, value: dec(1).div(dec(v.close)).toDecimalPlaces(8) }))
      .reverse();
  }
}
