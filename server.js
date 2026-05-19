import express from "express";
import cors from "cors";
import fs from "fs";

const app = express();

const PORT = process.env.PORT || 3000;
const ACTIVE_REFRESH_MS = 10 * 60 * 1000;
const REFRESH_MS = ACTIVE_REFRESH_MS;
const HISTORY_FILE = "./trade-history.json";

const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY || "";
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "";
const OANDA_API_KEY = process.env.OANDA_API_KEY || "";
const OANDA_ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID || "";
const OANDA_ENV = process.env.OANDA_ENV || "practice";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const TWELVEDATA_DAILY_LIMIT = 750;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

let snapshot = null;
let lastLiveSnapshot = null;
let updateCount = 0;
let tradeHistory = [];
let lastEliteAlertKey = "";
let twelveDataDailyCount = 0;
let twelveDataDay = new Date().toISOString().slice(0, 10);

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
  { pair: "EUR/AUD", base: "EUR", quote: "AUD", stooqSymbol: "euraud", twelveSymbol: "EUR/AUD", polygonSymbol: "C:EURAUD" }
];

async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
    });
  } catch (err) {
    console.error("Telegram alert failed:", err.message);
  }
}

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
      headers: { "User-Agent": "ForexSnow/1.0" }
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
      headers: { "User-Agent": "ForexSnow/1.0" }
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout
