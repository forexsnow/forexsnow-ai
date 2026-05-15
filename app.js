async function loadSnapshot() {
  try {
    const response = await fetch("https://forexsnow-ai-production.up.railway.app/api/snapshot");
    const data = await response.json();

    const top = data.topPick;

    document.getElementById("lastRefresh").textContent =
      `Last refreshed: ${new Date(data.updatedAt).toLocaleString()}`;

    document.getElementById("topPick").innerHTML = `
      <div class="top-header">
        <div>
          <div class="top-label">Top Opportunity</div>
          <h2 class="top-pair">${top.pair}</h2>
          <span class="badge ${top.bias.toLowerCase()}">${top.bias}</span>
        </div>
        <div>
          <p class="small">Updated</p>
          <strong>${new Date(data.updatedAt).toLocaleTimeString()}</strong>
        </div>
      </div>

      <div class="setup-grid">
        <div class="metric"><span>Confidence</span><strong>${top.confidence}%</strong></div>
        <div class="metric"><span>Entry</span><strong>${top.entry}</strong></div>
        <div class="metric"><span>Exit Rule</span><strong>${top.getOutPoint}</strong></div>
        <div class="metric"><span>Take Profit</span><strong>${top.takeProfit}</strong></div>
        <div class="metric"><span>Stop Loss</span><strong>${top.stopLoss}</strong></div>
        <div class="metric"><span>Engine</span><strong>10 Min Refresh</strong></div>
      </div>

      <p class="small">${top.reason}</p>
    `;

    document.getElementById("marketThesis").textContent = data.marketThesis;

    document.getElementById("rankings").innerHTML = data.rankings.map(item => `
      <tr>
        <td>#${item.rank}</td>
        <td>${item.pair}</td>
        <td><span class="badge ${item.bias.toLowerCase()}">${item.bias}</span></td>
        <td>${item.confidence}%</td>
        <td>${item.entry}</td>
        <td>${item.takeProfit}</td>
        <td>${item.stopLoss}</td>
      </tr>
    `).join("");

  } catch (error) {
    document.getElementById("topPick").innerHTML = "Snapshot failed to load. Refresh in a moment.";
    console.error(error);
  }
}

loadSnapshot();
setInterval(loadSnapshot, 10000);
