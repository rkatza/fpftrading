import { dec } from "@/lib/money";
import { ProviderError, type HistoryPoint, type ProviderQuote, type RateProvider } from "./types";

/**
 * TraderMade — fallback spot + forwards where covered.
 * Quotes USDXXX (local per USD); inverted to fund convention.
 */
export class TraderMadeProvider implements RateProvider {
  readonly name = "tradermade";

  constructor(
    private apiKey = process.env.TRADERMADE_API_KEY ?? "",
    private fetchFn: typeof fetch = fetch
  ) {}

  private symbol(pair: string): string {
    const [base, quote] = pair.split("/");
    return `${quote}${base}`; // PEN/USD → USDPEN
  }

  private async call(path: string, params: Record<string, string>) {
    const url = new URL(`https://marketdata.tradermade.com/api/v1/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("api_key", this.apiKey);
    const res = await this.fetchFn(url.toString());
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}`);
    return res.json();
  }

  async getSpot(pair: string): Promise<ProviderQuote | null> {
    const json = await this.call("live", { currency: this.symbol(pair) });
    const q = json.quotes?.[0];
    if (!q?.mid) return null;
    return {
      pair,
      tenor: "SPOT",
      value: dec(1).div(dec(q.mid)).toDecimalPlaces(8),
      source: "api:tradermade",
      quotedAt: new Date(),
    };
  }

  async getHistory(pair: string, days: number): Promise<HistoryPoint[]> {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const json = await this.call("timeseries", {
      currency: this.symbol(pair),
      start_date: fmt(start),
      end_date: fmt(end),
      interval: "daily",
    });
    if (!json.quotes) return [];
    return (json.quotes as { date: string; close: number }[]).map((v) => ({
      date: v.date,
      value: dec(1).div(dec(v.close)).toDecimalPlaces(8),
    }));
  }

  async getForward(pair: string, tenor: string): Promise<ProviderQuote | null> {
    const json = await this.call("forward_rates", {
      currency: this.symbol(pair),
      tenor,
    });
    const mid = json?.mid ?? json?.quotes?.[0]?.mid;
    if (!mid) return null;
    return {
      pair,
      tenor,
      value: dec(1).div(dec(mid)).toDecimalPlaces(8),
      source: "api:tradermade",
      quotedAt: new Date(),
    };
  }
}
