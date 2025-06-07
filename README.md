# Bitcoin 4-Year Cycle Theory - NextJS Application

This is a NextJS rewrite of the original Django Bitcoin 4-year cycle theory application. It displays Bitcoin price predictions based on historical cycle analysis and includes a comprehensive blog post explaining the theory.

## Features

- **Interactive Bitcoin Price Chart**: Built with Plotly.js, displaying historical Bitcoin prices with cycle predictions
- **Real-time Data**: Automatically fetches latest Bitcoin data from CoinGecko API when needed
- **4-Year Cycle Analysis**: Implements the complete cycle analysis algorithm including:
  - Historical data processing from CSV
  - Cycle generation and normalization
  - Logarithmic growth curve fitting
  - Price prediction visualization
- **Comprehensive Blog Post**: Complete explanation of the 4-year cycle theory with embedded images
- **Responsive Design**: Matches the original Django application's look and feel exactly
- **Dark Theme**: #1a1a1a background with Inter and Roboto fonts

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── globals.css          # Global styles matching Django app
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx             # Main page component
│   ├── components/
│   │   ├── BitcoinChart.tsx     # Interactive chart component
│   │   └── BlogPost.tsx         # Blog post with theory explanation
│   └── lib/
│       └── bitcoinAnalysis.ts   # Core analysis algorithms
├── public/
│   ├── data/
│   │   └── bitcoin_data.csv     # Historical Bitcoin data
│   └── static/
│       └── images/              # Blog post images
└── package.json
```

## Core Functionality

### Data Management
- Loads historical Bitcoin data from CSV file
- Automatically fetches missing data from CoinGecko API
- Processes and normalizes data for cycle analysis

### Chart Features
- Logarithmic scale Bitcoin price visualization
- Historical cycle overlay
- Price prediction bands
- Logarithmic growth curves
- Interactive Plotly chart with dark theme

### Blog Content
- Complete 4-year cycle theory explanation
- 10 embedded figures explaining the analysis
- Responsive image display
- Styled to match original Django app exactly

## Technology Stack

- **NextJS 15** with TypeScript
- **React 18** with hooks
- **Plotly.js** for interactive charts
- **Tailwind CSS** for styling
- **PapaParse** for CSV processing
- **CoinGecko API** for live Bitcoin data

## Deployment

This application is designed to be deployed on Vercel:

```bash
npm run build
```

The build output is optimized for static hosting and includes all necessary data files.

## API Usage

The application uses the CoinGecko API for fetching recent Bitcoin price data:
- Endpoint: `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range`
- No API key required
- Automatically handles rate limiting
- Falls back gracefully if API is unavailable

## Comparison with Django Version

This NextJS version provides identical functionality to the original Django application:
- ✅ Same chart visualization with all prediction bands
- ✅ Identical blog post content and styling
- ✅ Same color scheme and typography
- ✅ Same data processing algorithms
- ✅ Same Bitcoin data source and API integration
- ✅ Responsive design matching original layout

The main differences:
- Uses NextJS/React instead of Django templates
- Client-side data processing instead of server-side
- Can be hosted on static hosting platforms like Vercel
- No database required - uses CSV file and API directly