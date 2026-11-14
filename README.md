# Bitcoin 4-Year Cycle Theory

Next.js application with an interactive logarithmic Bitcoin price chart, the original cycle projections, and the accompanying article.

## Run locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Production mode:

```sh
npm run build
npm start
```

Run builds with the development server stopped; both use `.next`.

## Production deployment

The existing Vercel project is **`seconds-edge/4ycycle-next`** (project ID `prj_buFIELJYyAtE6ejwNceUTZNu1QFM`), serving https://www.4ycycle.info.

```sh
vercel link --yes --scope seconds-edge --project prj_buFIELJYyAtE6ejwNceUTZNu1QFM
vercel deploy --prod --scope seconds-edge
```

Sign into the Vercel account that owns SecondsEdge before deploying. Commits must use that owner's verified email for Vercel's commit attribution check.

Vercel's configured Git integration points to `Labrys-Locky/4ycycle-next`. This checkout's `locky192/4ycycle-next` remote is a separate repository, so pushing here does not update the production project automatically. The commands above deploy the local source directly to the existing project.

## Price data

- The original CSV preserves daily historical prices from 27 July 2010 through 3 June 2025.
- `/api/bitcoin?start=YYYY-MM-DD` backfills subsequent completed UTC daily closes from **Coinbase BTC-USD**, in batches below the 300-candle request limit. Dates are sorted, deduplicated, and checked for missing days. The incomplete current UTC day is excluded.
- `/api/bitcoin` returns Coinbase's latest BTC-USD trade with its source timestamp. The browser polls every **30 seconds** without caching the quote. This is polling, not a streaming feed.
- History refreshes every five minutes. Historical responses can be cached for five minutes in the browser and one hour at a shared HTTP cache. The ticker is always uncached.
- No API key is required. Requests have timeouts and check HTTP status, prices, and timestamps. Failed updates retain historical data and show a warning; failed quotes are marked stale. A quote older than five minutes is rejected by the API, and the UI flags quotes older than 90 seconds.
- When history is missing, the latest trade remains a separate marker without connecting a line across the missing prices.

Coinbase prices are exchange-specific USD trades; they can differ from the earlier CSV's aggregated prices. Daily candles are labeled by their UTC start date, while the live marker uses the actual trade time.

The old CoinGecko range request failed once the CSV was more than 365 days behind. The app now uses the same-origin Next.js API instead of requesting that restricted range directly from the browser. A running Next.js server is required; this is not a static-only deployment.

## Chart and model

The chart sizes to its container and preserves zoom during automatic updates. It retains the original price assumptions, logarithmic growth anchors, and 2023–2027 cycle projection. Historical bull and bear samples now use the January 13 calendar windows described in the article, independently of where the CSV begins. Growth curves use their original 16 August 2010 epoch. Projection and curve dates therefore align with the price series.

The article and its figures are preserved. The projections are the original theory, not newly fitted forecasts.

## Checks

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Tests use Node's native TypeScript stripping (Node 22.18+). They cover paginated history, duplicate and incomplete candles, missing-day and HTTP failures, invalid/stale quotes, CSV fallback, and model date alignment.

## Structure

- `src/components/BitcoinChart.tsx`: chart, live quote, refresh timers and status.
- `src/lib/bitcoinAnalysis.ts`: CSV loading, cycle analysis, curves and Plotly traces.
- `src/lib/bitcoinMarket.ts`: validated Coinbase history and ticker requests.
- `src/app/api/bitcoin/route.ts`: same-origin market data endpoints.
- `public/data/bitcoin_data.csv`: original bundled history.

Provider references: [Coinbase candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles), [Coinbase ticker](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker).
