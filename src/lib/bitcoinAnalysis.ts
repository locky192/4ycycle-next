import Papa from 'papaparse';

interface BitcoinDataRow {
  Start: string;
  End: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  'Market Cap': number;
}

interface ProcessedData {
  index: Date[];
  Value: number[];
}

// Fetch CoinGecko data between start_date and end_date
async function fetchCoingeckoData(startDate: Date, endDate: Date): Promise<ProcessedData> {
  const fromTs = Math.floor(startDate.getTime() / 1000);
  const toTs = Math.floor(endDate.getTime() / 1000);
  
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${fromTs}&to=${toTs}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    const records: { date: Date; value: number }[] = [];
    for (const [timestampMs, price] of data.prices || []) {
      const date = new Date(timestampMs);
      records.push({ date, value: price });
    }
    
    // Sort by date
    records.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    return {
      index: records.map(r => r.date),
      Value: records.map(r => r.value)
    };
  } catch (error) {
    console.error('Error fetching CoinGecko data:', error);
    return { index: [], Value: [] };
  }
}

// Format data for CSV structure (unused but kept for potential future use)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatDataForCsv(data: ProcessedData): BitcoinDataRow[] {
  // Group by date and create OHLC data
  const dailyData: { [key: string]: number[] } = {};
  
  data.index.forEach((date, i) => {
    const dateStr = date.toISOString().split('T')[0];
    if (!dailyData[dateStr]) {
      dailyData[dateStr] = [];
    }
    dailyData[dateStr].push(data.Value[i]);
  });
  
  const result: BitcoinDataRow[] = [];
  Object.entries(dailyData).forEach(([dateStr, prices]) => {
    if (prices.length > 0) {
      const open = prices[0];
      const high = Math.max(...prices);
      const low = Math.min(...prices);
      const close = prices[prices.length - 1];
      
      const startDate = new Date(dateStr);
      const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
      
      result.push({
        Start: startDate.toISOString(),
        End: endDate.toISOString(),
        Open: open,
        High: high,
        Low: low,
        Close: close,
        Volume: 0,
        'Market Cap': 0
      });
    }
  });
  
  return result.sort((a, b) => new Date(b.Start).getTime() - new Date(a.Start).getTime());
}

// Resample data to daily intervals
function resampleToDaily(data: ProcessedData): ProcessedData {
  const dailyData: { [key: string]: number } = {};
  
  data.index.forEach((date, i) => {
    const dateStr = date.toISOString().split('T')[0];
    dailyData[dateStr] = data.Value[i]; // Use last value of the day
  });
  
  const dates = Object.keys(dailyData).sort();
  return {
    index: dates.map(d => new Date(d)),
    Value: dates.map(d => dailyData[d])
  };
}

// Main function to get Bitcoin data
export async function getBitcoinData(): Promise<ProcessedData> {
  try {
    // Load CSV data
    const csvResponse = await fetch('/data/bitcoin_data.csv');
    const csvText = await csvResponse.text();
    
    const parseResult = Papa.parse<BitcoinDataRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true
    });
    
    if (parseResult.errors.length > 0) {
      console.error('CSV parsing errors:', parseResult.errors);
    }
    
    const bitcoinData = parseResult.data
      .filter(row => row.Close && row.Close > 0)
      .map(row => ({
        date: new Date(row.Start),
        value: row.Close
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Get latest date in CSV and today's date
    const latestCsvDate = new Date(Math.max(...bitcoinData.map(d => d.date.getTime())));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const daysBehind = Math.floor((today.getTime() - latestCsvDate.getTime()) / (24 * 60 * 60 * 1000));
    
    let allData = bitcoinData;
    
    // Fetch missing data if needed
    if (daysBehind > 0) {
      const fetchStart = new Date(latestCsvDate.getTime() + 24 * 60 * 60 * 1000);
      const fetchEnd = new Date();
      
      const newData = await fetchCoingeckoData(fetchStart, fetchEnd);
      
      if (newData.index.length > 0) {
        const resampledData = resampleToDaily(newData);
        const newRecords = resampledData.index.map((date, i) => ({
          date,
          value: resampledData.Value[i]
        }));
        
        allData = [...bitcoinData, ...newRecords];
      }
    }
    
    return {
      index: allData.map(d => d.date),
      Value: allData.map(d => d.value)
    };
    
  } catch (error) {
    console.error('Error loading Bitcoin data:', error);
    throw error;
  }
}

// Generate cycles from Bitcoin data
export function genCycles(bitcoinData: ProcessedData): number[][] {
  const cycleStart = 149;
  const bullLength = 1096;
  const cycleLength = 1461;
  const cycles: number[][] = [];
  
  // Generate 3 bull cycles
  for (let i = 0; i < 3; i++) {
    const startIdx = cycleStart + cycleLength * i + 1;
    const endIdx = cycleStart + cycleLength * i + bullLength;
    
    if (endIdx < bitcoinData.Value.length) {
      const cycle = bitcoinData.Value.slice(startIdx, endIdx);
      cycles.push(normalizeArray(cycle, 1, 2));
    }
  }
  
  // Generate 3 bear cycles
  for (let i = 0; i < 3; i++) {
    const startIdx = cycleStart + bullLength + cycleLength * i + 1;
    const endIdx = cycleStart + cycleLength * i + cycleLength;
    
    if (endIdx < bitcoinData.Value.length) {
      const cycle = bitcoinData.Value.slice(startIdx, endIdx);
      cycles.push(normalizeArray(cycle, 1, 2));
    }
  }
  
  // Calculate averages
  cycleAverage(cycles);
  
  return cycles;
}

// Normalize array to log scale
export function normalizeArray(arr: number[], a: number, b: number): number[] {
  const arrMin = Math.min(...arr);
  const arrMax = Math.max(...arr);
  
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
  const xFit = Array.from({ length: data.Value.length + 1500 }, (_, i) => i);
  const yFit = xFit.map(xi => k * Math.pow(xi, -alpha));
  
  return [xFit, yFit];
}

// Create the Plotly chart
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPlot(data: ProcessedData, logCurves: [number[], number[]][], cycles: number[][]): { data: any[]; layout: any } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traces: any[] = [];
  
  // Create date array
  const startDate = new Date('2010-08-16');
  const today = new Date();
  const endDate = new Date(today.getTime() + 1500 * 24 * 60 * 60 * 1000);
  const dateArray: Date[] = [];
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dateArray.push(new Date(d));
  }
  
  // Main Bitcoin price trace
  traces.push({
    x: data.index,
    y: data.Value,
    mode: 'lines',
    name: 'Bitcoin Price',
    type: 'scatter'
  });
  
  // Upper and lower bound curves
  traces.push({
    x: dateArray,
    y: logCurves[0][1],
    mode: 'lines',
    name: 'Upper Bound',
    line: { color: 'red', dash: 'dot' },
    type: 'scatter'
  });
  
  traces.push({
    x: dateArray,
    y: logCurves[1][1],
    mode: 'lines',
    name: 'Lower Bound',
    line: { color: 'red', dash: 'dot' },
    type: 'scatter'
  });
  
  // Add cycle predictions if available
  if (cycles.length > 6) {
    const cycleStartIdx = 149 + 1461 * 3;
    const cycleData = normalizeArray(cycles[6], 18000, 160000);
    
    traces.push({
      x: dateArray.slice(cycleStartIdx, cycleStartIdx + cycleData.length),
      y: cycleData,
      mode: 'lines',
      name: 'Cycles',
      line: { color: 'red', dash: 'dot' },
      type: 'scatter'
    });
    
    // Upper boundary
    traces.push({
      x: dateArray.slice(cycleStartIdx, cycleStartIdx + cycleData.length),
      y: cycleData.map(v => v * 1.5),
      fill: 'tonexty',
      mode: 'none',
      fillcolor: 'rgba(0,176,246,0.2)',
      name: 'Area between curves',
      type: 'scatter'
    });
    
    // Lower boundary
    traces.push({
      x: dateArray.slice(cycleStartIdx, cycleStartIdx + cycleData.length),
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
    const bearStartIdx = 149 + 1461 * 3 + 1094;
    const bearData = normalizeArray(cycles[9], 53000, 153000);
    
    traces.push({
      x: dateArray.slice(bearStartIdx, bearStartIdx + bearData.length),
      y: bearData,
      mode: 'lines',
      name: 'Cycles',
      line: { color: 'red', dash: 'dot' },
      type: 'scatter'
    });
    
    traces.push({
      x: dateArray.slice(bearStartIdx, bearStartIdx + bearData.length),
      y: bearData.map(v => v * 1.5),
      fill: 'tonexty',
      mode: 'none',
      fillcolor: 'rgba(0,176,246,0.2)',
      name: 'Area between curves',
      type: 'scatter'
    });
    
    traces.push({
      x: dateArray.slice(bearStartIdx, bearStartIdx + bearData.length),
      y: bearData.map(v => v * 0.5),
      fill: 'tonexty',
      mode: 'none',
      fillcolor: 'rgba(0,176,246,0.2)',
      name: 'Area between curves',
      type: 'scatter'
    });
  }
  
  const layout = {
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