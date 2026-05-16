import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 3000;
const REFRESH_MS = 5 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

let snapshot = null;
let updateCount = 0;

const priceHistory = {};

const pairs = [
  { pair: "EUR/USD", symbol: "eurusd" },
  { pair: "GBP/USD", symbol: "gbpusd" },
  { pair: "USD/JPY", symbol: "usdjpy" },
  { pair: "AUD/USD", symbol: "audusd" },
  { pair: "USD/CAD", symbol: "usdcad" },
  { pair: "USD/CHF", symbol: "usdchf" }
];

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ForexSnow/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchStooqPrice(symbol) {
  const url =
    `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`;

  const csv = await fetchWithTimeout(url);

  const lines = csv.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("No quote data returned");
  }

  const headers = lines[0].split(",");
  const values = lines[1].split(",");

  const row = {};

  headers.forEach((header, index) => {
    row[header.trim().toLowerCase()] = values[index];
  });

  const close =
    safeNumber(row.close) ||
    safeNumber(row.last) ||
    safeNumber(row.price);

  if (!close) {
    throw new Error("Invalid quote price");
  }

  return close;
}

function rememberPrice(pair, price) {
  if (!priceHistory[pair]) {
    priceHistory[pair] = [];
  }

  priceHistory[pair].push({
    time: Date.now(),
    price
  });

  priceHistory[pair] = priceHistory[pair].filter(point => {
    return Date.now() - point.time <= 60 * 60 * 1000;
  });
}

function getMomentum(pair, currentPrice) {
  const history = priceHistory[pair] || [];

  if (history.length < 2) {
    return 0;
  }

  const oldest = history[0].price;

  if (!oldest) {
    return 0;
  }

  return ((currentPrice - oldest) / oldest) * 100;
}

function buildTradeSetup(pair, price, momentum) {
  const bullish = momentum >= 0;

  const strength = Math.abs(momentum);

  const confidence = Math.min(
    92,
    Math.max(
      60,
      Math.round(62 + strength * 120)
    )
  );

  const isJpy = pair.includes("JPY");

  const stopDistance = isJpy ? 0.55 : 0.0055;
  const targetDistance = isJpy ? 0.99 : 0.0099;

  const entry = isJpy
    ? price.toFixed(2)
    : price.toFixed(4);

  const stopLoss = isJpy
    ? bullish
      ? (price - stopDistance).toFixed(2)
      : (price + stopDistance).toFixed(2)
    : bullish
      ? (price - stopDistance).toFixed(4)
      : (price + stopDistance).toFixed(4);

  const takeProfit = isJpy
    ? bullish
      ? (price + targetDistance).toFixed(2)
      : (price - targetDistance).toFixed(2)
    : bullish
      ? (price + targetDistance).toFixed(4)
      : (price - targetDistance).toFixed(4);

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
    reason: bullish
      ? "Current price momentum supports upside continuation."
      : "Current price momentum shows downside pressure."
  };
}

async function buildSnapshot() {
  updateCount++;

  const setups = [];
  const sourceStatus = [];

  for (const item of pairs) {
    try {
      const price = await fetchStooqPrice(item.symbol);

      rememberPrice(item.pair, price);

      const momentum = getMomentum(item.pair, price);

      setups.push(
        buildTradeSetup(item.pair, price, momentum)
      );

      sourceStatus.push({
        pair: item.pair,
        source: "Stooq",
        live: true
      });

    } catch (error) {
      sourceStatus.push({
        pair: item.pair,
        source: "Stooq",
        live: false,
        error: error.message
      });
    }
  }

  if (setups.length === 0 && snapshot) {
    snapshot = {
      ...snapshot,
      dataHealth: {
        live: false,
        fallbackUsed: true,
        message: "Live data delayed. Showing last verified snapshot.",
        checkedAt: new Date().toISOString()
      }
    };

    console.log("Live data failed. Previous snapshot retained.");
    return;
  }

  if (setups.length === 0) {
    console.log("No live data available and no previous snapshot exists.");
    return;
  }

  const rankings = setups
    .sort((a, b) => {
      if (a.bias === "Bullish" && b.bias === "Bearish") return -1;
      if (a.bias === "Bearish" && b.bias === "Bullish") return 1;
      return b.confidence - a.confidence;
    })
    .map((item, index) => ({
      rank: index + 1,
      ...item
    }));

  const bullishCount = rankings.filter(item => item.bias === "Bullish").length;
  const bearishCount = rankings.filter(item => item.bias === "Bearish").length;

  const marketThesis =
    bullishCount >= bearishCount
      ? "Bullish momentum currently leads overall market conditions."
      : "Bearish pressure currently leads across select currency pairs.";

  snapshot = {
    brand: "ForexSnow",
    updatedAt: new Date().toISOString(),
    nextUpdateAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    updateCount,
    topPick: rankings[0],
    rankings,
    marketThesis,
    dataHealth: {
      live: true,
      primarySource: "Stooq",
      fallbackUsed: false,
      checkedAt: new Date().toISOString(),
      sourceStatus
    },
    sources: [
      {
        name: "Stooq FX Quotes",
        url: "https://stooq.com"
      },
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
    service: "ForexSnow AI backend",
    refreshMs: REFRESH_MS,
    hasSnapshot: Boolean(snapshot)
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
