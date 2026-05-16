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

if (!data || !data.rankings || !Array.isArray(data.rankings)) {
  console.error("Invalid snapshot data:", data);
  document.getElementById("marketThesis").textContent =
    "Live snapshot is warming up. Please refresh again shortly.";
  return;
}

window.latestSnapshot = data;

    window.latestSnapshot = data;

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
      <div class="metric"><span class="refreshLabel">Market Status</span><strong class="refreshCountdown">Refreshing...</strong></div>
    </div>
  `;
}

function renderRows(targetId, rows) {
  const tableBody = document.getElementById(targetId);

  if (!rows || rows.length === 0) {
    const label = targetId.includes("bearish")
      ? "No bearish signals active right now."
      : "No bullish signals active right now.";

    tableBody.innerHTML = `
      <tr>
        <td colspan="6">${label}</td>
      </tr>
    `;

    return;
  }

  tableBody.innerHTML = rows.map(item => `
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
  const marketOpen = window.latestSnapshot?.marketOpen;
  const reopenCountdown = window.latestSnapshot?.marketReopenCountdown;

  const countdownElements =
    document.querySelectorAll(".refreshCountdown");

  const labelElements =
    document.querySelectorAll(".refreshLabel");

  labelElements.forEach(label => {
    label.textContent = "Market Status";
  });

  if (marketOpen === false) {
    countdownElements.forEach(item => {
      item.textContent =
        `Reopens in ${reopenCountdown || "soon"}`;
    });

    return;
  }

  const remaining = Math.max(
    0,
    nextRefreshAt - Date.now()
  );

  const minutes = Math.floor(remaining / 60000);

  const seconds = Math.floor(
    (remaining % 60000) / 1000
  )
    .toString()
    .padStart(2, "0");

  const label = `Refreshing in ${minutes}:${seconds}`;

  countdownElements.forEach(item => {
    item.textContent = label;
  });
}

document.getElementById("footerText").innerHTML =
  `© ${new Date().getFullYear()} ForexSnow AI • Live Snapshot Engine • Updated every ${REFRESH_LABEL}`;
