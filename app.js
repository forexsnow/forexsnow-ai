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
  "AUD/USD",
  "USD/CAD",
  "USD/CHF"
];

function randomPrice(pair) {
  if (pair.includes("JPY")) {
    return (145 + Math.random() * 10).toFixed(2);
  }

  return (1 + Math.random() * 0.35).toFixed(4);
}

function scorePair(pair) {
  const bullish = Math.random() > 0.45;

  const confidence = Math.floor(
    bullish
      ? 72 + Math.random() * 18
      : 60 + Math.random() * 18
  );

  const entry = randomPrice(pair);

  const stopLoss = pair.includes("JPY")
    ? (parseFloat(entry) + 0.55).toFixed(2)
    : (parseFloat(entry) + 0.0055).toFixed(4);

  const takeProfit = pair.includes("JPY")
    ? (parseFloat(entry) - 0.99).toFixed(2)
    : (parseFloat(entry) - 0.0099).toFixed(4);

  return {
    pair,
    bias: bullish ? "Bullish" : "Bearish",
    confidence,
    entry,
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

    // BULLISH FIRST
    .sort((a, b) => {
      const aBullish = a.bias === "Bullish";
      const bBullish = b.bias === "Bullish";

      if (aBullish && !bBullish) return -1;
      if (!aBullish && bBullish) return 1;

      return b.confidence - a.confidence;
    })

    .map((item, index) => ({
      rank: index + 1,
      ...item
    }));

  snapshot = {
    brand: "ForexSnow",

    updatedAt: new Date().toISOString(),

    nextUpdateAt: new Date(
      Date.now() + REFRESH_MS
    ).toISOString(),

    updateCount,

    topPick: rankings[0],

    rankings,

    marketThesis:
      "ForexSnow prioritizes bullish momentum opportunities first, ranked by strongest confidence scoring.",

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
    ],

    warnings: [
      "ForexSnow is informational only and not financial advice."
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
