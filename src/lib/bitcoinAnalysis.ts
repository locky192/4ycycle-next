import Papa from 'papaparse';
import type { Data, Layout } from 'plotly.js';
import type { BitcoinQuote, PricePoint } from './bitcoinMarket';

export interface ProcessedData {
  index: Date[];
  Value: number[];
  warning?: string;
}

const DAY = 86_400_000;
const CURVE_ORIGIN = Date.parse('2010-08-16T00:00:00Z');

export function parseBitcoinCsv(csvText: string): ProcessedData {
  const parsed = Papa.parse<{ Start: string; Close: number }>(csvText, {
    header: true, skipEmptyLines: true, dynamicTyping: true,
  });
  if (parsed.errors.length) throw new Error('Invalid Bitcoin history CSV');
  const points = new Map<string, number>();
  for (const row of parsed.data) {
    const date = row.Start?.slice(0, 10);
    if (date && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && Number.isFinite(row.Close) && row.Close > 0) {
      points.set(date, row.Close);
    }
  }
  const dates = [...points.keys()].sort();
  if (!dates.length) throw new Error('Bitcoin history is empty');
  return { index: dates.map(date => new Date(`${date}T00:00:00Z`)), Value: dates.map(date => points.get(date)!) };
}

export async function getBitcoinData(): Promise<ProcessedData> {
  const response = await fetch('/data/bitcoin_data.csv');
  if (!response.ok) throw new Error('Unable to load Bitcoin history');
  const history = parseBitcoinCsv(await response.text());
  const nextDay = new Date(history.index.at(-1)!.getTime() + DAY).toISOString().slice(0, 10);
  try {
    const response = await fetch(`/api/bitcoin?start=${nextDay}`);
    if (!response.ok) throw new Error('Unable to update Bitcoin history');
    const { prices } = await response.json() as { prices: PricePoint[] };
    if (!Array.isArray(prices)) throw new Error('Invalid Bitcoin history response');
    for (const point of prices) {
      history.index.push(new Date(`${point.date}T00:00:00Z`));
      history.Value.push(point.value);
    }
  } catch {
    history.warning = `History update unavailable. Daily prices end ${history.index.at(-1)!.toISOString().slice(0, 10)}. Retrying automatically.`;
  }
  return history;
}

export async function getBitcoinQuote(): Promise<BitcoinQuote> {
  const response = await fetch('/api/bitcoin', { cache: 'no-store' });
  if (!response.ok) throw new Error('Live BTC quote unavailable. Retrying automatically.');
  return response.json();
}

// Generate cycles from Bitcoin data
export function genCycles(bitcoinData: ProcessedData): number[][] {
  const cycles: number[][] = [];
  // Select calendar windows rather than assuming CSV row zero matches the model epoch.
  for (const phase of ['bull', 'bear']) {
    for (const year of [2011, 2015, 2019]) {
      const start = Date.parse(`${year + (phase === 'bear' ? 3 : 0)}-01-13T00:00:00Z`);
      const end = Date.parse(`${year + (phase === 'bear' ? 4 : 3)}-01-13T00:00:00Z`);
      const values = bitcoinData.Value.filter((_, i) => {
        const timestamp = bitcoinData.index[i].getTime();
        return timestamp >= start && timestamp < end;
      });
      if (values.length !== (end - start) / DAY) throw new Error('Incomplete historical cycle');
      cycles.push(normalizeArray(values, 1, 2));
    }
  }

  // Calculate averages
  cycleAverage(cycles);
  
  return cycles;
}

// Normalize array to log scale
export function normalizeArray(arr: number[], a: number, b: number): number[] {
  if (!arr.length) return [];
  const arrMin = Math.min(...arr);
  const arrMax = Math.max(...arr);
  
  if (arrMin === arrMax) return arr.map(() => a);
  const logMin = Math.log10(arrMin);
  const logMax = Math.log10(arrMax);
  
  const newLogMin = Math.log10(a);
  const newLogMax = Math.log10(b);
  
  const scaleFactor = (newLogMax - newLogMin) / (logMax - logMin);
  
  return arr.map(val => {
    const logVal = Math.log10(val);
    const scaledLogVal = (logVal - logMin) * scaleFactor + newLogMin;
    return Math.pow(10, scaledLogVal);
  });
}

// Calculate cycle averages
function cycleAverage(cycles: number[][]): void {
  if (cycles.length >= 3) {
    // Bull market average (geometric mean)
    const minLength = Math.min(...cycles.slice(0, 3).map(c => c.length));
    const average = new Array(minLength);
    
    for (let i = 0; i < minLength; i++) {
      const product = cycles[0][i] * cycles[1][i] * cycles[2][i];
      average[i] = Math.pow(product, 1/3);
    }
    
    // Apply smoothing
    const windowSize = 21;
    const weights = new Array(windowSize).fill(1.0 / windowSize);
    const smoothAverage = convolve(average, weights);
    
    cycles.push(smoothAverage);
    cycles.push(smoothAverage.map(v => v + v * 0.5));
    cycles.push(smoothAverage.map(v => v - v * 0.5));
  }
  
  if (cycles.length >= 6) {
    // Bear market average
    const minLength = Math.min(...cycles.slice(3, 6).map(c => c.length));
    const average2 = new Array(minLength);
    
    for (let i = 0; i < minLength; i++) {
      const product = cycles[3][i] * cycles[4][i] * cycles[5][i];
      average2[i] = Math.pow(product, 1/3);
    }
    
    // Apply smoothing
    const windowSize = 21;
    const weights = new Array(windowSize).fill(1.0 / windowSize);
    const smoothAverage2 = convolve(average2, weights);
    
    cycles.push(smoothAverage2);
    cycles.push(smoothAverage2.map(v => v + v * 0.5));
    cycles.push(smoothAverage2.map(v => v - v * 0.5));
  }
}

// Simple convolution for smoothing
function convolve(arr: number[], weights: number[]): number[] {
  const result: number[] = [];
  const halfWindow = Math.floor(weights.length / 2);
  
  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let weightSum = 0;
    
    for (let j = 0; j < weights.length; j++) {
      const idx = i - halfWindow + j;
      if (idx >= 0 && idx < arr.length) {
        sum += arr[idx] * weights[j];
        weightSum += weights[j];
      }
    }
    
    result.push(weightSum > 0 ? sum / weightSum : arr[i]);
  }
  
  return result;
}

// Fit curve to points
export function fitCurve(points: number[][], data: ProcessedData): [number[], number[]] {
  const x = points.map(p => p[0]);
  const y = points.map(p => p[1]);
  
  // Convert to log scale
  const xLog = x.map(val => Math.log10(val));
  const yLog = y.map(val => Math.log10(val));
  
  // Simple linear regression in log space
  const n = x.length;
  const sumXLog = xLog.reduce((a, b) => a + b, 0);
  const sumYLog = yLog.reduce((a, b) => a + b, 0);
  const sumXLogYLog = xLog.reduce((sum, xi, i) => sum + xi * yLog[i], 0);
  const sumXLogSq = xLog.reduce((sum, xi) => sum + xi * xi, 0);
  
  const slope = (n * sumXLogYLog - sumXLog * sumYLog) / (n * sumXLogSq - sumXLog * sumXLog);
  const intercept = (sumYLog - slope * sumXLog) / n;
  
  const k = Math.pow(10, intercept);
  const alpha = -slope;
  
  // Generate fitted curve
  const lastDay = Math.floor((data.index.at(-1)!.getTime() - CURVE_ORIGIN) / DAY);
  const xFit = Array.from({ length: lastDay + 1501 }, (_, i) => i + 1);
  const yFit = xFit.map(xi => k * Math.pow(xi, -alpha));
  
  return [xFit, yFit];
}

// Create the Plotly chart
export function createPlot(data: ProcessedData, logCurves: [number[], number[]][], cycles: number[][], quote?: BitcoinQuote | null): { data: Data[]; layout: Partial<Layout> } {
  const traces: Data[] = [];

  const curveDates = logCurves[0][0].map(day => new Date(CURVE_ORIGIN + day * DAY));
  const predictionDates = (start: string, length: number) =>
    Array.from({ length }, (_, i) => new Date(Date.parse(start) + i * DAY));
  const lastCloseDay = data.index.at(-1)!.getTime();
  const quoteIsNewer = quote && Date.parse(quote.time) >= lastCloseDay + DAY &&
    Date.parse(quote.time) < lastCloseDay + 2 * DAY;

  // Main Bitcoin price trace
  traces.push({
    x: quoteIsNewer ? [...data.index, new Date(quote.time)] : data.index,
    y: quoteIsNewer ? [...data.Value, quote.price] : data.Value,
    line: { color: '#f7931a', width: 2 },
    hovertemplate: '%{x|%d %b %Y}<br>$%{y:,.2f}<extra>Bitcoin Price</extra>',
    mode: 'lines',
    name: 'Bitcoin Price',
    type: 'scatter'
  });
  
  // Upper and lower bound curves
  traces.push({
    x: curveDates,
    y: logCurves[0][1],
    mode: 'lines',
    name: 'Upper Bound',
    line: { color: 'red', dash: 'dot' },
    type: 'scatter'
  });
  
  traces.push({
    x: curveDates,
    y: logCurves[1][1],
    mode: 'lines',
    name: 'Lower Bound',
    line: { color: 'red', dash: 'dot' },
    type: 'scatter'
  });
  
  // Add cycle predictions if available
  if (cycles.length > 6) {
    const cycleData = normalizeArray(cycles[6], 18000, 160000);
    
    traces.push({
      x: predictionDates('2023-01-13T00:00:00Z', cycleData.length),
      y: cycleData,
      mode: 'lines',
      name: 'Cycles',
      line: { color: 'red', dash: 'dot' },
      type: 'scatter'
    });
    
    // Upper boundary
    traces.push({
      x: predictionDates('2023-01-13T00:00:00Z', cycleData.length),
      y: cycleData.map(v => v * 1.5),
      fill: 'tonexty',
      mode: 'none',
      fillcolor: 'rgba(0,176,246,0.2)',
      name: 'Area between curves',
      type: 'scatter'
    });
    
    // Lower boundary
    traces.push({
      x: predictionDates('2023-01-13T00:00:00Z', cycleData.length),
      y: cycleData.map(v => v * 0.5),
      fill: 'tonexty',
      mode: 'none',
      fillcolor: 'rgba(0,176,246,0.2)',
      name: 'Area between curves',
      type: 'scatter'
    });
  }
  
  // Add bear market predictions
  if (cycles.length > 9) {
    const bearData = normalizeArray(cycles[9], 53000, 153000);
    
    traces.push({
      x: predictionDates('2026-01-13T00:00:00Z', bearData.length),
      y: bearData,
      mode: 'lines',
      name: 'Cycles',
      line: { color: 'red', dash: 'dot' },
      type: 'scatter'
    });
    
    traces.push({
      x: predictionDates('2026-01-13T00:00:00Z', bearData.length),
      y: bearData.map(v => v * 1.5),
      fill: 'tonexty',
      mode: 'none',
      fillcolor: 'rgba(0,176,246,0.2)',
      name: 'Area between curves',
      type: 'scatter'
    });
    
    traces.push({
      x: predictionDates('2026-01-13T00:00:00Z', bearData.length),
      y: bearData.map(v => v * 0.5),
      fill: 'tonexty',
      mode: 'none',
      fillcolor: 'rgba(0,176,246,0.2)',
      name: 'Area between curves',
      type: 'scatter'
    });
  }
  
  // A separate marker keeps a current quote visible even when history is unavailable,
  // without drawing a fictitious line across missing daily prices.
  if (quote) {
    traces.push({
      x: [new Date(quote.time)], y: [quote.price], type: 'scatter', mode: 'markers',
      name: 'Latest BTC trade', marker: { color: '#f7931a', size: 7 },
      hovertemplate: '%{x|%d %b %Y %H:%M UTC}<br>$%{y:,.2f}<extra>Coinbase BTC-USD</extra>',
    });
  }

  const layout: Partial<Layout> = {
    autosize: true,
    uirevision: 'bitcoin-cycle',
    hovermode: 'closest',
    showlegend: false,
    paper_bgcolor: '#1a1a1a',
    plot_bgcolor: '#1a1a1a',
    font: { family: 'Inter var', color: 'white' },
    yaxis: {
      type: 'log',
      range: [-0.301, 6],
      tickmode: 'array',
      tickvals: [1, 10, 100, 1000, 10000, 100000, 1000000],
      tickformat: '$,.0f',
      tickfont: { color: 'white' },
      gridcolor: '#333'
    },
    xaxis: {
      tickfont: { color: 'white' },
      gridcolor: '#333'
    },
    margin: { l: 60, r: 30, t: 30, b: 50 }
  };
  
  return { data: traces, layout };
}