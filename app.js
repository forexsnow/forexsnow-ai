const REFRESH_MS = 5 * 60 * 1000;
const REFRESH_LABEL = "5 minutes";

let nextRefreshAt = Date.now() + REFRESH_MS;

document.addEventListener("DOMContentLoaded", () => {
  loadSnapshot();

  setInterval(loadSnapshot, REFRESH_MS);
  setInterval(updateRefreshCountdown, 1000);
});

async function loadSnapshot() {
  try {
    const response = await fetch(
      "https://forexsnow-ai-production.up.railway.app/api/snapshot",
      { cache: "no-store" }
    );

    const data = await response.json();

    nextRefreshAt = Date.now() + REFRESH_MS;

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

    document.getElementById("marketThesis").textContent =
      data.marketThesis;

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

    updateRefreshCountdown();

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
      <div class="metric"><span>AI Refresh Cycle</span><strong class="refreshCountdown">Refreshing...</strong></div>
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

function updateRefreshCountdown() {
  const remaining = Math.max(0, nextRefreshAt - Date.now());

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  const label = `Refreshing in ${minutes}:${seconds}`;

  document.querySelectorAll(".refreshCountdown").forEach(item => {
    item.textContent = label;
  });
}

document.getElementById("footerText").innerHTML =
  `© ${new Date().getFullYear()} ForexSnow AI • Live Snapshot Engine • Updated every ${REFRESH_LABEL}`;
