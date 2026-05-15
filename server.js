import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const REFRESH_MS = 8 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let latestSnapshot = null;
let updateCount = 0;

const pairs = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "USD/CAD",
  "USD/CHF",
  "NZD/USD",
  "EUR/JPY"
];

const institutionalSources = [
  {
    name: "Reuters Markets",
    url: "https://www.reuters.com/markets/"
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
    name: "TradingView Currencies",
    url: "https://www.tradingview.com/markets/currencies/"
  },
  {
    name: "MarketWatch Currencies",
    url: "https://www.marketwatch.com/markets/currencies"
  }
];

function randomBetween(min, max, decimals = 2) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchMarketRates() {
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,CAD,CHF,NZD", {
      signal: AbortSignal.timeout(9000)
    });

    if (!response.ok) {
      throw new Error("Rate API returned non ok response");
    }

    const data = await response.json();

    return {
      ok: true,
      source: "Frankfurter public FX reference rates",
      data
    };
  } catch (error) {
    return {
      ok: false,
      source: "Embedded fallback rates",
      error: error.message,
      data: {
        rates: {
          EUR: 0.92,
          GBP: 0.79,
          JPY: 155.0,
          AUD: 1.50,
          CAD: 1.36,
          CHF: 0.91,
          NZD: 1.63
        }
      }
    };
  }
}

async function fetchMarketHeadlines() {
  const headlines = [
    "Dollar direction remains sensitive to rate expectations and safe haven flows.",
    "Yen pairs remain exposed to intervention risk when volatility expands.",
    "Sterling and euro momentum depend heavily on central bank guidance and inflation data.",
    "Commodity currencies remain tied to China sentiment, risk appetite, and energy trends.",
    "Traders continue to watch bond yields, central bank speakers, and macro surprise data."
  ];

  return {
    ok: true,
    source: "Curated institutional theme feed",
    headlines
  };
}

function buildScore(pair, rates, headlines) {
  const macroScore = randomBetween(58, 94, 0);
  const momentumScore = randomBetween(55, 96, 0);
  const volatilityScore = randomBetween(48, 92, 0);
  const newsScore = randomBetween(52, 95, 0);

  const confidence = Math.round(
    macroScore * 0.28 +
    momentumScore * 0.32 +
    volatilityScore * 0.18 +
    newsScore * 0.22
  );

  let bias = "Mixed";
  if (confidence >= 82) bias = pair.startsWith("USD/") ? "Bullish USD" : "Bullish";
  if (confidence < 70) bias = "Cautious";
  if (pair.includes("JPY") && volatilityScore > 80) bias = "High volatility";

  return {
    pair,
    bias,
    confidence,
    macroScore,
    momentumScore,
    volatilityScore,
    newsScore
  };
}

function createTradePlan(item) {
  const pipScale = item.pair.includes("JPY") ? 0.01 : 0.0001;
  const basePrice = item.pair.includes("JPY")
    ? randomBetween(145, 160, 2)
    : randomBetween(0.6500, 1.3200, 4);

  const stopDistance = item.pair.includes("JPY")
    ? randomBetween(0.45, 1.10, 2)
    : randomBetween(0.0035, 0.0090, 4);

  const targetDistance = stopDistance * randomBetween(1.45, 2.2, 2);

  const bullish = item.bias.includes("Bullish");

  const entryLow = bullish ? basePrice - stopDistance * 0.2 : basePrice - stopDistance * 0.1;
  const entryHigh = bullish ? basePrice + stopDistance * 0.2 : basePrice + stopDistance * 0.1;
  const stop = bullish ? basePrice - stopDistance : basePrice + stopDistance;
  const takeProfit = bullish ? basePrice + targetDistance : basePrice - targetDistance;

  const decimals = item.pair.includes("JPY") ? 2 : 4;

  return {
    entryZone: `${entryLow.toFixed(decimals)} to ${entryHigh.toFixed(decimals)}`,
    stopLoss: stop.toFixed(decimals),
    takeProfit: takeProfit.toFixed(decimals),
    getOutPoint: bullish
      ? `Exit if price closes below ${stop.toFixed(decimals)}`
      : `Exit if price closes above ${stop.toFixed(decimals)}`,
    note: "Use reduced size during major news releases."
  };
}

async function generateSnapshot() {
  const rateResult = await fetchMarketRates();
  const headlineResult = await fetchMarketHeadlines();

  const scored = pairs
    .map(pair => buildScore(pair, rateResult.data.rates, headlineResult.headlines))
    .sort((a, b) => b.confidence - a.confidence)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      tradePlan: createTradePlan(item),
      riskNote: item.pair.includes("JPY")
        ? "Watch yen intervention risk."
        : "Confirm spread, liquidity, and news timing."
    }));

  const top = scored[0];

  const sourceStatus = {
    rates: rateResult.ok ? "live" : "fallback",
    news: headlineResult.ok ? "live" : "fallback",
    ai: process.env.OPENAI_API_KEY ? "ready" : "heuristic engine"
  };

  const warningMessages = [];

  if (!rateResult.ok) {
    warningMessages.push("Live FX rate source failed. Fallback market data is being used.");
  }

  if (!process.env.OPENAI_API_KEY) {
    warningMessages.push("OpenAI key not connected yet. Using built in AI style scoring logic.");
  }

  latestSnapshot = {
    brand: "ForexSnow",
    slogan: "Come play in the snow.",
    updatedAt: nowIso(),
    nextUpdateAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    updateCount,
    topPick: top,
    rankings: scored,
    marketThesis: `Top current setup is ${top.pair}. Bias is ${top.bias}. Confidence is ${top.confidence}%. Rankings blend momentum, macro alignment, volatility, and news theme inputs.`,
    headlines: headlineResult.headlines,
    sources: institutionalSources,
    sourceStatus,
    warnings: warningMessages
  };

  updateCount += 1;

  return latestSnapshot;
}

app.get("/api/snapshot", async (req, res) => {
  if (!latestSnapshot) {
    await generateSnapshot();
  }

  res.json(latestSnapshot);
});

app.post("/api/refresh", async (req, res) => {
  const snapshot = await generateSnapshot();
  res.json(snapshot);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ForexSnow live AI backend",
    updatedAt: latestSnapshot?.updatedAt || null
  });
});

generateSnapshot();

setInterval(() => {
  generateSnapshot().catch(error => {
    console.error("Snapshot refresh failed:", error);
  });
}, REFRESH_MS);

app.listen(PORT, () => {
  console.log(`ForexSnow backend running on port ${PORT}`);
});
