'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getBitcoinData, getBitcoinQuote, genCycles, createPlot, fitCurve, type ProcessedData } from '@/lib/bitcoinAnalysis';
import type { BitcoinQuote } from '@/lib/bitcoinMarket';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => <div className="chart-message">Rendering chart…</div>,
});

const BitcoinChart: React.FC = () => {
  const [history, setHistory] = useState<ProcessedData | null>(null);
  const [quote, setQuote] = useState<BitcoinQuote | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [chartError, setChartError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      setHistory(await getBitcoinData());
      setHistoryError(null);
    } catch {
      setHistoryError('Unable to load Bitcoin history. Retrying automatically.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    const updateHistory = async () => {
      try {
        const data = await getBitcoinData();
        if (active) { setHistory(data); setHistoryError(null); }
      } catch {
        if (active) setHistoryError('Unable to load Bitcoin history. Retrying automatically.');
      }
    };
    const updateQuote = async () => {
      try {
        const latest = await getBitcoinQuote();
        if (active) { setQuote(latest); setQuoteError(null); setNow(Date.now()); }
      } catch {
        if (active) setQuoteError('Live quote unavailable. Retrying automatically.');
      }
    };
    void updateHistory();
    void updateQuote();
    const historyTimer = window.setInterval(updateHistory, 300_000);
    const quoteTimer = window.setInterval(updateQuote, 30_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(historyTimer);
      window.clearInterval(quoteTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const analysis = useMemo(() => {
    if (!history) return null;
    try {
      const points1 = [[296, 35], [1204, 1152], [2678, 19500], [3893, 63554], [4102, 67010]];
      const points2 = [[876, 14], [1875, 238.5], [3097, 3395], [4520, 16527]];
      return { curves: [fitCurve(points1, history), fitCurve(points2, history)], cycles: genCycles(history) };
    } catch {
      return null;
    }
  }, [history]);
  const plot = useMemo(() => history && analysis ? createPlot(history, analysis.curves, analysis.cycles, quote) : null,
    [history, analysis, quote]);
  const age = quote ? Math.max(0, Math.floor((now - Date.parse(quote.time)) / 1000)) : null;
  const stale = !!quoteError || (age !== null && age > 90);

  return (
    <section className="bitcoin-chart" aria-label="Bitcoin price and cycle chart">
      <div className="price-header">
        <div>
          <div className="price-label">Bitcoin · BTC / USD</div>
          <div className="price-value">{quote ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(quote.price) : 'Connecting…'}</div>
        </div>
        <div className="price-status">
          <div className={stale ? 'text-amber-400' : 'text-[#aaa]'}>{quote ? `${stale ? 'Stale quote' : 'Live'} · ${age}s ago` : quoteError ?? 'Fetching live quote…'}</div>
          <div>Coinbase BTC-USD · refreshes every 30s</div>
          {quote && <time dateTime={quote.time}>Last trade: {new Date(quote.time).toUTCString()}</time>}
        </div>
      </div>
      {(history?.warning || historyError || (quoteError && quote)) && (
        <div role="status" className="chart-notice">{history?.warning ?? historyError} {quote && quoteError}
          <button onClick={() => void refresh()}>Retry history</button>
        </div>
      )}
      <div className="chart-canvas">
        {plot && !chartError ? (
          <Plot data={plot.data} layout={plot.layout}
            config={{ displayModeBar: false, responsive: true, scrollZoom: false }}
            useResizeHandler style={{ width: '100%', height: '100%' }}
            onError={() => setChartError(true)} />
        ) : (
          <div className="chart-message" role="status">{chartError || (history && !analysis) ? 'Unable to render the chart. Please reload to retry.' : historyError ?? 'Loading Bitcoin price history…'}</div>
        )}
      </div>
      <p className="chart-caption">Daily historical closes + latest trade. Shaded bands show the original cycle projection.</p>
    </section>
  );
};

export default BitcoinChart;
