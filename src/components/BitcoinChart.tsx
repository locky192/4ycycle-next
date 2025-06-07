'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getBitcoinData, genCycles, createPlot, fitCurve } from '@/lib/bitcoinAnalysis';

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const BitcoinChart: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [plotData, setPlotData] = useState<{ data: any[]; layout: any } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Get Bitcoin data (includes CSV data + latest from API if needed)
        const data = await getBitcoinData();
        
        // Define the same points used in Django for log curves
        const points1 = [[296, 35], [1204, 1152], [2678, 19500], [3893, 63554], [4102, 67010]];
        const points2 = [[876, 14], [1875, 238.5], [3097, 3395], [4520, 16527]];
        
        // Fit curves
        const logCurves = [fitCurve(points1, data), fitCurve(points2, data)];
        
        // Generate cycles
        const cycles = genCycles(data);
        
        // Create plot
        const plot = createPlot(data, logCurves, cycles);
        
        setPlotData(plot);
        setLoading(false);
      } catch (error) {
        console.error('Error loading Bitcoin data:', error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-white">Loading Bitcoin data...</div>
      </div>
    );
  }

  if (!plotData) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-white">Error loading data</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen max-w-[1300px] max-h-[800px] mx-auto overflow-auto">
      <Plot
        data={plotData.data}
        layout={plotData.layout}
        config={{ displayModeBar: false, responsive: true }}
        className="w-full h-full"
      />
    </div>
  );
};

export default BitcoinChart;