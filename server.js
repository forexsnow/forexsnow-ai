import express from "express";
import cors from "cors";
import fs from "fs";

const app = express();

const PORT = process.env.PORT || 3000;
const ACTIVE_REFRESH_MS = 15 * 60 * 1000;
const SLOW_REFRESH_MS = 30 * 60 * 1000;
const REFRESH_MS = ACTIVE_REFRESH_MS;
const HISTORY_FILE = "./trade-history.json";

const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY || "";
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const TWELVEDATA_DAILY_LIMIT = 750;

async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message
        })
      }
    );
  } catch (err) {
    console.error("Telegram alert failed:", err.message);
  }
}

let twelveDataDailyCount = 0;
let twelveDataDay = new Date().toISOString().slice(0, 10);

app.use(cors());
app.use(express.json());
app.use(express.static("."));

let snapshot = null;
let lastLiveSnapshot = null;
let updateCount = 0;
let tradeHistory = [];
let lastEliteAlertKey = "";

try {
  const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
  tradeHistory = JSON.parse(raw);
} catch {
  tradeHistory = [];
}

const priceHistory = {};

const pairs = [
  { pair: "EUR/USD", base: "EUR", quote: "USD", stooqSymbol: "eurusd", twelveSymbol: "EUR/USD", polygonSymbol: "C:EURUSD" },
  { pair: "GBP/USD", base: "GBP", quote: "USD", stooqSymbol: "gbpusd", twelveSymbol: "GBP/USD", polygonSymbol: "C:GBPUSD" },
  { pair: "USD/JPY", base: "USD", quote: "JPY", stooqSymbol: "usdjpy", twelveSymbol: "USD/JPY", polygonSymbol: "C:USDJPY" },
  { pair: "AUD/USD", base: "AUD", quote: "USD", stooqSymbol: "audusd", twelveSymbol: "AUD/USD", polygonSymbol: "C:AUDUSD" },
  { pair: "USD/CAD", base: "USD", quote: "CAD", stooqSymbol: "usdcad", twelveSymbol: "USD/CAD", polygonSymbol: "C:USDCAD" },
  { pair: "USD/CHF", base: "USD", quote: "CHF", stooqSymbol: "usdchf", twelveSymbol: "USD/CHF", polygonSymbol: "C:USDCHF" },
  { pair: "NZD/USD", base: "NZD", quote: "USD", stooqSymbol: "nzdusd", twelveSymbol: "NZD/USD", polygonSymbol: "C:NZDUSD" },
  { pair: "GBP/JPY", base: "GBP", quote: "JPY", stooqSymbol: "gbpjpy", twelveSymbol: "GBP/JPY", polygonSymbol: "C:GBPJPY" },
  { pair: "EUR/JPY", base: "EUR", quote: "JPY", stooqSymbol: "eurjpy", twelveSymbol: "EUR/JPY", polygonSymbol: "C:EURJPY" },
  { pair: "EUR/AUD", base: "EUR", quote: "AUD", stooqSymbol: "euraud", twelveSymbol: "EUR/AUD", polygonSymbol: "C:EURAUD" },
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
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}h ${minutes}m`;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getLastKnownPrice(pair) {
  const memoryPrice = priceHistory[pair]?.at(-1)?.price;

  if (Number.isFinite(memoryPrice)) {
    return memoryPrice;
  }

  const historicalPrices = tradeHistory
    .flatMap(entry => entry.rankings || [])
    .filter(item => item.pair === pair && item.lastPrice)
    .map(item => Number(item.lastPrice))
    .filter(price => Number.isFinite(price));

  if (historicalPrices.length === 0) return null;

  return historicalPrices[historicalPrices.length - 1];
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

async function fetchTwelveDataPrice(symbol) {
  const today = new Date().toISOString().slice(0, 10);

  if (today !== twelveDataDay) {
    twelveDataDay = today;
    twelveDataDailyCount = 0;
  }

  if (twelveDataDailyCount >= TWELVEDATA_DAILY_LIMIT) {
    throw new Error("TwelveData daily budget reached");
  }

  twelveDataDailyCount++;

  if (!TWELVEDATA_API_KEY) {
    throw new Error("Missing TWELVEDATA_API_KEY");
  }

  const url =
    `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${TWELVEDATA_API_KEY}`;

  const data = await fetchJson(url);

  if (data.status === "error") {
    throw new Error(data.message || "TwelveData error");
  }

  const price = safeNumber(data.price);

  if (!price) {
    throw new Error("Invalid TwelveData price");
  }

  return price;
}

async function fetchFinnhubPrice(base, quote) {
  if (!FINNHUB_API_KEY) {
    throw new Error("Missing FINNHUB_API_KEY");
  }

  const url =
    `https://finnhub.io/api/v1/forex/rates?base=${encodeURIComponent(base)}&token=${FINNHUB_API_KEY}`;

  const data = await fetchJson(url);

  const price = safeNumber(data?.quote?.[quote]);

  if (!price) {
    throw new Error("Invalid Finnhub price");
  }

  return price;
}

async function fetchPolygonPrice(symbol) {
  if (!POLYGON_API_KEY) {
    throw new Error("Missing POLYGON_API_KEY");
  }

  const url =
    `https://api.polygon.io/v2/snapshot/locale/global/markets/forex/tickers/${encodeURIComponent(symbol)}?apiKey=${POLYGON_API_KEY}`;

  const data = await fetchJson(url);

  const ticker = data?.ticker || data?.results || data;

  const bid = safeNumber(ticker?.lastQuote?.b);
  const ask = safeNumber(ticker?.lastQuote?.a);
  const last = safeNumber(ticker?.lastTrade?.p);
  const dayClose = safeNumber(ticker?.day?.c);
  const prevClose = safeNumber(ticker?.prevDay?.c);

  const mid =
    bid && ask
      ? (bid + ask) / 2
      : null;

  const price =
    mid ||
    last ||
    dayClose ||
    prevClose;

  if (!price) {
    throw new Error("Invalid Polygon price");
  }

  return price;
}
async function fetchOandaPrice(pair) {
  const apiKey = process.env.OANDA_API_KEY;
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const env = process.env.OANDA_ENV || "practice";

  if (!apiKey || !accountId) {
    throw new Error("Missing OANDA credentials");
  }

  const host =
    env === "live"
      ? "https://api-fxtrade.oanda.com"
      : "https://api-fxpractice.oanda.com";

  const instrument = pair.replace("/", "_");

  const response = await fetch(
    `${host}/v3/accounts/${accountId}/pricing?instruments=${instrument}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`OANDA request failed: ${response.status}`);
  }

  const data = await response.json();

  const priceData = data.prices?.[0];

  if (!priceData) {
    throw new Error("No OANDA pricing data");
  }

  const bid = parseFloat(priceData.bids?.[0]?.price);
  const ask = parseFloat(priceData.asks?.[0]?.price);

  if (!bid || !ask) {
    throw new Error("Invalid OANDA bid/ask");
  }

  return (bid + ask) / 2;
}
async function fetchStooqPrice(symbol) {
  const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`;

    const csv = await fetchText(url, 15000);
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
    throw new Error("Invalid Stooq price");
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

if (!oldest) {
  return 0;
}

  return ((currentPrice - oldest) / oldest) * 1000;
}

function getConfidenceEvolutionAdjustment(pair, bias) {
  const historicalPlays = tradeHistory
    .flatMap(entry => entry.rankings || [])
    .filter(play => {
      return (
        play.pair === pair &&
        play.bias === bias &&
        (play.status === "WIN" || play.status === "LOSS")
      );
    });

  if (historicalPlays.length < 5) {
    return 0;
  }

  const wins = historicalPlays.filter(play => play.status === "WIN").length;
  const winRate = wins / historicalPlays.length;

  if (historicalPlays.length >= 20) {
  if (winRate >= 0.75) return 10;
  if (winRate >= 0.65) return 6;
  if (winRate >= 0.55) return 3;

  if (winRate <= 0.30) return -10;
  if (winRate <= 0.40) return -6;
  if (winRate <= 0.48) return -3;
}

if (winRate >= 0.7) return 6;
if (winRate >= 0.6) return 3;

if (winRate <= 0.35) return -6;
if (winRate <= 0.45) return -3;

  return 0;
}

function getConfidenceTier(confidence) {
if (confidence >= 92) return "Elite";
if (confidence >= 78) return "High";
if (confidence >= 62) return "Medium";
  return "Low";
}

function buildTradeSetup(
  pair,
  price,
  momentum,
  sourceMode,
  consensusStrength,
  dataAgeStatus,
  marketOpen
) {


const bullish = momentum > 0;
  const recentPlay = tradeHistory
  .flatMap(entry => entry.rankings || [])
  .find(play => play.pair === pair);

let cooldownPenalty = 0;

if (
  recentPlay &&
  recentPlay.bias !== (bullish ? "Bullish" : "Bearish")
) {
  const ageMinutes =
    (Date.now() - new Date(recentPlay.createdAt).getTime()) / 60000;

  if (ageMinutes < 60) {
    cooldownPenalty += 12;
  }
}
  const bias = bullish ? "Bullish" : "Bearish";
  const strength = Math.abs(momentum);

  const history = priceHistory[pair] || [];

const recentPrices = history.slice(-6).map(p => p.price);

let structureScore = 0;

if (recentPrices.length >= 4) {
  const rising =
    recentPrices[5] > recentPrices[4] &&
    recentPrices[4] > recentPrices[3];

  const falling =
    recentPrices[5] < recentPrices[4] &&
    recentPrices[4] < recentPrices[3];

  if (bullish && rising) {
    structureScore += 8;
  }

  if (!bullish && falling) {
    structureScore += 8;
  }
}

  let regime = "Balanced";
let regimePenalty = 0;

if (strength < 0.003) {
  regime = "Choppy";
  regimePenalty += 10;
}

if (strength >= 0.003 && strength < 0.01) {
  regime = "Range";
  regimePenalty += 4;
}

if (strength >= 0.01) {
  regime = "Trending";
}

let volatilityPenalty = 0;

if (strength < 0.01) {
  volatilityPenalty += 8;
}

if (strength < 0.005) {
  volatilityPenalty += 6;
}
  
  const historyBoost = getConfidenceEvolutionAdjustment(pair, bias);

  let confidencePenalty = 0;

if (!marketOpen) {
  confidencePenalty += 8;
}

if (sourceMode === "Single Source") {
  confidencePenalty += 10;
}

if (sourceMode === "Last Known") {
  confidencePenalty += 18;
}

if (consensusStrength <= 1) {
  confidencePenalty += 10;
}

if (consensusStrength === 2) {
  confidencePenalty += 4;
}

if (dataAgeStatus === "Unverified") {
  confidencePenalty += 6;
}
  let consensusBoost = 0;

if (sourceMode === "Consensus") {
  consensusBoost += 10;
}

if (dataAgeStatus === "Verified") {
  consensusBoost += 6;
}

if (marketOpen) {
  consensusBoost += 4;
}

let sessionBoost = 0;

const hour = new Date().getUTCHours();

if (hour >= 7 && hour <= 11) {
  sessionBoost += 12;
}

if (hour >= 12 && hour <= 16) {
  sessionBoost += 15;
}
  
if (hour >= 0 && hour <= 5) {
  sessionBoost -= 6;
}

let reopenAdjustment = 0;

if (
  lastLiveSnapshot &&
  marketOpen &&
  lastLiveSnapshot.rankings?.length
) {
  const previous = lastLiveSnapshot.rankings.find(
    item => item.pair === pair
  );

  if (previous) {
    const oldEntry = Number(previous.entry);

    if (Number.isFinite(oldEntry)) {
      const reopenMove = bullish
        ? price - oldEntry
        : oldEntry - price;

      if (reopenMove > 0) {
        reopenAdjustment += 4;
      }

      if (reopenMove < 0) {
        reopenAdjustment -= 6;
      }
    }
  }
}
  
const confidence = Math.min(
  96,
  Math.max(
    40,
    Math.round(
      52 +
strength * 260 +
historyBoost +
consensusBoost +
sessionBoost +
reopenAdjustment +
structureScore -
confidencePenalty -
volatilityPenalty -
cooldownPenalty -
regimePenalty
    )
  )
);
  const tier = getConfidenceTier(confidence);
  const isJpy = pair.includes("JPY");

  const stopDistance = isJpy ? 0.55 : 0.0055;
  const targetDistance = isJpy ? 0.99 : 0.0099;

  const entry = isJpy ? price.toFixed(3) : price.toFixed(5);

  const stopLoss = isJpy
    ? bullish
      ? (price - stopDistance).toFixed(3)
      : (price + stopDistance).toFixed(3)
    : bullish
      ? (price - stopDistance).toFixed(5)
      : (price + stopDistance).toFixed(5);

  const takeProfit = isJpy
  ? bullish
    ? (price + targetDistance).toFixed(3)
    : (price - targetDistance).toFixed(3)
  : bullish
    ? (price + targetDistance).toFixed(5)
    : (price - targetDistance).toFixed(5);

const risk = Math.abs(price - Number(stopLoss));

const reward = Math.abs(Number(takeProfit) - price);

const rr = reward / risk;

if (rr < 1.5) {
  return null;
}

return {
    pair,
lastPrice: entry,
bias,
confidence,
tier,
    stopLoss,
    takeProfit,
    getOutPoint: bullish
      ? `Exit below ${stopLoss}`
      : `Exit above ${stopLoss}`,
    reason: bullish
      ? "Current price momentum supports upside continuation."
      : "Current price momentum shows downside pressure.",
    sourceMode,
    dataAgeStatus,
    regime,
    status: "OPEN",
    createdAt: new Date().toISOString()
  };
}

function evaluateTradeOutcome(play, latestPrice) {
  if (play.status !== "OPEN") return play;

  const bullish = play.bias === "Bullish";
  const takeProfit = Number(play.takeProfit);
  const stopLoss = Number(play.stopLoss);
  const current = Number(latestPrice);

  const risk = Math.abs(price - Number(stopLoss));

const reward = Math.abs(Number(takeProfit) - price);

const rr = reward / risk;

if (rr < 1.5) {
  return null;
}

  if (
    !Number.isFinite(takeProfit) ||
    !Number.isFinite(stopLoss) ||
    !Number.isFinite(current)
  ) {
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

  const ageMinutes =
  (Date.now() - new Date(play.createdAt).getTime()) / 60000;

if (ageMinutes > 720 && play.status === "OPEN") {
  play.status = "EXPIRED";
}

  if (play.status !== "OPEN") {
    play.closedAt = new Date().toISOString();
    play.resultPrice = latestPrice;
  }

  return play;
}

function calculatePerformanceStats() {
  const allPlays = tradeHistory.flatMap(entry => entry.rankings || []);

  const wins = allPlays.filter(play => play.status === "WIN");
  const losses = allPlays.filter(play => play.status === "LOSS");
  const open = allPlays.filter(play => play.status === "OPEN");

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

    if (play.status === "WIN") pairStats[play.pair].wins++;
    if (play.status === "LOSS") pairStats[play.pair].losses++;
    if (play.status === "OPEN") pairStats[play.pair].open++;
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
  const errors = [];
  const candidates = [];

  async function attempt(sourceName, fetcher) {
    try {
      const price = await fetcher();

      if (Number.isFinite(price)) {
        candidates.push({
          source: sourceName,
          price
        });
      }
    } catch (error) {
      errors.push(`${sourceName}: ${error.message}`);
    }
  }

  if (!isForexMarketOpen()) {
  const lastKnownPrice = getLastKnownPrice(item.pair);

  if (!lastKnownPrice) {
    return {
      price: null,
      source: "Market Closed",
      live: false,
      sourceMode: "Unavailable",
      dataAgeStatus: "Unverified",
      contributors: [],
      error: "Market closed. Live quote polling paused."
    };
  }

  return {
    price: lastKnownPrice,
    source: "Last Known Market Price",
    live: false,
    sourceMode: "Last Known",
    dataAgeStatus: "Unverified",
    contributors: [],
    error: "Market closed. Using last known price."
  };
}

await Promise.all([
  attempt(
    "OANDA",
    () => fetchOandaPrice(item.pair)
  ),

  attempt(
    "Stooq",
    () => fetchStooqPrice(item.stooqSymbol)
  ),

  attempt(
    "TwelveData",
    () => fetchTwelveDataPrice(item.twelveSymbol)
  ),

  attempt(
    "Finnhub",
    () => fetchFinnhubPrice(item.base, item.quote)
  ),
]);
  if (candidates.length === 0) {
    const lastKnownPrice = getLastKnownPrice(item.pair);

    if (!lastKnownPrice) {
      return {
        price: null,
        source: "Unavailable",
        live: false,
        sourceMode: "Unavailable",
        error: errors.join(" | ")
      };
    }

    return {
      price: lastKnownPrice,
      source: "Last Known Market Price",
      live: false,
      sourceMode: "Last Known",
      contributors: [],
      error: errors.join(" | ")
    };
  }

  const sortedPrices = candidates
    .map(item => item.price)
    .sort((a, b) => a - b);

  const median =
    sortedPrices.length % 2 === 0
      ? (
          sortedPrices[sortedPrices.length / 2 - 1] +
          sortedPrices[sortedPrices.length / 2]
        ) / 2
      : sortedPrices[Math.floor(sortedPrices.length / 2)];

  const trusted = candidates.filter(item => {
    const deviation =
      Math.abs(item.price - median) / median;

    return deviation <= 0.0035;
  });

  const finalSources =
    trusted.length > 0
      ? trusted
      : candidates;

  const consensusPrice =
    finalSources.reduce(
      (sum, item) => sum + item.price,
      0
    ) / finalSources.length;

  return {
    price: consensusPrice,
    source:
      finalSources.length > 1
        ? "Consensus Engine"
        : finalSources[0].source,
    live: true,
    sourceMode:
      finalSources.length > 1
        ? "Consensus"
        : "Single Source",
    dataAgeStatus:
  finalSources.length > 1
    ? "Verified"
    : "Unverified",
    contributors: finalSources.map(item => item.source),
    rejectedSources: candidates
      .filter(
        item =>
          !finalSources.find(
            trusted =>
              trusted.source === item.source
          )
      )
      .map(item => item.source),
    error: errors.join(" | ")
  };
}
async function buildSnapshot() {
  updateCount++;

  const marketOpen = isForexMarketOpen();
  const marketReopenCountdown = getMarketReopenCountdown();

  const setups = [];
  const sourceStatus = [];

  const pairResults = await Promise.all(
  pairs.map(async item => {
    const result = await getPriceForPair(item);

    return {
      item,
      result
    };
  })
);

for (const { item, result } of pairResults) {
  sourceStatus.push({
    pair: item.pair,
    source: result.source,
    live: result.live,
    sourceMode: result.sourceMode,
    error: result.error || null
  });

  if (!result.price) {
    continue;
  }

rememberPrice(item.pair, result.price);
result.lastKnownPrice = result.price;
  const momentum = getMomentum(item.pair, result.price);

const setup = buildTradeSetup(
  item.pair,
  result.price,
  momentum,
  result.sourceMode,
  result.contributors?.length || 1,
  result.dataAgeStatus || "Unverified",
  marketOpen
);

if (setup) {
  setups.push(setup);
}
}

  tradeHistory.forEach(snapshotEntry => {
    snapshotEntry.rankings?.forEach(play => {
      const matching = setups.find(item => item.pair === play.pair);

      if (matching) {
        evaluateTradeOutcome(play, matching.lastPrice);
      }
    });
  });

const rankableSetups = setups.filter(Boolean);

  const tierOrder = {
  Elite: 0,
  High: 1,
  Medium: 2,
  Low: 3
};

const rankings = rankableSetups
  .sort((a, b) => {
  if (tierOrder[a.tier] !== tierOrder[b.tier]) {
    return tierOrder[a.tier] - tierOrder[b.tier];
  }

  return b.confidence - a.confidence;
})
    .map((item, index) => ({
      rank: index + 1,
      ...item
    }));

const eliteAlerts = rankings.filter(
  item => item.confidence >= 80
);

for (const alert of eliteAlerts) {
  await sendTelegramAlert(
    `ð¨ ForexSnow Elite Signal

Pair: ${alert.pair}
Bias: ${alert.bias}
Confidence: ${alert.confidence}%
Price: ${alert.lastPrice}

High confidence setup detected.`
  );
}
  
  const eliteSetup = rankings.find(item => item.confidence >= 80);

if (eliteSetup) {
  const eliteKey =
    `${eliteSetup.pair}-${eliteSetup.bias}-${eliteSetup.confidence}`;

  if (eliteKey !== lastEliteAlertKey) {
    lastEliteAlertKey = eliteKey;

    console.log(
      `ELITE FOREXSNOW ALERT: ${eliteSetup.pair} ${eliteSetup.bias} ${eliteSetup.confidence}%`
    );
  }
}

const bullishRankings = rankings.filter(item => item.bias === "Bullish");
const bearishRankings = rankings.filter(item => item.bias === "Bearish");

const topBullishPick =
  bullishRankings.find(item => item.confidence >= 75) || null;

const topBearishPick =
  bearishRankings.find(item => item.confidence >= 75) || null;

const bullishCount = bullishRankings.length;
const bearishCount = bearishRankings.length;

  const liveCount = sourceStatus.filter(item => item.live).length;
  const primaryCount = sourceStatus.filter(item => item.source === "TwelveData").length;
  const secondaryCount = sourceStatus.filter(item => item.source === "Finnhub").length;
  const tertiaryCount = sourceStatus.filter(item => item.source === "Polygon").length;
  const backupCount = sourceStatus.filter(item => item.source === "Stooq").length;
  const availableCount = rankings.length;
  const unavailableCount = sourceStatus.length - availableCount;
  const lastKnownUsed = sourceStatus.some(item => item.sourceMode === "Last Known");

  let marketThesis = "";

  if (!marketOpen) {
    marketThesis =
      `Forex market currently closed. Snapshot engine standing by. Market reopens in ${marketReopenCountdown}.`;
  } else if (availableCount === 0) {
    marketThesis =
      "Live market data is temporarily unavailable. ForexSnow is standing by for the next verified snapshot.";
  } else if (bullishCount >= bearishCount) {
    marketThesis =
      "Bullish momentum currently leads overall market conditions.";
  } else {
    marketThesis =
      "Bearish pressure currently leads across select currency pairs.";
  }

  const performanceStats = calculatePerformanceStats();

  const historyEntry = {
    timestamp: new Date().toISOString(),
    marketOpen,
    rankings
  };

  if (rankings.length > 0) {
    tradeHistory.push(historyEntry);

    if (tradeHistory.length > 5000) {
      tradeHistory.shift();
    }

    fs.writeFileSync(
      HISTORY_FILE,
      JSON.stringify(tradeHistory, null, 2)
    );
  }

if (!marketOpen && lastLiveSnapshot?.rankings?.length) {
  snapshot = {
    ...lastLiveSnapshot,
    updatedAt: new Date().toISOString(),
    marketOpen,
    marketReopenCountdown,
    snapshotMode: "Cached",
    marketThesis:
      `Forex market currently closed. Showing last verified snapshot. Market reopens in ${marketReopenCountdown}.`,
    rankings: lastLiveSnapshot.rankings.map(item => ({
      ...item,
      status: "CACHED"
    }))
  };

  return;
}
  
  snapshot = {
    brand: "ForexSnow",
    updatedAt: new Date().toISOString(),
    nextUpdateAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    marketOpen,
    marketReopenCountdown,
    updateCount,
    totalHistoricalSnapshots: tradeHistory.length,
    topPick: rankings.find(item => item.confidence >= 75) || null,
topBullishPick,
topBearishPick,
rankings,
bullishRankings,
bearishRankings,
    marketThesis,
    dataHealth: {
      live: liveCount > 0,
      marketOpen,
      marketReopenCountdown,
      primarySource: "TwelveData",
      secondarySource: "Finnhub",
      tertiarySource: "Polygon",
      backupSource: "Stooq",
      primaryPairs: primaryCount,
      secondaryPairs: secondaryCount,
      tertiaryPairs: tertiaryCount,
      backupPairs: backupCount,
      lastKnownUsed,
      livePairs: liveCount,
      availablePairs: availableCount,
      unavailablePairs: unavailableCount,
      totalPairs: sourceStatus.length,
      checkedAt: new Date().toISOString(),
      message: !marketOpen
        ? `Forex market currently closed. Reopens in ${marketReopenCountdown}.`
        : primaryCount > 0 && secondaryCount === 0 && tertiaryCount === 0 && backupCount === 0 && !lastKnownUsed
          ? "Primary market data active."
          : lastKnownUsed
            ? "Some live data was delayed. ForexSnow used last known market prices where needed."
            : secondaryCount > 0 || tertiaryCount > 0
              ? "Primary data partially delayed. Secondary market data active."
              : backupCount > 0
                ? "Primary data delayed. Backup market data active."
                : liveCount > 0
                  ? "Live market data active."
                  : "Live market data temporarily unavailable.",
      sourceStatus
    },
    memory: {
      historicalSnapshots: tradeHistory.length,
      learningActive: true
    },
    performance: performanceStats,
    sources: [
      {
        name: "TwelveData FX Quotes",
        url: "https://twelvedata.com"
      },
      {
        name: "Finnhub FX Rates",
        url: "https://finnhub.io"
      },
      {
        name: "Polygon Forex Market Data",
        url: "https://polygon.io"
      },
      {
        name: "Stooq FX Quotes",
        url: "https://stooq.com"
      },
      {
        name: "Last Known Market Price",
        url: "Internal memory"
      }
    ],
    warnings: [
      "ForexSnow is informational only and not financial advice."
    ]
  };
if (marketOpen && rankings.length > 0) {
  lastLiveSnapshot = snapshot;
}
  console.log(`Snapshot updated #${updateCount}`);
}

buildSnapshot();

setInterval(buildSnapshot, ACTIVE_REFRESH_MS);

app.get("/api/snapshot", (req, res) => {
  res.json(snapshot);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ForexSnow AI backend",
    refreshMs: REFRESH_MS,
    hasSnapshot: Boolean(snapshot),
    marketOpen: snapshot?.marketOpen ?? null,
    historicalSnapshots: tradeHistory.length,
    primarySource: "TwelveData",
    secondarySource: "Finnhub",
    tertiarySource: "Polygon",
    backupSource: "Stooq"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
