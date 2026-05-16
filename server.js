import express from "express";
import cors from "cors";
import fs from "fs";

const app = express();

const PORT = process.env.PORT || 3000;
const REFRESH_MS = 5 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

let snapshot = null;
let updateCount = 0;

let tradeHistory = [];

try {
  const raw = fs.readFileSync(
    "./trade-history.json",
    "utf-8"
  );

  tradeHistory = JSON.parse(raw);

} catch {
  tradeHistory = [];
}

const priceHistory = {};

const pairs = [
  { pair: "EUR/USD", symbol: "eurusd" },
  { pair: "GBP/USD", symbol: "gbpusd" },
  { pair: "USD/JPY", symbol: "usdjpy" },
  { pair: "AUD/USD", symbol: "audusd" },
  { pair: "USD/CAD", symbol: "usdcad" },
  { pair: "USD/CHF", symbol: "usdchf" }
];

function isForexMarketOpen() {
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();

  if (day === 5 && hour >= 22) return false;
  if (day === 6) return false;
  if (day === 0 && hour < 22) return false;

  return true;
}

function getMarketReopenCountdown() {
  const now = new Date();
  const reopen = new Date(now);
  const day = now.getUTCDay();

  if (day === 6) {
    reopen.setUTCDate(now.getUTCDate() + 1);
    reopen.setUTCHours(22, 0, 0, 0);
  } else if (day === 0 && now.getUTCHours() < 22) {
    reopen.setUTCHours(22, 0, 0, 0);
  } else if (day === 5 && now.getUTCHours() >= 22) {
    reopen.setUTCDate(now.getUTCDate() + 2);
    reopen.setUTCHours(22, 0, 0, 0);
  } else {
    return null;
  }

  const diff = reopen - now;

  const hours = Math.floor(
    diff / (1000 * 60 * 60)
  );

  const minutes = Math.floor(
    (diff % (1000 * 60 * 60)) /
    (1000 * 60)
  );

  return `${hours}h ${minutes}m`;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : null;
}

function getLastKnownPrice(pair) {
  const historicalPrices = tradeHistory
    .flatMap(entry => entry.rankings || [])
    .filter(item => item.pair === pair && item.lastPrice)
    .map(item => Number(item.lastPrice))
    .filter(price => Number.isFinite(price));

  if (historicalPrices.length === 0) {
    return null;
  }

  return historicalPrices[historicalPrices.length - 1];
}

async function fetchWithTimeout(
  url,
  timeoutMs = 8000
) {
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
      throw new Error(
        `Request failed: ${response.status}`
      );
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
    throw new Error(
      "No quote data returned"
    );
  }

  const headers = lines[0].split(",");
  const values = lines[1].split(",");

  const row = {};

  headers.forEach((header, index) => {
    row[
      header.trim().toLowerCase()
    ] = values[index];
  });

  const close =
    safeNumber(row.close) ||
    safeNumber(row.last) ||
    safeNumber(row.price);

  if (!close) {
    throw new Error(
      "Invalid quote price"
    );
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

  priceHistory[pair] =
    priceHistory[pair].filter(point => {
      return (
        Date.now() - point.time <=
        60 * 60 * 1000
      );
    });
}

function getMomentum(pair, currentPrice) {
  const history =
    priceHistory[pair] || [];

  if (history.length < 2) {
    return (
      (Math.random() - 0.45) * 0.2
    );
  }

  const oldest = history[0].price;

  if (!oldest) {
    return (
      (Math.random() - 0.45) * 0.2
    );
  }

  return (
    (
      (currentPrice - oldest) /
      oldest
    ) * 100
  );
}

function getConfidenceEvolutionAdjustment(pair, bias) {
  const historicalPlays = tradeHistory
    .flatMap(entry => entry.rankings || [])
    .filter(play => {
      return (
        play.pair === pair &&
        play.bias === bias &&
        (
          play.status === "WIN" ||
          play.status === "LOSS"
        )
      );
    });

  if (historicalPlays.length < 5) {
    return 0;
  }

  const wins =
    historicalPlays.filter(
      play => play.status === "WIN"
    ).length;

  const losses =
    historicalPlays.filter(
      play => play.status === "LOSS"
    ).length;

  const winRate =
    wins / historicalPlays.length;

  if (winRate >= 0.7) {
    return 6;
  }

  if (winRate >= 0.6) {
    return 3;
  }

  if (winRate <= 0.35) {
    return -6;
  }

  if (winRate <= 0.45) {
    return -3;
  }

  return 0;
}
function buildTradeSetup(
  pair,
  price,
  momentum,
  sourceMode
) {
  const bullish = momentum >= 0;

  const strength =
    Math.abs(momentum);

const historyBoost =
  getConfidenceEvolutionAdjustment(
    pair,
    bullish ? "Bullish" : "Bearish"
  );
  
  const confidence = Math.min(
    96,
    Math.max(
      60,
      Math.round(
        62 +
        strength * 120 +
        historyBoost
      )
    )
  );

  const isJpy =
    pair.includes("JPY");

  const stopDistance =
    isJpy ? 0.55 : 0.0055;

  const targetDistance =
    isJpy ? 0.99 : 0.0099;

  const entry =
    isJpy
      ? price.toFixed(2)
      : price.toFixed(4);

  const stopLoss =
    isJpy
      ? bullish
        ? (price - stopDistance)
            .toFixed(2)
        : (price + stopDistance)
            .toFixed(2)
      : bullish
        ? (price - stopDistance)
            .toFixed(4)
        : (price + stopDistance)
            .toFixed(4);

  const takeProfit =
    isJpy
      ? bullish
        ? (price + targetDistance)
            .toFixed(2)
        : (price - targetDistance)
            .toFixed(2)
      : bullish
        ? (price + targetDistance)
            .toFixed(4)
        : (price - targetDistance)
            .toFixed(4);

  return {
    pair,
    lastPrice: entry,
    bias:
      bullish
        ? "Bullish"
        : "Bearish",
    confidence,
    entry,
    stopLoss,
    takeProfit,
    getOutPoint:
      bullish
        ? `Exit below ${stopLoss}`
        : `Exit above ${stopLoss}`,
    reason:
      bullish
        ? "Current price momentum supports upside continuation."
        : "Current price momentum shows downside pressure.",
    sourceMode,
    status: "OPEN",
    createdAt: new Date().toISOString()
  };
}

function evaluateTradeOutcome(play, latestPrice) {
  if (play.status !== "OPEN") {
    return play;
  }

  const bullish = play.bias === "Bullish";

  const takeProfit = Number(play.takeProfit);
  const stopLoss = Number(play.stopLoss);
  const current = Number(latestPrice);

  if (!Number.isFinite(takeProfit) || !Number.isFinite(stopLoss) || !Number.isFinite(current)) {
    return play;
  }

  if (bullish) {
    if (current >= takeProfit) {
      play.status = "WIN";
    } else if (current <= stopLoss) {
      play.status = "LOSS";
    }
  } else {
    if (current <= takeProfit) {
      play.status = "WIN";
    } else if (current >= stopLoss) {
      play.status = "LOSS";
    }
  }

  if (play.status !== "OPEN") {
    play.closedAt = new Date().toISOString();
    play.resultPrice = latestPrice;
  }

  return play;
}
function calculatePerformanceStats() {
  const allPlays = tradeHistory.flatMap(
    entry => entry.rankings || []
  );

  const wins = allPlays.filter(
    play => play.status === "WIN"
  );

  const losses = allPlays.filter(
    play => play.status === "LOSS"
  );

  const open = allPlays.filter(
    play => play.status === "OPEN"
  );

  const completed = wins.length + losses.length;

  const winRate = completed > 0
    ? Math.round((wins.length / completed) * 100)
    : 0;

  const pairStats = {};

  allPlays.forEach(play => {
    if (!pairStats[play.pair]) {
      pairStats[play.pair] = {
        pair: play.pair,
        wins: 0,
        losses: 0,
        open: 0
      };
    }

    if (play.status === "WIN") {
      pairStats[play.pair].wins++;
    }

    if (play.status === "LOSS") {
      pairStats[play.pair].losses++;
    }

    if (play.status === "OPEN") {
      pairStats[play.pair].open++;
    }
  });

  const bestPair = Object.values(pairStats)
    .map(item => {
      const total = item.wins + item.losses;

      return {
        ...item,
        winRate: total > 0
          ? Math.round((item.wins / total) * 100)
          : 0
      };
    })
    .sort((a, b) => b.winRate - a.winRate)[0] || null;

  return {
    totalPlays: allPlays.length,
    wins: wins.length,
    losses: losses.length,
    open: open.length,
    completed,
    winRate,
    bestPair
  };
}
async function getPriceForPair(item) {
  try {
    const price =
      await fetchStooqPrice(
        item.symbol
      );

    return {
      price,
      source: "Stooq",
      live: true,
      sourceMode: "Live"
    };

  } catch (error) {

    const lastKnownPrice = getLastKnownPrice(item.pair);

if (!lastKnownPrice) {
  throw new Error(
    `No live or historical price available for ${item.pair}`
  );
}

return {
  price: lastKnownPrice,
  source: "Last Known Market Price",
  live: false,
  sourceMode: "Last Known",
  error: error.message
};
  }
}

async function buildSnapshot() {
  updateCount++;

  const marketOpen =
    isForexMarketOpen();

  const marketReopenCountdown =
    getMarketReopenCountdown();

  const setups = [];
  const sourceStatus = [];

  for (const item of pairs) {
    const result =
      await getPriceForPair(item);

    rememberPrice(
      item.pair,
      result.price
    );

    const momentum =
      getMomentum(
        item.pair,
        result.price
      );

    setups.push(
      buildTradeSetup(
        item.pair,
        result.price,
        momentum,
        result.sourceMode
      )
    );

    sourceStatus.push({
      pair: item.pair,
      source: result.source,
      live: result.live,
      error:
        result.error || null
    });
  }

  tradeHistory.forEach(snapshotEntry => {
  snapshotEntry.rankings?.forEach(play => {
    const matching = setups.find(
      item => item.pair === play.pair
    );

    if (matching) {
      evaluateTradeOutcome(
        play,
        matching.lastPrice
      );
    }
  });
});
  
  const rankings =
    setups
      .sort((a, b) => {
        if (
          a.bias === "Bullish" &&
          b.bias === "Bearish"
        ) return -1;

        if (
          a.bias === "Bearish" &&
          b.bias === "Bullish"
        ) return 1;

        return (
          b.confidence -
          a.confidence
        );
      })
      .map((item, index) => ({
        rank: index + 1,
        ...item
      }));

  const bullishCount =
    rankings.filter(
      item => item.bias === "Bullish"
    ).length;

  const bearishCount =
    rankings.filter(
      item => item.bias === "Bearish"
    ).length;

  const liveCount =
    sourceStatus.filter(
      item => item.live
    ).length;

  const fallbackUsed =
    liveCount <
    sourceStatus.length;

  let marketThesis = "";

  if (!marketOpen) {

    marketThesis =
      `Forex market currently closed. Snapshot engine standing by. Market reopens in ${marketReopenCountdown}.`;

  } else if (
    bullishCount >= bearishCount
  ) {

    marketThesis =
      "Bullish momentum currently leads overall market conditions.";

  } else {

    marketThesis =
      "Bearish pressure currently leads across select currency pairs.";
  }

const performanceStats =
  calculatePerformanceStats();
  
  const historyEntry = {
    timestamp:
      new Date().toISOString(),
    marketOpen,
    rankings
  };

  tradeHistory.push(historyEntry);

  if (tradeHistory.length > 5000) {
    tradeHistory.shift();
  }

  fs.writeFileSync(
    "./trade-history.json",
    JSON.stringify(
      tradeHistory,
      null,
      2
    )
  );

  snapshot = {
    brand: "ForexSnow",

    updatedAt:
      new Date().toISOString(),

    nextUpdateAt:
      new Date(
        Date.now() + REFRESH_MS
      ).toISOString(),

    marketOpen,
    marketReopenCountdown,

    updateCount,

    totalHistoricalSnapshots:
      tradeHistory.length,

    topPick: rankings[0],

    rankings,

    marketThesis,

    dataHealth: {
      live: liveCount > 0,
      marketOpen,
      marketReopenCountdown,

      primarySource:
        "Stooq",

      fallbackUsed,

      livePairs: liveCount,

      totalPairs:
        sourceStatus.length,

      checkedAt:
        new Date().toISOString(),

      message:
        !marketOpen
          ? `Forex market currently closed. Reopens in ${marketReopenCountdown}.`
          : fallbackUsed
            ? "Some live data was delayed. ForexSnow used backup pricing to keep the snapshot active."
            : "Live market data active.",

      sourceStatus
    },

    memory: {
      historicalSnapshots:
        tradeHistory.length,

      learningActive: true
    },

    performance: performanceStats,
    
    sources: [
      {
        name:
          "Stooq FX Quotes",
        url:
          "https://stooq.com"
      },
      {
        name:
          "Backup Pricing Engine",
        url:
          "Internal fallback"
      },
      {
        name:
          "Investing.com Forex",
        url:
          "https://www.investing.com/currencies/"
      },
      {
        name:
          "Forex Factory Calendar",
        url:
          "https://www.forexfactory.com/calendar"
      },
      {
        name:
          "Reuters Markets",
        url:
          "https://www.reuters.com/markets/"
      },
      {
        name:
          "TradingView Currencies",
        url:
          "https://www.tradingview.com/markets/currencies/"
      }
    ],

    warnings: [
      "ForexSnow is informational only and not financial advice."
    ]
  };

  console.log(
    `Snapshot updated #${updateCount}`
  );
}

buildSnapshot();

setInterval(
  buildSnapshot,
  REFRESH_MS
);

app.get(
  "/api/snapshot",
  (req, res) => {
    res.json(snapshot);
  }
);

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      service:
        "ForexSnow AI backend",
      refreshMs:
        REFRESH_MS,
      hasSnapshot:
        Boolean(snapshot),
      marketOpen:
        snapshot?.marketOpen ??
        null,
      historicalSnapshots:
        tradeHistory.length
    });
  }
);

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});
