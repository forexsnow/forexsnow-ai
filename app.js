function buildSnapshot() {
  updateCount++;

  const rankings = pairs
    .map(scorePair)
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
    nextUpdateAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    updateCount,
    topPick: rankings[0],
    rankings,
    marketThesis:
      "ForexSnow ranks bullish opportunities first by highest confidence, then bearish setups by confidence.",
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
