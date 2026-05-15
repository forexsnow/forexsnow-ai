const API_BASE = window.FOREXSNOW_API_BASE || "";

const els = {
  banner: document.getElementById("statusBanner"),
  lastUpdate: document.getElementById("lastUpdate"),
  nextUpdate: document.getElementById("nextUpdate"),
  updateCount: document.getElementById("updateCount"),
  marketThesis: document.getElementById("marketThesis"),
  topPair: document.getElementById("topPair"),
  topBias: document.getElementById("topBias"),
  entry: document.getElementById("entry"),
  stop: document.getElementById("stop"),
  take: document.getElementById("take"),
  exit: document.getElementById("exit"),
  confidence: document.getElementById("confidence"),
  meterFill: document.getElementById("meterFill"),
  tableBody: document.getElementById("tableBody"),
  sourceGrid: document.getElementById("sourceGrid")
};

function formatTime(value){
  const date = new Date(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function setBanner(type, message){
  els.banner.classList.remove("warning", "error");

  if(type){
    els.banner.classList.add(type);
  }

  els.banner.innerHTML = message;
}

function renderSources(sources = []){
  els.sourceGrid.innerHTML = "";

  sources.forEach(source => {
    const card = document.createElement("article");
    card.className = "card source-card";

    card.innerHTML = `
      <h3>${source.name}</h3>
      <a href="${source.url}" target="_blank" rel="noopener">Open source</a>
    `;

    els.sourceGrid.appendChild(card);
  });
}

function renderTable(rankings = []){
  els.tableBody.innerHTML = "";

  rankings.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.rank}</td>
      <td><strong>${row.pair}</strong></td>
      <td>${row.bias}</td>
      <td>${row.confidence}%</td>
      <td>${row.momentumScore}</td>
      <td>${row.volatilityScore}</td>
      <td>${row.tradePlan.takeProfit}</td>
      <td>${row.tradePlan.stopLoss}</td>
      <td>${row.riskNote}</td>
    `;

    els.tableBody.appendChild(tr);
  });
}

function renderSnapshot(snapshot){
  const top = snapshot.topPick;
  const plan = top.tradePlan;

  els.marketThesis.textContent = snapshot.marketThesis;
  els.topPair.textContent = top.pair;
  els.topBias.textContent = top.bias;
  els.entry.textContent = plan.entryZone;
  els.stop.textContent = plan.stopLoss;
  els.take.textContent = plan.takeProfit;
  els.exit.textContent = plan.getOutPoint;
  els.confidence.textContent = `${top.confidence}%`;
  els.meterFill.style.width = `${top.confidence}%`;

  els.lastUpdate.textContent = `Last refreshed: ${formatTime(snapshot.updatedAt)}`;
  els.nextUpdate.textContent = `Next update: ${formatTime(snapshot.nextUpdateAt)}`;
  els.updateCount.textContent = `Updates: ${snapshot.updateCount}`;

  renderTable(snapshot.rankings);
  renderSources(snapshot.sources);

  if(snapshot.warnings && snapshot.warnings.length){
    setBanner("warning", `<strong>Warning:</strong> ${snapshot.warnings.join(" ")}`);
  } else {
    setBanner("", `<strong>Status:</strong> Live ForexSnow engine active. Updated at ${formatTime(snapshot.updatedAt)}.`);
  }
}

async function loadSnapshot(force = false){
  try {
    setBanner("", "<strong>Status:</strong> Updating ForexSnow snapshot.");

    const url = force ? `${API_BASE}/api/refresh` : `${API_BASE}/api/snapshot`;
    const options = force ? { method: "POST" } : {};

    const response = await fetch(url, options);

    if(!response.ok){
      throw new Error("Snapshot API returned an error.");
    }

    const snapshot = await response.json();
    renderSnapshot(snapshot);
    localStorage.setItem("forexsnow_latest_snapshot", JSON.stringify(snapshot));

  } catch(error) {
    const cached = localStorage.getItem("forexsnow_latest_snapshot");

    if(cached){
      renderSnapshot(JSON.parse(cached));
      setBanner("warning", "<strong>Warning:</strong> Live backend unavailable. Showing last saved snapshot.");
      return;
    }

    setBanner("error", "<strong>Error:</strong> Live backend unavailable and no saved snapshot exists.");
  }
}

document.getElementById("refreshBtn").addEventListener("click", () => loadSnapshot(true));
document.getElementById("manualTableRefresh").addEventListener("click", () => loadSnapshot(true));
document.getElementById("year").textContent = new Date().getFullYear();

loadSnapshot(false);

setInterval(() => {
  loadSnapshot(false);
}, 8 * 60 * 1000);
