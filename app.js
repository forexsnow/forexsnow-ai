const REFRESH_LABEL = "5 Min Refresh";
document.addEventListener("DOMContentLoaded", () => {
  loadSnapshot();
  setInterval(loadSnapshot, 10000);
});

async function loadSnapshot() {
  try {
    const response = await fetch(
      "https://forexsnow-ai-production.up.railway.app/api/snapshot",
      { cache: "no-store" }
    );

    const data = await response.json();

    const bullish = data.rankings
      .filter(item => item.bias === "Bullish")
      .sort((a, b) => b.confidence - a.confidence);

    const bearish = data.rankings
      .filter(item => item.bias === "Bearish")
      .sort((a, b) => b.confidence - a.confidence);

    const bullishTop = bullish[0];
    const bearishTop = bearish[0];

    document.getElementById("lastRefresh").textContent =
      `Last refreshed: ${new Date(data.updatedAt).toLocaleString()}`;

    document.getElementById("marketThesis").textContent = data.marketThesis;

    document.getElementById("updatePill").textContent =
      `Updates: ${data.updateCount}`;

    if (bullishTop) {
      document.getElementById("forecastConfidence").textContent =
        `${bullishTop.confidence}%`;

      document.getElementById("bullishProgressFill").style.width =
        `${bullishTop.confidence}%`;
    }

    if (bearishTop) {
      document.getElementById("bearishForecastConfidence").textContent =
        `${bearishTop.confidence}%`;

      document.getElementById("bearishProgressFill").style.width =
        `${bearishTop.confidence}%`;
    }

    renderTopCard("bullishTopPick", "Bullish Top Opportunity", bullishTop);
    renderTopCard("bearishTopPick", "Bearish Top Opportunity", bearishTop);

    renderRows("bullishRankings", bullish);
    renderRows("bearishRankings", bearish);

  } catch (error) {
    console.error(error);
  }
}

function renderTopCard(targetId, label, item) {
  if (!item) {
    document.getElementById(targetId).innerHTML = `
      <div class="top-label">${label}</div>
      <p>No opportunities available right now.</p>
    `;
    return;
  }

  document.getElementById(targetId).innerHTML = `
    <div class="top-header">
      <div>
        <div class="top-label">${label}</div>
        <h2 class="top-pair">${item.pair}</h2>
        <span class="badge ${item.bias.toLowerCase()}">${item.bias}</span>
      </div>
    </div>

    <div class="setup-grid">
      <div class="metric"><span>Confidence</span><strong>${item.confidence}%</strong></div>
      <div class="metric"><span>Entry Trigger</span><strong>${item.entry}</strong></div>
      <div class="metric"><span>Take Profit Exit</span><strong>${item.takeProfit}</strong></div>
      <div class="metric"><span>Get Out Point</span><strong>${item.getOutPoint}</strong></div>
      <div class="metric"><span>Stop Loss</span><strong>${item.stopLoss}</strong></div>
      <div class="metric"><span>Engine</span><strong>${REFRESH_LABEL}</strong></div>
    </div>
  `;
}

function renderRows(targetId, rows) {
  document.getElementById(targetId).innerHTML = rows.map(item => `
    <tr>
      <td>${item.pair}</td>
      <td>
        <span class="badge ${item.bias.toLowerCase()}">
          ${item.bias}
        </span>
      </td>
      <td>${item.confidence}%</td>
      <td>${item.entry}</td>
      <td>${item.takeProfit}</td>
      <td>${item.stopLoss}</td>
    </tr>
  `).join("");

}
document.getElementById("footerText").innerHTML =
  `© ${new Date().getFullYear()} ForexSnow AI • Live Snapshot Engine • Updated every ${REFRESH_LABEL}`;
