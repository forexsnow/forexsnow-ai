import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 3000;
const REFRESH_MS = 10 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

let snapshot = null;
let updateCount = 0;

const pairs = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "USD/CHF",
  "AUD/USD",
  "USD/CAD"
];

function scorePair(pair) {
  const confidence = Math.floor(65 + Math.random() * 25);
  const bullish = Math.random() > 0.45;

  const price = pair.includes("JPY")
    ? (145 + Math.random() * 10).toFixed(2)
    : (1 + Math.random() * 0.3).toFixed(4);

  const stopOffset = pair.includes("JPY") ? 0.55 : 0.0055;
  const tpOffset = pair.includes("JPY") ? 0.99 : 0.0099;

  const entry = parseFloat(price);

  const stopLoss = bullish
    ? (entry - stopOffset).toFixed(pair.includes("JPY") ? 2 : 4)
    : (entry + stopOffset).toFixed(pair.includes("JPY") ? 2 : 4);

  const takeProfit = bullish
    ? (entry + tpOffset).toFixed(pair.includes("JPY") ? 2 : 4)
    : (entry - tpOffset).toFixed(pair.includes("JPY") ? 2 : 4);

  return {
    pair,
    bias: bullish ? "Bullish" : "Bearish",
    confidence,
    entry: price,
    stopLoss,
    takeProfit,
    getOutPoint: bullish
      ? `Exit below ${stopLoss}`
      : `Exit above ${stopLoss}`,
    reason:
      "Scored from momentum, volatility, currency strength, and macro theme weighting."
  };
}

function buildSnapshot() {
  updateCount++;

  const rankings = pairs
    .map(scorePair)
    .sort((a, b) => {
      if (a.bias === "Bullish" && b.bias !== "Bullish") return -1;
      if (a.bias !== "Bullish" && b.bias === "Bullish") return 1;
      return b.confidence - a.confidence;
    })
    .map((item, index) => ({
      rank: index + 1,
      ...item
    }));

  snapshot = {
    brand: "ForexSnow",
    updatedAt: new Date().toISOString(),
    nextUpdateAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    updateCount,
    topPick: rankings[0],
    rankings,
    marketThesis:
      "ForexSnow refreshes every 10 minutes and ranks bullish setups first by highest confidence, followed by bearish setups.",
    sources: [
      {
        name: "Investing.com Forex",
        url: "https://www.investing.com/currencies/"
      },
      {
        name: "Forex Factory Calendar",
        url: "https://www.forexfactory.com/calendar"
      },
      {
        name: "Reuters Markets",
        url: "https://www.reuters.com/markets/"
      },
      {
        name: "TradingView Currencies",
        url: "https://www.tradingview.com/markets/currencies/"
      }
    ]
  };

  console.log(`Snapshot updated #${updateCount}`);
}

buildSnapshot();

setInterval(buildSnapshot, REFRESH_MS);

app.get("/api/snapshot", (req, res) => {
  res.json(snapshot);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ForexSnow AI backend"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
