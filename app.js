const REFRESH_MS = 15 * 60 * 1000;
const REFRESH_LABEL = "15 minutes";

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

    if (!data || !Array.isArray(data.rankings)) {
      console.error("Invalid snapshot:", data);
      return;
    }

    window.latestSnapshot = data;
    nextRefreshAt = Date.now() + REFRESH_MS;

    const bullish = data.bullishRankings || [];
const bearish = data.bearishRankings || [];

const bullishTop = data.topBullishPick || null;
const bearishTop = data.topBearishPick || null;

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

    renderTopCard("bullishTopPick", "Top Bullish Play", bullishTop);
    renderTopCard("bearishTopPick", "Top Bearish Play", bearishTop);

    renderRows("bullishRankings", bullish);
    renderRows("bearishRankings", bearish);

    updateRefreshCountdown();

  } catch (error) {
    console.error(error);
  }
}

function buildCopyText(item) {
  return `${item.pair}
${item.bias}

Last Price: ${item.lastPrice || item.entry}
Take Profit: ${item.takeProfit}
Stop Loss: ${item.stopLoss}
Confidence: ${item.confidence}%`;
}

function copyPlay(button, encodedPlay) {
  const item = JSON.parse(decodeURIComponent(encodedPlay));
  const text = buildCopyText(item);

  navigator.clipboard.writeText(text).then(() => {
    const originalText = button.textContent;
    button.textContent = "Copied ✓";

    setTimeout(() => {
      button.textContent = originalText;
    }, 1600);
  });
}

function renderTopCard(targetId, label, item) {
  if (!item) {
    document.getElementById(targetId).innerHTML = `
      <div class="top-label">${label}</div>
      <p>No active setup right now.</p>
    `;
    return;
  }

  const encodedPlay = encodeURIComponent(JSON.stringify(item));

  document.getElementById(targetId).innerHTML = `
    <div class="top-header">
      <div class="top-left">
        <div class="top-label">${label}</div>
        <h2 class="top-pair">${item.pair}</h2>
        <span class="badge ${item.bias.toLowerCase()}">${item.bias}</span>
      </div>

      <button
        class="copy-play-btn"
        onclick="copyPlay(this, '${encodedPlay}')"
      >
        Copy Play
      </button>
    </div>

    <div class="setup-grid">
      <div class="metric"><span>Confidence</span><strong>${item.confidence}%</strong></div>
      <div class="metric"><span>Last Price</span><strong>${item.lastPrice || item.entry}</strong></div>
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
    tableBody.innerHTML = `
      <tr>
        <td colspan="6">
          No active signals right now. ForexSnow is monitoring market positioning.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = rows.map(item => `
    <tr>
      <td>${item.pair}</td>
      <td>${item.lastPrice || item.entry}</td>
      <td>
  <span class="tier tier-${item.tier.toLowerCase()}">
    <span class="tier-dot"></span>
    ${item.tier}
  </span>
</td>
      <td>${item.confidence}%</td>
      <td>${item.takeProfit}</td>
      <td>${item.stopLoss}</td>
    </tr>
  `).join("");
}

function updateRefreshCountdown() {
  const marketOpen = window.latestSnapshot?.marketOpen;
  const reopenCountdown = window.latestSnapshot?.marketReopenCountdown;

  const countdownElements = document.querySelectorAll(".refreshCountdown");
  const labelElements = document.querySelectorAll(".refreshLabel");

  labelElements.forEach(label => {
    label.textContent = "Market Status";
  });

  if (marketOpen === false) {
    countdownElements.forEach(item => {
      item.textContent = `Reopens in ${reopenCountdown || "soon"}`;
    });
    return;
  }

  const remaining = Math.max(0, nextRefreshAt - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  countdownElements.forEach(item => {
    item.textContent = `Refreshing in ${minutes}:${seconds}`;
  });
}

document.getElementById("footerText").innerHTML =
  `© ${new Date().getFullYear()} ForexSnow AI • Live Snapshot Engine • Updated every ${REFRESH_LABEL}`;

