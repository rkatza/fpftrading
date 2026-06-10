import { dec } from "@/lib/money";
import type { ProviderQuote } from "./types";

/**
 * Free central-bank rate fetchers. Each returns the policy/reference rate as
 * an annualized decimal, normalized into a `MarketQuote`-shaped object
 * (pair = ccy code, type interest_rate, source central_bank).
 * Cached daily by the cron route, never called from request paths.
 */

type Fetch = typeof fetch;

async function getJson(fetchFn: Fetch, url: string): Promise<unknown> {
  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

const quote = (ccy: string, value: string | number): ProviderQuote => ({
  pair: ccy,
  tenor: "ON",
  value: dec(value).div(100).toDecimalPlaces(8), // published in %, stored as decimal
  source: "central_bank",
  quotedAt: new Date(),
});

/** BCRP (Peru) — reference rate, series PD04722MM via BCRPData API. */
export async function fetchBcrpRate(fetchFn: Fetch = fetch): Promise<ProviderQuote> {
  const json = (await getJson(
    fetchFn,
    "https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04722MM/json/"
  )) as { periods: { values: string[] }[] };
  const last = json.periods.at(-1);
  if (!last) throw new Error("BCRP: empty series");
  return quote("PEN", last.values[0]);
}

/** BanRep (Colombia) — policy rate via the public SUAMECA/estadísticas endpoint. */
export async function fetchBanRepRate(fetchFn: Fetch = fetch): Promise<ProviderQuote> {
  const json = (await getJson(
    fetchFn,
    "https://suameca.banrep.gov.co/estadisticas-economicas/rest/consultaDatosService/consultaDatosSeries?listaSeries=[{%22idPeriodicidades%22:[1],%22idSerie%22:241}]"
  )) as { data: [number, number][] }[];
  const series = json[0]?.data;
  if (!series?.length) throw new Error("BanRep: empty series");
  return quote("COP", series[series.length - 1][1]);
}

/** Banxico SIE (Mexico) — target rate series SF61745 (needs free token). */
export async function fetchBanxicoRate(fetchFn: Fetch = fetch, token = process.env.BANXICO_TOKEN ?? ""): Promise<ProviderQuote> {
  const json = (await getJson(
    fetchFn,
    `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF61745/datos/oportuno?token=${token}`
  )) as { bmx: { series: { datos: { dato: string }[] }[] } };
  const dato = json.bmx?.series?.[0]?.datos?.[0]?.dato;
  if (!dato) throw new Error("Banxico: empty series");
  return quote("MXN", dato);
}

/** BCB SGS (Brazil) — Selic target, series 432. */
export async function fetchSelicRate(fetchFn: Fetch = fetch): Promise<ProviderQuote> {
  const json = (await getJson(
    fetchFn,
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json"
  )) as { valor: string }[];
  if (!json.length) throw new Error("BCB: empty series");
  return quote("BRL", json[0].valor);
}

/** FRED — SOFR (needs free API key). */
export async function fetchSofr(fetchFn: Fetch = fetch, apiKey = process.env.FRED_API_KEY ?? ""): Promise<ProviderQuote> {
  const json = (await getJson(
    fetchFn,
    `https://api.stlouisfed.org/fred/series/observations?series_id=SOFR&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`
  )) as { observations: { value: string }[] };
  const obs = json.observations?.[0];
  if (!obs || obs.value === ".") throw new Error("FRED: no SOFR observation");
  return quote("USD", obs.value);
}

export async function fetchAllCentralBankRates(fetchFn: Fetch = fetch): Promise<{ quotes: ProviderQuote[]; errors: string[] }> {
  const tasks: [string, () => Promise<ProviderQuote>][] = [
    ["BCRP", () => fetchBcrpRate(fetchFn)],
    ["BanRep", () => fetchBanRepRate(fetchFn)],
    ["Banxico", () => fetchBanxicoRate(fetchFn)],
    ["BCB", () => fetchSelicRate(fetchFn)],
    ["FRED", () => fetchSofr(fetchFn)],
  ];
  const quotes: ProviderQuote[] = [];
  const errors: string[] = [];
  await Promise.all(
    tasks.map(async ([name, fn]) => {
      try {
        quotes.push(await fn());
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );
  return { quotes, errors };
}
