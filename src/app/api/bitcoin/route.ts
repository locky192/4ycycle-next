import { NextRequest, NextResponse } from 'next/server';
import { fetchBitcoinHistory, fetchBitcoinQuote } from '@/lib/bitcoinMarket';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const start = request.nextUrl.searchParams.get('start');
    if (start !== null) {
      const timestamp = Date.parse(`${start}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(timestamp) ||
          new Date(timestamp).toISOString().slice(0, 10) !== start ||
          start < '2015-01-01' || timestamp > Date.now()) {
        return NextResponse.json({ error: 'Invalid history start date' }, { status: 400 });
      }
      const prices = await fetchBitcoinHistory(start);
      return NextResponse.json({ prices, source: 'Coinbase BTC-USD' }, {
        headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
      });
    }
    const quote = await fetchBitcoinQuote();
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Bitcoin market data unavailable:', error);
    return NextResponse.json({ error: 'Bitcoin market data is temporarily unavailable. Retrying automatically.' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
