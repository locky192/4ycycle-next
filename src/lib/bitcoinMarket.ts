export interface PricePoint {
  date: string;
  value: number;
}

export interface BitcoinQuote {
  price: number;
  time: string;
  source: 'Coinbase BTC-USD';
}

const DAY = 86_400_000;
const BASE_URL = 'https://api.exchange.coinbase.com/products/BTC-USD';

async function marketRequest(path: string): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/${path}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`BTC market data returned HTTP ${response.status}`);
  return response.json();
}

export async function fetchBitcoinQuote(now = Date.now()): Promise<BitcoinQuote> {
  const data = await marketRequest('ticker') as { price?: string; time?: string };
  const price = Number(data.price);
  const time = Date.parse(data.time ?? '');
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time) ||
      time > now + 60_000 || now - time > 5 * 60_000) {
    throw new Error('BTC ticker is invalid or more than five minutes old');
  }
  return { price, time: new Date(time).toISOString(), source: 'Coinbase BTC-USD' };
}

// UTC daily closes only; the current, incomplete day is represented by the ticker.
// Stay below Coinbase's 300-candle limit and reject gaps instead of bridging them.
export async function fetchBitcoinHistory(startDate: string, now = Date.now()): Promise<PricePoint[]> {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Math.floor(now / DAY) * DAY;
  if (!Number.isFinite(start)) throw new Error('Invalid history start date');
  const points = new Map<number, number>();
  for (let from = start; from < end; from += 299 * DAY) {
    const to = Math.min(from + 299 * DAY, end);
    const query = new URLSearchParams({
      granularity: '86400', start: new Date(from).toISOString(), end: new Date(to).toISOString(),
    });
    const rows = await marketRequest(`candles?${query}`);
    if (!Array.isArray(rows)) throw new Error('Invalid BTC candle response');
    for (const row of rows) {
      if (!Array.isArray(row)) throw new Error('Invalid BTC candle');
      const timestamp = Number(row[0]) * 1000;
      const close = Number(row[4]);
      if (!Number.isFinite(timestamp) || timestamp % DAY !== 0 || !Number.isFinite(close) || close <= 0) {
        throw new Error('Invalid BTC daily close');
      }
      if (timestamp >= from && timestamp < to) points.set(timestamp, close);
    }
  }
  const result: PricePoint[] = [];
  for (let day = start; day < end; day += DAY) {
    const value = points.get(day);
    if (value === undefined) throw new Error(`Missing BTC history for ${new Date(day).toISOString().slice(0, 10)}`);
    result.push({ date: new Date(day).toISOString().slice(0, 10), value });
  }
  return result;
}
