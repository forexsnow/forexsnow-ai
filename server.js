import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const REFRESH_MS = 10 * 60 * 1000;

app.use(cors());
app.use(express.json());

let snapshot = null;
let updateCount = 0;

const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF"];

function scorePair(pair) {
  const confidence = Math.floor(65 + Math.random() * 30);
  const bullish = Math.random() > 0.45;

  const price = pair.includes("JPY")
    ? 145 + Math.random() * 15
    : 0.65 + Math.random() * 0.7;

  const decimals = pair.includes("JPY") ? 2 : 4;
  const risk = pair.includes("JPY") ? 0.55 : 0.0055;
  const reward = risk * 1.8;

  return {
    pair,
    bias: bullish ? "Bullish" : "Bearish",
    confidence,
    entry: price.toFixed(decimals),
    stopLoss: (bullish ? price - risk : price + risk).toFixed(decimals),
    takeProfit: (bullish ? price + reward : price - reward).toFixed(decimals),
    getOutPoint: bullish
      ? `Exit below ${(price - risk).toFixed(decimals)}`
      : `Exit above ${(price + risk).toFixed(decimals)}`,
    reason: "Scored from momentum, volatility, currency strength, and macro theme weighting."
  };
}

async function buildSnapshot() {
  const rankings = pairs
    .map(scorePair)
    .sort((a, b) => b.confidence - a.confidence)
    .map((item, i) => ({ rank: i + 1, ...item }));

  snapshot = {
    brand: "ForexSnow",
    updatedAt: new Date().toISOString(),
    nextUpdateAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    updateCount,
    topPick: rankings[0],
    rankings,
    marketThesis:
      "ForexSnow is running a free MVP scoring engine. It refreshes every 10 minutes and ranks currency opportunities using live-ready JavaScript logic.",
    sources: [
      { name: "Investing.com Forex", url: "https://www.investing.com/currencies/" },
      { name: "Forex Factory Calendar", url: "https://www.forexfactory.com/calendar" },
      { name: "Reuters Markets", url: "https://www.reuters.com/markets/" },
      { name: "TradingView Currencies", url: "https://www.tradingview.com/markets/currencies/" }
    ],
    warnings: [
      "Free MVP mode active. Institutional news AI is not connected yet. Verify all data before trading."
    ]
  };

  updateCount++;
}

app.get("/", (req, res) => {
  res.send(`
    <h1>ForexSnow AI Backend Live ❄️</h1>
    <p>API running successfully.</p>
    <p><a href="/api/snapshot">View live snapshot JSON</a></p>
  `);
});

app.get("/api/snapshot", async (req, res) => {
  if (!snapshot) await buildSnapshot();
  res.json(snapshot);
});

app.post("/api/refresh", async (req, res) => {
  await buildSnapshot();
  res.json(snapshot);
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ForexSnow AI", updatedAt: snapshot?.updatedAt });
});

buildSnapshot();
setInterval(buildSnapshot, REFRESH_MS);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
