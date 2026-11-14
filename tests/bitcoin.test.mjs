import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchBitcoinHistory, fetchBitcoinQuote } from '../src/lib/bitcoinMarket.ts';
import { parseBitcoinCsv, genCycles, fitCurve, createPlot, getBitcoinData } from '../src/lib/bitcoinAnalysis.ts';

const DAY = 86_400_000;
const originalFetch = globalThis.fetch;
const csv = readFileSync(new URL('../public/data/bitcoin_data.csv', import.meta.url), 'utf8');

test('history pages across the 300-candle limit, sorts, deduplicates and excludes incomplete days', async () => {
  const start = Date.parse('2025-06-04T00:00:00Z');
  const now = start + 530 * DAY + 12345;
  const urls = [];
  globalThis.fetch = async url => {
    const query = new URL(url).searchParams;
    urls.push(query);
    const from = Date.parse(query.get('start'));
    const to = Date.parse(query.get('end'));
    assert.ok((to - from) / DAY <= 299);
    const rows = [];
    for (let day = to; day >= from - DAY; day -= DAY) rows.push([day / 1000, 1, 2, 1, 100_000 + (day - start) / DAY]);
    return Response.json(rows);
  };
  try {
    const points = await fetchBitcoinHistory('2025-06-04', now);
    assert.equal(urls.length, 2);
    assert.equal(points.length, 530);
    assert.equal(points[0].date, '2025-06-04');
    assert.equal(points.at(-1).value, 100529);
    assert.equal(new Set(points.map(p => p.date)).size, 530);
  } finally { globalThis.fetch = originalFetch; }
});

test('missing candles and upstream errors cannot silently become a complete history', async () => {
  try {
    globalThis.fetch = async () => Response.json([]);
    await assert.rejects(fetchBitcoinHistory('2026-11-13', Date.parse('2026-11-14T12:00:00Z')), /Missing BTC history/);
    globalThis.fetch = async () => Response.json({ message: 'rate limited' }, { status: 429 });
    await assert.rejects(fetchBitcoinHistory('2026-11-13', Date.parse('2026-11-14T12:00:00Z')), /HTTP 429/);
  } finally { globalThis.fetch = originalFetch; }
});

test('ticker must contain a positive, recent, timestamped trade', async () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  try {
    globalThis.fetch = async () => Response.json({ price: '65000.12', time: new Date(now - 1000).toISOString() });
    assert.equal((await fetchBitcoinQuote(now)).price, 65000.12);
    for (const data of [{ price: 'NaN', time: new Date(now).toISOString() }, { price: '-1', time: new Date(now).toISOString() }, { price: '65000', time: new Date(now - 600000).toISOString() }, { price: '65000' }]) {
      globalThis.fetch = async () => Response.json(data);
      await assert.rejects(fetchBitcoinQuote(now), /invalid|old/);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('bundled history retains UTC dates and model curves and projections line up on calendar dates', () => {
  const history = parseBitcoinCsv(csv);
  assert.equal(history.index[0].toISOString(), '2010-07-27T00:00:00.000Z');
  assert.equal(history.index.at(-1).toISOString(), '2025-06-03T00:00:00.000Z');
  const cycles = genCycles(history);
  assert.equal(cycles.length, 12);
  assert.deepEqual(cycles.slice(0, 6).map(c => c.length), [1096, 1096, 1096, 365, 365, 365]);
  const curve = fitCurve([[296, 35], [1204, 1152], [2678, 19500]], history);
  const plot = createPlot(history, [curve, curve], cycles);
  for (const trace of plot.data) {
    assert.equal(trace.x.length, trace.y.length);
    assert.ok(trace.y.every(v => Number.isFinite(v) && v > 0));
  }
  assert.equal(plot.data[1].x[0].toISOString(), '2010-08-17T00:00:00.000Z');
  assert.equal(plot.data[3].x[0].toISOString(), '2023-01-13T00:00:00.000Z');
  assert.equal(plot.data[6].x[0].toISOString(), '2026-01-13T00:00:00.000Z');
});

test('history failures keep the chart available with an explicit stale-history warning', async () => {
  try {
    globalThis.fetch = async url => url.endsWith('.csv') ? new Response(csv) : Response.json({}, { status: 502 });
    const history = await getBitcoinData();
    assert.equal(history.Value.length, 5426);
    assert.match(history.warning, /2025-06-03/);
  } finally { globalThis.fetch = originalFetch; }
});

test('fresh quotes extend a complete chart, while missing history never becomes a fictitious connecting line', () => {
  const history = parseBitcoinCsv(csv);
  const cycles = genCycles(history);
  const curve = fitCurve([[296, 35], [1204, 1152]], history);
  const makeQuote = time => ({ price: 65000, time, source: 'Coinbase BTC-USD' });
  const fresh = createPlot(history, [curve, curve], cycles, makeQuote('2025-06-04T12:00:00Z'));
  assert.equal(fresh.data[0].y.length, history.Value.length + 1);
  assert.equal(fresh.data[0].y.at(-1), 65000);
  const gap = createPlot(history, [curve, curve], cycles, makeQuote('2026-11-14T12:00:00Z'));
  assert.equal(gap.data[0].y.length, history.Value.length);
  assert.equal(gap.data.at(-1).name, 'Latest BTC trade');
  assert.equal(gap.data.at(-1).y[0], 65000);
});
